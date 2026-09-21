'use strict';

/*
 * Background worker for the admin "Sync with New Book House" console. Spawned
 * (detached) by supplierSync.route.js; streams progress into a SupplierSyncJob
 * document the admin page polls. Two phases:
 *
 *   --phase scan     ensure a CDP Chrome, take a FRESH snapshot harvest of the
 *                    whole NBH listing, then diff it: new books (collision
 *                    report) + books that vanished from the listing (out of
 *                    stock), behind coverage / absent-cap / miss-threshold
 *                    guards so an incomplete harvest can't false-flag stockouts.
 *   --phase publish  import the new books found by the last scan (--stock 2).
 *
 *   node scripts/run-supplier-sync.js --job <id> --phase scan
 *   node scripts/run-supplier-sync.js --job <id> --phase publish
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const Book = require('../src/models/book.model');
const InventoryAlert = require('../src/models/inventoryAlert.model');
const SupplierSyncJob = require('../src/models/supplierSyncJob.model');
const { toIsbn13 } = require('../src/utils/isbn');

const SCRAPER_DIR = 'D:/daraz-scraper';
const SNAPSHOT_DIR = path.join(SCRAPER_DIR, 'data-nbh-snapshot');
const STATE_FILE = path.join(SCRAPER_DIR, 'availability-state.json'); // OUTSIDE the cleared snapshot dir
const HARVEST = path.join(SCRAPER_DIR, 'harvest-listing.js');
const LISTING = 'https://www.daraz.com.np/new-book-house/?from=wangpu&langFlag=en&pageTypeId=2&q=All-Products';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CHROME_PROFILE = 'D:\\daraz-scraper\\data\\chrome-cdp';
const SUPPLIER = 'New Book House';

const COVERAGE_MIN = 98; // % — below this the harvest is too partial to judge availability
const ABSENT_CAP_PCT = 5; // if more than this share vanished at once, blame the harvest, not stock
const MISS_THRESHOLD = 2; // consecutive complete syncs a book must be absent before we call it out of stock

const arg = (flag) => { const i = process.argv.indexOf(flag); return i === -1 ? undefined : process.argv[i + 1]; };
const JOB_ID = arg('--job');
const PHASE = arg('--phase') || 'scan';

const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const titleKey = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');

function cdpUp() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:9222/json/version', { timeout: 4000 }, (r) => { r.resume(); resolve(r.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function ensureChrome() {
  if (await cdpUp()) return true;
  if (!fs.existsSync(CHROME)) return false;
  spawn(CHROME, ['--remote-debugging-port=9222', `--user-data-dir=${CHROME_PROFILE}`, '--no-first-run', '--no-default-browser-check', 'https://www.daraz.com.np/new-book-house/'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 20; i += 1) { await new Promise((r) => setTimeout(r, 2000)); if (await cdpUp()) return true; }
  return false;
}

// Run a child node script, resolving with its exit code. Output streams to this
// process (visible in the spawned worker's own stdout).
function run(scriptCwd, args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: scriptCwd, stdio: 'inherit' });
    p.on('close', (code) => resolve(code ?? 1));
    p.on('error', () => resolve(1));
  });
}

const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } };
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s), 'utf8');

async function setJob(patch) {
  await SupplierSyncJob.updateOne({ _id: JOB_ID }, { $set: patch });
}

// ── scan ─────────────────────────────────────────────────────────────────────
async function scan() {
  await setJob({ status: 'running', phase: 'starting Chrome', startedAt: new Date(), error: '' });

  if (!(await ensureChrome())) {
    await setJob({ status: 'failed', phase: 'chrome', error: 'Could not start Chrome on port 9222.', finishedAt: new Date() });
    return;
  }

  // Clear the snapshot dir so books.jsonl is exactly THIS run's live listing.
  fs.rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  await setJob({ phase: 'harvesting the full listing (~9 min)' });
  const hc = await run(SCRAPER_DIR, [HARVEST, '--listing', LISTING, '--data', 'data-nbh-snapshot', '--cdp', 'http://localhost:9222', '--delay', '3000']);
  if (hc === 3) { await setJob({ status: 'needs_captcha', phase: 'Daraz challenge — solve the slider in the Chrome window, then re-run', finishedAt: new Date() }); return; }
  if (hc !== 0) { await setJob({ status: 'failed', phase: 'harvest', error: `Harvest exited ${hc}.`, finishedAt: new Date() }); return; }

  // Coverage from the harvest's own plan.
  let coverage = 100;
  try {
    const state = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, 'harvest-state.json'), 'utf8'));
    const expected = (state.slices || []).reduce((s, x) => s + (x.expected || 0), 0);
    const got = readJsonl(path.join(SNAPSHOT_DIR, 'books.jsonl')).length;
    if (expected > 0) coverage = Math.round((got / expected) * 1000) / 10;
  } catch { /* no state — assume flat/complete */ }

  // New books via the existing collision reporter (writes books.new.jsonl).
  await setJob({ phase: 'diffing against the catalogue', coverage });
  const cc = await run(process.cwd(), ['scripts/report-scrape-collisions.js', path.join(SNAPSHOT_DIR, 'books.jsonl')]);
  const newRecs = cc === 0 ? readJsonl(path.join(SNAPSHOT_DIR, 'books.new.jsonl')) : [];
  const newBooks = newRecs.slice(0, 500).map((r) => ({ title: r.title, isbn13: r.isbn13 || '', price: r.price, coverUrl: r.coverUrl || '', url: r.url || '' }));

  // Out of stock = NBH store books absent from this snapshot, gated + confirmed
  // over MISS_THRESHOLD consecutive complete syncs.
  const snapRecs = readJsonl(path.join(SNAPSHOT_DIR, 'books.jsonl'));
  const liveKeys = new Set();
  for (const r of snapRecs) {
    const i13 = r.isbn13 && /^\d{13}$/.test(r.isbn13) ? r.isbn13 : toIsbn13(r.isbn13 || r.isbn10 || '');
    if (i13) liveKeys.add('i:' + i13);
    if (r.title) { liveKeys.add('s:' + slugify(r.title)); liveKeys.add('t:' + titleKey(r.title)); }
  }

  const nbhBooks = await Book.find({ supplier: SUPPLIER }).select('slug title isbn stockStatus').lean();
  const present = (b) => {
    const i13 = b.isbn && /^\d{13}$/.test(b.isbn) ? b.isbn : '';
    return (i13 && liveKeys.has('i:' + i13)) || liveKeys.has('s:' + b.slug) || liveKeys.has('s:' + slugify(b.title)) || liveKeys.has('t:' + titleKey(b.title));
  };
  const absent = nbhBooks.filter((b) => b.stockStatus !== 'discontinued' && !present(b));
  const absentPct = nbhBooks.length ? (absent.length / nbhBooks.length) * 100 : 0;

  const state = loadState();

  // Auto-restore: any book we previously zeroed that is live again is safe to
  // bring back — presence is a positive signal, trustworthy even on a partial
  // harvest. Restock to the baseline 2 and resolve its reorder alert.
  const restoreIds = nbhBooks.filter((b) => state[String(b._id)] && state[String(b._id)].autoZeroed && present(b)).map((b) => b._id);
  let restoredCount = 0;
  if (restoreIds.length) {
    await Book.updateMany({ _id: { $in: restoreIds }, stockStatus: { $ne: 'discontinued' } }, { $set: { stock: 2, stockStatus: 'in-stock' } });
    await InventoryAlert.updateMany({ book: { $in: restoreIds }, alertType: 'reorder_needed', status: 'open' }, { $set: { status: 'resolved', resolvedAt: new Date() } });
    restoredCount = restoreIds.length;
    for (const id of restoreIds) delete state[String(id)];
  }

  // Absence/miss counting only on a trustworthy (complete) harvest.
  let outOfStock = [];
  const goodHarvest = coverage >= COVERAGE_MIN && absentPct <= ABSENT_CAP_PCT;
  if (goodHarvest) {
    for (const b of nbhBooks) {
      const id = String(b._id);
      if (present(b)) { delete state[id]; continue; } // reset
      const miss = ((state[id] && state[id].missCount) || 0) + 1;
      state[id] = { missCount: miss, autoZeroed: (state[id] && state[id].autoZeroed) || false };
      if (miss >= MISS_THRESHOLD && b.stockStatus !== 'out-of-stock') {
        outOfStock.push({ book: b._id, slug: b.slug, title: b.title, isbn: b.isbn || '', missCount: miss });
      }
    }
  }
  saveState(state);

  await setJob({
    status: 'done',
    phase: goodHarvest ? 'done' : `done (coverage ${coverage}% / ${Math.round(absentPct)}% absent — availability skipped this run)`,
    coverage,
    finishedAt: new Date(),
    results: { newBooks, outOfStock: outOfStock.slice(0, 500), absentThisRun: absent.length, restoredCount },
  });
}

