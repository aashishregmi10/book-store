'use strict';

/*
 * Recover the covers that restore-covers-from-scrape.js refused to touch.
 *
 * After the restore and the R2 migration, 605 books (537 of them active) were
 * still pointing at the deactivated Cloudinary account. The obvious reading was
 * that the supplier scrape simply did not have them. It does: only 10 of the
 * 537 are genuinely absent. The rest were rejected as *ambiguous*.
 *
 * The ambiguity is real but it is the wrong kind. restore-covers-from-scrape.js
 * inherited resolveMatch() from fix-daraz-mismatches.js, a script whose job was
 * repricing, and that lineage shows in two rules:
 *
 *   - two listings under one ISBN with different prices  -> refuse  (300 books)
 *   - two scrape records with the same title             -> refuse  (227 books)
 *
 * For a price, refusing is right: picking the wrong one puts a wrong number in
 * front of a customer. For a cover it is far too strict. Two resellers listing
 * the same ISBN at different prices are still selling the same book, and either
 * one's photograph is the correct photograph. What matters for an image is not
 * whether the listings agree on commercial detail but whether they agree on
 * *identity*.
 *
 * So this re-runs the same index with identity-only guards, in descending order
 * of confidence:
 *
 *   1. every candidate points at the same image      -> ambiguity is moot
 *   2. candidates differ in image but agree on title -> same book, other photo
 *   3. titles differ only by a subtitle or series
 *      prefix ("Relativity" / "Relativity: The
 *      Special and the General Theory")              -> same book
 *   4. titles genuinely differ, but the book's
 *      author picks exactly one of them              -> same book
 *
 * Anything left is refused, and the refusals are the right ones — mostly
 * different multi-book combos sharing a reused ISBN, plus listings titled after
 * the shop ("New International Books Center...") rather than after a book.
 * That is 5 books. With the 10 absent, 15 of 537 keep the fallback.
 *
 * Where a guard leaves several candidates, the first wins, and SCRAPE_FILES is
 * ordered richest-first — so the PDP scrape decides before the listing scrapes.
 *
 * Unlike the restore, this does not park the URL on the supplier CDN and wait
 * for a second migration pass. It fetches, resizes and writes straight into R2
 * in the same step, so a recovered book lands in exactly the state every other
 * book is already in:
 *
 *   covers/<slug>.webp       720px
 *   covers/<slug>-300.webp   300px
 *
 * Resumable: anything already on R2_PUBLIC_BASE is skipped, so an interrupted
 * run is just re-run.
 *
 * Dry run by default.
 *   node scripts/recover-remaining-covers.js
 *   node scripts/recover-remaining-covers.js --plan     # full audit CSV, no writes
 *   node scripts/recover-remaining-covers.js --apply
 *   node scripts/recover-remaining-covers.js --apply --limit 25 --concurrency 4
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const { uploadBuffer } = require('../src/config/storage');
const { normalizeIsbns } = require('../src/utils/isbn');

const SCRAPE_FILES = [
  'D:/daraz-scraper/data-nbh-pdp/books.jsonl',
  'D:/daraz-scraper/data-nbh-full/books-merged.jsonl',
  'D:/daraz-scraper/data-nbh-full/books.jsonl',
  'D:/daraz-scraper/data/books.jsonl',
  'D:/daraz-scraper/data-nibc/books.jsonl',
];

const APPLY = process.argv.includes('--apply');

function argNum(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) ? n : fallback;
}
const LIMIT = argNum('--limit', Infinity);
const CONCURRENCY = argNum('--concurrency', 4);

const THUMB_WIDTH = 300;
const FULL_WIDTH = 720;

// A combo listing and a single-book listing are different products even when
// they share a title fragment, so never let one stand in for the other.
const COMBO_RE = /\bcombo\b|\bbundle\b|\bbox\s*set\b|\bset of \d|\bbuy\s*1\s*get\s*1\b|\d\s*pcs?\b/i;
const isCombo = (t) => COMBO_RE.test(String(t || ''));

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function readScrape(file) {
  if (!fs.existsSync(file)) {
    console.warn(`  (missing) ${file}`);
    return [];
  }
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((r) => r && r.coverUrl);
}

/**
 * Pick one scrape record whose cover we are confident belongs to this book, or
 * null. Returns `{ rec, via }` so the CSV can record which guard decided —
 * without that the output is unauditable.
 */
