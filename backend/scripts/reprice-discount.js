'use strict';

/**
 * Re-price the catalogue to a target discount off comparePrice.
 *
 * `price` is what the customer pays; `comparePrice` is the struck-through
 * original. The shop-wide discount is set here and the catalogue is re-priced
 * to match it:
 *
 *     price = roundUp5(comparePrice * (1 - pct/100))
 *
 * Rounding is CEILING to the nearest 5 rupees, per the shop's convention, and
 * it is also what keeps every stored price a whole number of rupees:
 *   786 * 0.90 = 707.40  ->  710
 *   861 * 0.90 = 774.90  ->  775
 * Never plain Math.round: 707.40 would land on 705, and the shop prices up.
 *
 * A side effect worth knowing: on cheap books the 5-rupee ceiling eats part of
 * the discount, so a 152 book at 10% lands on 140 and shows 8%. That is the
 * convention working as intended, not a rounding bug.
 *
 * Notes on correctness:
 *  - Variant books (hardcover/paperback) carry their own price/comparePrice and
 *    the model's pre-validate hook derives the top-level price as the cheapest
 *    variant. Those go through save() so the hook runs; a bulk update would
 *    bypass it and leave the top-level price stale. Simple books use bulkWrite.
 *  - Books with no usable comparePrice (missing, 0, or <= price) are SKIPPED,
 *    not invented. Repricing those would mean fabricating an original price.
 *  - A new price is never allowed to meet or exceed comparePrice; that would
 *    render a 0% badge and look like a bug on the storefront.
 *
 * Usage:
 *   node scripts/reprice-discount.js                  # dry run at the default
 *   node scripts/reprice-discount.js --pct 10
 *   node scripts/reprice-discount.js --apply          # writes, after backup
 */

require('dotenv').config({ quiet: true });

// Atlas connection strings are mongodb+srv://, which needs a DNS SRV lookup.
// Some sandboxes refuse the default resolver, so allow an explicit override
// rather than failing to connect at all.
const dns = require('dns');
if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(','));

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Book = require('../src/models/book.model.js');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const pctIdx = args.indexOf('--pct');
// The shop-wide discount. Change here, not at the call site, so a bare run and
// sync-from-supplier.js (which prices new imports) cannot drift apart.
const DEFAULT_PCT = 10;
const PCT = pctIdx !== -1 && Number(args[pctIdx + 1]) > 0 ? Number(args[pctIdx + 1]) : DEFAULT_PCT;

/** Ceiling to the nearest 5 rupees. */
const roundUp5 = (n) => Math.ceil(n / 5) * 5;

/** Target price for a given comparePrice, or null if it cannot be computed. */
function targetPrice(comparePrice) {
  if (!comparePrice || comparePrice <= 0) return null;
  const p = roundUp5(comparePrice * (1 - PCT / 100));
  // A very small comparePrice can round up to >= itself, which would show as a
  // 0% (or negative) discount on the card.
  return p >= comparePrice ? null : p;
}

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
  console.log(`connected to database: ${mongoose.connection.name}`);
  console.log(`mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}   target discount: ${PCT}%\n`);

  const books = await Book.find({ isActive: true })
    .select('slug title price comparePrice stockStatus variants')
    .lean();

  const changes = [];
  const skipped = { noCompare: 0, unpriceable: 0, alreadyCorrect: 0 };

  for (const b of books) {
    const hasVariants = Array.isArray(b.variants) && b.variants.length > 0;

    if (hasVariants) {
      const vNew = b.variants.map((v) => ({ _id: v._id, from: v.price, to: targetPrice(v.comparePrice) }));
      if (vNew.some((v) => v.to === null)) { skipped.unpriceable++; continue; }
      if (vNew.every((v) => v.to === v.from)) { skipped.alreadyCorrect++; continue; }
      changes.push({ _id: b._id, slug: b.slug, variants: vNew, from: b.price, to: Math.min(...vNew.map((v) => v.to)) });
      continue;
    }

    if (!b.comparePrice || b.comparePrice <= 0) { skipped.noCompare++; continue; }
    const to = targetPrice(b.comparePrice);
    if (to === null) { skipped.unpriceable++; continue; }
    if (to === b.price) { skipped.alreadyCorrect++; continue; }
    changes.push({ _id: b._id, slug: b.slug, comparePrice: b.comparePrice, from: b.price, to });
  }

  console.log(`active books             : ${books.length}`);
  console.log(`to be repriced           : ${changes.length}`);
  console.log(`skipped, no comparePrice : ${skipped.noCompare}`);
  console.log(`skipped, unpriceable     : ${skipped.unpriceable}`);
  console.log(`skipped, already ${PCT}%     : ${skipped.alreadyCorrect}\n`);

  const sample = changes.filter((c) => !c.variants).slice(0, 15);
  if (sample.length) {
    console.log('sample (compare -> old -> new, effective %):');
    for (const c of sample) {
      const pct = Math.round(((c.comparePrice - c.to) / c.comparePrice) * 100);
      console.log(
        `  ${String(c.comparePrice).padStart(6)} -> ${String(c.from).padStart(6)} -> ${String(c.to).padStart(6)}  (${String(pct).padStart(2)}%)  ${c.slug.slice(0, 42)}`
      );
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  // Backup before any write, so a bad run is reversible from a file.
  const stamp = Date.now();
  const backup = path.join(__dirname, '..', '..', `reprice-backup-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(changes, null, 1));
  console.log(`\nbackup written: ${backup}`);

  const simple = changes.filter((c) => !c.variants);
  const variant = changes.filter((c) => c.variants);

  if (simple.length) {
    const ops = simple.map((c) => ({ updateOne: { filter: { _id: c._id }, update: { $set: { price: c.to } } } }));
    for (let i = 0; i < ops.length; i += 500) {
      const res = await Book.bulkWrite(ops.slice(i, i + 500), { ordered: false });
      console.log(`  simple books ${i + 1}-${Math.min(i + 500, ops.length)}: modified ${res.modifiedCount}`);
    }
  }

  // Variant books go through save() so pre-validate recomputes the top-level price.
  let vDone = 0;
  for (const c of variant) {
    const doc = await Book.findById(c._id);
    if (!doc) continue;
    for (const v of c.variants) {
      const sub = doc.variants.id(v._id);
      if (sub && v.to !== null) sub.price = v.to;
    }
    await doc.save();
    vDone++;
  }
  if (variant.length) console.log(`  variant books: saved ${vDone}/${variant.length}`);

  console.log('\ndone.');
  await mongoose.disconnect();
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