// ── publish ──────────────────────────────────────────────────────────────────
async function publish() {
  await setJob({ publishStatus: 'running', publishError: '' });
  const newFile = path.join(SNAPSHOT_DIR, 'books.new.jsonl');
  if (!fs.existsSync(newFile) || readJsonl(newFile).length === 0) {
    await setJob({ publishStatus: 'done', publishedCount: 0 });
    return;
  }
  const before = await Book.countDocuments({});
  const code = await run(process.cwd(), ['scripts/import-from-scrape.js', newFile, '--stock', '2']);
  const after = await Book.countDocuments({});
  if (code !== 0) { await setJob({ publishStatus: 'failed', publishError: `import exited ${code}`, publishedCount: Math.max(0, after - before) }); return; }
  await setJob({ publishStatus: 'done', publishedCount: Math.max(0, after - before) });
}

(async function main() {
  if (!JOB_ID) { console.error('run-supplier-sync: --job <id> required'); process.exit(1); }
  await connectMongo();
  try {
    if (PHASE === 'publish') await publish();
    else await scan();
  } catch (err) {
    await setJob(PHASE === 'publish' ? { publishStatus: 'failed', publishError: err.message } : { status: 'failed', phase: 'error', error: err.message, finishedAt: new Date() }).catch(() => {});
    console.error('run-supplier-sync failed:', err.message);
  } finally {
    await disconnectMongo();
  }
  process.exit(0);
})();
