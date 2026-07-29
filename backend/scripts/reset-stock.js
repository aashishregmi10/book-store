'use strict';

/**
 * Set every title's stock to the shop's standing level (2 copies).
 *
 * The catalogue was imported with arbitrary stock numbers that never reflected
 * what's actually on the shelf. The shop carries two copies of everything.
 *
 * Notes on correctness:
 *  - `discontinued` titles are skipped by default. That status is set by hand
 *    to mean "we are not selling this any more", and restocking it would put a
 *    deliberately retired book back on sale. Pass --include-discontinued to
 *    override.
 *  - Variant books (hardcover/paperback) get 2 of *each* variant — they are
 *    separate physical items. The model's pre-validate hook then recomputes the
 *    top-level stock as the sum, so those go through save() rather than a bulk
 *    update, which would bypass the hook and leave stock/stockStatus stale.
 *
 * Usage:
 *   node scripts/reset-stock.js              # dry run
 *   node scripts/reset-stock.js --apply
 *   node scripts/reset-stock.js --apply --level 3
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const Book = require('../src/models/book.model');

const DEFAULT_LEVEL = 2;

function parseArgs(argv) {
  const a = { apply: false, level: DEFAULT_LEVEL, includeDiscontinued: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--include-discontinued') a.includeDiscontinued = true;
    else if (argv[i] === '--level') a.level = Number(argv[i + 1]);
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(args.level) || args.level < 0) throw new Error('--level must be a non-negative integer');

  await connectMongo();

  const filter = args.includeDiscontinued ? {} : { stockStatus: { $ne: 'discontinued' } };
  const total = await Book.countDocuments(filter);
  const skipped = args.includeDiscontinued ? 0 : await Book.countDocuments({ stockStatus: 'discontinued' });
  const variantIds = await Book.find({ ...filter, 'variants.0': { $exists: true } }).select('_id').lean();

  console.log(`${args.apply ? 'APPLY' : 'DRY RUN'} — setting stock to ${args.level}`);
  console.log(`  books in scope        : ${total}`);
  console.log(`  …of which have variants: ${variantIds.length} (each variant set to ${args.level})`);
  console.log(`  discontinued skipped  : ${skipped}`);

  if (!args.apply) {
    console.log('\nNothing was written. Re-run with --apply.');
    await disconnectMongo();
    return;
  }

  // Plain books: one bulk update. stockStatus is set explicitly because
  // updateMany does not run the pre-validate hook that normally derives it.
  const status = args.level === 0 ? 'out-of-stock' : args.level <= 1 ? 'low-stock' : 'in-stock';
  const plain = await Book.updateMany(
    { ...filter, 'variants.0': { $exists: false } },
    { $set: { stock: args.level, stockStatus: status } }
  );
  console.log(`\nplain books updated   : ${plain.modifiedCount}`);

  // Variant books: save() so the hook recomputes the top-level stock/status
  // from the variant array rather than us duplicating that logic here.
  let variantsUpdated = 0;
  for (const { _id } of variantIds) {
    const book = await Book.findById(_id);
    if (!book) continue;
    book.variants.forEach((v) => {
      v.stock = args.level;
    });
    await book.save();
    variantsUpdated += 1;
  }
  console.log(`variant books updated : ${variantsUpdated}`);

  const after = await Book.aggregate([{ $group: { _id: '$stockStatus', n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  console.log('\nresulting stockStatus:');
  after.forEach((s) => console.log(`  ${String(s.n).padStart(5)}  ${s._id}`));

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err.message);
  await disconnectMongo().catch(() => {});
  process.exit(1);
});
