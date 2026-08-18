'use strict';

/*
 * Shelve the backlog from a hand-curated author list.
 *
 * classify-by-author.js can only borrow evidence the live catalogue already
 * holds, so it stops at authors who happen to be shelved here already: 875 of
 * the remaining drafts are by someone with no active books at all. But many of
 * those authors are not obscure. Geronimo Stilton has 15 hidden books, Stephen
 * King 5, Ana Huang 6, David Walliams 4. Where a writer's whole body of work
 * sits on one shelf, that is knowable without asking a provider.
 *
 * data/known-authors.json is that knowledge, kept as data rather than code so
 * it can be reviewed, corrected and extended by a person who knows books
 * without touching a script. Adding a line to it is the cheapest way to clear
 * another cluster of the backlog.
 *
 * Deliberately excluded from the file: authors who genuinely span shelves. If
 * a name is missing, that is usually a decision not to guess.
 *
 * Sets the genre only. Publishing stays with publish-ready-drafts.js, which
 * checks description, cover, price and stock — a shelf is reversible metadata,
 * a public URL is not.
 *
 * Dry run by default.
 *   node scripts/classify-by-known-author.js
 *   node scripts/classify-by-known-author.js --apply
 *   node scripts/classify-by-known-author.js --apply --active-too
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');

const HOLDING = 'unclassified';
const MAP_FILE = path.join(__dirname, '..', 'data', 'known-authors.json');

function parseArgs(argv) {
  const a = { apply: false, activeToo: false, limit: Infinity };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--active-too') a.activeToo = true;
    else if (argv[i] === '--limit') a.limit = Number(argv[i + 1]) || Infinity;
  }
  return a;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** "Jhumpa Lahiri & Ilan Stavans" -> "jhumpa lahiri" */
const firstAuthor = (s) => norm(String(s).split(/\s*(?:&|,| and | with )\s*/i)[0]);
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').trim()}"`;

(async function main() {
  const args = parseArgs(process.argv.slice(2));

  const raw = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  const MAP = new Map();
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('_')) continue;
    MAP.set(norm(k), v);
  }

  await connectMongo();
  try {
    const liveGenres = new Set(
      (await Genre.find({ isActive: true }).select('slug').lean()).map((g) => g.slug)
    );

    // Guard against a typo in the data file shelving books into a dead genre.
    const badTargets = [...new Set([...MAP.values()])].filter((g) => !liveGenres.has(g));
    if (badTargets.length) {
      console.error(`known-authors.json targets genres that are not live: ${badTargets.join(', ')}`);
      process.exit(1);
    }

    const q = args.activeToo
      ? { $or: [{ genre: HOLDING }, { genre: { $in: [null, ''] } }] }
      : { isActive: false, genre: HOLDING };
    const books = (await Book.find(q).select('slug title author genre isActive').lean())
      .slice(0, args.limit);

    console.log(`${args.apply ? 'APPLYING' : 'DRY RUN'} — ${books.length} unshelved book(s)`);
    console.log(`author map: ${MAP.size} names\n`);

    const decided = [];
    let noAuthor = 0;
    let notInMap = 0;
    const missed = new Map();

    for (const b of books) {
      const exact = norm(b.author);
      if (!exact || exact === 'unknown') { noAuthor += 1; continue; }
      let genre = MAP.get(exact);
      let via = 'exact';
      if (!genre) {
        const fa = firstAuthor(b.author);
        if (fa && fa !== exact && MAP.has(fa)) { genre = MAP.get(fa); via = 'first author'; }
      }
      if (!genre) {
        notInMap += 1;
        missed.set(exact, (missed.get(exact) || 0) + 1);
        continue;
      }
      decided.push({ ...b, proposed: genre, via });
    }

    const dist = {};
    for (const d of decided) dist[d.proposed] = (dist[d.proposed] || 0) + 1;

    console.log(`would shelve      : ${decided.length}`);
    console.log(`author not in map : ${notInMap}`);
    console.log(`no usable author  : ${noAuthor}\n`);
    if (decided.length) {
      console.log('proposed distribution:');
      Object.entries(dist).sort((a, b) => b[1] - a[1])
        .forEach(([g, n]) => console.log(`  ${String(n).padStart(4)}  ${g}`));
    }

    // The biggest unmapped clusters are the best candidates for the next few
    // lines of known-authors.json, so surface them rather than burying them.
    const top = [...missed.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (top.length) {
      console.log('\nbiggest unmapped authors (add these to known-authors.json next):');
      top.forEach(([a, n]) => console.log(`  ${String(n).padStart(4)}  ${a}`));
    }

    const stamp = Date.now();
    const csv = path.join(__dirname, '..', `known-author-decided-${stamp}.csv`);
    fs.writeFileSync(
      csv,
      ['slug,title,author,proposed_genre,matched_via']
        .concat(decided.map((d) => [d.slug, d.title, d.author, d.proposed, d.via].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );
    console.log(`\nreview CSV: ${csv}`);

    if (!args.apply) {
      console.log('\nNothing was written. Review the CSV, then re-run with --apply.');
      return;
    }

    let updated = 0;
    for (const d of decided) {
      await Book.updateOne({ _id: d._id }, { $set: { genre: d.proposed } });
      updated += 1;
    }
    logger.info({ updated }, 'Shelved from the known-author map');
    console.log(`\nshelved: ${updated}`);
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'classify-by-known-author failed');
  process.exit(1);
});
