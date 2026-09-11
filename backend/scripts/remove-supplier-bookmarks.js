'use strict';

/*
 * Cut the supplier's advertising strip off our book covers.
 *
 * Every cover in this catalogue came from a scrape of the supplier's Daraz
 * listings, and on about a fifth of them the supplier had composited a vertical
 * band down the left edge of the product photo. That band is not decoration:
 * it carries "New International Books Center, Kathmandu" with their emblem,
 * "A complete collection of genuine books", and "FREE BOOK MARK". We were
 * running a named competitor's advertisement on our own product pages, on 1,189
 * covers, 1,085 of them live.
 *
 * Re-picking a different photo does not help. Every candidate image the scrape
 * holds for these products carries the same strip — the supplier composites it
 * onto all of them. So the picture has to be edited.
 *
 * There is a second overlay, a gold "ORIGINAL PRODUCT 100% GUARANTEED" roundel,
 * usually at the bottom right. It is deliberately left alone: it names no
 * competitor, and unlike the strip it sits *on top of* the artwork, so removing
 * it would mean inpainting over the cover itself.
 *
 * ── Finding the cut ──────────────────────────────────────────────────────────
 *
 * Two rules were tried and rejected before the one below, and both failures are
 * worth keeping because they look reasonable on paper:
 *
 *   A fixed fraction of the width. Measured strips run 15.8%–17.9%, so any
 *   constant either leaves a sliver behind or eats into the book.
 *
 *   "Cut while the column is blue" — the strip is a blue mountain photograph,
 *   and blueness separates it from most covers beautifully. It also clipped the
 *   A off ANDREW MARR and the S off Situationship, because those books are
 *   themselves blue.
 *
 * What does work is the white gutter the supplier leaves between the strip and
 * the product photo. Profiling columns across many cases: inside the strip, no
 * column is more than 34% background pixels (its logo panel is the brightest
 * part); in the gutter, every column is at least 70%. Cutting at the first
 * column past 55% therefore lands in the gutter every time. The gutter can be a
 * single column wide, so this must not require a run of them — an earlier
 * attempt demanding three consecutive columns at 97% walked straight past a real
 * gutter and left the strip in place.
 *
 * A minority of listings have no gutter at all: the product photo is wide enough
 * that it butts straight against the strip. For those there is a geometric
 * fallback. The strip is one fixed-aspect graphic scaled to the height of
 * whatever canvas it lands on, so its width tracks the image *height*, not the
 * width — measured at 0.149, 0.150, 0.149 and 0.158 of height across the cases
 * that do have a gutter. Cutting at 0.165 of height is therefore just past the
 * strip: into the gutter where one exists, and a couple of pixels into the
 * book's edge where one does not, which is invisible at any display size.
 *
 * ── Guards ───────────────────────────────────────────────────────────────────
 *
 * Four independent checks, and a cover failing any of them is skipped rather
 * than written:
 *
 *   1. the greyscale fingerprint in data/supplier-bookmark-signature.json
 *      matches the cover's left edge;
 *   2. the first non-background column is strip-blue, so a cover with an
 *      incidental pale band is not mistaken for one carrying the strip. Judging
 *      column 0 directly is not enough: a tenth of these listings begin with a
 *      one-to-four pixel white hairline, which reads as "not blue" and, worse,
 *      satisfies the gutter test at x=0;
 *   3. the cut lands between 5% and 26% of the width;
 *   4. re-fingerprinting the cropped result no longer matches.
 *
 * Check 4 is the one that matters. A crop that failed to remove the strip is
 * rejected by the same measurement that found it.
 *
 * ── Why a new key ────────────────────────────────────────────────────────────
 *
 * Covers are uploaded with `Cache-Control: immutable, max-age=31536000` on the
 * promise that a key's contents never change. Overwriting covers/<slug>.webp
 * would keep the bookmarked image in visitors' browser caches for up to a year —
 * and the visitors with a warm cache are exactly the ones who already saw it.
 * So the cleaned set is written under covers/v2/ instead. The frontend needs no
 * change for this: image-loader.ts and the OG card's ogCover() both derive their
 * variants by substituting on the filename, so a directory prefix passes
 * through untouched.
 *
 * The originals stay where they are. Together with the backup CSV, rolling back
 * is restoring two fields per book.
 *
 * Resumable — anything already on covers/v2/ is skipped.
 *
 * Dry run by default.
 *   node scripts/remove-supplier-bookmarks.js
 *   node scripts/remove-supplier-bookmarks.js --report   # full audit CSV, no writes
 *   node scripts/remove-supplier-bookmarks.js --apply
 *   node scripts/remove-supplier-bookmarks.js --apply --limit 25 --concurrency 4
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const { uploadBuffer } = require('../src/config/storage');

const FINGERPRINT = require('../data/supplier-bookmark-signature.json');

const APPLY = process.argv.includes('--apply');
const REPORT = process.argv.includes('--report');

function argNum(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) ? n : fallback;
}
const LIMIT = argNum('--limit', Infinity);
const CONCURRENCY = argNum('--concurrency', 5);

const CLEAN_PREFIX = 'covers/v2';
const THUMB_WIDTH = 300;
const FULL_WIDTH = 720;
const OG_WIDTH = 420;

// Detection
const { stripFraction: STRIP_FRAC, sigWidth: SIG_W, sigHeight: SIG_H, threshold: THRESHOLD } = FINGERPRINT;
const TEMPLATE = Buffer.from(FINGERPRINT.data);

// Cropping
const WHITE = 238;
const GUTTER_WHITE = 0.55;
const BLUE_MIN = 25;
const MIN_FRAC = 0.05;
const MAX_FRAC = 0.26;
// Fallback for listings with no gutter: the strip is a fixed-aspect graphic
// scaled to the canvas height, so its width follows height rather than width.
const HEIGHT_RATIO = 0.165;

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Greyscale fingerprint of a cover's left edge. */
async function fingerprint(buf) {
  const meta = await sharp(buf).metadata();
  const w = Math.max(4, Math.round(meta.width * STRIP_FRAC));
  return sharp(buf)
    .extract({ left: 0, top: 0, width: w, height: meta.height })
    .resize(SIG_W, SIG_H, { fit: 'fill' })
    .greyscale().raw().toBuffer();
}

