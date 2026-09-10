'use strict';

/*
 * Point every cover back at the supplier photo it was originally copied from.
 *
 * Emergency restore. The Cloudinary account was deactivated for exceeding its
 * free-tier credits, and res.cloudinary.com now answers 401 for all ~6,271
 * covers — so BookCover's grey fallback is showing on every card and detail
 * page in the shop. Cloudinary's Admin API is 401 too, so there is nothing to
 * export: the assets are reachable only by paying.
 *
 * They do not need to be. Every cover was copied from a New Book House product
 * photo, those URLs are still live on img.drz.lazcdn.com, and the scrape files
 * that recorded them are still on disk. This rewrites coverImage.secureUrl to
 * the original URL, which brings the shop back with no upload, no new account
 * and no cost.
 *
 * This is deliberately a stopgap, not the destination. It leaves the shop's
 * entire visual layer on a supplier's CDN, which can start blocking hotlinks
 * whenever it likes. scripts/migrate-covers-to-r2.js is the permanent home;
 * this exists so the shop is not broken while that is set up.
 *
 * Matching is lifted from fix-daraz-covers.js unchanged — same ISBN-then-title
 * resolution, same combo/bundle exclusion, same "leave ambiguous ones alone"
 * rule — so the two scripts can never disagree about which supplier row a book
 * corresponds to. The one difference is breadth: that script reads a single
 * scrape file, and reaching 98% needs all five, because the catalogue was
 * imported across several harvests.
 *
 * What it does NOT touch:
 *   - coverImage.publicId. It is required by image.schema.js, the frontend only
 *     ever uses it as a React key, and keeping it makes the rollback a
 *     one-column CSV replay.
 *   - Books already off Cloudinary, so re-running is safe and resumable.
 *   - The ~101 books no scrape file knows about. They keep the dead URL and
 *     render the existing fallback, which is honest: we genuinely do not have
 *     their cover any more.
 *
 * Dry run by default.
 *   node scripts/restore-covers-from-scrape.js
 *   node scripts/restore-covers-from-scrape.js --apply
 *   node scripts/restore-covers-from-scrape.js --apply --limit 50
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const { normalizeIsbns } = require('../src/utils/isbn');

// Every harvest that ever fed the catalogue. Order matters only for tie-breaks:
// the product-page scrape is richest, so it wins when two files describe the
// same book.
const SCRAPE_FILES = [
  'D:/daraz-scraper/data-nbh-pdp/books.jsonl',
  'D:/daraz-scraper/data-nbh-full/books-merged.jsonl',
  'D:/daraz-scraper/data-nbh-full/books.jsonl',
  'D:/daraz-scraper/data/books.jsonl',
  'D:/daraz-scraper/data-nibc/books.jsonl',
];

const APPLY = process.argv.includes('--apply');

function argNum(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) ? n : fallback;
}
const LIMIT = argNum('--limit', Infinity);
// How many restored URLs to actually fetch before writing. Enough to catch a
// dead CDN or a hotlink block; small enough not to be a crawl.
const SAMPLE = argNum('--sample', 8);

const COMBO_RE = /\bcombo\b|\bbundle\b|\bbox\s*set\b|\bset of \d|\bbuy\s*1\s*get\s*1\b|\d\s*pcs?\b/i;
const isCombo = (title) => COMBO_RE.test(String(title || ''));

const normTitle = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const normAuthor = normTitle;

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function readScrape(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((r) => r && r.coverUrl && String(r.coverUrl).trim());
}

const filterByComboMatch = (candidates, bookIsCombo) =>
  candidates.filter((c) => isCombo(c.title) === bookIsCombo);

/** Resolve exactly one confident supplier record for a book, or null. */
function resolveMatch(b, byIsbn13, byTitle) {
  const bookIsbn = b.isbn && /^\d{13}$/.test(b.isbn) ? b.isbn : '';
  const bookCombo = isCombo(b.title);

  if (bookIsbn && byIsbn13.has(bookIsbn)) {
    const candidates = filterByComboMatch(byIsbn13.get(bookIsbn), bookCombo);
    if (candidates.length === 0) return null;
    const prices = new Set(candidates.map((c) => c.price).filter((p) => Number.isFinite(p) && p > 0));
    if (prices.size > 1) return null; // conflicting listings under one reused ISBN
    return candidates[0];
  }

  const allCandidates = byTitle.get(normTitle(b.title)) || [];
  const candidates = filterByComboMatch(allCandidates, bookCombo);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const ba = normAuthor(b.author);
  const authorMatches = candidates.filter((c) => {
    const ca = normAuthor(c.author);
    return ca && ba && (ca.includes(ba) || ba.includes(ca));
  });
  if (authorMatches.length === 1) return authorMatches[0];

  const isbns = new Set(candidates.map((c) => c.isbn13 || ''));
  const prices = new Set(candidates.map((c) => c.price));
  if (isbns.size === 1 && prices.size === 1) return candidates[0];

  return null; // ambiguous — leave it alone
}

