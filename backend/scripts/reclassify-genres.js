'use strict';

/**
 * Re-derive every book's genre from real subject data.
 *
 * Background: `general` was never a genre, it was the import fallback whenever
 * genreMap returned null — which it did for most books, because the old map
 * covered only 8 outcomes. 2063 of 2294 books ended up there. This resolves
 * each book's actual subjects via Open Library / Google Books (both already
 * wrapped in src/utils/bookLookup.js) and maps them onto the 16-genre
 * taxonomy in GENRE-TAXONOMY-PROPOSAL.md.
 *
 * Books above the confidence threshold are updated in place; everything else —
 * ambiguous matches, lookup misses, books with no ISBN — goes to a CSV for a
 * human to decide. Nothing is guessed silently.
 *
 * Usage:
 *   node scripts/reclassify-genres.js                    # dry run, writes the CSV
 *   node scripts/reclassify-genres.js --apply            # update high-confidence books
 *   node scripts/reclassify-genres.js --apply --limit 50 # try a small batch first
 *   node scripts/reclassify-genres.js --all              # re-examine every book, not just `general`
 *   node scripts/reclassify-genres.js --drafts --apply   # triage only the hidden import backlog
 *
 * Network-bound: expect roughly one lookup per book at CONCURRENCY parallelism.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const Book = require('../src/models/book.model');
const { mapGenre } = require('../src/utils/genreMap');
const { lookupSubjects } = require('../src/utils/bookLookup');
const { detectOrigin } = require('../src/utils/bookOrigin');

// A book must beat the runner-up genre by at least this much to be auto-applied.
// 2 means "won by a full strong signal", not "edged it by a hint".
const MIN_CONFIDENCE = 2;
const CONCURRENCY = 5;

// Genres being retired by the restructure — books sitting on these are
// re-examined even without --all, since their slug is going away.
const RETIRED = ['general', 'games', 'strategy', 'horror', 'law', 'educational', 'biography', 'business', 'politics', 'spirituality'];
// The holding pen for imports whose subject data was inconclusive. Always
// re-examined: sitting here is the whole reason a book is waiting. A book that
// wins a real genre also gets published, because `unclassified` is the only
// reason it was hidden — see CLAUDE.md's genre taxonomy notes.
const HOLDING = ['unclassified'];

function parseArgs(argv) {
  const a = { apply: false, all: false, drafts: false, limit: Infinity };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--all') a.all = true;
    else if (argv[i] === '--drafts') a.drafts = true;
    else if (argv[i] === '--limit') a.limit = Number(argv[i + 1]);
  }
  return a;
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

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectMongo();

  const filter = args.all ? {} : { $or: [{ genre: { $in: [...RETIRED, ...HOLDING] } }, { genre: null }] };
  // Triage just the hidden import backlog, leaving live books untouched.
  if (args.drafts) filter.isActive = false;
  const books = await Book.find(filter)
    .select('slug title author isbn genre category isActive')
    .limit(args.limit === Infinity ? 0 : args.limit)
    .lean();

  console.log(`${args.apply ? 'APPLY' : 'DRY RUN'} — examining ${books.length} book(s)`);
  console.log(`auto-apply threshold: confidence >= ${MIN_CONFIDENCE}\n`);

  const applied = [];
  const review = [];
  const tally = new Map();
  let done = 0;

  await pool(books, CONCURRENCY, async (b) => {
    done += 1;
    if (done % 200 === 0) console.log(`  … ${done}/${books.length}`);

    const meta = await lookupSubjects({ isbn: b.isbn, title: b.title, author: b.author });

    const categories = meta?.subjects || [];
    if (categories.length === 0) {
      review.push({ ...b, reason: 'no subject data from provider', proposed: '', confidence: '', subjects: '' });
      return;
    }

    // isbn13 matters here: the 978-9937 prefix is registered to Nepal and is
    // the strongest signal for routing a title into nepali-literature.
    const origin = detectOrigin({
      isbn13: b.isbn,
      title: b.title,
      author: b.author,
      publisher: meta?.publisher,
    });
    const mapped = mapGenre(categories, origin?.signals || []);

    if (!mapped) {
      review.push({ ...b, reason: 'no rule matched', proposed: '', confidence: '', subjects: categories.join('; ') });
      return;
    }
    // A section match (kids/manga/loksewa) is a different axis — flag rather
    // than silently move a book out of the genre silo into a section.
    if (mapped.category) {
      review.push({
        ...b,
        reason: `provider says section "${mapped.category}"`,
        proposed: '',
        confidence: mapped.confidence,
        subjects: categories.join('; '),
      });
      return;
    }
    if (mapped.confidence < MIN_CONFIDENCE) {
      review.push({
        ...b,
        reason: `ambiguous (runner-up ${mapped.runnerUp || 'n/a'})`,
        proposed: mapped.genre,
        confidence: mapped.confidence,
        subjects: categories.join('; '),
      });
      return;
    }

    applied.push({ ...b, proposed: mapped.genre, confidence: mapped.confidence });
    tally.set(mapped.genre, (tally.get(mapped.genre) || 0) + 1);

    // Leaving the holding pen means the book is classified, so publish it —
    // but only from `unclassified`, never un-hiding a book an admin chose to
    // deactivate for some other reason (out of print, bad cover, …).
    const publish = HOLDING.includes(b.genre) && b.isActive === false;
    if (publish) applied[applied.length - 1].published = true;

    if (args.apply) {
      const $set = { genre: mapped.genre };
      if (publish) $set.isActive = true;
      await Book.updateOne({ _id: b._id }, { $set });
    }
  });

  // ── Report ───────────────────────────────────────────────
  console.log(`\nhigh confidence  : ${applied.length}${args.apply ? ' (updated)' : ' (would update)'}`);
  const published = applied.filter((r) => r.published).length;
  if (published) console.log(`published        : ${published}${args.apply ? '' : ' (would go live from unclassified)'}`);
  console.log(`needs review     : ${review.length}`);
  console.log('\nproposed distribution:');
  for (const [g, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${g}`);
  }

  const out = path.join(process.cwd(), `genre-review-${Date.now()}.csv`);
  const header = 'slug,title,author,isbn,current_genre,proposed_genre,confidence,reason,provider_subjects\n';
  const rows = review
    .map((r) =>
      [r.slug, r.title, r.author, r.isbn, r.genre, r.proposed, r.confidence, r.reason, r.subjects]
        .map(csvCell)
        .join(',')
    )
    .join('\n');
  fs.writeFileSync(out, header + rows + '\n');
  console.log(`\nreview CSV: ${out}`);

  if (!args.apply) console.log('Nothing was written. Re-run with --apply to update the high-confidence books.');

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectMongo().catch(() => {});
  process.exit(1);
});
