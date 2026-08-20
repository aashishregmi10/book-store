'use strict';

/*
 * Shelve the 775-book unshelved backlog from the owner's category pass.
 *
 * The owner took backlog-unshelved.csv (the export this repo produced, sorted
 * by title) and added a Category column using 15 buckets of their own. The IDs
 * in that sheet are its 1-based row numbers, so this joins on row order rather
 * than re-matching titles — verified against rows 1, 2, 43, 100, 300, 479, 523,
 * 706, 774 and 775 before it was written.
 *
 * Fourteen of the fifteen buckets map cleanly onto the closed taxonomy. Two
 * need saying out loud:
 *
 *   "General / Uncategorized" is NOT mapped. It is a catch-all with no genre
 *   decision inside it, and a catch-all is precisely what produced the original
 *   mess (see /CLAUDE.md). Those books stay hidden and are listed, rather than
 *   being swept into `fiction` to make a number go up.
 *
 *   "Fiction - Historical & War" is the one internally-mixed bucket: it holds
 *   novels (Clytemnestra, Fritz and Kurt) alongside straight history and
 *   reportage (Conflict: A Military History, Sandworm, The Shortest History of
 *   War). Either blanket choice files a lot of books wrongly, so it is split by
 *   classifyText — fiction when the text reads as fiction, politics-society
 *   otherwise, which is where this catalogue already keeps history.
 *
 * The owner's label is otherwise applied as given. Where the deterministic
 * classifier strongly disagrees, the book is still shelved as asked and the
 * disagreement is reported, so the sheet can be corrected rather than silently
 * overridden.
 *
 * Publishing is gated exactly as publish-ready-drafts.js gates it.
 *
 * Dry run by default.
 *   node scripts/shelve-owner-categories.js
 *   node scripts/shelve-owner-categories.js --apply
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');
const { isTemplateDescription } = require('../src/utils/cleanDescription');
const { classifyText } = require('../src/utils/classifyText');

const MIN_DESC_CHARS = 200;
const CSV = path.join(__dirname, '..', '..', 'backlog-unshelved.csv');

// The owner's 15 buckets → this shop's taxonomy.
const BUCKETS = {
  C: { label: "Children's Books", genre: 'childrens', category: 'kids' },
  R: { label: 'Fiction - Romance & Relationships', genre: 'romance' },
  LG: { label: 'Fiction - Literary & General', genre: 'fiction' },
  FS: { label: 'Fiction - Fantasy & Science Fiction', genre: 'sci-fi-fantasy' },
  TM: { label: 'Fiction - Thriller, Mystery & Horror', genre: 'mystery-thriller' },
  HW: { label: 'Fiction - Historical & War', genre: 'SPLIT' },
  ST: { label: 'Non-Fiction - Science, Technology & Nature', genre: 'science-technology' },
  SH: { label: 'Non-Fiction - Self-Help & Personal Development', genre: 'self-help' },
  BM: { label: 'Non-Fiction - Biography & Memoir', genre: 'biography-memoir' },
  BF: { label: 'Non-Fiction - Business, Finance & Economics', genre: 'business-economics' },
  PH: { label: 'Non-Fiction - Politics, History & Social Issues', genre: 'politics-society' },
  RS: { label: 'Religion, Spirituality & Philosophy', genre: 'spirituality-religion' },
  NL: { label: 'Nepali Literature', genre: 'nepali-literature' },
  AT: { label: 'Academic & Test Prep', genre: 'science-technology' },
  G: { label: 'General / Uncategorized', genre: null }, // deliberately unmapped
};

// The owner's category per book, in backlog-unshelved.csv row order.
// Fifty per chunk, each labelled with the ID range it covers, and asserted at
// load: a transcription slip shifts every later book onto the wrong shelf, so
// it has to fail loudly rather than quietly mis-shelve hundreds of titles.
const CHUNKS = [
  [1, 'R C C C G C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C C G HW G G ST SH C C C'],
  [51, 'C C C C C C C C C AT AT AT LG SH HW RS R NL R AT RS RS C RS R R HW BM FS G NL G SH AT SH LG RS BF RS RS NL BM NL R G R PH BM BM ST'],
  [101, 'TM ST NL NL NL ST BM NL HW NL HW HW LG AT C RS AT BF C SH NL NL AT AT NL NL ST HW SH SH SH RS R R SH SH ST RS NL NL ST C R HW ST TM TM ST SH C'],
  [151, 'C SH SH RS RS RS HW SH SH NL SH NL RS C C NL SH FS ST RS SH HW HW RS C C C C C C SH C C G FS HW SH R SH SH RS ST TM NL BF RS R R SH HW'],
  [201, 'SH SH FS C SH TM SH NL C C NL RS NL NL R SH NL NL R TM G BM ST SH SH SH R ST SH SH ST SH SH ST SH C R C C C C C C C C C BF C SH G'],
  [251, 'R SH BF ST ST HW HW SH ST AT BM TM FS RS R SH RS SH R C SH TM SH SH SH SH SH SH RS C BM C C TM C FS SH SH SH SH SH SH C SH SH ST R SH G AT'],
  [301, 'AT SH TM FS RS RS HW SH NL SH AT AT FS BM BM C RS LG RS RS BM NL NL NL NL SH BM ST C G AT LG LG RS RS NL RS LG NL NL NL R NL R RS C AT SH SH R'],
  [351, 'AT FS FS AT NL HW BM BM SH NL R HW FS R R NL NL FS G FS G G NL G NL NL C R SH SH AT RS SH SH NL C C SH SH SH SH C SH NL BF C TM TM C BM'],
  [401, 'SH FS G SH TM C R NL C C C C C C C C C C C C C TM NL BF BF BM NL NL SH SH SH HW FS NL TM LG NL LG NL TM G C NL FS AT SH R SH HW BM'],
  [451, 'FS HW FS TM AT C RS NL G SH SH AT C C G PH LG NL NL R SH R C C BM RS G C ST C SH RS G R BM R NL FS SH BF NL G NL AT BF NL HW RS NL NL'],
  [501, 'SH C C R NL TM RS R FS NL NL NL R R FS HW SH SH R C SH SH G C SH SH SH BM SH C RS C C TM C SH SH NL C NL NL NL BF SH C LG R SH RS NL'],
  [551, 'NL BF TM ST FS TM TM SH SH R G HW SH RS SH SH SH FS C TM TM FS FS LG R RS SH RS RS C R NL HW FS SH BF HW BF C RS RS TM SH TM R RS G SH BF RS'],
  [601, 'C G SH RS LG BM SH FS FS SH FS ST SH SH C R R R SH R RS FS BM BM FS FS FS RS SH C SH TM SH FS RS RS RS C TM R G TM R RS R FS RS TM FS RS'],
  [651, 'RS BM TM TM SH AT FS R G HW C FS SH SH RS SH TM SH HW C TM BF TM HW SH TM SH C SH RS RS SH HW HW PH RS SH C FS RS BM SH R R C C SH SH SH HW'],
  [701, 'SH R C SH C NL SH FS SH C G SH SH R SH RS SH SH BM SH SH PH C G C NL C G SH SH HW HW LG SH C NL SH SH HW C G G SH SH TM R R R C SH'],
  [751, 'RS C SH R C SH SH RS AT SH HW FS C LG HW SH R R SH SH SH R SH NL NL'],
];

const CODES = [];
for (const [start, line] of CHUNKS) {
  const parts = line.trim().split(/\s+/);
  if (start !== CODES.length + 1) {
    throw new Error(`chunk starting at ${start} follows ${CODES.length} codes — a chunk is the wrong length`);
  }
  CODES.push(...parts);
}
if (CODES.length !== 775) throw new Error(`expected 775 codes, built ${CODES.length}`);

/** Minimal CSV row splitter — the export quotes every cell. */
function parseCsv(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const cells = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i += 1) {
        const c = line[i];
        if (c === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i += 1; }
          else inQ = !inQ;
        } else if (c === ',' && !inQ) { cells.push(cur); cur = ''; }
        else cur += c;
      }
      cells.push(cur);
      return cells;
    });
}

