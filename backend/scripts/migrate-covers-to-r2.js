'use strict';

/*
 * Take ownership of the cover images.
 *
 * restore-covers-from-scrape.js got the shop working again by pointing every
 * cover at the supplier's CDN. That was a bridge, not a home: img.drz.lazcdn.com
 * belongs to someone else, serves at their discretion, and can start refusing
 * hotlinks any day without warning. This copies each cover into our own R2
 * bucket and repoints the catalogue at that.
 *
 * Two sizes are written per book, because R2 does not transform:
 *
 *   covers/<slug>.webp       720px — the detail page
 *   covers/<slug>-300.webp   300px — cards and thumbnails, ~8KB against ~25KB
 *
 * The 300 matters more than it looks. A catalogue page shows 48 covers; served
 * at full size that is 1.2MB of images, against 384KB at thumbnail size, and
 * CLAUDE.md's target is LCP under 2.5s on 3G. frontend/src/lib/image-loader.ts
 * picks between them from the width next/image asks for, so nothing else in the
 * app needs to know there are two.
 *
 * Keys are derived from the slug rather than randomised. Cloudinary's uploader
 * was never given a public_id, so every asset had a random name and, when the
 * account was deactivated, nothing could be asked for by name — the covers were
 * only recoverable because a supplier scrape happened to be on disk. A
 * slug-keyed bucket can be rebuilt from the catalogue alone.
 *
 * Source is whatever coverImage.secureUrl currently points at, so this runs
 * after the restore script and needs no matching logic of its own. Books still
 * holding a dead Cloudinary URL are skipped: there is nothing to fetch.
 *
 * Resumable — anything already on R2_PUBLIC_BASE is left alone — so an
 * interrupted run is just re-run.
 *
 * Dry run by default.
 *   node scripts/migrate-covers-to-r2.js
 *   node scripts/migrate-covers-to-r2.js --apply
 *   node scripts/migrate-covers-to-r2.js --apply --limit 50 --concurrency 6
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const { uploadBuffer } = require('../src/config/storage');

const APPLY = process.argv.includes('--apply');

function argNum(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) ? n : fallback;
}
const LIMIT = argNum('--limit', Infinity);
const CONCURRENCY = argNum('--concurrency', 6);

const THUMB_WIDTH = 300;
const FULL_WIDTH = 720;

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function pool(items, size, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

(async function main() {
  const publicBase = (process.env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');
  if (!publicBase) {
    console.error('R2_PUBLIC_BASE is not set — nothing would be reachable after the move.');
    process.exit(1);
  }

  await connectMongo();
  try {
    const books = await Book.find({})
      .select('slug title coverImage isActive')
      .lean();

    const todo = [];
    const skipped = { done: 0, noSource: 0 };

    for (const b of books) {
      const url = b.coverImage?.secureUrl || '';
      if (url.startsWith(publicBase)) {
        skipped.done += 1;
        continue;
      }
      // A dead Cloudinary URL is not a source — there is nothing behind it.
      if (!url || url.includes('res.cloudinary.com')) {
        skipped.noSource += 1;
        continue;
      }
      todo.push({ _id: b._id, slug: b.slug, title: b.title, isActive: b.isActive, source: url });
    }

    const batch = todo.slice(0, LIMIT);

    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${books.length} book(s) in the catalogue`);
    console.log(`  to migrate       : ${batch.length}${batch.length !== todo.length ? ` (of ${todo.length})` : ''}`);
    console.log(`  already on R2    : ${skipped.done}`);
    console.log(`  no usable source : ${skipped.noSource}   <- still on the dead host, nothing to copy`);
    console.log(`  target           : ${publicBase}/covers/\n`);

    if (!APPLY) {
      console.log('first 5 that would move:');
      batch.slice(0, 5).forEach((b) =>
        console.log(`  ${b.slug.slice(0, 46).padEnd(48)} <- ${b.source.slice(0, 54)}`)
      );
      console.log('\nNothing was written. Re-run with --apply.');
      return;
    }

    const done = [];
    const failed = [];
    let n = 0;

    await pool(batch, CONCURRENCY, async (b) => {
      try {
        const res = await fetch(b.source, {
          headers: { Referer: 'https://www.bookstemple.com/' },
        });
        if (!res.ok) throw new Error(`source HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        // Guard against a CDN handing back an error page or a 1px placeholder.
        if (buf.length <= 1024) throw new Error(`source too small (${buf.length}B)`);

        const fullKey = `covers/${b.slug}.webp`;
        const thumbKey = `covers/${b.slug}-${THUMB_WIDTH}.webp`;

        const full = await uploadBuffer(buf, { key: fullKey, maxWidth: FULL_WIDTH });
        await uploadBuffer(buf, { key: thumbKey, maxWidth: THUMB_WIDTH, quality: 80 });

        await Book.updateOne(
          { _id: b._id },
          { $set: { 'coverImage.publicId': fullKey, 'coverImage.secureUrl': full.secure_url } }
        );
        done.push({ ...b, newUrl: full.secure_url, bytes: full.bytes });
      } catch (err) {
        failed.push({ ...b, reason: err.message.slice(0, 80) });
      }
      n += 1;
      if (n % 200 === 0) console.log(`  ${n}/${batch.length}  ok:${done.length} failed:${failed.length}`);
    });

    const stamp = Date.now();
    const csv = path.join(__dirname, '..', `migrate-r2-backup-${stamp}.csv`);
    fs.writeFileSync(
      csv,
      ['slug,isActive,source_url,new_url']
        .concat(done.map((d) => [d.slug, d.isActive, d.source, d.newUrl].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );

    console.log(`\nmigrated : ${done.length}`);
    console.log(`failed   : ${failed.length}`);
    if (failed.length) {
      const why = {};
      for (const f of failed) why[f.reason.replace(/\d+/g, 'N')] = (why[f.reason.replace(/\d+/g, 'N')] || 0) + 1;
      Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .forEach(([r, c]) => console.log(`  ${String(c).padStart(5)}  ${r}`));
    }
    const mb = done.reduce((s, d) => s + d.bytes, 0) / 1024 / 1024;
    console.log(`stored   : ${mb.toFixed(0)} MB of full-size covers (plus thumbnails)`);
    console.log(`CSV      : ${csv}`);

    logger.info({ migrated: done.length, failed: failed.length }, 'Covers migrated to R2');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'migrate-covers-to-r2 failed');
  process.exit(1);
});
