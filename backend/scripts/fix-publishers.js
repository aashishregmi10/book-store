'use strict';

/*
 * Fix the publisher on books imported from the Daraz scrape.
 *
 * The importer mistakenly stored the Daraz SELLER brand ("New International Books
 * Center") as the publisher on every book. This script:
 *   • moves that seller name into the `supplier` field, and
 *   • sets the REAL publisher by looking each book up on Google Books by ISBN-13.
 * When no real publisher is found, the wrong value is simply removed (left blank).
 *
 * Targets only books whose publisher is currently the seller brand, so it's safe
 * to re-run (already-fixed books no longer match).
 *
 *   node scripts/fix-publishers.js [--brand "New International Books Center"]
 *        [--concurrency 2] [--limit N] [--dry]
 *
 * Requires MONGODB_URI and (for real publishers) GOOGLE_BOOKS_API_KEY.
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const { lookupByIsbn } = require('../src/utils/bookLookup');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAGGER_MS = 600;

function parseArgs(argv) {
  const a = { brand: 'New International Books Center', concurrency: 2, limit: Infinity, dry: false, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--brand') a.brand = argv[++i];
    else if (v === '--concurrency') a.concurrency = Math.max(1, parseInt(argv[++i], 10) || 2);
    else if (v === '--limit') a.limit = parseInt(argv[++i], 10) || Infinity;
    else if (v === '--dry') a.dry = true;
    else if (v === '--force') a.force = true; // re-look-up even books that already have a (possibly wrong) publisher
  }
  return a;
}

async function fixOne(book, opts) {
  // Already has a real publisher (not the seller brand)? Leave it alone —
  // unless --force, which re-looks-up everything (use after setting the API key
  // to overwrite wrong publishers from an earlier keyless run).
  const cur = book.specifications?.publisher?.trim();
  if (!opts.force && cur && cur !== opts.brand) return { title: book.title, publisher: cur, skipped: true };

  let realPublisher = '';
  if (book.isbn && /^\d{13}$/.test(book.isbn)) {
    try {
      const meta = await lookupByIsbn(book.isbn);
      realPublisher = meta?.specifications?.publisher?.trim() || '';
    } catch { /* leave blank on lookup failure */ }
  }

  const update = { $set: { supplier: opts.brand } };
  if (realPublisher) update.$set['specifications.publisher'] = realPublisher;
  else update.$unset = { 'specifications.publisher': '' }; // drop the wrong value

  if (!opts.dry) await Book.updateOne({ _id: book._id }, update);
  return { title: book.title, publisher: realPublisher || '(removed)' };
}

(async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await connectMongo();
  try {
    // Catch both: old imports (seller brand stored as publisher) AND new imports
    // (seller stored as supplier, publisher blank).
    let books = await Book.find({ $or: [{ 'specifications.publisher': opts.brand }, { supplier: opts.brand }] })
      .select('title isbn specifications.publisher')
      .lean();
    if (books.length > opts.limit) books = books.slice(0, opts.limit);
    logger.info({ matched: books.length, brand: opts.brand, dry: opts.dry }, books.length ? 'Fixing publishers' : 'Nothing to fix');

    let done = 0;
    let withReal = 0;
    let next = 0;
    const worker = async () => {
      while (next < books.length) {
        const i = next; next += 1;
        const r = await fixOne(books[i], opts);
        done += 1;
        if (r.publisher !== '(removed)') withReal += 1;
        logger.info({ i: i + 1, total: books.length, title: r.title, publisher: r.publisher }, 'fixed');
        if (next < books.length) await sleep(STAGGER_MS);
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.concurrency, books.length) }, worker));
    logger.info({ fixed: done, realPublishers: withReal, removed: done - withReal }, opts.dry ? 'Dry run — no changes written' : 'Done');
  } finally {
    await disconnectMongo();
  }
  process.exit(0);
})().catch((err) => {
  logger.error({ err: err.message }, 'fix-publishers crashed');
  process.exit(1);
});
