'use strict';

/**
 * Create the launch discount as a coupon rather than by cutting every price.
 *
 * Why a coupon and not a catalogue-wide 10% off:
 *  • Rewriting 2,294 prices resets what customers believe a book costs here.
 *    Putting them back later reads as a price rise.
 *  • A blanket cut also discounts the sales you'd have made at full price —
 *    on books, where margin is thin, that's the majority of them.
 *  • A code is measurable: usageCount tells you whether the launch push
 *    actually drove orders. A silent price change tells you nothing.
 *  • It's reversible. The date window closes on its own.
 *
 * Defaults below: 10% off, first order only, capped, expires in 30 days. The
 * cap matters — uncapped percentage off an unusually large order is where a
 * launch offer stops being marketing and starts being a loss.
 *
 * Usage:
 *   node scripts/create-launch-coupon.js
 *   node scripts/create-launch-coupon.js --apply
 *   node scripts/create-launch-coupon.js --apply --code TEMPLE10 --percent 10 --days 30 --cap 500
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const Coupon = require('../src/models/coupon.model');

function parseArgs(argv) {
  const a = { apply: false, code: 'TEMPLE10', percent: 10, days: 30, cap: 500, minOrder: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--code') a.code = String(argv[i + 1]).toUpperCase();
    else if (argv[i] === '--percent') a.percent = Number(argv[i + 1]);
    else if (argv[i] === '--days') a.days = Number(argv[i + 1]);
    else if (argv[i] === '--cap') a.cap = Number(argv[i + 1]);
    else if (argv[i] === '--min-order') a.minOrder = Number(argv[i + 1]);
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectMongo();

  const endDate = new Date(Date.now() + args.days * 86400000);
  const doc = {
    code: args.code,
    description: `Launch offer — ${args.percent}% off your first order`,
    type: 'percentage',
    value: args.percent,
    minOrderAmount: args.minOrder,
    maxDiscount: args.cap,
    // One redemption per customer, and only customers with no prior orders.
    perUserLimit: 1,
    newUserOnly: true,
    startDate: new Date(),
    endDate,
    isActive: true,
    isStackable: false,
  };

  console.log(`${args.apply ? 'APPLY' : 'DRY RUN'} — launch coupon\n`);
  console.log(`  code          : ${doc.code}`);
  console.log(`  discount      : ${doc.value}% (capped at NPR ${doc.maxDiscount})`);
  console.log(`  min order     : ${doc.minOrderAmount ? `NPR ${doc.minOrderAmount}` : 'none'}`);
  console.log(`  who           : new customers only, 1 use each`);
  console.log(`  window        : now → ${endDate.toDateString()}`);
  console.log(`\n  worked example: NPR 900 cart → NPR ${Math.floor((900 * doc.value) / 100)} off`);
  console.log(`                  NPR 8,000 cart → NPR ${Math.min(Math.floor((8000 * doc.value) / 100), doc.maxDiscount)} off (cap applies)`);

  const existing = await Coupon.findOne({ code: doc.code });
  if (existing) console.log(`\n  NOTE: ${doc.code} already exists — it will be updated in place.`);

  if (!args.apply) {
    console.log('\nNothing written. Re-run with --apply.');
    await disconnectMongo();
    return;
  }

  await Coupon.updateOne({ code: doc.code }, { $set: doc }, { upsert: true });
  const saved = await Coupon.findOne({ code: doc.code }).lean();
  console.log(`\ncoupon ${saved.code} is live (used ${saved.usageCount} time(s) so far).`);

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err.message);
  await disconnectMongo().catch(() => {});
  process.exit(1);
});
