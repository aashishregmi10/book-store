'use strict';

/*
 * Replace each PageTurn book's cover image with the ACTUAL Daraz/New Book House
 * product photo. Many books currently show a metadata-provider cover (Google
 * Books / Open Library), which is often a DIFFERENT PRINTING/EDITION than what
 * the wholesaler physically ships — customers receive a book that looks
 * nothing like the photo. This re-uploads the exact Daraz listing photo as the
 * cover for every book we can confidently match, so what's pictured is what
 * ships.
 *
 * Matching logic mirrors fix-daraz-mismatches.js (same combo/bundle exclusion,
 * same ISBN-then-title resolution, same "leave ambiguous ones alone" rule) so
 * the two scripts never disagree about which Daraz row a book corresponds to.
 *
 * A book's cover is replaced even if it might already be correct — there's no
 * stored provenance to tell, and re-uploading the same photo is harmless
 * (wasteful, not wrong). Failed downloads/uploads leave the existing cover
 * untouched (coverImage is a required field — we never null it out).
 *
 *   node scripts/fix-daraz-covers.js                 # dry run (default)
 *   node scripts/fix-daraz-covers.js --apply          # write + upload
 *   node scripts/fix-daraz-covers.js --apply --limit 20 --concurrency 3
 *
 * Makes no writes/uploads without --apply.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const Book = require('../src/models/book.model');
const { normalizeIsbns } = require('../src/utils/isbn');
const { uploadCoverFromUrl } = require('../src/utils/coverUpload');
const { deleteImage } = require('../src/config/cloudinary');

const JSONL_PATH = 'D:/daraz-scraper/data/books.jsonl';
const APPLY = process.argv.includes('--apply');

function argNum(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) ? n : fallback;
}
const LIMIT = argNum('--limit', Infinity);
const CONCURRENCY = argNum('--concurrency', 3);
const STAGGER_MS = 400;

const COMBO_RE = /\bcombo\b|\bbundle\b|\bbox\s*set\b|\bset of \d|\bbuy\s*1\s*get\s*1\b|\d\s*pcs?\b/i;
const isCombo = (title) => COMBO_RE.test(String(title || ''));

const normTitle = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normAuthor = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readScrape(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return raw
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
    .filter(Boolean);
}

function filterByComboMatch(candidates, bookIsCombo) {
  return candidates.filter((c) => isCombo(c.title) === bookIsCombo);
}

// Resolve exactly one confident Daraz record for a book, or null if ambiguous/no match.
function resolveMatch(b, byIsbn13, byTitle) {
  const bookIsbn = b.isbn && /^\d{13}$/.test(b.isbn) ? b.isbn : '';
  const bookCombo = isCombo(b.title);

  if (bookIsbn && byIsbn13.has(bookIsbn)) {
    const candidates = filterByComboMatch(byIsbn13.get(bookIsbn), bookCombo);
    if (candidates.length === 0) return null;
    const prices = new Set(candidates.map((c) => c.price).filter((p) => Number.isFinite(p) && p > 0));
    if (prices.size > 1) return null; // conflicting listings under the same reused ISBN
    return candidates[0];
  }

  const t = normTitle(b.title);
  const allCandidates = byTitle.get(t) || [];
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

  return null; // ambiguous
}

(async function main() {
  const scrape = readScrape(path.resolve(JSONL_PATH));
  console.log(`Loaded ${scrape.length} scraped Daraz records.`);

  const byIsbn13 = new Map();
  const byTitle = new Map();
  for (const r of scrape) {
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

  await connectMongo();

  let books = await Book.find({}).select('slug title author isbn coverImage');
  console.log(`Checking ${books.length} PageTurn books against the scrape...\n`);

  const toFix = [];
  let ambiguousOrNoMatch = 0;
  let noCoverUrl = 0;

  for (const b of books) {
    const chosen = resolveMatch(b, byIsbn13, byTitle);
    if (!chosen) {
      ambiguousOrNoMatch += 1;
      continue;
    }
    if (!chosen.coverUrl) {
      noCoverUrl += 1;
      continue;
    }
    toFix.push({ book: b, coverUrl: chosen.coverUrl, darazTitle: chosen.title });
  }

  console.log(`Matched with a Daraz photo to apply: ${toFix.length}`);
  console.log(`Ambiguous / no reliable match:        ${ambiguousOrNoMatch}`);
  console.log(`Matched but Daraz row has no photo:   ${noCoverUrl}\n`);

  console.log('--- Sample (first 15) ---');
  for (const f of toFix.slice(0, 15)) {
    console.log(`  [${f.book.slug}] "${f.book.title}"`);
    console.log(`      current: ${f.book.coverImage?.secureUrl || '(none)'}`);
    console.log(`      daraz:   ${f.coverUrl}`);
  }
  console.log('');

  if (!APPLY) {
    console.log(`DRY RUN — no uploads made. ${toFix.length} book(s) would have their cover replaced. Re-run with --apply.`);
    await disconnectMongo();
    process.exit(0);
  }

  const work = toFix.slice(0, LIMIT);
  const backupPath = path.resolve(__dirname, `../../daraz-cover-fix-backup-${Date.now()}.csv`);
  const backupRows = ['slug,title,old_public_id,old_secure_url,new_public_id,new_secure_url'];

  let done = 0;
  let uploaded = 0;
  let failed = 0;
  let next = 0;

  async function worker() {
    while (next < work.length) {
      const i = next;
      next += 1;
      const f = work[i];
      const newImg = await uploadCoverFromUrl(f.coverUrl, f.book.title);
      done += 1;
      if (!newImg) {
        failed += 1;
        console.log(`[${done}/${work.length}] FAILED upload [${f.book.slug}]`);
      } else {
        const oldPublicId = f.book.coverImage?.publicId;
        try {
          await Book.updateOne({ _id: f.book._id }, { $set: { coverImage: newImg } });
          backupRows.push(
            [f.book.slug, JSON.stringify(f.book.title), oldPublicId || '', f.book.coverImage?.secureUrl || '', newImg.publicId, newImg.secureUrl].join(',')
          );
          uploaded += 1;
          console.log(`[${done}/${work.length}] OK [${f.book.slug}]`);
          if (oldPublicId && oldPublicId !== newImg.publicId) {
            deleteImage(oldPublicId).catch((err) => console.warn(`  cleanup failed for old cover of ${f.book.slug}: ${err.message}`));
          }
        } catch (err) {
          failed += 1;
          console.log(`[${done}/${work.length}] DB UPDATE FAILED [${f.book.slug}]: ${err.message}`);
        }
      }
      if (next < work.length) await sleep(STAGGER_MS);
    }
  }

  fs.writeFileSync(backupPath, backupRows.join('\n'), 'utf8'); // header now; rewritten with data at the end too
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));
  fs.writeFileSync(backupPath, backupRows.join('\n'), 'utf8');

  console.log(`\nBackup of pre-change cover values written to ${backupPath}`);
  console.log(`Done. Uploaded ${uploaded}, failed ${failed}, of ${work.length} attempted.`);
  await disconnectMongo();
  process.exit(0);
})().catch((err) => {
  console.error('Cover reconciliation failed:', err.message);
  process.exit(1);
});
