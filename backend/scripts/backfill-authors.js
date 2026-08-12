'use strict';

/*
 * Give every book a real author.
 *
 * Listing-harvested imports often carry no author at all — Daraz only prints
 * one when the seller bothered to add an "Author:" spec line — so those books
 * land on 'Unknown'. That is bad for SEO (no author in the Book JSON-LD) and
 * bad for the book card, where the author sits in small-caps under the cover.
 *
 * Resolution order per book: Google/Open Library by ISBN (exact edition), then
 * an Open Library title search. Nothing is guessed: a book that resolves to
 * nothing keeps 'Unknown'.
 *
 *   node scripts/backfill-authors.js [--limit N] [--concurrency 2] [--dry]
 *
 * Requires MONGODB_URI. GOOGLE_BOOKS_API_KEY is optional but avoids the 429s
 * that make the Google half of the lookup useless.
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const { lookupByIsbn, lookupSubjects } = require('../src/utils/bookLookup');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAGGER_MS = 600;

// Provider junk that is no better than 'Unknown'.
const JUNK = /^(unknown|various|anonymous|n\/?a|none|author)$/i;

function cleanAuthor(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s || JUNK.test(s) || s.length > 120) return '';
  return s;
}

function parseArgs(argv) {
  const a = { limit: Infinity, concurrency: 2, dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--limit') a.limit = parseInt(argv[++i], 10) || Infinity;
    else if (v === '--concurrency') a.concurrency = Math.max(1, parseInt(argv[++i], 10) || 2);
    else if (v === '--dry') a.dry = true;
  }
  return a;
}

async function resolveOne(book, opts) {
  let author = '';
  let source = '';

  if (book.isbn) {
    try {
      const meta = await lookupByIsbn(book.isbn);
      author = cleanAuthor(meta?.author);
      if (author) source = meta.source || 'isbn';
    } catch { /* fall through to the title search */ }
  }

  if (!author) {
    try {
      const meta = await lookupSubjects({ isbn: book.isbn, title: book.title });
      author = cleanAuthor(meta?.author);
      if (author) source = 'openlibrary-search';
    } catch { /* leave Unknown */ }
  }

  if (!author) return { status: 'unresolved', title: book.title };
  if (!opts.dry) await Book.updateOne({ _id: book._id }, { $set: { author } });
  return { status: 'fixed', title: book.title, author, source };
}

(async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await connectMongo();

  let results = [];
  try {
    let q = Book.find({ author: 'Unknown' }).select('title isbn author').sort({ createdAt: -1 });
    if (opts.limit !== Infinity) q = q.limit(opts.limit);
    const books = await q.lean();
    logger.info({ books: books.length, dry: opts.dry }, 'Backfilling authors');

    results = new Array(books.length);
    let next = 0;
    const worker = async () => {
      while (next < books.length) {
        const i = next; next += 1;
        results[i] = await resolveOne(books[i], opts);
        const r = results[i];
        logger.info({ i: i + 1, total: books.length, status: r.status, title: r.title, author: r.author }, 'author');
        if (next < books.length) await sleep(STAGGER_MS);
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.concurrency, books.length) }, worker));
  } finally {
    await disconnectMongo();
  }

  const tally = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  logger.info({ tally, dry: opts.dry }, opts.dry ? 'Dry run — nothing written' : 'Author backfill complete');
  process.exit(0);
})().catch((err) => {
  logger.error({ err: err.message }, 'Backfill crashed');
  process.exit(1);
});
