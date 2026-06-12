'use strict';

// Build/sync every model's indexes explicitly. In production autoIndex is OFF
// (see config/database.js), so run this once after deploys that add/change an
// index — it creates missing indexes and drops ones no longer in the schema.
//
//   node scripts/sync-indexes.js
//
// syncIndexes() is safe to re-run; it's a no-op when indexes already match.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectMongo, disconnectMongo } = require('../src/config/database');

(async () => {
  await connectMongo();

  // Load every model so it's registered on the connection.
  const modelsDir = path.join(__dirname, '..', 'src', 'models');
  for (const file of fs.readdirSync(modelsDir)) {
    if (file.endsWith('.model.js')) require(path.join(modelsDir, file));
  }

  const names = mongoose.modelNames();
  console.log(`\nSyncing indexes for ${names.length} models…\n`);
  for (const name of names) {
    const Model = mongoose.model(name);
    try {
      const result = await Model.syncIndexes();
      console.log(`  ✅ ${name}: ${Array.isArray(result) ? result.length : 0} index op(s)`);
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
    }
  }

  console.log('\nDone.\n');
  await disconnectMongo();
  process.exit(0);
})().catch((err) => {
  console.error('Index sync failed:', err.message);
  process.exit(1);
});
