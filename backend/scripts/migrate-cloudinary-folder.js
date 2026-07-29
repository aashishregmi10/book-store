'use strict';

/**
 * Move book covers from the pre-rebrand Cloudinary folder to the new one:
 *   pageturn/books/<id>  →  bookstemple/books/<id>
 *
 * The rebrand renamed the upload folder in code, which only affects NEW
 * uploads. Existing covers keep their old publicId, and that path is visible
 * in every rendered <img src>. This migrates the existing ones.
 *
 * READ BEFORE RUNNING — this mutates production assets:
 *   • Cloudinary rename is not free to undo. Old URLs 404 immediately after,
 *     so anything that hotlinked a cover (a shared social card, a Google
 *     Images result) breaks until re-crawled.
 *   • Cover URLs are also embedded in order line-item snapshots. Those are
 *     historical records and are deliberately NOT rewritten, so old orders
 *     will show broken cover thumbnails in the admin. Pass --orders to
 *     rewrite those too.
 *
 * Usage:
 *   node scripts/migrate-cloudinary-folder.js              # dry run (default)
 *   node scripts/migrate-cloudinary-folder.js --apply      # do it
 *   node scripts/migrate-cloudinary-folder.js --apply --limit 20   # test on 20
 *   node scripts/migrate-cloudinary-folder.js --apply --orders     # incl. order snapshots
 *
 * Resumable: it only selects records still on the old prefix, so re-running
 * after a failure picks up where it stopped.
 */

require('dotenv').config({ quiet: true });

const { v2: cloudinary } = require('cloudinary');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const Book = require('../src/models/book.model');
const Order = require('../src/models/order.model');

const OLD_PREFIX = 'pageturn/';
const NEW_PREFIX = 'bookstemple/';

// Cloudinary's upload API tolerates modest concurrency; keep it low so a large
// catalogue can't trip rate limiting halfway and leave a half-migrated state.
const CONCURRENCY = 4;

function parseArgs(argv) {
  const a = { apply: false, limit: Infinity, orders: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--orders') a.orders = true;
    else if (argv[i] === '--limit') a.limit = Number(argv[i + 1]);
  }
  return a;
}

/** Swap the folder prefix in a full Cloudinary delivery URL. */
const rewriteUrl = (url) => (url || '').replace(`/${OLD_PREFIX}`, `/${NEW_PREFIX}`);

async function pool(items, size, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.CLOUDINARY_CLOUD_NAME) throw new Error('Cloudinary is not configured');
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  await connectMongo();

  const books = await Book.find({ 'coverImage.publicId': new RegExp(`^${OLD_PREFIX}`) })
    .select('slug coverImage')
    .limit(args.limit === Infinity ? 0 : args.limit)
    .lean();

  console.log(`${args.apply ? 'APPLY' : 'DRY RUN'} — ${books.length} book cover(s) on the old prefix\n`);

  if (!args.apply) {
    for (const b of books.slice(0, 5)) {
      console.log(`  ${b.coverImage.publicId}\n    → ${b.coverImage.publicId.replace(OLD_PREFIX, NEW_PREFIX)}`);
    }
    if (books.length > 5) console.log(`  … and ${books.length - 5} more`);
    console.log('\nNothing was changed. Re-run with --apply to migrate.');
    await disconnectMongo();
    return;
  }

  let ok = 0;
  const failures = [];

  await pool(books, CONCURRENCY, async (b) => {
    const from = b.coverImage.publicId;
    const to = from.replace(OLD_PREFIX, NEW_PREFIX);
    try {
      // invalidate purges the old URL from the CDN edge; without it the stale
      // path can keep serving for hours and mask a half-done migration.
      const res = await cloudinary.uploader.rename(from, to, { invalidate: true });
      await Book.updateOne(
        { _id: b._id },
        { $set: { 'coverImage.publicId': to, 'coverImage.secureUrl': res.secure_url } }
      );
      ok += 1;
      if (ok % 100 === 0) console.log(`  … ${ok}/${books.length}`);
    } catch (err) {
      failures.push({ slug: b.slug, from, error: err.message });
    }
  });

  console.log(`\ncovers migrated: ${ok}/${books.length}`);
  if (failures.length) {
    console.log(`failed: ${failures.length}`);
    for (const f of failures.slice(0, 10)) console.log(`  ${f.slug}: ${f.error}`);
    console.log('Re-run to retry only the ones still on the old prefix.');
  }

  if (args.orders) {
    // Snapshot URLs on historical orders. Purely cosmetic for the admin view —
    // it does not change what the customer was charged or shipped.
    const orders = await Order.find({ 'items.coverImage': new RegExp(OLD_PREFIX) }).select('items').lean();
    let touched = 0;
    for (const o of orders) {
      const items = o.items.map((i) => ({ ...i, coverImage: rewriteUrl(i.coverImage) }));
      await Order.updateOne({ _id: o._id }, { $set: { items } });
      touched += 1;
    }
    console.log(`order snapshots rewritten: ${touched}`);
  }

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectMongo().catch(() => {});
  process.exit(1);
});
