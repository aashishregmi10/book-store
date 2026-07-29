'use strict';

/**
 * Empty the `general` bucket — give every book a real genre.
 *
 * The subject-lookup pass (reclassify-genres.js) resolved what Open Library
 * knew about, but it has no record of roughly two thirds of this catalogue
 * (regional printings, Indian-market editions, Daraz-sourced titles), so those
 * books stayed in `general`. Every one of them does have a title and a
 * description, which is what src/utils/classifyText.js reads.
 *
 * Cascade, most reliable signal first:
 *   1. Retired slug        → deterministic rename (matches the 301s in next.config.ts)
 *   2. category 'kids'     → childrens   (the section already states the audience)
 *   3. Title + description → classifyText
 *   4. Author consensus    → the genre this author's other books already sit in
 *   5. Residue             → `unclassified` (hidden), never a wrong guess
 *
 * Usage:
 *   node scripts/eliminate-general.js                 # dry run + CSV
 *   node scripts/eliminate-general.js --apply
 *   node scripts/eliminate-general.js --apply --min 2 # stricter auto-apply
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const Book = require('../src/models/book.model');
const { classifyText } = require('../src/utils/classifyText');
const { lookupSubjects } = require('../src/utils/bookLookup');
const { mapGenre } = require('../src/utils/genreMap');

// Retired → replacement. Mirrors the permanent redirects in next.config.ts;
// these are renames, not guesses, so they apply regardless of confidence.
const RETIRED_MAP = {
  business: 'business-economics',
  biography: 'biography-memoir',
  politics: 'politics-society',
  spirituality: 'spirituality-religion',
  horror: 'mystery-thriller',
  strategy: 'business-economics',
  games: 'business-economics',
  law: 'politics-society',
  educational: 'science-technology',
};

const HOLDING = 'unclassified';

// A text match must clear BOTH bars to be trusted: enough absolute weight that
// it isn't resting on one stray keyword, and enough margin that it isn't a coin
// flip against the runner-up. Gating on margin alone filed The Great Gatsby
// under business-economics because its blurb says "wealth" once.
const MIN_SCORE = 3;
const MIN_MARGIN = 1;

function parseArgs(argv) {
  const a = { apply: false, min: MIN_MARGIN, minScore: MIN_SCORE };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--min') a.min = Number(argv[i + 1]);
    else if (argv[i] === '--min-score') a.minScore = Number(argv[i + 1]);
  }
  return a;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Minimal RFC-4180 field splitter (handles quoted commas + doubled quotes). */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Subjects already fetched by reclassify-genres.js, keyed by slug.
 *
 * That pass hit Open Library for every book and wrote what it found — including
 * for the ones it then set aside as ambiguous. Re-fetching would be thousands
 * of redundant requests against a free API for data sitting on disk. Feeding
 * those subjects back in as extra evidence is what pushes a book with a thin
 * description over the confidence bar.
 */