function resolveCover(b, byIsbn13, byTitle) {
  const bookCombo = isCombo(b.title);
  const bookIsbn = b.isbn && /^\d{13}$/.test(b.isbn) ? b.isbn : '';

  let cands = [];
  let lookup = '';
  if (bookIsbn && byIsbn13.has(bookIsbn)) {
    cands = byIsbn13.get(bookIsbn).filter((c) => isCombo(c.title) === bookCombo);
    lookup = 'isbn';
  }
  if (!cands.length) {
    cands = (byTitle.get(norm(b.title)) || []).filter((c) => isCombo(c.title) === bookCombo);
    lookup = 'title';
  }
  if (!cands.length) return null;

  // 1. One image between them — nothing to disambiguate.
  if (new Set(cands.map((c) => String(c.coverUrl).trim())).size === 1) {
    return { rec: cands[0], via: `${lookup}/one-image` };
  }

  // 2. Several images, one title. Same book photographed by different sellers.
  const titles = [...new Set(cands.map((c) => norm(c.title)))];
  if (titles.length === 1) return { rec: cands[0], via: `${lookup}/titles-agree` };

  // 3. Subtitle or series drift. "Ram: Scion of Ikshvaku" is the same book as
  //    "Ram Chandra Series - Ram: Scion of Ikshvaku"; containment says so.
  const bySize = titles.slice().sort((x, y) => x.length - y.length);
  const shortest = bySize[0];
  const longest = bySize[bySize.length - 1];
  if (bySize.every((t) => t.includes(shortest) || longest.includes(t))) {
    return { rec: cands[0], via: `${lookup}/subtitle-drift` };
  }

  // 4. Genuinely different titles. Only the author can settle it, and only if
  //    it leaves exactly one title standing.
  const ba = norm(b.author);
  const byAuthor = cands.filter((c) => {
    const ca = norm(c.author);
    return ca && ba && (ca.includes(ba) || ba.includes(ca));
  });
  if (byAuthor.length && new Set(byAuthor.map((c) => norm(c.title))).size === 1) {
    return { rec: byAuthor[0], via: `${lookup}/author-decides` };
  }

  return null;
}

