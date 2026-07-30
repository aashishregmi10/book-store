'use strict';

/**
 * Delete Cloudinary assets that nothing in the database references.
 *
 * Book covers are cleaned up on update/delete (admin.route.js cleanupImages),
 * and articles now are too — but two sources still orphan assets and always
 * will:
 *   • An admin uploads an image, then abandons the form without saving. The
 *     upload already happened; nothing ever references it.
 *   • Bulk cover-fix scripts that replaced a cover without destroying the old
 *     asset (see the daraz-cover-fix-backup-*.csv files at the repo root).
 *
 * So this is a periodic reaper, not a substitute for inline cleanup.
 *
 * SAFETY: builds the referenced set from every model that stores a publicId. If
 * a new model starts storing images, add it here BEFORE running, or its images
 * will be treated as orphans and deleted.
 *
 * Usage:
 *   node scripts/prune-orphan-images.js                    # dry run
 *   node scripts/prune-orphan-images.js --apply
 *   node scripts/prune-orphan-images.js --apply --older-than 7   # only 7+ days old
 */

require('dotenv').config({ quiet: true });

const { getCloudinary, deleteImage } = require('../src/config/cloudinary');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const Book = require('../src/models/book.model');
const Article = require('../src/models/article.model');
const User = require('../src/models/user.model');
const Order = require('../src/models/order.model');
const Notification = require('../src/models/notification.model');

function parseArgs(argv) {
  const a = { apply: false, olderThanDays: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--older-than') a.olderThanDays = Number(argv[i + 1]) || 0;
  }
  return a;
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

async function referencedPublicIds() {
  const ids = new Set();

  const books = await Book.find().select('coverImage.publicId images.publicId variants').lean();
  for (const b of books) {
    if (b.coverImage?.publicId) ids.add(b.coverImage.publicId);
    for (const i of b.images || []) if (i?.publicId) ids.add(i.publicId);
  }

  for (const a of await Article.find().select('coverImage.publicId').lean()) {
    if (a.coverImage?.publicId) ids.add(a.coverImage.publicId);
  }

  for (const u of await User.find({ avatarPublicId: { $nin: [null, ''] } }).select('avatarPublicId').lean()) {
    if (u.avatarPublicId) ids.add(u.avatarPublicId);
  }

  // Notifications can carry a promo banner. Empty today, but included so this
  // reaper doesn't start deleting live banners the moment that feature is used.
  for (const n of await Notification.find({ 'image.publicId': { $nin: [null, ''] } }).select('image.publicId').lean()) {
    if (n.image?.publicId) ids.add(n.image.publicId);
  }

  // Order line items snapshot a cover URL rather than a publicId. Those are
  // historical receipts, so their images must never be reaped even when the
  // book itself is long gone — derive the publicId back out of the URL.
  for (const o of await Order.find({ 'items.coverImage': /res\.cloudinary\.com/ }).select('items.coverImage').lean()) {
    for (const it of o.items || []) {
      const m = String(it.coverImage || '').match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-z0-9]+$/i);
      if (m) ids.add(m[1]);
    }
  }

  return ids;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cloudinary = getCloudinary();
  await connectMongo();

  const referenced = await referencedPublicIds();

  const stored = [];
  let cursor;
  do {
    const r = await cloudinary.api.resources({ type: 'upload', max_results: 500, next_cursor: cursor });
    stored.push(...r.resources.map((x) => ({ id: x.public_id, bytes: x.bytes, createdAt: new Date(x.created_at) })));
    cursor = r.next_cursor;
  } while (cursor);

  const cutoff = args.olderThanDays ? Date.now() - args.olderThanDays * 86400000 : Infinity;
  const orphans = stored.filter((s) => !referenced.has(s.id) && s.createdAt.getTime() < cutoff);

  console.log(`${args.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`  referenced in DB : ${referenced.size}`);
  console.log(`  stored in Cloudinary: ${stored.length} (${mb(stored.reduce((a, b) => a + b.bytes, 0))})`);
  console.log(`  orphaned         : ${orphans.length} (${mb(orphans.reduce((a, b) => a + b.bytes, 0))})`);
  if (args.olderThanDays) console.log(`  (only assets older than ${args.olderThanDays} day(s))`);

  orphans.slice(0, 10).forEach((o) => console.log(`      ${o.id}  ${mb(o.bytes)}`));
  if (orphans.length > 10) console.log(`      … and ${orphans.length - 10} more`);

  if (!args.apply) {
    console.log('\nNothing deleted. Re-run with --apply.');
    await disconnectMongo();
    return;
  }

  let ok = 0;
  for (const o of orphans) {
    try {
      await deleteImage(o.id);
      ok += 1;
      if (ok % 25 === 0) console.log(`  … ${ok}/${orphans.length}`);
    } catch (err) {
      console.log(`  FAILED ${o.id}: ${err.message}`);
    }
  }
  console.log(`\ndeleted ${ok}/${orphans.length} orphaned asset(s), freeing ${mb(orphans.reduce((a, b) => a + b.bytes, 0))}`);

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err.message);
  await disconnectMongo().catch(() => {});
  process.exit(1);
});
