'use strict';

/*
 * Put back the catalogue fields the original import never captured.
 *
 * Two different scrapes exist for New Book House, and the catalogue was built
 * from the wrong one. The LISTING endpoint returns spec lines only and carries
 * an author for a minority of books, which is why 673 hidden books sit on
 * 'Unknown'. The PRODUCT PAGE scrape (data-nbh-pdp/books.jsonl, the file
 * sync-from-supplier.js already reads for descriptions and prices) carries an
 * author on 89% of records and an ISBN on 97%.
 *
 * sync-from-supplier.js only ever took description and price out of that file.
 * Everything else it holds has been sitting unused on disk. Measured against
 * the current hidden backlog it can repair:
 *
 *     469 missing authors      (228 matched by ISBN, 241 by exact title)
 *     303 missing ISBNs
 *     838 missing page counts
 *
 * That matters beyond tidiness: author is the one free signal that can shelve
 * these books (see classify-by-author.js), and it is a required field in the
 * Book JSON-LD. Repairing authors roughly doubles what the author classifier
 * can reach.
 *
 * Only ever FILLS A GAP. A field that already holds a real value is never
 * overwritten, because the catalogue has hand-corrected records in it and the
 * scrape is a supplier feed, not a source of truth. ISBN matches are trusted
 * outright; title matches require an exact normalised match and a title long
 * enough not to collide (short generic titles are skipped, since "Poems" would
 * happily match the wrong book).
 *
 * Dry run by default.
 *   node scripts/repair-from-scrape.js
 *   node scripts/repair-from-scrape.js --apply
 *   node scripts/repair-from-scrape.js --apply --active-too   # not just drafts
 *   node scripts/repair-from-scrape.js --apply --isbn-only    # trust ISBN matches only
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');
const { genreHint } = require('../src/utils/cleanDescription');
const { mapGenre } = require('../src/utils/genreMap');

const SCRAPE = process.env.NBH_PDP_SCRAPE || 'D:/daraz-scraper/data-nbh-pdp/books.jsonl';
// Below this length a normalised title is too generic to match on safely.
const MIN_TITLE_CHARS = 12;
const HOLDING = 'unclassified';

function parseArgs(argv) {
  const a = { apply: false, activeToo: false, isbnOnly: false, genre: false, limit: Infinity };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--active-too') a.activeToo = true;
    else if (argv[i] === '--isbn-only') a.isbnOnly = true;
    else if (argv[i] === '--genre') a.genre = true;
    else if (argv[i] === '--limit') a.limit = Number(argv[i + 1]) || Infinity;
  }
  return a;
}

const usable = (v) =>
  v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim().toLowerCase() !== 'unknown';
const normTitle = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cleanIsbn = (s) => String(s || '').replace(/[^0-9X]/gi, '');
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').trim()}"`;

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(SCRAPE)) {
    console.error(`Scrape file not found: ${SCRAPE}`);
    console.error('Set NBH_PDP_SCRAPE if it lives elsewhere.');
    process.exit(1);
  }

  // Index the scrape. A title collision keeps the first record and marks the
  // key ambiguous, so a duplicated title never silently picks a winner.
  const byIsbn = new Map();
  const byTitle = new Map();
  const ambiguous = new Set();
  let records = 0;
  for (const line of fs.readFileSync(SCRAPE, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    records += 1;
    const isbn = cleanIsbn(o.isbn13);
    if (isbn.length === 13) byIsbn.set(isbn, o);
    const t = normTitle(o.title);
    if (t.length >= MIN_TITLE_CHARS) {
      if (byTitle.has(t)) ambiguous.add(t);
      else byTitle.set(t, o);
    }
  }

  await connectMongo();
  try {
    const liveGenres = new Set(
      (await Genre.find({ isActive: true }).select('slug').lean()).map((g) => g.slug)
    );

    const q = args.activeToo ? {} : { isActive: false };
    const books = (await Book.find(q).select('slug title author isbn specifications isActive genre').lean())
      .slice(0, args.limit);

    console.log(`${args.apply ? 'APPLYING' : 'DRY RUN'} — ${books.length} book(s) in scope`);
    console.log(`scrape: ${records} records (${byIsbn.size} by ISBN, ${byTitle.size} by title, ${ambiguous.size} ambiguous titles)`);
    console.log(`match: ${args.isbnOnly ? 'ISBN only' : 'ISBN, then exact title'}\n`);

    const changes = [];
    const counts = { author: 0, isbn: 0, pages: 0, publisher: 0, format: 0, language: 0 };
    let matchedIsbn = 0, matchedTitle = 0, unmatched = 0;

    for (const b of books) {
      const isbn = cleanIsbn(b.isbn);
      let rec = isbn.length === 13 ? byIsbn.get(isbn) : null;
      let via = 'isbn';
      if (!rec && !args.isbnOnly) {
        const t = normTitle(b.title);
        if (t.length >= MIN_TITLE_CHARS && !ambiguous.has(t)) {
          rec = byTitle.get(t);
          via = 'title';
        }
      }
      if (!rec) { unmatched += 1; continue; }
      if (via === 'isbn') matchedIsbn += 1; else matchedTitle += 1;

      const set = {};
      const filled = [];
      if (!usable(b.author) && usable(rec.author)) {
        set.author = String(rec.author).trim();
        filled.push('author');
      }
      if (!usable(b.isbn) && cleanIsbn(rec.isbn13).length === 13) {
        set.isbn = cleanIsbn(rec.isbn13);
        filled.push('isbn');
      }
      const spec = b.specifications || {};
      if (!spec.pages && usable(rec.pages)) {
        const n = parseInt(String(rec.pages).replace(/[^0-9]/g, ''), 10);
        if (n > 0 && n < 20000) { set['specifications.pages'] = n; filled.push('pages'); }
      }
      if (!usable(spec.publisher) && usable(rec.brand)) {
        set['specifications.publisher'] = String(rec.brand).trim();
        filled.push('publisher');
      }
      if (!usable(spec.language) && usable(rec.language)) {
        set['specifications.language'] = String(rec.language).trim();
        filled.push('language');
      }

      // The supplier stamps its own "Genre :" line into the product description
      // for roughly one listing in six. That is a publisher-supplied label, not
      // an inference from the title, so it outranks anything we could guess —
      // but it is only trusted when genreMap can resolve it to one of the 16
      // live slugs. An unrecognised label leaves the book in the holding pen
      // rather than inventing a shelf for it.
      if (args.genre && (!b.genre || b.genre === HOLDING)) {
        const hint = genreHint(rec.description || '');
        if (hint) {
          const r = mapGenre([hint]);
          if (r && r.genre && r.genre !== HOLDING && liveGenres.has(r.genre)) {
            set.genre = r.genre;
            filled.push('genre');
          }
        }
      }

      if (!filled.length) continue;
      for (const f of filled) counts[f] = (counts[f] || 0) + 1;
      changes.push({ ...b, set, filled, via });
    }

    console.log(`matched by ISBN : ${matchedIsbn}`);
    console.log(`matched by title: ${matchedTitle}`);
    console.log(`no scrape record: ${unmatched}\n`);
    console.log(`books with at least one gap to fill: ${changes.length}\n`);
    console.log('fields to be filled:');
    Object.entries(counts).filter(([, n]) => n).sort((a, b) => b[1] - a[1])
      .forEach(([f, n]) => console.log(`  ${String(n).padStart(5)}  ${f}`));

    const authorFills = changes.filter((c) => c.filled.includes('author'));
    if (authorFills.length) {
      console.log('\nfirst 10 author repairs:');
      authorFills.slice(0, 10).forEach((c) =>
        console.log(`  [${c.via}] ${String(c.set.author).slice(0, 28).padEnd(30)} <- ${String(c.title).slice(0, 44)}`)
      );
    }

    const stamp = Date.now();
    const csv = path.join(__dirname, '..', `repair-from-scrape-${stamp}.csv`);
    fs.writeFileSync(
      csv,
      ['slug,title,isActive,matched_via,fields_filled,new_author,new_isbn']
        .concat(changes.map((c) => [
          c.slug, c.title, c.isActive, c.via, c.filled.join(' '), c.set.author || '', c.set.isbn || '',
        ].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );
    console.log(`\nreview CSV: ${csv}`);

    if (!args.apply) {
      console.log('\nNothing was written. Review the CSV, then re-run with --apply.');
      return;
    }

    // `isbn` carries a unique index, and the catalogue contains duplicate
    // records (a hidden copy of an active title). Writing a scraped ISBN onto
    // the second copy is a straight E11000 that aborts the whole run, so claim
    // ISBNs against what is already in the collection and against what earlier
    // rows in this run have just taken. A skipped ISBN is not a failure: the
    // book still gets its author, pages and publisher, and the duplicate pair
    // is reported for dedupe-books.js to deal with separately.
    const taken = new Set(
      (await Book.find({ isbn: { $nin: [null, ''] } }).select('isbn').lean()).map((b) => cleanIsbn(b.isbn))
    );

    let updated = 0;
    let isbnSkipped = 0;
    const failures = [];
    for (const c of changes) {
      const set = { ...c.set };
      if (set.isbn) {
        if (taken.has(set.isbn)) { delete set.isbn; isbnSkipped += 1; }
        else taken.add(set.isbn);
      }
      if (!Object.keys(set).length) continue;
      try {
        await Book.updateOne({ _id: c._id }, { $set: set });
        updated += 1;
      } catch (err) {
        failures.push({ slug: c.slug, err: err.message });
      }
    }
    console.log(`\nupdated            : ${updated}`);
    console.log(`ISBN skipped (dupe): ${isbnSkipped}`);
    if (failures.length) {
      console.log(`failed             : ${failures.length}`);
      failures.slice(0, 5).forEach((f) => console.log(`  ${f.slug}: ${f.err.slice(0, 90)}`));
    }
    logger.info({ updated, isbnSkipped, failed: failures.length, ...counts }, 'Repaired catalogue fields from PDP scrape');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'repair-from-scrape failed');
  process.exit(1);
});