async function pool(items, size, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

(async function main() {
  const publicBase = (process.env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');
  if (!publicBase) {
    console.error('R2_PUBLIC_BASE is not set — nothing would be reachable after the write.');
    process.exit(1);
  }

  const byIsbn13 = new Map();
  const byTitle = new Map();
  let loaded = 0;

  for (const file of SCRAPE_FILES) {
    const rows = readScrape(file);
    loaded += rows.length;
    for (const r of rows) {
      const n = r.isbn13 ? normalizeIsbns(r.isbn13) : null;
      const i13 = n?.isbn13 && /^\d{13}$/.test(n.isbn13) ? n.isbn13 : '';
      if (i13) {
        if (!byIsbn13.has(i13)) byIsbn13.set(i13, []);
        byIsbn13.get(i13).push(r);
      }
      const t = norm(r.title);
      if (!t) continue;
      if (!byTitle.has(t)) byTitle.set(t, []);
      byTitle.get(t).push(r);
    }
  }
  console.log(`scrape: ${loaded} records with a cover — ${byIsbn13.size} ISBNs, ${byTitle.size} titles\n`);

  await connectMongo();
  try {
    // Anything still on the dead host. Inactive ones are included: they cost
    // nothing to fix now and would otherwise be broken the day they're shelved.
    const dead = await Book.find({ 'coverImage.secureUrl': /res\.cloudinary\.com/ })
      .select('slug title author isbn isActive coverImage')
      .lean();

    const todo = [];
    const byGuard = {};
    let unresolved = 0;

    for (const b of dead) {
      const hit = resolveCover(b, byIsbn13, byTitle);
      if (!hit) {
        unresolved += 1;
        continue;
      }
      byGuard[hit.via] = (byGuard[hit.via] || 0) + 1;
      todo.push({
        _id: b._id,
        slug: b.slug,
        title: b.title,
        isActive: b.isActive,
        via: hit.via,
        oldSecureUrl: b.coverImage?.secureUrl || '',
        source: String(hit.rec.coverUrl).trim(),
      });
    }

    const batch = todo.slice(0, LIMIT);
    const activeTodo = todo.filter((t) => t.isActive).length;

    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${dead.length} book(s) still on the dead host`);
    console.log(`  resolvable       : ${todo.length}   (${activeTodo} of them active)`);
    console.log(`  no confident match: ${unresolved}   <- these keep the fallback`);
    console.log(`  this run         : ${batch.length}`);
    console.log(`  target           : ${publicBase}/covers/\n`);
    console.log('decided by:');
    Object.entries(byGuard).sort((a, b) => b[1] - a[1])
      .forEach(([g, c]) => console.log(`  ${String(c).padStart(5)}  ${g}`));

    if (!APPLY) {
      // The truncated preview is enough to sanity-check the guards, but not to
      // check that a chosen photograph is actually the right book. --plan
      // writes the full slug/guard/URL list so a sample can be opened.
      if (process.argv.includes('--plan')) {
        const planCsv = path.join(__dirname, '..', `recover-covers-plan-${Date.now()}.csv`);
        fs.writeFileSync(
          planCsv,
          ['slug,title,isActive,guard,source_url']
            .concat(batch.map((b) => [b.slug, b.title, b.isActive, b.via, b.source].map(csvCell).join(',')))
            .join('\n'),
          'utf8'
        );
        console.log(`\nplan written: ${planCsv}`);
      } else {
        console.log('\nfirst 8 that would be recovered:');
        batch.slice(0, 8).forEach((b) =>
          console.log(`  ${b.via.padEnd(22)} ${b.slug.slice(0, 42).padEnd(44)} <- ${b.source.slice(0, 48)}`)
        );
      }
      console.log('\nNothing was written. Re-run with --apply.');
      return;
    }

    const done = [];
    const failed = [];
    let n = 0;

    await pool(batch, CONCURRENCY, async (b) => {
      try {
        const res = await fetch(b.source, { headers: { Referer: 'https://www.bookstemple.com/' } });
        if (!res.ok) throw new Error(`source HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        // A CDN handing back an error page or a 1px spacer is not a cover.
        if (buf.length <= 1024) throw new Error(`source too small (${buf.length}B)`);

        const fullKey = `covers/${b.slug}.webp`;
        const full = await uploadBuffer(buf, { key: fullKey, maxWidth: FULL_WIDTH });
        await uploadBuffer(buf, { key: `covers/${b.slug}-${THUMB_WIDTH}.webp`, maxWidth: THUMB_WIDTH, quality: 80 });

        await Book.updateOne(
          { _id: b._id },
          { $set: { 'coverImage.publicId': fullKey, 'coverImage.secureUrl': full.secure_url } }
        );
        done.push({ ...b, newUrl: full.secure_url, bytes: full.bytes });
      } catch (err) {
        failed.push({ ...b, reason: err.message.slice(0, 80) });
      }
      n += 1;
      if (n % 100 === 0) console.log(`  ${n}/${batch.length}  ok:${done.length} failed:${failed.length}`);
    });

    const csv = path.join(__dirname, '..', `recover-covers-backup-${Date.now()}.csv`);
    fs.writeFileSync(
      csv,
      ['slug,isActive,guard,old_secureUrl,source_url,new_url']
        .concat(done.map((d) => [d.slug, d.isActive, d.via, d.oldSecureUrl, d.source, d.newUrl].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );

    console.log(`\nrecovered : ${done.length}`);
    console.log(`failed    : ${failed.length}`);
    if (failed.length) {
      const why = {};
      for (const f of failed) {
        const k = f.reason.replace(/\d+/g, 'N');
        why[k] = (why[k] || 0) + 1;
      }
      Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .forEach(([r, c]) => console.log(`  ${String(c).padStart(5)}  ${r}`));
    }
    console.log(`CSV       : ${csv}`);

    logger.info({ recovered: done.length, failed: failed.length }, 'Remaining covers recovered');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'recover-remaining-covers failed');
  process.exit(1);
});
