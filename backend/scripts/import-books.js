'use strict';

/*
 * Bulk book importer (Books Temple Nepal).
 *
 * Reads a CSV of `query,price,image,genre` rows (see scripts/README-import.md),
 * enriches each via Google Books / Open Library, uploads a cover to Cloudinary
 * (provider cover → Daraz image fallback), and creates each book as a DRAFT
 * (isActive:false) for the admin to review and publish.
 *
 * Idempotent & resumable: rows whose ISBN or slug already exist are skipped, and
 * every failure is written to a sibling `<csv>.failures.csv` so a re-run only
 * retries what's left.
 *
 *   node scripts/import-books.js <csv> --genre <fallback> [--stock N]
 *                                       [--concurrency 2] [--limit N]
 *
 * Requires MONGODB_URI, CLOUDINARY_* and (strongly recommended) GOOGLE_BOOKS_API_KEY.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');
const { lookupByIsbn, lookupBook } = require('../src/utils/bookLookup');
const { normalizeIsbns } = require('../src/utils/isbn');
const { detectOrigin } = require('../src/utils/bookOrigin');
const { mapGenre } = require('../src/utils/genreMap');
const { uploadCover } = require('../src/utils/coverUpload');

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const titleCase = (slug) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isIsbnLike = (s) => /^\d{9}[\dXx]$/.test(s) || /^\d{13}$/.test(s);

// ── Minimal RFC-4180 CSV parser (titles can contain commas) ──────────────────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row); }
  return rows;
}

function readRows(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const cells = parseCsv(raw);
  if (!cells.length) return [];
  const header = cells[0].map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const qi = idx('query'); const pi = idx('price'); const ii = idx('image'); const gi = idx('genre'); const ai = idx('author');
  if (qi === -1) throw new Error('CSV must have a "query" column (ISBN or title).');
  return cells.slice(1).map((r) => ({
    query: (r[qi] || '').trim(),
    price: pi !== -1 ? parseInt(r[pi], 10) : undefined,
    image: ii !== -1 ? (r[ii] || '').trim() : undefined,
    genre: gi !== -1 ? (r[gi] || '').trim() : undefined,
    author: ai !== -1 ? (r[ai] || '').trim() : undefined,
  })).filter((r) => r.query);
}

function parseArgs(argv) {
  const args = { csv: null, genre: 'unclassified', stock: 0, concurrency: 2, limit: Infinity };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--genre') args.genre = argv[++i];
    else if (a === '--stock') args.stock = parseInt(argv[++i], 10) || 0;
    else if (a === '--concurrency') args.concurrency = Math.max(1, parseInt(argv[++i], 10) || 2);
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || Infinity;
    else if (!a.startsWith('--') && !args.csv) args.csv = a;
  }
  return args;
}

const STAGGER_MS = 400; // space external API calls to stay under rate limits

// Process one CSV row → { status, ... } describing the outcome. Never throws.
async function importRow(row, opts) {
  const isbnInput = row.query.replace(/[\s-]/g, '');
  const byIsbn = isIsbnLike(isbnInput);
  const norm = byIsbn ? normalizeIsbns(isbnInput) : null;

  // Enrich.
  let meta;
  try {
    meta = byIsbn ? await lookupByIsbn(norm.isbn13 || norm.clean) : await lookupBook({ title: row.query, author: row.author || undefined });
  } catch {
    meta = null;
  }
  if (!meta || !meta.title) return { status: 'not_found', query: row.query };

  const isbn13 = meta.isbn13 || norm?.isbn13 || null;
  const slug = slugify(meta.title);

  // Resume / dedupe.
  const existing = await Book.exists({ $or: [...(isbn13 ? [{ isbn: isbn13 }] : []), { slug }] });
  if (existing) return { status: 'duplicate', query: row.query, slug };

  // Genre / section.
  const origin = detectOrigin({
    isbn13,
    publisher: meta.specifications?.publisher,
    author: meta.author,
    title: meta.title,
    language: meta.specifications?.language,
  });
  let genre;
  let category = null;
  let usedFallback = false;
  if (row.genre) {
    genre = slugify(row.genre);
  } else {
    const mapped = mapGenre(meta.categories, origin.signals);
    if (mapped?.category) category = mapped.category;
    else if (mapped?.genre) genre = mapped.genre;
    else { genre = slugify(opts.genre); usedFallback = true; }
  }

  // Cover: provider first, Daraz image as fallback.
  const coverImage = await uploadCover([meta.coverUrl, row.image], meta.title || isbn13 || 'cover');
  if (!coverImage) return { status: 'no_cover', query: row.query };

  // Ensure a Genre doc exists so the silo/landing page resolves (sections are a fixed enum).
  if (genre) {
    await Genre.updateOne(
      { slug: genre },
      { $setOnInsert: { slug: genre, name: titleCase(genre), isActive: true } },
      { upsert: true }
    );
  }

  try {
    const book = await Book.create({
      slug,
      title: meta.title,
      author: row.author || meta.author || 'Unknown',
      genre,
      category,
      price: Number.isFinite(row.price) ? row.price : 0,
      stock: opts.stock,
      coverImage,
      description:
        meta.description && meta.description.trim().length >= 10
          ? meta.description.trim()
          : `${meta.title}${meta.author ? ` by ${meta.author}` : ''}. Details to be added.`,
      isbn: isbn13 || undefined,
      specifications: {
        pages: meta.specifications?.pages || undefined,
        publisher: meta.specifications?.publisher || undefined,
        publishedDate: meta.specifications?.publishedDate || undefined,
        language: origin.language || meta.specifications?.language || undefined,
      },
      isActive: false,
    });
    return { status: 'created', query: row.query, slug: book.slug, genre: genre || category, usedFallback, source: meta.source };
  } catch (err) {
    return { status: err?.code === 11000 ? 'duplicate' : 'create_failed', query: row.query, error: err?.message };
  }
}

// Bounded-concurrency pool with a stagger between calls.
async function run(rows, opts) {
  const results = new Array(rows.length);
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const i = next; next += 1;
      results[i] = await importRow(rows[i], opts);
      const r = results[i];
      logger.info({ i: i + 1, total: rows.length, status: r.status, query: r.query, slug: r.slug }, 'import');
      if (next < rows.length) await sleep(STAGGER_MS);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, rows.length) }, worker));
  return results;
}

(async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.csv) {
    logger.error('Usage: node scripts/import-books.js <csv> --genre <fallback> [--stock N] [--concurrency 2] [--limit N]');
    process.exit(1);
  }
  const csvPath = path.resolve(opts.csv);
  let rows = readRows(csvPath);
  if (rows.length > opts.limit) rows = rows.slice(0, opts.limit);
  logger.info({ rows: rows.length, fallbackGenre: opts.genre }, 'Starting import');

  await connectMongo();
  let results = [];
  try {
    results = await run(rows, opts);
  } finally {
    await disconnectMongo();
  }

  const tally = results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  const failed = results.filter((r) => r.status !== 'created' && r.status !== 'duplicate');
  if (failed.length) {
    const failPath = csvPath.replace(/\.csv$/i, '') + '.failures.csv';
    const lines = ['query,reason', ...failed.map((r) => `${JSON.stringify(r.query)},${r.status}`)];
    fs.writeFileSync(failPath, lines.join('\n'), 'utf8');
    logger.warn({ failPath }, 'Wrote failures CSV (re-run it to retry)');
  }
  const fallbackCount = results.filter((r) => r.usedFallback).length;
  logger.info({ tally, fallbackGenre: fallbackCount }, 'Import complete — created books are DRAFTS (isActive:false); review & publish in admin');
  process.exit(0);
})().catch((err) => {
  logger.error({ err: err.message }, 'Importer crashed');
  process.exit(1);
});