/** Mean absolute difference against the stored fingerprint, 0 (identical)–255. */
function score(sig) {
  let sum = 0;
  for (let i = 0; i < sig.length; i++) sum += Math.abs(sig[i] - TEMPLATE[i]);
  return sum / sig.length;
}

/** Per-column background fraction and blueness. */
async function columns(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const white = new Float32Array(width);
  const blue = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let w = 0, r = 0, b = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * channels;
      if (data[i] >= WHITE && data[i + 1] >= WHITE && data[i + 2] >= WHITE) w++;
      r += data[i];
      b += data[i + 2];
    }
    white[x] = w / height;
    blue[x] = (b - r) / height;
  }
  return { white, blue, width, height };
}

/** Right edge of the strip in pixels, or a reason it could not be found. */
async function stripEdge(buf) {
  const { white, blue, width, height } = await columns(buf);

  // Walk in to the first column that is unambiguously strip. Two things sit in
  // the way and both have to be stepped over: a hairline of white before the
  // strip begins (one to four pixels, on roughly a tenth of these listings),
  // and then an anti-aliased blend column where the white meets the blue —
  // which measures around 21 blueness and so slips under the threshold on its
  // own. Judging column 0, or the first non-white column, refuses both.
  let start = 0;
  const margin = Math.floor(width * 0.08);
  while (start < margin && (white[start] >= 0.5 || blue[start] < BLUE_MIN)) start += 1;
  if (start >= margin) return { edge: null, width, height, why: 'left edge not strip-blue' };
  const hi = Math.floor(width * MAX_FRAC);
  for (let x = start; x < hi; x++) {
    if (white[x] >= GUTTER_WHITE) {
      if (x < width * MIN_FRAC) return { edge: null, width, height, why: `gutter at ${x}px too close to edge` };
      return { edge: x, width, height, why: 'gutter' };
    }
  }
  // No gutter — the product photo butts against the strip. Fall back to the
  // geometric rule; guard 4 still has to pass before anything is written.
  //
  // Bound it by width as well. Guard 4 cannot catch an over-cut — removing too
  // much only makes the fingerprint match less — so on a tall, narrow canvas,
  // where a height-derived width would be a huge share of the image, refuse
  // instead of guessing.
  const fallback = Math.round(height * HEIGHT_RATIO);
  if (fallback > width * MAX_FRAC) {
    return { edge: null, width, height, why: 'no gutter, and height-ratio cut would be too wide' };
  }
  return { edge: fallback, width, height, why: 'height-ratio' };
}

/** Crop the strip away and re-frame the book. Returns null when no cut is safe. */
async function debookmark(buf) {
  const { edge, width, height, why } = await stripEdge(buf);
  if (edge === null) return { out: null, why };
  const cut = await sharp(buf).extract({ left: edge, top: 0, width: width - edge, height }).toBuffer();
  // Drop the background the cut exposes, then restore an even margin so the
  // book is not left flush against the frame.
  const trimmed = await sharp(cut).trim({ threshold: 12 }).toBuffer();
  const tm = await sharp(trimmed).metadata();
  const pad = Math.round(tm.width * 0.03);
  const out = await sharp(trimmed)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 255, g: 255, b: 255 } })
    .toBuffer();
  return { out, edge, why };
}

async function pool(items, size, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor;
        cursor += 1;
        await worker(items[i], i);
      }
    })
  );
}

