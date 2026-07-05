'use strict';

/*
 * Reconcile existing PageTurn books against the authoritative Daraz "New Book
 * House" scrape (D:\daraz-scraper\data\books.jsonl). Earlier imports (Google
 * Books/title-matched) left some books with the WRONG ISBN and a stale price
 * that doesn't match what the seller actually charges.
 *
 * The seller reuses a single book's ISBN on unrelated "combo"/bundle listings
 * (its own ISBN pasted onto a 4-in-1 offer), so a naive ISBN lookup can pick
 * up a bundle's price for a single title. Combo/bundle listings are excluded
 * from candidate pools unless the PageTurn book is itself a combo listing.
 *
 * Matching, in order of confidence:
 *   1. Exact ISBN-13 match (non-combo candidates only) -> price fixed if it
 *      differs. Multiple non-combo candidates with conflicting prices for the
 *      same ISBN -> NEEDS REVIEW.
 *   2. Normalized title match with exactly one non-combo Daraz candidate ->
 *      ISBN + price corrected to the scraped values.
 *   3. Normalized title match with multiple candidates -> disambiguated by
 *      author if possible, else NEEDS REVIEW, left untouched.
 *
 * No-op matches (nothing would actually change) are silently dropped.
 *
 * Every change is logged to a timestamped backup CSV (old values) before any
 * write, so it can be manually reverted.
 *
 *   node scripts/fix-daraz-mismatches.js                # dry run (default)
 *   node scripts/fix-daraz-mismatches.js --apply         # write changes
 *
 * Makes no writes without --apply.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const Book = require('../src/models/book.model');
const { normalizeIsbns } = require('../src/utils/isbn');

const JSONL_PATH = 'D:/daraz-scraper/data/books.jsonl';
const APPLY = process.argv.includes('--apply');

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

// Narrow a candidate pool to non-combo listings unless the PageTurn book
// itself is a combo (in which case keep only combo candidates).
function filterByComboMatch(candidates, bookIsCombo) {
  return candidates.filter((c) => isCombo(c.title) === bookIsCombo);
}

(async function main() {
  const scrape = readScrape(path.resolve(JSONL_PATH));
  console.log(`Loaded ${scrape.length} scraped Daraz records.`);

  const byIsbn13 = new Map(); // isbn13 -> [record]
  const byTitle = new Map(); // normTitle -> [record]
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

  const books = await Book.find({}).select('slug title author isbn price supplier');
  console.log(`Checking ${books.length} PageTurn books against the scrape...\n`);

  const isbnPriceFix = []; // ISBN already correct, price differs
  const titleMatchFix = []; // wrong/missing ISBN, single unambiguous Daraz candidate
  const needsReview = []; // multiple/conflicting candidates, couldn't disambiguate
  let noMatch = 0;
  let noOp = 0;

  for (const b of books) {
    const bookIsbn = b.isbn && /^\d{13}$/.test(b.isbn) ? b.isbn : '';
    const bookCombo = isCombo(b.title);

    if (bookIsbn && byIsbn13.has(bookIsbn)) {
      const all = byIsbn13.get(bookIsbn);
      const candidates = filterByComboMatch(all, bookCombo);

      if (candidates.length === 0) {
        // Only combo listings reuse this ISBN and the book itself isn't one — untrustworthy, skip.
        noMatch += 1;
        continue;
      }
      const prices = new Set(candidates.map((c) => c.price).filter((p) => Number.isFinite(p) && p > 0));
      if (prices.size > 1) {
        needsReview.push({ book: b, candidates });
        continue;
      }
      const r = candidates[0];
      const darazPrice = Number.isFinite(r.price) ? r.price : Number(r.price);
      if (Number.isFinite(darazPrice) && darazPrice > 0 && darazPrice !== b.price) {
        isbnPriceFix.push({ book: b, daraz: r, oldPrice: b.price, newPrice: darazPrice });
      } else {
        noOp += 1;
      }
      continue;
    }

    const t = normTitle(b.title);
    const allCandidates = byTitle.get(t) || [];
    const candidates = filterByComboMatch(allCandidates, bookCombo);

    if (candidates.length === 0) {
      noMatch += 1;
      continue;
    }

    let chosen = candidates[0];
    if (candidates.length > 1) {
      const ba = normAuthor(b.author);
      const authorMatches = candidates.filter((c) => {
        const ca = normAuthor(c.author);
        return ca && ba && (ca.includes(ba) || ba.includes(ca));
      });
      if (authorMatches.length === 1) {
        chosen = authorMatches[0];
      } else {
        // Still ambiguous unless every candidate agrees on isbn13 + price.
        const isbns = new Set(candidates.map((c) => c.isbn13 || ''));
        const prices = new Set(candidates.map((c) => c.price));
        if (isbns.size === 1 && prices.size === 1) {
          chosen = candidates[0];
        } else {
          needsReview.push({ book: b, candidates });
          continue;
        }
      }
    }

    const norm = chosen.isbn13 ? normalizeIsbns(chosen.isbn13) : null;
    const newIsbn = norm?.isbn13 && /^\d{13}$/.test(norm.isbn13) ? norm.isbn13 : undefined;
    const darazPrice = Number.isFinite(chosen.price) ? chosen.price : Number(chosen.price);
    const newPrice = Number.isFinite(darazPrice) && darazPrice > 0 ? darazPrice : b.price;

    const isbnChanged = !!newIsbn && newIsbn !== bookIsbn;
    const priceChanged = newPrice !== b.price;
    if (!isbnChanged && !priceChanged) {
      noOp += 1;
      continue;
    }
    titleMatchFix.push({ book: b, daraz: chosen, oldIsbn: b.isbn || '', newIsbn: isbnChanged ? newIsbn : undefined, oldPrice: b.price, newPrice });
  }

  console.log(`ISBN matched, price stale:      ${isbnPriceFix.length}`);
  console.log(`Title matched, ISBN+price fix:  ${titleMatchFix.length}`);
  console.log(`Ambiguous (needs manual review): ${needsReview.length}`);
  console.log(`No reliable Daraz match:         ${noMatch}`);
  console.log(`Already correct (no-op):        ${noOp}\n`);

  if (isbnPriceFix.length) {
    console.log('--- Price-only fixes (ISBN already correct) ---');
    for (const f of isbnPriceFix) {
      console.log(`  [${f.book.slug}] "${f.book.title}"  price ${f.oldPrice} -> ${f.newPrice}`);
    }
    console.log('');
  }

  if (titleMatchFix.length) {
    console.log('--- ISBN + price fixes (matched by title) ---');
    for (const f of titleMatchFix) {
      console.log(
        `  [${f.book.slug}] "${f.book.title}" by ${f.book.author}\n` +
          `      isbn:  ${f.oldIsbn || '(none)'}${f.newIsbn ? ' -> ' + f.newIsbn : ' (unchanged)'}\n` +
          `      price: ${f.oldPrice} -> ${f.newPrice}`
      );
    }
    console.log('');
  }

  if (needsReview.length) {
    console.log('--- NEEDS MANUAL REVIEW (ambiguous, left untouched) ---');
    for (const f of needsReview) {
      console.log(`  [${f.book.slug}] "${f.book.title}" by ${f.book.author} (current isbn: ${f.book.isbn || 'none'}, price: ${f.book.price})`);
      for (const c of f.candidates) {
        console.log(`      candidate: "${c.title}" by ${c.author || '(no author)'}  isbn13=${c.isbn13 || '-'}  price=${c.price}  ${c.url}`);
      }
    }
    console.log('');
  }

  const toApply = [...isbnPriceFix, ...titleMatchFix];

  if (!APPLY) {
    console.log(`DRY RUN — no writes made. ${toApply.length} book(s) would be updated. Re-run with --apply to write.`);
    await disconnectMongo();
    process.exit(0);
  }

  if (toApply.length === 0) {
    console.log('Nothing to apply.');
    await disconnectMongo();
    process.exit(0);
  }

  const backupPath = path.resolve(__dirname, `../../daraz-scraper-fix-backup-${Date.now()}.csv`);
  const backupRows = ['slug,title,old_isbn,new_isbn,old_price,new_price'];
  for (const f of isbnPriceFix) {
    backupRows.push([f.book.slug, JSON.stringify(f.book.title), f.book.isbn || '', f.book.isbn || '', f.oldPrice, f.newPrice].join(','));
  }
  for (const f of titleMatchFix) {
    backupRows.push([f.book.slug, JSON.stringify(f.book.title), f.oldIsbn, f.newIsbn || f.oldIsbn, f.oldPrice, f.newPrice].join(','));
  }
  fs.writeFileSync(backupPath, backupRows.join('\n'), 'utf8');
  console.log(`Backup of pre-change values written to ${backupPath}`);

  let updated = 0;
  let failed = 0;
  for (const f of toApply) {
    try {
      const update = { price: f.newPrice };
      if (f.newIsbn) update.isbn = f.newIsbn;
      await Book.updateOne({ _id: f.book._id }, { $set: update });
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`  FAILED [${f.book.slug}]: ${err.message}`);
    }
  }

  console.log(`\nApplied ${updated} update(s), ${failed} failure(s).`);
  await disconnectMongo();
  process.exit(0);
})().catch((err) => {
  console.error('Reconciliation failed:', err.message);
  process.exit(1);
});
