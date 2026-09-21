'use strict';

const mongoose = require('mongoose');

/**
 * A run of the "Sync with New Book House" admin console. The scan is a ~9-minute
 * harvest, far too long for one HTTP request, so the route spawns the
 * run-supplier-sync.js worker which streams its progress into this document; the
 * admin page polls it. `results` holds what the two panels render.
 */
const newBookSchema = new mongoose.Schema(
  { title: String, isbn13: String, price: Number, coverUrl: String, url: String },
  { _id: false }
);
const outOfStockSchema = new mongoose.Schema(
  { book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' }, slug: String, title: String, isbn: String, missCount: Number },
  { _id: false }
);

const supplierSyncJobSchema = new mongoose.Schema(
  {
    supplier: { type: String, default: 'New Book House' },
    // scan lifecycle
    status: {
      type: String,
      enum: ['queued', 'running', 'needs_captcha', 'done', 'failed'],
      default: 'queued',
      index: true,
    },
    phase: { type: String, default: 'queued' }, // human label: harvesting / diffing / done
    coverage: { type: Number }, // % of the seller catalogue the harvest reached
    error: { type: String },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    results: {
      newBooks: { type: [newBookSchema], default: [] },
      outOfStock: { type: [outOfStockSchema], default: [] }, // confirmed (crossed the miss threshold)
      absentThisRun: { type: Number, default: 0 }, // absent but not yet confirmed
      restoredCount: { type: Number, default: 0 }, // previously-zeroed books auto-restored (back in stock)
    },
    // publish lifecycle (import of the new books) — a second background step
    publishStatus: { type: String, enum: ['idle', 'running', 'done', 'failed'], default: 'idle' },
    publishedCount: { type: Number, default: 0 },
    publishError: { type: String },
    // apply-stock lifecycle (fast, inline)
    stockApplied: { type: Boolean, default: false },
    stockAppliedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.SupplierSyncJob || mongoose.model('SupplierSyncJob', supplierSyncJobSchema);
