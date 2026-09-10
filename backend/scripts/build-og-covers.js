'use strict';

/*
 * Give every book a JPEG cover for its Open Graph card.
 *
 * Covers are stored as WebP, which is right for the site — it is half the bytes
 * of an equivalent JPEG and every browser that matters reads it. It is wrong
 * for exactly one consumer.
 *
 * frontend/src/app/books/[slug]/opengraph-image.tsx builds the social share
 * card by compositing the cover with next/og. Its renderer, Satori, has no WebP
 * decoder, and its failure mode is quiet: it logs "Unsupported image type:
 * image/webp" server-side, draws an empty rounded rectangle where the cover
 * should be, and returns HTTP 200 with a perfectly valid PNG. Nothing breaks
 * loudly — every book link shared to Facebook, WhatsApp or Twitter just shows a
 * card with a blank space next to the title. Verified against the live card for
 * /books/ikigai, and reproduced directly: the same layout renders the cover
 * from JPEG and PNG sources and drops it from WebP.
 *
 * So each book gets a third stored file:
 *
 *   covers/<slug>.webp       720px  page, detail view
 *   covers/<slug>-300.webp   300px  cards, drawers, thumbnails
 *   covers/<slug>-og.jpg     420px  the OG card, and nothing else
 *
 * 420px because the card draws the cover into a 336px-wide box and never larger,
 * so anything beyond ~2x is bytes Facebook's crawler downloads and discards.
 *
 * Source is the stored WebP rather than the original supplier image: it is
 * already the picture we ship, it is a local-ish fetch from R2, and it means
 * this can be re-run at any time from the catalogue alone.
 *
 * Resumable — it HEADs the target key and skips what already exists — so an
 * interrupted run is just re-run.
 *
 * Dry run by default.
 *   node scripts/build-og-covers.js
 *   node scripts/build-og-covers.js --apply
 *   node scripts/build-og-covers.js --apply --limit 50 --concurrency 8
 */

require('dotenv').config({ quiet: true });

const { HeadObjectCommand } = require('@aws-sdk/client-s3');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const { uploadBuffer, getStorage } = require('../src/config/storage');

const APPLY = process.argv.includes('--apply');

function argNum(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) ? n : fallback;
}
const LIMIT = argNum('--limit', Infinity);
const CONCURRENCY = argNum('--concurrency', 6);

const OG_WIDTH = 420;

/** covers/<slug>.webp -> covers/<slug>-og.jpg. Mirrors ogCover() in the OG route. */
const ogKeyFor = (webpKey) => webpKey.replace(/\.webp$/, '-og.jpg');

async function alreadyBuilt(key) {
  try {
    await getStorage().send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

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
    console.error('R2_PUBLIC_BASE is not set.');
    process.exit(1);
  }

  await connectMongo();
  try {
    // Only books whose cover is actually on R2 — the handful still holding a
    // dead Cloudinary URL have nothing to convert, and their card correctly
    // renders without a cover.
    const books = await Book.find({ 'coverImage.secureUrl': { $regex: escapeRe(publicBase) } })
      .select('slug title coverImage.secureUrl')
      .lean();

    const todo = books
      .map((b) => {
        const url = b.coverImage.secureUrl;
        const key = url.slice(publicBase.length + 1);
        return { slug: b.slug, title: b.title, url, key, ogKey: ogKeyFor(key) };
      })
      .filter((b) => b.key.endsWith('.webp'));

    const batch = todo.slice(0, LIMIT);

    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${books.length} book(s) with a cover on R2`);
    console.log(`  to build : ${batch.length}${batch.length !== todo.length ? ` (of ${todo.length})` : ''}`);
    console.log(`  width    : ${OG_WIDTH}px JPEG\n`);

    if (!APPLY) {
      console.log('first 5:');
      batch.slice(0, 5).forEach((b) => console.log(`  ${b.key.slice(0, 52).padEnd(54)} -> ${b.ogKey.slice(0, 52)}`));
      console.log('\nNothing was written. Re-run with --apply.');
      return;
    }

    let built = 0;
    let skipped = 0;
    const failed = [];
    let n = 0;

    await pool(batch, CONCURRENCY, async (b) => {
      try {
        if (await alreadyBuilt(b.ogKey)) {
          skipped += 1;
        } else {
          const res = await fetch(b.url);
          if (!res.ok) throw new Error(`source HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length <= 512) throw new Error(`source too small (${buf.length}B)`);
          await uploadBuffer(buf, { key: b.ogKey, maxWidth: OG_WIDTH, quality: 80, format: 'jpeg' });
          built += 1;
        }
      } catch (err) {
        failed.push({ slug: b.slug, reason: err.message.slice(0, 80) });
      }
      n += 1;
      if (n % 250 === 0) console.log(`  ${n}/${batch.length}  built:${built} skipped:${skipped} failed:${failed.length}`);
    });

    console.log(`\nbuilt   : ${built}`);
    console.log(`existed : ${skipped}`);
    console.log(`failed  : ${failed.length}`);
    if (failed.length) {
      const why = {};
      for (const f of failed) {
        const k = f.reason.replace(/\d+/g, 'N');
        why[k] = (why[k] || 0) + 1;
      }
      Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .forEach(([r, c]) => console.log(`  ${String(c).padStart(5)}  ${r}`));
    }

    logger.info({ built, skipped, failed: failed.length }, 'OG cover variants built');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'build-og-covers failed');
  process.exit(1);
});

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