(async function main() {
  const apply = process.argv.includes('--apply');
  await connectMongo();
  try {
    const rows = parseCsv(fs.readFileSync(CSV, 'utf8')); // title,author,price,stock,chars,hasIsbn,slug
    if (rows.length !== CODES.length) {
      throw new Error(`row/code mismatch: ${rows.length} CSV rows vs ${CODES.length} codes`);
    }

    const liveGenres = new Set((await Genre.find({ isActive: true }).select('slug').lean()).map((g) => g.slug));
    const slugs = rows.map((r) => r[6]);
    const books = await Book.find({ slug: { $in: slugs } })
      .select('slug title author genre category description coverImage price stockStatus')
      .lean();
    const bySlug = new Map(books.map((b) => [b.slug, b]));

    const plan = [];
    const unmapped = [];
    const notFound = [];
    const disagreements = [];

    rows.forEach((row, i) => {
      const [title, , , , , , slug] = row;
      const code = CODES[i];
      const bucket = BUCKETS[code];
      if (!bucket) throw new Error(`unknown code "${code}" at row ${i + 1}`);
      const book = bySlug.get(slug);
      if (!book) { notFound.push(title); return; }
      if (!bucket.genre) { unmapped.push({ title, slug }); return; }

      let genre = bucket.genre;
      const guess = classifyText({ title: book.title, description: book.description, author: book.author });

      // The one mixed bucket, split rather than guessed at wholesale.
      if (genre === 'SPLIT') genre = guess && guess.genre === 'fiction' ? 'fiction' : 'politics-society';

      // Applied as asked either way; a confident, different answer is reported.
      if (guess && guess.genre !== genre && guess.score >= 6 && guess.confidence >= 3) {
        disagreements.push({ title: book.title, owner: genre, classifier: guess.genre, evidence: guess.evidence.slice(0, 3) });
      }

      plan.push({ book, genre, category: bucket.category || null, code });
    });

    // Publish gate — identical to publish-ready-drafts.js.
    const ready = [];
    const held = [];
    for (const p of plan) {
      const b = p.book;
      const d = (b.description || '').trim();
      if (!liveGenres.has(p.genre)) { held.push({ ...p, reason: 'genre not live' }); continue; }
      if (!d || d.length < MIN_DESC_CHARS) { held.push({ ...p, reason: 'description too short' }); continue; }
      if (isTemplateDescription(d)) { held.push({ ...p, reason: 'placeholder description' }); continue; }
      if (!b.coverImage?.secureUrl) { held.push({ ...p, reason: 'no cover image' }); continue; }
      if (!b.price || b.price < 1) { held.push({ ...p, reason: 'price is zero or missing' }); continue; }
      if (b.stockStatus === 'out-of-stock' || b.stockStatus === 'discontinued') { held.push({ ...p, reason: 'not in stock' }); continue; }
      ready.push(p);
    }

    console.log(`${apply ? 'APPLYING' : 'DRY RUN'} — ${rows.length} rows in the sheet\n`);
    console.log(`would shelve            : ${plan.length}`);
    console.log(`would publish           : ${ready.length}`);
    console.log(`shelved but held back   : ${held.length}`);
    console.log(`left unshelved (General): ${unmapped.length}`);
    console.log(`slug not found in DB    : ${notFound.length}`);

    const dist = {};
    plan.forEach((p) => {
      const k = p.category ? `${p.genre} + ${p.category}` : p.genre;
      dist[k] = (dist[k] || 0) + 1;
    });
    console.log('\ntarget shelves:');
    Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([g, n]) => console.log(`  ${String(n).padStart(4)}  ${g}`));

    if (held.length) {
      const r = {};
      held.forEach((h) => (r[h.reason] = (r[h.reason] || 0) + 1));
      console.log('\nheld back from publishing (still shelved):');
      Object.entries(r).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
    }

    console.log(`\nclassifier disagreed confidently on ${disagreements.length} (shelved as you asked anyway):`);
    disagreements.slice(0, 15).forEach((d) =>
      console.log(`  ${String(d.title).slice(0, 46).padEnd(46)} you: ${d.owner.padEnd(20)} it: ${d.classifier}`)
    );

    if (!apply) {
      console.log('\nNothing was written. Re-run with --apply.');
      return;
    }

    let shelved = 0;
    let published = 0;
    for (const p of plan) {
      const set = { genre: p.genre };
      if (p.category) set.category = p.category;
      if (ready.some((r) => r.book._id === p.book._id)) { set.isActive = true; published += 1; }
      await Book.updateOne({ _id: p.book._id }, { $set: set });
      shelved += 1;
    }
    logger.info({ shelved, published, held: held.length, unmapped: unmapped.length }, 'owner categories applied');
    console.log(`\nshelved: ${shelved}`);
    console.log(`published: ${published}`);

    if (unmapped.length) {
      console.log('\n══ LEFT UNSHELVED — "General / Uncategorized" needs a real genre ══\n');
      console.log('| #  | Title |');
      console.log('| -- | ----- |');
      unmapped.forEach((u, i) => console.log(`| ${i + 1} | ${String(u.title).replace(/\|/g, '/').slice(0, 70)} |`));
    }
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'shelve-owner-categories failed');
  process.exit(1);
});
