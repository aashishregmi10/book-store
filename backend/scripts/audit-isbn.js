'use strict';

// One-off READ-ONLY audit: find books whose stored `isbn` is not a clean
// 13-digit ISBN-13, i.e. values that would fail the new model validator on
// their next save. Hyphen/space-only differences are auto-fixed by the model
// setter, so we report them separately from genuinely invalid ones.
//
//   node scripts/audit-isbn.js
//
// Makes no writes.

require('dotenv').config();
const mongoose = require('mongoose');
const { connectMongo, disconnectMongo } = require('../src/config/database');

(async () => {
  await connectMongo();

  // Read raw to bypass model setters/validators (we want the on-disk value).
  const docs = await mongoose.connection
    .collection('books')
    .find({ isbn: { $exists: true, $ne: null, $ne: '' } }, { projection: { isbn: 1, slug: 1, title: 1 } })
    .toArray();

  const clean = [];        // already 13 digits — fine
  const fixableBySetter = []; // only hyphens/spaces differ — setter fixes on next save
  const invalid = [];      // genuinely non-conforming (e.g. ISBN-10) — will be REJECTED

  for (const d of docs) {
    const raw = String(d.isbn);
    const stripped = raw.replace(/[\s-]/g, '');
    if (/^\d{13}$/.test(raw)) clean.push(d);
    else if (/^\d{13}$/.test(stripped)) fixableBySetter.push({ ...d, stripped });
    else invalid.push({ ...d, stripped });
  }

  console.log(`\nBooks with an ISBN: ${docs.length}`);
  console.log(`  ✅ clean 13-digit:        ${clean.length}`);
  console.log(`  🟡 fixable by setter:     ${fixableBySetter.length} (hyphens/spaces only)`);
  console.log(`  ❌ INVALID (will reject):  ${invalid.length}\n`);

  if (fixableBySetter.length) {
    console.log('🟡 Fixable on next save (no action needed unless you want to normalize now):');
    for (const d of fixableBySetter) console.log(`   "${d.isbn}" -> ${d.stripped}  [${d.slug}] ${d.title}`);
    console.log('');
  }
  if (invalid.length) {
    console.log('❌ INVALID — these will fail validation on next save. Fix or clear them:');
    for (const d of invalid) console.log(`   "${d.isbn}" (len ${d.stripped.length})  [${d.slug}] ${d.title}`);
    console.log('');
  } else {
    console.log('No genuinely invalid ISBNs. The validator is safe to keep.\n');
  }

  await disconnectMongo();
  process.exit(0);
})().catch((err) => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
