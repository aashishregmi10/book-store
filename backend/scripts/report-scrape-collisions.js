'use strict';

/*
 * Diff a scraped Daraz dataset against what Books Temple already sells, so a
 * second seller/brand import only adds books we don't have.
 *
 * A scraped book "collides" when any of these already exists in the catalogue:
 *   1. isbn      — its ISBN-13 (ISBN-10s are converted first) matches a book's
 *   2. slug      — the slug its title would generate matches a book's slug
 *   3. title     — its normalised title+author matches a live book's
 * ISBN is the strong signal; slug/title catch the (common) untagged listings.
 *
 * Optionally also diffs against a previous scrape (--against) to show how much
 * of the new dataset the earlier harvest already covered.
 *
 * READ-ONLY — it never writes to Mongo. It writes two files next to the input:
 *   <name>.collisions.csv  every row with its verdict and what it matched
 *   <name>.new.jsonl       only the non-colliding books, ready for
 *                          import-from-scrape.js
 *
 *   node scripts/report-scrape-collisions.js <scrape.jsonl> [--against <other.jsonl>]
 *
 * Requires MONGODB_URI.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const { toIsbn13 } = require('../src/utils/isbn');

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Loose title key: lowercase, drop punctuation/diacritics and the noise words
// Daraz pads listings with, so "The Alchemist (Paperback)" == "Alchemist".
const NOISE = /\b(paperback|hardcover|hardback|english|nepali|edition|book|new|by)\b/g;
function titleKey(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Main title (before any subtitle) with ALL separators removed. Daraz listings
// word-break compound titles — "Super Freak Onomics" vs the catalogue's
// "SuperFreakonomics: Global Cooling…" — which defeats both slug and word
// matching. Both of those squash to "superfreakonomics".
// Weak on its own (it would also equate "Sapiens: A Brief History" with
// "Sapiens: A Graphic History"), so a hit here is only ever reported as
// `probable-duplicate` for a human to confirm — never silently skipped.
function squashKey(title) {
  return String(title || '').split(/[:–—|(]/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

const isbnOf = (b) => toIsbn13(b.isbn13 || b.isbn10 || '') || '';

function parseArgs(argv) {
  const a = { jsonl: '', against: '', includeProbable: false };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--against') a.against = argv[++i];
    else if (v === '--include-probable') a.includeProbable = true;
    else if (!v.startsWith('--')) a.jsonl = v;
  }
  return a;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ').trim()}"`;

(async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.jsonl) { logger.error('usage: report-scrape-collisions.js <scrape.jsonl> [--against <other.jsonl>]'); process.exit(1); }
  const jsonlPath = path.resolve(opts.jsonl);
  if (!fs.existsSync(jsonlPath)) { logger.error({ jsonlPath }, 'JSONL not found'); process.exit(1); }

  const scraped = readJsonl(jsonlPath);
  logger.info({ books: scraped.length, file: jsonlPath }, 'Loaded scrape');

  // ── prior scrape (optional) ──
  const priorIsbn = new Set();
  const priorTitle = new Set();
  if (opts.against) {
    const againstPath = path.resolve(opts.against);
    if (!fs.existsSync(againstPath)) { logger.error({ againstPath }, '--against file not found'); process.exit(1); }
    const prior = readJsonl(againstPath);
    prior.forEach((b) => { const i = isbnOf(b); if (i) priorIsbn.add(i); priorTitle.add(titleKey(b.title)); });
    logger.info({ books: prior.length, file: againstPath }, 'Loaded prior scrape for comparison');
  }

  await connectMongo();
  let rows = [];
  let liveCount = 0;
  try {
    // Whole catalogue (drafts included — a hidden draft is still "we have it").
    const books = await Book.find({}, { slug: 1, title: 1, author: 1, isbn: 1, isActive: 1 }).lean();
    liveCount = books.length;
    const byIsbn = new Map();
    const bySlug = new Map();
    const byTitle = new Map();
    const bySquash = new Map(); // key → [books]; only a unique hit is reported
    for (const b of books) {
      const i = toIsbn13(b.isbn || '');
      if (i) byIsbn.set(i, b);
      bySlug.set(b.slug, b);
      const k = titleKey(b.title);
      if (k && !byTitle.has(k)) byTitle.set(k, b);
      const s = squashKey(b.title);
      if (s.length >= 8) bySquash.set(s, [...(bySquash.get(s) || []), b]);
    }
    logger.info({ catalogue: books.length, withIsbn: byIsbn.size }, 'Loaded catalogue');

    // Dedupe within the scrape itself, too — the listing repeats products.
    const seenInScrape = new Set();

    rows = scraped.map((b) => {
      const isbn13 = isbnOf(b);
      const slug = slugify(b.title || '');
      const tkey = titleKey(b.title);

      const selfKey = isbn13 || slug;
      const dupInScrape = seenInScrape.has(selfKey);
      if (selfKey) seenInScrape.add(selfKey);

      const hitIsbn = isbn13 ? byIsbn.get(isbn13) : null;
      const hitSlug = bySlug.get(slug);
      const hitTitle = tkey ? byTitle.get(tkey) : null;
      // Squash only counts when it points at exactly one catalogue book — an
      // ambiguous key ("sapiens") tells us nothing.
      const skey = squashKey(b.title);
      const squashHits = skey.length >= 8 ? (bySquash.get(skey) || []) : [];
      const hitSquash = squashHits.length === 1 ? squashHits[0] : null;
      const hit = hitIsbn || hitSlug || hitTitle || hitSquash;

      let verdict;
      let matchedOn = '';
      if (dupInScrape) { verdict = 'duplicate-in-scrape'; matchedOn = 'self'; }
      else if (hitIsbn) { verdict = 'collides'; matchedOn = 'isbn'; }
      else if (hitSlug) { verdict = 'collides'; matchedOn = 'slug'; }
      else if (hitTitle) { verdict = 'collides'; matchedOn = 'title'; }
      // Held back from the import for review rather than trusted either way.
      else if (hitSquash) { verdict = 'probable-duplicate'; matchedOn = 'squash'; }
      else verdict = 'new';

      return {
        verdict,
        matchedOn,
        title: b.title,
        author: b.author || '',
        isbn13,
        price: b.price ?? '',
        seller: b.sellerName || b.brand || '',
        inPriorScrape: (isbn13 && priorIsbn.has(isbn13)) || priorTitle.has(tkey) ? 'yes' : 'no',
        matchedSlug: hit?.slug || '',
        matchedTitle: hit?.title || '',
        matchedActive: hit ? String(hit.isActive) : '',
        url: b.url || '',
        book: b,
      };
    });
  } finally {
    await disconnectMongo();
  }

  // ── write the report + the importable remainder ──
  const base = jsonlPath.replace(/\.jsonl$/i, '');
  const header = ['verdict', 'matchedOn', 'title', 'author', 'isbn13', 'price', 'seller', 'inPriorScrape', 'matchedSlug', 'matchedTitle', 'matchedActive', 'url'];
  fs.writeFileSync(
    `${base}.collisions.csv`,
    [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n'),
    'utf8'
  );

  const fresh = rows.filter((r) => r.verdict === 'new' || (opts.includeProbable && r.verdict === 'probable-duplicate'));
  fs.writeFileSync(`${base}.new.jsonl`, fresh.map((r) => JSON.stringify(r.book)).join('\n') + (fresh.length ? '\n' : ''), 'utf8');

  const tally = rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});
  const matchBreakdown = rows.filter((r) => r.verdict === 'collides')
    .reduce((a, r) => ((a[r.matchedOn] = (a[r.matchedOn] || 0) + 1), a), {});
  const freshNoIsbn = fresh.filter((r) => !r.isbn13).length;

  logger.info({
    scraped: rows.length,
    catalogue: liveCount,
    tally,
    collidedBy: matchBreakdown,
    importable: fresh.length,
    importableWithoutIsbn: freshNoIsbn,
    heldForReview: opts.includeProbable ? 0 : (tally['probable-duplicate'] || 0),
    alsoInPriorScrape: rows.filter((r) => r.inPriorScrape === 'yes').length,
    report: `${base}.collisions.csv`,
    importableFile: `${base}.new.jsonl`,
  }, 'Collision report complete (read-only — nothing was written to Mongo)');
  process.exit(0);
})().catch((err) => {
  logger.error({ err: err.message }, 'Report crashed');
  process.exit(1);
});
