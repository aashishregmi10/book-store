'use strict';

/*
 * Strip the scraped spec header off book descriptions.
 *
 * 728 live books open their description with the supplier's spec block:
 *
 *     Author: Ruchir Sharma
 *     Publication: Penguin
 *     Format: Paperback
 *     Pages: 464pages
 *     The crisis of 2008 ended the illusion of a golden era in which…
 *
 * Every one of those four facts is already on the page twice over — in the
 * "Book specifications" <dl> and in the Product+Book JSON-LD (author, publisher,
 * bookFormat, numberOfPages). Leaving them at the top of the description costs
 * three separate things:
 *
 *   1. `bookLd()` publishes `description: book.description.slice(0, 500)`, so on
 *      a short blurb the structured-data description can be *entirely* spec
 *      lines — a machine-readable summary that says nothing about the book.
 *   2. It is supplier copy, byte-identical to what every other retailer selling
 *      that title publishes. It is the least distinctive text we could lead with.
 *   3. It pushes the real prose below the fold of every snippet and extract.
 *
 * What this does NOT do: invent prose. Same rule as backfill-descriptions.js —
 * a book nobody catalogued keeps what it has. 86 of the 728 are *only* a spec
 * block with no prose under it; stripping those would leave an empty
 * description, and `description` is required in the model. Those are skipped and
 * listed in the report so they can go through backfill-descriptions.js, which
 * fetches real text from Open Library / Google Books.
 *
 * The label whitelist is deliberately exact rather than a generic
 * /^Word:/ match. A loose pattern eats real prose: the leading-label survey
 * turned up "Freakonomics:", "Grit:", "Hooked:", "The Communication Book:" and
 * "Origin:" — all book titles opening a sentence, not spec labels. Only the
 * labels below are ever removed, and scanning stops at the first line that is
 * not one of them, so a spec block buried mid-blurb is left alone.
 *
 * Every original is written to a timestamped backup CSV before anything is
 * updated, so a bad run is recoverable.
 *
 * Book pages are ISR at revalidate=120 (app/books/[slug]/page.tsx), so edits
 * surface within two minutes without a deploy or a manual cache purge.
 *
 * Dry run by default.
 *   node scripts/strip-spec-headers.js
 *   node scripts/strip-spec-headers.js --apply
 *   node scripts/strip-spec-headers.js --apply --limit 50     # sample first
 *   node scripts/strip-spec-headers.js --include-inactive     # hidden drafts too
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');

// The only labels ever stripped. Anything else ends the header block.
const SPEC_LABELS = [
  'author', 'authors', 'publication', 'publisher', 'format', 'binding',
  'pages', 'page', 'language', 'languages', 'translator', 'translated by',
  'first published', 'published', 'reading age', 'readers age', 'age',
  'isbn', 'isbn10', 'isbn13', 'isbn-10', 'isbn-13', 'edition', 'imprint',
];
const LABEL_RE = new RegExp(`^\\s*(${SPEC_LABELS.join('|')})\\s*:`, 'i');

// Below this, stripping would leave a stub rather than a description. The model
// requires `description`, and a two-line orphan is worse than the spec block.
const MIN_KEEP = 100;

function parseArgs(argv) {
  const a = { apply: false, limit: Infinity, includeInactive: false, minKeep: MIN_KEEP };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--include-inactive') a.includeInactive = true;
    else if (argv[i] === '--limit') a.limit = Number(argv[i + 1]) || Infinity;
    else if (argv[i] === '--min-keep') a.minKeep = Number(argv[i + 1]) || MIN_KEEP;
  }
  return a;
}

/**
 * Remove the contiguous run of spec-label lines at the top of `desc`.
 * Returns { stripped, removed } — `removed` is the label lines taken off.
 */
function stripHeader(desc) {
  const lines = String(desc).split(/\r?\n/);
  let i = 0;
  const removed = [];
  while (i < lines.length) {
    if (LABEL_RE.test(lines[i])) {
      removed.push(lines[i].trim());
      i += 1;
    } else if (lines[i].trim() === '' && removed.length) {
      i += 1; // blank line inside/after the block
    } else {
      break;
    }
  }
  return { stripped: lines.slice(i).join('\n').trim(), removed };
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectMongo();
  try {
    const query = { description: LABEL_RE };
    if (!args.includeInactive) query.isActive = true;

    const books = (await Book.find(query).select('slug title description isActive').lean())
      .slice(0, args.limit);

    console.log(`${args.apply ? 'APPLYING' : 'DRY RUN'} — ${books.length} book(s) with a spec header`);
    console.log(`scope: ${args.includeInactive ? 'active + hidden' : 'active only'}, keep threshold ${args.minKeep} chars\n`);

    const willStrip = [];
    const tooThin = [];

    for (const b of books) {
      const { stripped, removed } = stripHeader(b.description);
      if (!removed.length) continue;
      if (stripped.length < args.minKeep) {
        tooThin.push({ ...b, remaining: stripped.length });
        continue;
      }
      willStrip.push({ ...b, stripped, removedCount: removed.length });
    }

    console.log(`would strip        : ${willStrip.length}`);
    console.log(`skipped (too thin) : ${tooThin.length}  → send these to backfill-descriptions.js\n`);

    if (willStrip.length) {
      const saved = willStrip.reduce((n, b) => n + (b.description.length - b.stripped.length), 0);
      console.log(`spec text removed  : ${saved.toLocaleString()} chars`);
      console.log(`median new length  : ${
        willStrip.map((b) => b.stripped.length).sort((x, y) => x - y)[Math.floor(willStrip.length / 2)]
      } chars\n`);
      console.log('first 3 examples:');
      for (const b of willStrip.slice(0, 3)) {
        console.log(`\n  ${b.slug}`);
        console.log(`    before: ${JSON.stringify(b.description.slice(0, 90))}…`);
        console.log(`    after : ${JSON.stringify(b.stripped.slice(0, 90))}…`);
      }
      console.log('');
    }

    const stamp = Date.now();
    const backup = path.join(__dirname, '..', `strip-spec-headers-backup-${stamp}.csv`);
    fs.writeFileSync(
      backup,
      ['slug,isActive,original_description,new_description']
        .concat(willStrip.map((b) => [b.slug, b.isActive, b.description, b.stripped].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );
    console.log(`backup (originals): ${backup}`);

    if (tooThin.length) {
      const thinCsv = path.join(__dirname, '..', `strip-spec-headers-toothin-${stamp}.csv`);
      fs.writeFileSync(
        thinCsv,
        ['slug,title,isActive,chars_remaining']
          .concat(tooThin.map((b) => [b.slug, b.title, b.isActive, b.remaining].map(csvCell).join(',')))
          .join('\n'),
        'utf8'
      );
      console.log(`too-thin CSV      : ${thinCsv}`);
    }

    if (!args.apply) {
      console.log('\nNothing was written. Re-run with --apply.');
      return;
    }

    let updated = 0;
    for (const b of willStrip) {
      await Book.updateOne({ _id: b._id }, { $set: { description: b.stripped } });
      updated += 1;
    }
    logger.info({ updated, skipped: tooThin.length }, 'Spec headers stripped');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'strip-spec-headers failed');
  process.exit(1);
});
