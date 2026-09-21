'use strict';

/*
 * Normalise supplier stock to the shop's standing baseline of 2 copies per
 * title (book.model.js: "the shop carries a standing 2 copies of every title";
 * LOW_STOCK_AT is 1, so stock 2 reads as in-stock). This gives the supplier-sync
 * a clean 2<->0 signal: in stock at New Book House keeps 2, gone flips to 0.
 *
 * Scope: books supplied by New Book House / New International Books Center only,
 * and never a title an admin has marked 'discontinued'. Because updateMany
 * bypasses the pre('validate') hook that derives stockStatus, stockStatus is set
 * explicitly alongside stock.
 *
 *   node scripts/set-stock-baseline.js            # dry run (default)
 *   node scripts/set-stock-baseline.js --apply     # write
 *
 * Makes no writes without --apply.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const { cacheDel } = require('../src/config/redis');
const Book = require('../src/models/book.model');

const BASELINE = 2;
const SUPPLIERS = ['New Book House', 'New International Books Center'];
const APPLY = process.argv.includes('--apply');

// stock 2 with LOW_STOCK_AT=1 derives to in-stock; set it explicitly since
// updateMany skips the model's pre('validate') derivation.
const SCOPE = { supplier: { $in: SUPPLIERS }, stockStatus: { $ne: 'discontinued' } };

(async function main() {
  await connectMongo();
  try {
    const total = await Book.countDocuments(SCOPE);
    // Only rows that would actually change (stock != baseline OR status not in-stock).
    const toChange = await Book.countDocuments({
      ...SCOPE,
      $or: [{ stock: { $ne: BASELINE } }, { stockStatus: { $ne: 'in-stock' } }],
    });

    const byStock = await Book.aggregate([
      { $match: SCOPE },
      { $group: { _id: '$stock', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);

    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — baseline stock = ${BASELINE}`);
    console.log(`in scope (NBH/NIBC, not discontinued): ${total}`);
    console.log(`current stock distribution: ${JSON.stringify(byStock.map((s) => ({ stock: s._id, n: s.n })))}`);
    console.log(`would change: ${toChange}\n`);

    if (!APPLY) {
      console.log('Nothing written. Re-run with --apply.');
      return;
    }

    // Backup the pre-change stock/status of the rows we are about to touch.
    const rows = await Book.find({
      ...SCOPE,
      $or: [{ stock: { $ne: BASELINE } }, { stockStatus: { $ne: 'in-stock' } }],
    }).select('slug title stock stockStatus').lean();
    const backupPath = path.resolve(__dirname, `../../stock-baseline-backup-${Date.now()}.csv`);
    fs.writeFileSync(
      backupPath,
      ['slug,title,old_stock,old_status'].concat(
        rows.map((b) => [b.slug, JSON.stringify(b.title || ''), b.stock, b.stockStatus].join(','))
      ).join('\n'),
      'utf8'
    );
    console.log(`Backup of ${rows.length} pre-change rows -> ${backupPath}`);

    const res = await Book.updateMany(
      { ...SCOPE, $or: [{ stock: { $ne: BASELINE } }, { stockStatus: { $ne: 'in-stock' } }] },
      { $set: { stock: BASELINE, stockStatus: 'in-stock' } }
    );
    console.log(`Updated ${res.modifiedCount} book(s) to stock ${BASELINE} / in-stock.`);

    await Promise.all([
      cacheDel('books_list:*'),
      cacheDel('featured_books'),
      cacheDel('filters_metadata'),
      cacheDel('genre:*'),
    ]);
    console.log('Catalogue caches invalidated.');
  } finally {
    await disconnectMongo();
  }
  process.exit(0);
})().catch((err) => {
  console.error('set-stock-baseline failed:', err.message);
  process.exit(1);
});
