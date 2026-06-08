'use strict';

// One-off: strip hyphens/spaces from existing book ISBNs so the emitted
// gtin13 is a clean 13-digit value (Google Rich Results requirement). The
// model setter already does this on future saves; this fixes records written
// before the setter existed. Idempotent — re-running is a no-op.
//
//   node scripts/normalize-isbn.js

require('dotenv').config();
const mongoose = require('mongoose');
const { connectMongo, disconnectMongo } = require('../src/config/database');

(async () => {
  await connectMongo();
  const col = mongoose.connection.collection('books');

  const targets = await col.find({ isbn: /[-\s]/ }, { projection: { isbn: 1, slug: 1 } }).toArray();
  console.log(`\nFound ${targets.length} book(s) with hyphens/spaces in isbn.\n`);

  let changed = 0;
  for (const b of targets) {
    const cleaned = String(b.isbn).replace(/[\s-]/g, '');
    const res = await col.updateOne({ _id: b._id }, { $set: { isbn: cleaned } });
    if (res.modifiedCount) changed++;
    console.log(`   ${b.isbn} -> ${cleaned}  [${b.slug}]`);
  }

  console.log(`\nDone. ${changed} record(s) updated.\n`);
  await disconnectMongo();
  process.exit(0);
})().catch((err) => {
  console.error('Normalize failed:', err.message);
  process.exit(1);
});
