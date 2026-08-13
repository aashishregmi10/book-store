'use strict';

/*
 * Give the hidden import backlog a genre from its own description, and publish
 * what wins one.
 *
 * Why this exists next to reclassify-genres.js: that script asks Open Library
 * and Google Books for subjects, which is the better signal when it exists. It
 * doesn't for most of this backlog — a sample of 80 drafts came back "no
 * subject data from provider" 60 times, because these are regional and
 * Indian-market printings no catalogue indexes. Tuning the threshold barely
 * moved it (4/60 at margin 2, 8/80 at margin 1): the lookups aren't ambiguous,
 * they're empty. What these books do have is their own description, and after
 * backfill-descriptions.js roughly 1,300 of the 1,500 carry real text.
 *
 * Two deliberate choices, both about not repeating known failures:
 *
 *   1. Title and author are NOT fed to the classifier, only the description.
 *      classifyText weights a title hit 3x a description hit, and its
 *      `scienceish` rule fires on the bare word "science" in a title — which
 *      is how "The Science of Being Great" (a 1910 self-help classic) and "The
 *      Elements of Style" (a writing guide) were both proposed as
 *      science-technology. The title is the noisiest field here and the one
 *      that produced every mis-file I found by hand.
 *
 *   2. Gated on absolute score AND margin, not margin alone. classifyText's
 *      own comment explains why: one stray keyword scores 1 and beats a field
 *      of zeroes by 1, which reads as confident and isn't. MIN_SCORE demands
 *      several independent hits before a genre is believed.
 *
 * A book that wins a genre is published, because `unclassified` being a hidden
 * holding pen was the only reason it was down (CLAUDE.md's taxonomy notes).
 * Anything that doesn't win stays hidden and lands in the CSV for a human —
 * a wrong genre is not cosmetic here, it sets the book's URL silo, breadcrumb,
 * related-books rail and JSON-LD.
 *
 * Dry run by default.
 *   node scripts/activate-drafts.js
 *   node scripts/activate-drafts.js --apply
 *   node scripts/activate-drafts.js --apply --min-score 4   # stricter
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');
const { classifyText } = require('../src/utils/classifyText');

const HOLDING = 'unclassified';
// Enough independent description hits that one stray word cannot carry it.
const DEFAULT_MIN_SCORE = 3;
// And a clear winner over the runner-up.
const DEFAULT_MIN_MARGIN = 2;
// Below this the description is too short to be evidence of anything.
const MIN_DESC_CHARS = 200;

// Our own placeholder blurb, written by cleanDescription.js when an import had
// no real text. It is long enough to pass a length check and mentions "Books
// Temple Nepal" and "ships across Nepal", so a classifier reading it scores
// `nepal` and `nepali` on every single book that has one — 1,044 of the hidden
// drafts. That is how a loosened gate proposed 36 books for nepali-literature
// on the strength of our own boilerplate rather than anything about the book.
// Treat these as having no description at all.
const TEMPLATE_MARKERS = /fuller description is on the way|available now at Books Temple Nepal/i;

function parseArgs(argv) {
  const a = { apply: false, minScore: DEFAULT_MIN_SCORE, minMargin: DEFAULT_MIN_MARGIN, limit: Infinity };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--min-score') a.minScore = Number(argv[i + 1]) || DEFAULT_MIN_SCORE;
    else if (argv[i] === '--min-margin') a.minMargin = Number(argv[i + 1]) || DEFAULT_MIN_MARGIN;
    else if (argv[i] === '--limit') a.limit = Number(argv[i + 1]) || Infinity;
  }
  return a;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').trim()}"`;

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectMongo();
  try {
    const liveGenres = new Set(
      (await Genre.find({ isActive: true }).select('slug').lean()).map((g) => g.slug)
    );

    const drafts = await Book.find({ isActive: false })
      .select('slug title author description genre category soldCount')
      .lean();
    const books = drafts.slice(0, args.limit);

    console.log(`${args.apply ? 'APPLYING' : 'DRY RUN'} — ${books.length} hidden draft(s)`);
    console.log(`gate: score >= ${args.minScore} AND margin >= ${args.minMargin}, description >= ${MIN_DESC_CHARS} chars\n`);

    const decided = [];
    const held = [];

    for (const b of books) {
      const desc = (b.description || '').trim();
      if (TEMPLATE_MARKERS.test(desc)) {
        held.push({ ...b, reason: 'placeholder blurb, not a real description' });
        continue;
      }
      if (desc.length < MIN_DESC_CHARS) {
        held.push({ ...b, reason: 'description too short' });
        continue;
      }
      // Description only. See the header for why title/author are withheld.
      const r = classifyText({ description: desc });
      if (!r) {
        held.push({ ...b, reason: 'no term matched the description' });
        continue;
      }
      if (r.score < args.minScore) {
        held.push({ ...b, reason: `weak evidence (score ${r.score})`, proposed: r.genre, evidence: r.evidence.join('; ') });
        continue;
      }
      if (r.confidence < args.minMargin) {
        held.push({ ...b, reason: `ambiguous vs ${r.runnerUp || 'n/a'} (margin ${r.confidence})`, proposed: r.genre, evidence: r.evidence.join('; ') });
        continue;
      }
      if (!liveGenres.has(r.genre) || r.genre === HOLDING) {
        held.push({ ...b, reason: `genre '${r.genre}' is not a live browsable genre`, proposed: r.genre });
        continue;
      }
      decided.push({ ...b, proposed: r.genre, score: r.score, margin: r.confidence, evidence: r.evidence.join('; ') });
    }

    // Report before writing, so a dry run is genuinely reviewable.
    const dist = {};
    for (const d of decided) dist[d.proposed] = (dist[d.proposed] || 0) + 1;
    console.log(`would publish : ${decided.length}`);
    console.log(`stays hidden  : ${held.length}\n`);
    console.log('proposed distribution:');
    Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([g, n]) => console.log(`  ${String(n).padStart(4)}  ${g}`));

    const reasons = {};
    for (const h of held) {
      const key = h.reason.replace(/\(.*/, '').trim();
      reasons[key] = (reasons[key] || 0) + 1;
    }
    console.log('\nwhy the rest stay hidden:');
    Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([r, n]) => console.log(`  ${String(n).padStart(4)}  ${r}`));

    const stamp = Date.now();
    const outDir = path.join(__dirname, '..');
    const decidedCsv = path.join(outDir, `activate-decided-${stamp}.csv`);
    fs.writeFileSync(
      decidedCsv,
      ['slug,title,author,proposed_genre,score,margin,evidence']
        .concat(decided.map((d) => [d.slug, d.title, d.author, d.proposed, d.score, d.margin, d.evidence].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );
    const heldCsv = path.join(outDir, `activate-held-${stamp}.csv`);
    fs.writeFileSync(
      heldCsv,
      ['slug,title,author,reason,proposed_genre,evidence']
        .concat(held.map((h) => [h.slug, h.title, h.author, h.reason, h.proposed || '', h.evidence || ''].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );
    console.log(`\ndecided CSV: ${decidedCsv}`);
    console.log(`held CSV:    ${heldCsv}`);

    if (!args.apply) {
      console.log('\nNothing was written. Re-run with --apply.');
      return;
    }

    let published = 0;
    for (const d of decided) {
      await Book.updateOne({ _id: d._id }, { $set: { genre: d.proposed, isActive: true } });
      published += 1;
    }
    logger.info({ published, stillHidden: held.length }, 'Drafts activated');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'activate-drafts failed');
  process.exit(1);
});