(async function main() {
  const byIsbn13 = new Map();
  const byTitle = new Map();
  let loaded = 0;

  for (const file of SCRAPE_FILES) {
    const rows = readScrape(path.resolve(file));
    loaded += rows.length;
    console.log(`  ${rows.length.toString().padStart(5)} records with a cover  ${file}`);
    for (const r of rows) {
      const norm = r.isbn13 ? normalizeIsbns(r.isbn13) : null;
      const isbn13 = norm?.isbn13 && /^\d{13}$/.test(norm.isbn13) ? norm.isbn13 : '';
      if (isbn13) {
        if (!byIsbn13.has(isbn13)) byIsbn13.set(isbn13, []);
        byIsbn13.get(isbn13).push(r);
      }
      const t = normTitle(r.title);
      if (!t) continue;
      if (!byTitle.has(t)) byTitle.set(t, []);
      byTitle.get(t).push(r);
    }
  }
  console.log(`\nloaded ${loaded} scraped records — ${byIsbn13.size} ISBNs, ${byTitle.size} titles\n`);

  await connectMongo();
  try {
    const books = await Book.find({})
      .select('slug title author isbn coverImage isActive')
      .lean();

    const changes = [];
    const skipped = { alreadyRestored: 0, noMatch: 0 };

    for (const b of books) {
      const current = b.coverImage?.secureUrl || '';
      // Resumable: anything already off Cloudinary has been done.
      if (current && !current.includes('res.cloudinary.com')) {
        skipped.alreadyRestored += 1;
        continue;
      }
      const rec = resolveMatch(b, byIsbn13, byTitle);
      if (!rec) {
        skipped.noMatch += 1;
        continue;
      }
      changes.push({
        _id: b._id,
        slug: b.slug,
        title: b.title,
        isActive: b.isActive,
        oldPublicId: b.coverImage?.publicId || '',
        oldSecureUrl: current,
        newSecureUrl: String(rec.coverUrl).trim(),
      });
    }

    const todo = changes.slice(0, LIMIT);

    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${books.length} book(s) in the catalogue`);
    console.log(`  to restore            : ${changes.length}${todo.length !== changes.length ? ` (limiting to ${todo.length})` : ''}`);
    console.log(`  already restored      : ${skipped.alreadyRestored}`);
    console.log(`  no confident match    : ${skipped.noMatch}   <- these keep the fallback\n`);

    if (todo.length) {
      console.log('first 5:');
      todo.slice(0, 5).forEach((c) =>
        console.log(`  ${String(c.title).slice(0, 44).padEnd(46)} ${c.newSecureUrl.slice(0, 62)}`)
      );
      console.log('');
    }

    // Prove the replacement URLs actually serve an image before trusting them
    // for the whole catalogue. A hotlink block or a dead CDN would otherwise
    // swap one broken cover for another, 6,000 times.
    if (todo.length) {
      const step = Math.max(1, Math.floor(todo.length / SAMPLE));
      const picks = [];
      for (let i = 0; i < todo.length && picks.length < SAMPLE; i += step) picks.push(todo[i]);
      let ok = 0;
      console.log(`verifying ${picks.length} sample URLs before writing:`);
      for (const p of picks) {
        try {
          const r = await fetch(p.newSecureUrl, {
            method: 'HEAD',
            headers: { Referer: 'https://www.bookstemple.com/' },
          });
          const type = r.headers.get('content-type') || '';
          const good = r.ok && type.startsWith('image/');
          if (good) ok += 1;
          console.log(`  ${good ? 'ok  ' : 'FAIL'} HTTP ${r.status} ${type.padEnd(12)} ${p.slug.slice(0, 40)}`);
        } catch (err) {
          console.log(`  FAIL ${err.message.slice(0, 50)}  ${p.slug.slice(0, 40)}`);
        }
      }
      console.log(`  -> ${ok}/${picks.length} usable\n`);
      if (APPLY && ok === 0) {
        console.error('Every sampled URL failed. Refusing to write — the source CDN looks unreachable.');
        return;
      }
    }

    const stamp = Date.now();
    const csv = path.join(__dirname, '..', `restore-covers-backup-${stamp}.csv`);
    fs.writeFileSync(
      csv,
      ['slug,title,isActive,old_publicId,old_secureUrl,new_secureUrl']
        .concat(
          todo.map((c) =>
            [c.slug, c.title, c.isActive, c.oldPublicId, c.oldSecureUrl, c.newSecureUrl]
              .map(csvCell)
              .join(',')
          )
        )
        .join('\n'),
      'utf8'
    );
    console.log(`rollback CSV: ${csv}`);

    if (!APPLY) {
      console.log('\nNothing was written. Re-run with --apply.');
      return;
    }

    // Only secureUrl moves. publicId stays as the record of where this cover
    // used to live, which is what makes the CSV a complete rollback.
    let updated = 0;
    const ops = todo.map((c) => ({
      updateOne: { filter: { _id: c._id }, update: { $set: { 'coverImage.secureUrl': c.newSecureUrl } } },
    }));
    for (let i = 0; i < ops.length; i += 500) {
      const res = await Book.bulkWrite(ops.slice(i, i + 500), { ordered: false });
      updated += res.modifiedCount;
      console.log(`  ${i + 1}-${Math.min(i + 500, ops.length)}: modified ${res.modifiedCount}`);
    }

    logger.info({ updated, unmatched: skipped.noMatch }, 'Covers restored from supplier scrape');
    console.log(`\nrestored: ${updated}`);
    console.log('Book pages are ISR at revalidate=120, so covers reappear within ~2 minutes');
    console.log('once frontend/next.config.ts allows the img.drz.lazcdn.com hostname.');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'restore-covers-from-scrape failed');
  process.exit(1);
});
