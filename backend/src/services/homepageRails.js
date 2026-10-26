'use strict';

const crypto = require('crypto');
const Book = require('../models/book.model');
const Setting = require('../models/setting.model');

/**
 * The three curated homepage rails — Bestsellers (isBestseller), New arrivals
 * (isNewArrival) and Staff favourites (isFeatured) — in a shuffled order that
 * an admin re-rolls from the dashboard.
 *
 * The order is a seeded hash of each book's id, not Math.random() per request:
 * the same seed always yields the same order, so the rails stay stable between
 * shuffles and every cache in front of them (Redis here, the Next data cache on
 * the storefront) holds a correct answer until the next shuffle. A shuffle just
 * stores a new seed. Each rail draws from ALL its flagged books before taking
 * its 20, so with more flagged books than slots a shuffle also changes which
 * ones are on show, not only their order.
 */

const SEED_KEY = 'homepageRailSeed';
const DEFAULT_SEED = 'initial'; // before the first shuffle — still a shuffled order
const RAIL_SIZE = 20; // the homepage rails scroll horizontally
const POOL_MAX = 500; // flagged books considered per rail (today: 20–27 each)

// A curated rail with fewer than this many books looks sparse/broken rather
// than "lightly curated" — top it up from a catalogue-wide fallback so the
// homepage rails are never empty because too few books are flagged.
const MIN_RAIL_SIZE = 6;

const rankOf = (seed, id) => crypto.createHash('sha1').update(`${seed}:${id}`).digest().readUInt32BE(0);

/** Order books by the seeded hash of their id. Pure; does not mutate `books`. */
function shuffleBySeed(books, seed) {
  return books
    .map((b) => ({ b, r: rankOf(seed, String(b._id)) }))
    .sort((x, y) => x.r - y.r)
    .map((x) => x.b);
}

async function getShuffleState() {
  const doc = await Setting.findOne({ key: SEED_KEY }).populate('updatedBy', 'fullName').lean();
  return {
    seed: doc?.value?.seed || DEFAULT_SEED,
    shuffledAt: doc?.value?.shuffledAt || null,
    shuffledBy: doc?.updatedBy?.fullName || null,
  };
}

async function railWithFallback(flag, fallbackSort, fields, seed) {
  const base = { isActive: true };
  const pool = await Book.find({ ...base, [flag]: true }).select(fields).limit(POOL_MAX).lean();
  const curated = shuffleBySeed(pool, seed).slice(0, RAIL_SIZE);
  if (curated.length >= MIN_RAIL_SIZE) return curated;
  const fallback = await Book.find(base).select(fields).sort(fallbackSort).limit(RAIL_SIZE).lean();
  const seen = new Set(curated.map((b) => String(b._id)));
  return [...curated, ...fallback.filter((b) => !seen.has(String(b._id)))].slice(0, RAIL_SIZE);
}

/** The three rails for `seed` (defaults to the stored one). */
async function buildRails(fields, seed) {
  const s = seed || (await getShuffleState()).seed;
  const [featured, bestsellers, newArrivals] = await Promise.all([
    // Fallbacks keep the old curated orderings: best reviewed (sold as the
    // tiebreaker in a catalogue with few reviews), most sold, newest.
    railWithFallback('isFeatured', { avgRating: -1, soldCount: -1 }, fields, s),
    railWithFallback('isBestseller', { soldCount: -1 }, fields, s),
    railWithFallback('isNewArrival', { createdAt: -1 }, fields, s),
  ]);
  return { featured, bestsellers, newArrivals };
}

/** Store a new seed, recording who shuffled and when. Returns the new state. */
async function shuffleRails(userId) {
  const value = { seed: crypto.randomBytes(8).toString('hex'), shuffledAt: new Date() };
  await Setting.findOneAndUpdate(
    { key: SEED_KEY },
    { $set: { value, updatedBy: userId || undefined } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return getShuffleState();
}

module.exports = { buildRails, shuffleRails, getShuffleState, shuffleBySeed, RAIL_SIZE, MIN_RAIL_SIZE };