(async function main() {
  const publicBase = (process.env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');
  if (!publicBase) {
    console.error('R2_PUBLIC_BASE is not set.');
    process.exit(1);
  }
  const thumbOf = (u) => u.replace(/\.webp$/, `-${THUMB_WIDTH}.webp`);

  await connectMongo();
  try {
    const books = await Book.find({ 'coverImage.secureUrl': { $regex: publicBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } })
      .select('slug title isActive coverImage.secureUrl')
      .lean();

    const pending = books.filter((b) => !b.coverImage.secureUrl.includes(`/${CLEAN_PREFIX}/`));
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${books.length} cover(s) on R2, ${books.length - pending.length} already cleaned\n`);
    console.log('scanning for the supplier strip...');

    const flagged = [];
    let scanned = 0;
    await pool(pending, Math.max(CONCURRENCY, 10), async (b) => {
      try {
        const buf = Buffer.from(await (await fetch(thumbOf(b.coverImage.secureUrl))).arrayBuffer());
        const d = score(await fingerprint(buf));
        if (d < THRESHOLD) flagged.push({ ...b, d: +d.toFixed(1) });
      } catch { /* unreadable cover — leave it alone */ }
      scanned += 1;
      if (scanned % 1500 === 0) console.log(`  ${scanned}/${pending.length}  flagged:${flagged.length}`);
    });

    flagged.sort((a, b) => a.d - b.d);
    const batch = flagged.slice(0, LIMIT);
    const active = flagged.filter((f) => f.isActive).length;

    console.log(`\n  carrying the strip : ${flagged.length}  (${active} active)`);
    console.log(`  this run           : ${batch.length}`);
    console.log(`  writing to         : ${publicBase}/${CLEAN_PREFIX}/\n`);

    if (REPORT) {
      const csv = path.join(__dirname, '..', `bookmark-report-${Date.now()}.csv`);
      fs.writeFileSync(
        csv,
        ['slug,title,isActive,score,current_url']
          .concat(flagged.map((f) => [f.slug, f.title, f.isActive, f.d, f.coverImage.secureUrl].map(csvCell).join(',')))
          .join('\n'),
        'utf8'
      );
      console.log(`report written: ${csv}`);
    }

    if (!APPLY) {
      console.log('first 8 that would be cleaned:');
      batch.slice(0, 8).forEach((b) => console.log(`  score ${String(b.d).padStart(5)}  ${b.slug.slice(0, 58)}`));
      console.log('\nNothing was written. Re-run with --apply.');
      return;
    }

    const done = [];
    const skipped = [];
    const failed = [];
    let n = 0;

    await pool(batch, CONCURRENCY, async (b) => {
      try {
        const res = await fetch(b.coverImage.secureUrl);
        if (!res.ok) throw new Error(`source HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());

        const { out, why } = await debookmark(buf);
        if (!out) {
          skipped.push({ ...b, why });
          return;
        }

        // Guard 4: the crop has to actually have removed it.
        const after = score(await fingerprint(out));
        if (after < THRESHOLD) {
          skipped.push({ ...b, why: `still matches after crop (${after.toFixed(1)})` });
          return;
        }

        const key = `${CLEAN_PREFIX}/${b.slug}.webp`;
        const full = await uploadBuffer(out, { key, maxWidth: FULL_WIDTH });
        await uploadBuffer(out, { key: `${CLEAN_PREFIX}/${b.slug}-${THUMB_WIDTH}.webp`, maxWidth: THUMB_WIDTH, quality: 80 });
        await uploadBuffer(out, { key: `${CLEAN_PREFIX}/${b.slug}-og.jpg`, maxWidth: OG_WIDTH, quality: 80, format: 'jpeg' });

        await Book.updateOne(
          { _id: b._id },
          { $set: { 'coverImage.publicId': key, 'coverImage.secureUrl': full.secure_url } }
        );
        done.push({ ...b, oldUrl: b.coverImage.secureUrl, newUrl: full.secure_url });
      } catch (err) {
        failed.push({ ...b, reason: err.message.slice(0, 80) });
      }
      n += 1;
      if (n % 100 === 0) console.log(`  ${n}/${batch.length}  ok:${done.length} skipped:${skipped.length} failed:${failed.length}`);
    });

    const csv = path.join(__dirname, '..', `bookmark-crop-backup-${Date.now()}.csv`);
    fs.writeFileSync(
      csv,
      ['slug,isActive,score,old_publicId,old_secureUrl,new_secureUrl']
        .concat(done.map((d) => [d.slug, d.isActive, d.d, d.coverImage.publicId || '', d.oldUrl, d.newUrl].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );

    console.log(`\ncleaned : ${done.length}`);
    console.log(`skipped : ${skipped.length}   <- a guard refused; cover left exactly as it was`);
    console.log(`failed  : ${failed.length}`);
    const tally = (rows, field) => {
      const m = {};
      for (const r of rows) {
        const k = String(r[field]).replace(/\d+/g, 'N');
        m[k] = (m[k] || 0) + 1;
      }
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
    };
    if (skipped.length) tally(skipped, 'why').forEach(([w, c]) => console.log(`  ${String(c).padStart(5)}  ${w}`));
    if (failed.length) tally(failed, 'reason').forEach(([w, c]) => console.log(`  ${String(c).padStart(5)}  ${w}`));
    console.log(`CSV     : ${csv}`);

    logger.info({ cleaned: done.length, skipped: skipped.length, failed: failed.length }, 'Supplier bookmarks removed');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'remove-supplier-bookmarks failed');
  process.exit(1);
});