function loadFetchedSubjects(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^genre-review-\d+\.csv$/.test(f))
    .sort();
  const bySlug = new Map();
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').slice(1);
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = parseCsvLine(line);
      const [slug] = cols;
      const subjects = cols[8];
      if (slug && subjects && subjects.trim()) {
        bySlug.set(slug, subjects.split(';').map((s) => s.trim()).filter(Boolean));
      }
    }
  }
  return bySlug;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectMongo();

  // ── 1. Deterministic renames off the retired slugs ───────
  let renamed = 0;
  for (const [from, to] of Object.entries(RETIRED_MAP)) {
    const n = await Book.countDocuments({ genre: from });
    if (!n) continue;
    renamed += n;
    if (args.apply) await Book.updateMany({ genre: from }, { $set: { genre: to } });
    console.log(`  ${String(n).padStart(4)}  ${from} → ${to}`);
  }
  console.log(`retired-slug renames: ${renamed}${args.apply ? ' (applied)' : ' (would apply)'}\n`);

  // ── 2–5. Everything with no real genre ───────────────────
  const books = await Book.find({ $or: [{ genre: 'general' }, { genre: null }, { genre: '' }] })
    .select('slug title author description genre category isbn')
    .lean();

  const fetchedSubjects = loadFetchedSubjects(process.cwd());

  console.log(`${args.apply ? 'APPLY' : 'DRY RUN'} — ${books.length} book(s) without a real genre`);
  console.log(`thresholds: score >= ${args.minScore}, margin >= ${args.min}`);
  console.log(`reusing subjects fetched earlier for ${fetchedSubjects.size} book(s)\n`);

  // Author consensus needs the already-classified books as its evidence base.
  const classified = await Book.find({
    genre: { $nin: ['general', HOLDING, null, ''] },
    author: { $nin: [null, '', 'Unknown'] },
  })
    .select('author genre')
    .lean();

  const byAuthor = new Map();
  for (const b of classified) {
    const key = String(b.author).trim().toLowerCase();
    if (!byAuthor.has(key)) byAuthor.set(key, new Map());
    const m = byAuthor.get(key);
    m.set(b.genre, (m.get(b.genre) || 0) + 1);
  }
  const authorGenre = (author) => {
    const m = byAuthor.get(String(author || '').trim().toLowerCase());
    if (!m || m.size === 0) return null;
    const [top] = [...m.entries()].sort((a, b) => b[1] - a[1]);
    return top[0];
  };

  const updates = [];
  const rows = [];
  const tally = new Map();
  const bySource = new Map();

  let processed = 0;
  for (const b of books) {
    processed += 1;
    if (processed % 250 === 0) console.log(`  … ${processed}/${books.length}`);

    let genre = null;
    let source = null;
    let confidence = '';
    let evidence = '';

    if (b.category === 'kids') {
      genre = 'childrens';
      source = 'section:kids';
    } else if (b.category === 'manga') {
      genre = 'sci-fi-fantasy';
      source = 'section:manga';
    } else {
      const r = classifyText({
        title: b.title,
        description: b.description,
        author: b.author,
        subjects: fetchedSubjects.get(b.slug),
      });
      if (r && r.score >= args.minScore && r.confidence >= args.min) {
        genre = r.genre;
        source = 'text';
        confidence = `${r.score}/${r.confidence}`;
        evidence = r.evidence.join('; ');
      } else {
        // An author who already has classified books is better evidence than a
        // weak keyword hit — Stephen King's unlabelled titles belong with his
        // labelled ones, whatever a single blurb word suggests.
        const raw = authorGenre(b.author);
        const consensus = raw ? RETIRED_MAP[raw] || raw : null;
        if (consensus) {
          genre = consensus;
          source = 'author';
        } else if (r && r.score >= args.minScore) {
          // Decent weight but a close runner-up: still a plausible shelf, and
          // better than a bucket that is about to stop existing. Flagged in the
          // CSV for spot-checking.
          genre = r.genre;
          source = 'text-weak';
          confidence = `${r.score}/${r.confidence}`;
          evidence = r.evidence.join('; ');
        } else {
          // Last resort before giving up: ask Open Library directly. What
          // lands here is mostly well-known fiction whose scraped description
          // is a boilerplate stub ("Book Type: lifestyle, Pages: 310") — no
          // text signal at all, but titles the provider definitely knows.
          // Scoped to the residue so it's a few hundred requests, not 2294.
          const fetched = await lookupSubjects({ isbn: b.isbn, title: b.title, author: b.author });
          const subs = fetched?.subjects || [];
          const viaSubjects = subs.length ? mapGenre(subs, []) : null;

          if (viaSubjects?.genre) {
            genre = viaSubjects.genre;
            source = 'lookup';
            confidence = viaSubjects.confidence;
            evidence = subs.slice(0, 6).join('; ');
          } else if (viaSubjects?.category === 'kids') {
            genre = 'childrens';
            source = 'lookup:kids';
          } else {
            const r2 = subs.length
              ? classifyText({ title: b.title, description: b.description, author: b.author, subjects: subs })
              : null;
            if (r2 && r2.score >= args.minScore) {
              genre = r2.genre;
              source = 'lookup-text';
              confidence = `${r2.score}/${r2.confidence}`;
              evidence = r2.evidence.join('; ');
            } else {
              genre = HOLDING;
              source = 'none';
            }
          }
        }
      }
    }

    updates.push({ _id: b._id, genre });
    tally.set(genre, (tally.get(genre) || 0) + 1);
    bySource.set(source, (bySource.get(source) || 0) + 1);
    rows.push([b.slug, b.title, b.author, b.genre, genre, source, confidence, evidence]);
  }

  if (args.apply) {
    // One bulkWrite instead of ~1500 round trips to Atlas.
    const ops = updates.map((u) => ({
      updateOne: { filter: { _id: u._id }, update: { $set: { genre: u.genre } } },
    }));
    for (let i = 0; i < ops.length; i += 500) {
      await Book.bulkWrite(ops.slice(i, i + 500));
    }
  }

  console.log('assigned by signal:');
  for (const [s, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${s}`);
  }
  console.log('\nresulting genres:');
  for (const [g, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${g}`);
  }

  const out = path.join(process.cwd(), `general-assignment-${Date.now()}.csv`);
  fs.writeFileSync(
    out,
    'slug,title,author,old_genre,new_genre,signal,confidence,evidence\n' +
      rows.map((r) => r.map(csvCell).join(',')).join('\n') +
      '\n'
  );
  console.log(`\nassignment CSV: ${out}`);
  if (!args.apply) console.log('Nothing was written. Re-run with --apply.');

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectMongo().catch(() => {});
  process.exit(1);
});
