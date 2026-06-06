'use strict';

const mongoose = require('mongoose');

/**
 * Atomic sequence generator for collision-free order numbers.
 * Keyed by name (e.g. 'order-20260606').
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

async function nextSequence(name) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

module.exports = { Counter, nextSequence };
