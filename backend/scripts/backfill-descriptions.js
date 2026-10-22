'use strict';

/*
 * Give thin books a real description, from a real source.
 *
 * 864 books carry under 200 characters of description and 587 of them are live.
 * That is thin content on public product pages: bad for readers deciding whether
 * to buy, and the single biggest reason Google leaves a page in "Discovered –
 * currently not indexed". Most of these came from a Daraz import whose blurbs
 * were spec lines, not prose.
 *
 * Sources are the same providers the importer already uses (Open Library, then
 * Google Books, via src/utils/bookLookup.js). Nothing is written that a provider
 * did not return: no generated prose, no paraphrase of the title. A book nobody
 * has catalogued keeps its thin description and shows up in the summary, because
 * an invented description on a bookshop is worse than a short one.
 *
 * Google intermittently answers 503 under load, and a single try mistakes that
 * for "no such book" — roughly a quarter of a sample of 20. Hence the retries.
 *
 * Dry-run by default. Pass --apply to write.
 *
 *   node scripts/backfill-descriptions.js                 # dry run + report
 *   node scripts/backfill-descriptions.js --apply
 *   node scripts/backfill-descriptions.js --apply --limit 50
 *   node scripts/backfill-descriptions.js --apply --min-length 300
 *   node scripts/backfill-descriptions.js --apply --hidden-only   # backlog only
 *
 * Requires MONGODB_URI. GOOGLE_BOOKS_API_KEY strongly recommended.
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const { lookupByIsbn } = require('../src/utils/bookLookup');
const { isTemplateDescription } = require('../src/utils/cleanDescription');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const a = { apply: false, limit: Infinity, minLength: 200, concurrency: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--hidden-only') a.hiddenOnly = true;
    else if (argv[i] === '--limit') a.limit = Number(argv[i + 1]) || Infinity;
    else if (argv[i] === '--min-length') a.minLength = Number(argv[i + 1]) || 200;
    else if (argv[i] === '--concurrency') a.concurrency = Math.max(1, Number(argv[i + 1]) || 3);
  }
  return a;
}

// Google Books returns descriptions with markup in them ("<p>", "<br>", the odd
// <i>), which would render as literal tags on the book page.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function clean(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, (_, n) => ENTITIES[n.toLowerCase()] ?? ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** One lookup, retried past the transient 503s Google returns under load. */
async function lookupWithRetry(isbn, hints, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await lookupByIsbn(isbn, hints);
    } catch (err) {
      const transient = /503|502|504|ETIMEDOUT|ECONNRESET|fetch failed/i.test(err.message || '');
      if (!transient || attempt === tries) return null;
      await sleep(400 * attempt);
    }
  }
  return null;
}

async function pool(items, size, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor;
        cursor += 1;
        await worker(items[i], i);
      }
    })
  );
}

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectMongo();
  try {
    // --hidden-only keeps a run off published pages. Rewriting the blurb on a
    // live product page is a public-content change; doing it to the unpublished
    // backlog is just preparing stock for release, and that is usually the run
    // you actually want.
    const scope = args.hiddenOnly ? { isActive: false } : {};
    const all = await Book.find(scope).select('title author isbn description isActive soldCount').lean();
    // "Thin" is not only about length. Our own templateDescription() placeholder
    // runs ~300 chars — comfortably over any sane minimum — so 510 books wearing
    // one were skipped by this script on every previous run, which is why they
    // are still wearing one. It carries no information about the book, so it is
    // thin in the only sense that matters here.
    const thin = all
      .filter((b) => {
        const d = (b.description || '').trim();
        return d.length < args.minLength || isTemplateDescription(d);
      })
      // Best-sellers first: if a run is cut short, it stopped after fixing the
      // pages that get the most traffic.
      .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
      .slice(0, args.limit);

    const withIsbn = thin.filter((b) => b.isbn);
    logger.info(
      { thin: thin.length, withIsbn: withIsbn.length, noIsbn: thin.length - withIsbn.length, apply: args.apply },
      'Backfilling descriptions'
    );

    let filled = 0;
    let missing = 0;
    let done = 0;

    await pool(withIsbn, args.concurrency, async (b) => {
      const meta = await lookupWithRetry(b.isbn, { title: b.title, author: b.author });
      const text = clean(meta && meta.description);
      done += 1;
      if (done % 100 === 0) logger.info({ done, of: withIsbn.length, filled }, 'progress');

      if (text.length < args.minLength) {
        missing += 1;
        return;
      }
      filled += 1;
      if (args.apply) {
        await Book.updateOne(
          { _id: b._id },
          {
            $set: {
              description: text,
              // shortDescription feeds the meta description and the card blurb;
              // only set it when it is still empty, so hand-written ones stand.
              ...(text.length > 60 ? { shortDescription: text.slice(0, 155).trim() } : {}),
              ...(meta.author && (!b.author || b.author === 'Unknown') ? { author: meta.author } : {}),
            },
          }
        );
      }
    });

    logger.info(
      {
        examined: thin.length,
        filled,
        noProviderText: missing,
        skippedNoIsbn: thin.length - withIsbn.length,
        applied: args.apply,
      },
      args.apply ? 'Descriptions backfilled' : 'Dry run — pass --apply to write'
    );
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'backfill-descriptions failed');
  process.exit(1);
});
