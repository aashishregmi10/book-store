'use strict';

/*
 * Import the Daraz scraper's dataset (D:\daraz-scraper\data\books.jsonl) into the
 * store as LIVE/active books, using the authoritative scraped fields (title,
 * author, price, ISBN-13/10, pages, weight, language, cover).
 *
 * Descriptions: the raw Daraz text is boilerplate, so each book's description is
 * (1) the cleaned Daraz blurb when one survives, else (2) enriched from Google
 * Books by ISBN, else (3) a generated editorial blurb — never the boilerplate.
 * Genre: parsed from Daraz when present → Google categories (only when we already
 * fetched them for the description) → a `--genre` fallback. Covers come from the
 * scraped Daraz image.
 *
 * Idempotent/resumable: a book whose ISBN or slug already exists is skipped.
 *
 *   node scripts/import-from-scrape.js [jsonl] --stock 4 [--genre general]
 *        [--concurrency 2] [--limit N] [--no-enrich]
 *
 * Requires MONGODB_URI, CLOUDINARY_*, and (for enrichment) GOOGLE_BOOKS_API_KEY.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');
const { lookupByIsbn } = require('../src/utils/bookLookup');
const { normalizeIsbns } = require('../src/utils/isbn');
const { detectOrigin } = require('../src/utils/bookOrigin');
const { mapGenre } = require('../src/utils/genreMap');
const { uploadCover } = require('../src/utils/coverUpload');
const { cleanDaraz, isMeaningful, templateDescription, genreHint } = require('../src/utils/cleanDescription');

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const titleCase = (slug) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseFormat(raw) {
  if (!raw) return undefined;
  if (/hardcover|hardback/i.test(raw)) return 'Hardcover';
  if (/paperback/i.test(raw)) return 'Paperback';
  return undefined;
}

function parseArgs(argv) {
  const a = { jsonl: 'D:/daraz-scraper/data/books.jsonl', genre: 'unclassified', stock: 4, concurrency: 2, limit: Infinity, enrich: true };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--genre') a.genre = argv[++i];
    else if (v === '--stock') a.stock = parseInt(argv[++i], 10) || 0;
    else if (v === '--concurrency') a.concurrency = Math.max(1, parseInt(argv[++i], 10) || 2);
    else if (v === '--limit') a.limit = parseInt(argv[++i], 10) || Infinity;
    else if (v === '--no-enrich') a.enrich = false;
    else if (!v.startsWith('--')) a.jsonl = v;
  }
  return a;
}

function readBooks(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

const STAGGER_MS = 600; // spacing for Google lookups (only blank-description rows hit it)

async function importBook(b, opts) {
  const norm = b.isbn13 ? normalizeIsbns(b.isbn13) : null;
  const isbn13 = norm?.isbn13 && /^\d{13}$/.test(norm.isbn13) ? norm.isbn13 : '';
  const slug = slugify(b.title || '');
  if (!slug) return { status: 'failed', title: b.title, error: 'no title' };

  // Resume / dedupe.
  const exists = await Book.exists({ $or: [...(isbn13 ? [{ isbn: isbn13 }] : []), { slug }] });
  if (exists) return { status: 'skipped', title: b.title };

  // ── Description ──
  let meta = null;
  let description = '';
  const cleaned = cleanDaraz(b.description);
  if (isMeaningful(cleaned, b.title)) {
    description = cleaned;
  } else if (opts.enrich && isbn13) {
    try { meta = await lookupByIsbn(isbn13); } catch { meta = null; }
    if (meta?.description && isMeaningful(meta.description, b.title)) description = meta.description.trim();
  }
  if (!isMeaningful(description, b.title)) {
    description = templateDescription({ title: b.title, author: b.author, pages: b.pages, format: parseFormat(b.description), language: b.language });
  }

  // ── Genre / section ──
  const origin = detectOrigin({ isbn13, publisher: b.brand, author: b.author, title: b.title, language: b.language });
  let mapped = null;
  const hint = genreHint(b.description);
  if (hint) mapped = mapGenre([hint], origin.signals);
  // Reuse categories only if we already fetched meta for the description (no extra call).
  if (!mapped && meta?.categories?.length) mapped = mapGenre(meta.categories, origin.signals);
  let genre;
  let category = null;
  if (mapped?.category) category = mapped.category;
  else if (mapped?.genre) genre = mapped.genre;
  else genre = slugify(opts.genre);

  // ── Cover (Daraz image first, provider as fallback) ──
  const coverImage = await uploadCover([b.coverUrl, meta?.coverUrl], b.title || isbn13 || 'cover');
  if (!coverImage) return { status: 'no_cover', title: b.title };

  if (genre) {
    await Genre.updateOne({ slug: genre }, { $setOnInsert: { slug: genre, name: titleCase(genre), isActive: true } }, { upsert: true });
  }

  try {
    await Book.create({
      slug,
      title: b.title,
      author: b.author || 'Unknown',
      isbn: isbn13 || undefined,
      genre,
      category,
      price: Number.isFinite(b.price) ? b.price : 0,
      stock: opts.stock,
      coverImage,
      description,
      condition: 'new',
      isActive: true,
      supplier: b.brand || undefined, // the Daraz seller (NOT the publisher)
      specifications: {
        format: parseFormat(b.description),
        pages: b.pages || undefined,
        language: b.language || meta?.specifications?.language || undefined,
        // Real publisher only — comes from Google when we enriched this book;
        // the dedicated fix-publishers script backfills the rest by ISBN.
        publisher: meta?.specifications?.publisher || undefined,
        weight: b.weight || undefined,
        isbn10: b.isbn10 || norm?.isbn10 || undefined,
      },
    });
    return { status: 'created', title: b.title, slug, genre: genre || category, enriched: !!meta };
  } catch (err) {
    return { status: err?.code === 11000 ? 'skipped' : 'failed', title: b.title, error: err?.message };
  }
}

async function run(books, opts) {
  const results = new Array(books.length);
  let next = 0;
  const worker = async () => {
    while (next < books.length) {
      const i = next; next += 1;
      results[i] = await importBook(books[i], opts);
      const r = results[i];
      logger.info({ i: i + 1, total: books.length, status: r.status, title: r.title, genre: r.genre }, 'import');
      if (next < books.length) await sleep(STAGGER_MS);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, books.length) }, worker));
  return results;
}

(async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const jsonlPath = path.resolve(opts.jsonl);
  if (!fs.existsSync(jsonlPath)) {
    logger.error({ jsonlPath }, 'JSONL file not found');
    process.exit(1);
  }
  let books = readBooks(jsonlPath);
  if (books.length > opts.limit) books = books.slice(0, opts.limit);
  if (!opts.enrich) logger.warn('Enrichment disabled — blank descriptions will use the generated template');
  logger.info({ books: books.length, stock: opts.stock, fallbackGenre: opts.genre, enrich: opts.enrich }, 'Starting import (active books)');

  await connectMongo();
  let results = [];
  try {
    results = await run(books, opts);
  } finally {
    await disconnectMongo();
  }

  const tally = results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  const failed = results.filter((r) => r.status === 'no_cover' || r.status === 'failed');
  if (failed.length) {
    const failPath = jsonlPath.replace(/\.jsonl$/i, '') + '.import-failures.csv';
    fs.writeFileSync(failPath, ['title,reason', ...failed.map((r) => `${JSON.stringify(r.title || '')},${r.status}`)].join('\n'), 'utf8');
    logger.warn({ failPath }, 'Wrote failures CSV');
  }
  logger.info({ tally }, 'Import complete — books are LIVE (isActive:true). Storefront may lag until cache revalidation.');
  process.exit(0);
})().catch((err) => {
  logger.error({ err: err.message }, 'Importer crashed');
  process.exit(1);
});
