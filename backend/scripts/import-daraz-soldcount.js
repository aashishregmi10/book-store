'use strict';

/*
 * Populate each Books Temple book's `soldCount` from the Daraz "New Book House"
 * sold-count scrape (D:\daraz-scraper\data\sold-counts.csv). Books Temple is a
 * brand-new store — every book's own soldCount is currently 0 — so the
 * existing "popular" sort (soldCount desc) is meaningless until this runs.
 * The Daraz sold-count is the best real-world demand signal we have for a
 * title this seller carries.
 *
 * Matching is EXACT-TITLE-ONLY (after stripping each side's own "by <author>"
 * suffix so the two sides compare on equal footing) plus the same combo/
 * bundle exclusion used elsewhere in this session. An earlier version of this
 * script also tried a word-subset fallback for titles with no exact match,
 * but that produced real false positives (e.g. "The Power" matched a "Buy 1
 * Get 1: ...The Power Of Your Subconscious Mind" bundle purely because both
 * contain the words "the" and "power") for only ~13 extra matches out of
 * 1432+ solid exact ones — not worth the risk, so it was removed. A book with
 * no exact match is simply left alone (soldCount unchanged), not guessed at.
 *
 * NOTE: sold-counts.csv currently only covers pages 1-46 of 102 (the crawl
 * was blocked by a CAPTCHA) — books outside that partial scrape are left
 * untouched, not zeroed.
 *
 *   node scripts/import-daraz-soldcount.js                # dry run (default)
 *   node scripts/import-daraz-soldcount.js --apply          # write changes
 *
 * Makes no writes without --apply.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const Book = require('../src/models/book.model');

const CSV_PATH = 'D:/daraz-scraper/data/sold-counts.csv';
const APPLY = process.argv.includes('--apply');

const COMBO_RE = /\bcombo\b|\bbundle\b|\bbox\s*set\b|\bset of \d|\bbuy\s*1\s*get\s*1\b|\d\s*pcs?\b/i;
const isCombo = (title) => COMBO_RE.test(String(title || ''));

const normTitle = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Strips a trailing " by <author>" — but never lets that eat the WHOLE title
// (titles that themselves start with "By ...", e.g. "By The Book: Buddha
// Air...", would otherwise strip to "" — and an empty query string against a
// substring-style match trivially "matches" everything, since
// "anything".includes("") is true in JS. Applied symmetrically to both the
// Books Temple title and the raw Daraz card title so a book differing only by
// that suffix still gets a clean exact match.)
function stripByAuthor(s) {
  const raw = String(s || '');
  const cleaned = raw.replace(/\bby\b.*$/i, '').replace(/\(.*?\)/g, '').trim();
  return cleaned.length > 2 ? cleaned : raw;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function readSoldCounts(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  return lines.slice(1).map(parseCsvLine).map(([sold, ratingCount, price, title, url]) => ({
    sold: parseInt(sold, 10) || 0,
    title,
    url,
  }));
}

(async function main() {
  const rows = readSoldCounts(path.resolve(CSV_PATH));
  console.log(`Loaded ${rows.length} scraped sold-count rows.`);

  const byTitle = new Map(); // normTitle(stripByAuthor(title)) -> [row]
  for (const r of rows) {
    const t = normTitle(stripByAuthor(r.title));
    if (!t) continue;
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(r);
  }

  await connectMongo();
  const books = await Book.find({}).select('slug title soldCount').lean();
  console.log(`Checking ${books.length} Books Temple books against the scrape...\n`);

  const toUpdate = [];
  let ambiguous = 0;
  let noMatch = 0;
  let unchanged = 0;

  for (const b of books) {
    const bookCombo = isCombo(b.title);
    const t = normTitle(stripByAuthor(b.title));
    const all = byTitle.get(t);
    const candidates = (all || []).filter((r) => isCombo(r.title) === bookCombo);

    if (candidates.length === 0) {
      noMatch += 1;
      continue;
    }

    let chosen = candidates[0];
    if (candidates.length > 1) {
      // Multiple listings share this exact normalized title (editions/duplicates)
      // with no author info in this dataset to disambiguate — use the highest
      // sold-count among them (a conservative, defensible pick) rather than
      // guessing which specific edition, but flag it so it's visible below.
      chosen = candidates.reduce((a, c) => (c.sold > a.sold ? c : a), candidates[0]);
      ambiguous += 1;
    }

    if (chosen.sold === b.soldCount) {
      unchanged += 1;
      continue;
    }
    toUpdate.push({ book: b, oldSoldCount: b.soldCount, newSoldCount: chosen.sold });
  }

  console.log(`Would update:     ${toUpdate.length}`);
  console.log(`Multi-candidate (used highest sold): ${ambiguous}`);
  console.log(`No exact match in scrape:            ${noMatch}`);
  console.log(`Already matches (no-op):              ${unchanged}\n`);

  console.log('--- Sample (first 20) ---');
  for (const u of toUpdate.slice(0, 20)) {
    console.log(`  [${u.book.slug}] "${u.book.title}"  soldCount ${u.oldSoldCount} -> ${u.newSoldCount}`);
  }
  console.log('');

  if (!APPLY) {
    console.log(`DRY RUN — no writes made. ${toUpdate.length} book(s) would be updated. Re-run with --apply to write.`);
    await disconnectMongo();
    process.exit(0);
  }

  const backupPath = path.resolve(__dirname, `../../daraz-soldcount-backup-${Date.now()}.csv`);
  const backupRows = ['slug,title,old_sold_count,new_sold_count'];
  for (const u of toUpdate) backupRows.push([u.book.slug, JSON.stringify(u.book.title), u.oldSoldCount, u.newSoldCount].join(','));
  fs.writeFileSync(backupPath, backupRows.join('\n'), 'utf8');
  console.log(`Backup of pre-change soldCount values written to ${backupPath}`);

  let updated = 0;
  let failed = 0;
  for (const u of toUpdate) {
    try {
      await Book.updateOne({ _id: u.book._id }, { $set: { soldCount: u.newSoldCount } });
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`  FAILED [${u.book.slug}]: ${err.message}`);
    }
  }

  console.log(`\nApplied ${updated} update(s), ${failed} failure(s).`);
  await disconnectMongo();
  process.exit(0);
})().catch((err) => {
  console.error('Sold-count import failed:', err.message);
  process.exit(1);
});
