'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { authenticate, requireAdmin } = require('../middleware/auth');
const { ok, fail } = require('../utils/apiResponse');
const { cacheDel } = require('../config/redis');
const Book = require('../models/book.model');
const InventoryAlert = require('../models/inventoryAlert.model');
const SupplierSyncJob = require('../models/supplierSyncJob.model');
const logger = require('../config/logger');

const router = express.Router();
router.use(authenticate, requireAdmin);

const BACKEND_ROOT = path.join(__dirname, '..', '..');
const WORKER = path.join(BACKEND_ROOT, 'scripts', 'run-supplier-sync.js');
const STATE_FILE = 'D:/daraz-scraper/availability-state.json';

// Spawn the long-running worker detached so the HTTP request returns at once.
function spawnWorker(jobId, phase) {
  const child = spawn(process.execPath, [WORKER, '--job', String(jobId), '--phase', phase], {
    cwd: BACKEND_ROOT,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

async function invalidate() {
  await Promise.all([cacheDel('books_list:*'), cacheDel('featured_books'), cacheDel('filters_metadata'), cacheDel('genre:*')]).catch(() => {});
}

// ── POST /run — start a scan (or return the one already running) ──
router.post('/run', async (_req, res, next) => {
  try {
    const active = await SupplierSyncJob.findOne({ status: { $in: ['queued', 'running'] } }).sort({ createdAt: -1 });
    if (active) return ok(res, active, 'A sync is already running');
    const job = await SupplierSyncJob.create({ status: 'queued', phase: 'queued' });
    spawnWorker(job._id, 'scan');
    return ok(res, job, 'Sync started');
  } catch (err) {
    return next(err);
  }
});

// ── GET /status — the latest job, for polling ──
router.get('/status', async (_req, res, next) => {
  try {
    const job = await SupplierSyncJob.findOne().sort({ createdAt: -1 }).lean();
    return ok(res, job, 'Latest sync');
  } catch (err) {
    return next(err);
  }
});

// ── POST /publish — import the new books the last scan found ──
router.post('/publish', async (_req, res, next) => {
  try {
    const job = await SupplierSyncJob.findOne({ status: 'done' }).sort({ createdAt: -1 });
    if (!job) return fail(res, 'No completed scan to publish from.', 409, [{ code: 'NO_SCAN' }]);
    if (!job.results?.newBooks?.length) return fail(res, 'That scan found no new books.', 409, [{ code: 'NOTHING_NEW' }]);
    if (job.publishStatus === 'running') return ok(res, job, 'Publish already running');
    await SupplierSyncJob.updateOne({ _id: job._id }, { $set: { publishStatus: 'running', publishError: '' } });
    spawnWorker(job._id, 'publish');
    return ok(res, { jobId: job._id }, 'Publishing started');
  } catch (err) {
    return next(err);
  }
});

// ── POST /apply-stock — mark the confirmed out-of-stock books unavailable ──
// Sets stock 0 (derives out-of-stock), opens a reorder alert for each, and
// records that we auto-zeroed them so a later scan can auto-restore on restock.
router.post('/apply-stock', async (_req, res, next) => {
  try {
    const job = await SupplierSyncJob.findOne({ status: 'done' }).sort({ createdAt: -1 });
    if (!job) return fail(res, 'No completed scan to apply.', 409, [{ code: 'NO_SCAN' }]);
    const items = job.results?.outOfStock || [];
    if (!items.length) return fail(res, 'That scan confirmed no out-of-stock titles.', 409, [{ code: 'NONE' }]);

    let state = {};
    try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { state = {}; }

    let applied = 0;
    for (const it of items) {
      const book = await Book.findById(it.book).select('stockStatus title');
      if (!book || book.stockStatus === 'discontinued') continue;
      await Book.updateOne({ _id: it.book }, { $set: { stock: 0, stockStatus: 'out-of-stock' } });
      await createReorderAlert(it.book, it.title || book.title);
      state[String(it.book)] = { missCount: (state[String(it.book)]?.missCount) || 2, autoZeroed: true };
      applied += 1;
    }
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8'); } catch { /* best effort */ }

    await SupplierSyncJob.updateOne({ _id: job._id }, { $set: { stockApplied: true, stockAppliedCount: applied } });
    await invalidate();
    return ok(res, { applied }, `${applied} book(s) marked out of stock`);
  } catch (err) {
    return next(err);
  }
});

// ── POST /reorder — flag one book for reorder (the per-row "Order for restock") ──
router.post('/reorder', async (req, res, next) => {
  try {
    const { bookId } = req.body || {};
    const book = await Book.findById(bookId).select('title');
    if (!book) return fail(res, 'Book not found.', 404, [{ code: 'NOT_FOUND' }]);
    const alert = await createReorderAlert(book._id, book.title);
    return ok(res, alert, 'Reorder requested');
  } catch (err) {
    return next(err);
  }
});

// One open reorder alert per book (the unique partial index enforces it; upsert
// so clicking twice is idempotent rather than a duplicate-key error).
async function createReorderAlert(bookId, title) {
  return InventoryAlert.findOneAndUpdate(
    { book: bookId, alertType: 'reorder_needed', status: 'open' },
    { $setOnInsert: { book: bookId, bookTitle: title, alertType: 'reorder_needed', currentStock: 0, status: 'open', message: 'Out of stock at New Book House — reorder from the supplier.', isAutoGenerated: true } },
    { upsert: true, new: true }
  );
}

module.exports = router;
