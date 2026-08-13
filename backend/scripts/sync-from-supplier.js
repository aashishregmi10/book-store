'use strict';

/*
 * Re-sync the catalogue against New Book House's live product pages.
 *
 * Two jobs, from one scrape (D:/daraz-scraper/data-nbh-pdp/books.jsonl, produced
 * by scrape.js against the seller's product pages rather than the listing
 * endpoint, which returns spec lines only):
 *
 * 1. DESCRIPTIONS. Roughly 1,000 books carry cleanDescription's placeholder
 *    ("A fuller description is on the way") because neither Open Library nor
 *    Google Books had ever heard of them — they are regional and Indian-market
 *    printings. The seller's own product page does have real prose for about
 *    four in five. It arrives wrapped in Daraz's marketplace disclaimer, which
 *    cleanDaraz already knows how to strip.
 *
 * 2. PRICES. Supplier prices drift, and the catalogue was priced at import
 *    time. This re-reads the current price and applies the launch discount:
 *    we sell at DISCOUNT below the supplier's price, and record the supplier
 *    price as `comparePrice` so the saving is visible rather than implied.
 *
 * A book is only touched when there is something better to write: a real
 * description replaces a placeholder or a stub, never a description someone
 * has already written properly, and a price is only rewritten when it actually
 * differs. Dry run by default.
 *
 *   node scripts/sync-from-supplier.js
 *   node scripts/sync-from-supplier.js --apply
 *   node scripts/sync-from-supplier.js --apply --prices-only
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const { cleanDaraz, isMeaningful } = require('../src/utils/cleanDescription');

const SCRAPE = 'D:/daraz-scraper/data-nbh-pdp/books.jsonl';

// Launch discount: we undercut the supplier's shelf price by this much on
// everything, to give a new shop a reason to be chosen. Changing this number
// and re-running re-prices the whole catalogue.
const DISCOUNT = 0.10;

// A price move this large is more often a bad match than a real supplier
// change — matching falls back to title when there is no ISBN, and two editions
// of the same title can differ several-fold. Applying one silently would put a
// wrong price on a live shelf, so these are held for review instead.
// --allow-big-moves applies them anyway once you have read the CSV.
const BIG_MOVE = 1.5;

// Below this a "description" is a stub, not prose worth showing.
const MIN_DESC = 200;
// Our own placeholder, written at import when nothing better existed.
const PLACEHOLDER = /fuller description is on the way|available now at Books Temple Nepal/i;

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function parseArgs(argv) {
  const a = { apply: false, pricesOnly: false, descriptionsOnly: false, allowBigMoves: false };
  for (const v of argv) {
    if (v === '--apply') a.apply = true;
    else if (v === '--prices-only') a.pricesOnly = true;
    else if (v === '--descriptions-only') a.descriptionsOnly = true;
    else if (v === '--allow-big-moves') a.allowBigMoves = true;
  }
  return a;
}

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(SCRAPE)) {
    console.error(`No scrape at ${SCRAPE} — run scrape.js first.`);
    process.exit(1);
  }

  const scraped = fs
    .readFileSync(SCRAPE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  const byIsbn = new Map();
  const bySlug = new Map();
  for (const r of scraped) {
    if (r.isbn13) byIsbn.set(r.isbn13, r);
    const k = slugify(r.title || '');
    if (k && !bySlug.has(k)) bySlug.set(k, r);
  }

  await connectMongo();
  try {
    const books = await Book.find({}).select('slug title isbn price comparePrice description').lean();

    const changes = [];
    const bigMoves = [];
    let noMatch = 0;
    let descKept = 0;
    let priceSame = 0;

    for (const b of books) {
      const m = (b.isbn && byIsbn.get(b.isbn)) || bySlug.get(b.slug) || bySlug.get(slugify(b.title));
      if (!m) { noMatch += 1; continue; }

      const set = {};

      // ── Description ──
      if (!args.pricesOnly) {
        const mine = (b.description || '').trim();
        const minePlaceholder = PLACEHOLDER.test(mine) || mine.length < MIN_DESC;
        const theirs = cleanDaraz(m.description || '');
        if (minePlaceholder && isMeaningful(theirs) && theirs.length >= MIN_DESC) {
          set.description = theirs;
        } else if (!minePlaceholder) {
          descKept += 1;
        }
      }

      // ── Price ──
      if (!args.descriptionsOnly) {
        const supplier = Number(m.price);
        if (Number.isFinite(supplier) && supplier > 0) {
          const ours = Math.round(supplier * (1 - DISCOUNT));
          const bigMove = b.price > 0 && ours > b.price * BIG_MOVE;
          if (bigMove && !args.allowBigMoves) {
            bigMoves.push({ slug: b.slug, title: b.title, oldPrice: b.price, newPrice: ours, supplier });
          } else if (ours > 0 && (b.price !== ours || b.comparePrice !== supplier)) {
            set.price = ours;
            // Only claim a saving when there is one to claim.
            set.comparePrice = ours < supplier ? supplier : undefined;
            if (set.comparePrice === undefined) delete set.comparePrice;
          } else {
            priceSame += 1;
          }
        }
      }

      if (Object.keys(set).length) {
        changes.push({
          _id: b._id,
          slug: b.slug,
          title: b.title,
          oldPrice: b.price,
          newPrice: set.price,
          supplier: Number(m.price) || null,
          filledDescription: Boolean(set.description),
          set,
        });
      }
    }

    const priced = changes.filter((c) => c.newPrice !== undefined);
    const described = changes.filter((c) => c.filledDescription);
    const cheaper = priced.filter((c) => c.newPrice < c.oldPrice).length;
    const dearer = priced.filter((c) => c.newPrice > c.oldPrice).length;

    console.log(`${args.apply ? 'APPLYING' : 'DRY RUN'} — scrape holds ${scraped.length} product page(s)`);
    console.log(`catalogue: ${books.length}, no supplier match: ${noMatch}\n`);
    console.log(`descriptions to fill : ${described.length}   (kept ${descKept} we already had)`);
    console.log(`prices to update     : ${priced.length}   (${cheaper} down, ${dearer} up, ${priceSame} unchanged)`);
    console.log(`discount applied     : ${(DISCOUNT * 100).toFixed(0)}% off the supplier price`);
    console.log(`held for review      : ${bigMoves.length} price(s) would move more than ${BIG_MOVE}x\n`);

    if (bigMoves.length) {
      console.log('held back (probable bad match, pass --allow-big-moves to include):');
      for (const m of bigMoves.slice(0, 8)) {
        console.log(`  ${String(m.title).slice(0, 38).padEnd(40)} was ${String(m.oldPrice).padStart(5)} -> would be ${String(m.newPrice).padStart(5)}`);
      }
      console.log('');
    }

    console.log('sample price moves (supplier -> ours):');
    for (const c of priced.slice(0, 10)) {
      console.log(`  ${String(c.title).slice(0, 38).padEnd(40)} NPR ${String(c.supplier).padStart(5)} -> ${String(c.newPrice).padStart(5)}  (was ${c.oldPrice})`);
    }

    const stamp = Date.now();
    const csv = path.join(__dirname, '..', `supplier-sync-${stamp}.csv`);
    fs.writeFileSync(
      csv,
      ['slug,title,supplier_price,old_price,new_price,description_filled']
        .concat(changes.map((c) => [c.slug, c.title, c.supplier ?? '', c.oldPrice ?? '', c.newPrice ?? '', c.filledDescription].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')))
        .join('\n'),
      'utf8'
    );
    console.log(`\nfull CSV: ${csv}`);

    if (!args.apply) {
      console.log('\nNothing was written. Re-run with --apply.');
      return;
    }

    let n = 0;
    for (const c of changes) {
      await Book.updateOne({ _id: c._id }, { $set: c.set });
      n += 1;
    }
    logger.info({ updated: n, descriptions: described.length, prices: priced.length }, 'Supplier sync applied');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'sync-from-supplier failed');
  process.exit(1);
});
