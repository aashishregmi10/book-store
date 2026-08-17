'use strict';

/*
 * Shelve hidden drafts from an author who is already shelved.
 *
 * The keyword classifier (activate-drafts.js) is exhausted: on the current
 * backlog it resolves 10 books out of 1,608, because these blurbs describe
 * books without ever using the literal words classifyText.js matches on. The
 * provider route is exhausted too, since Open Library and Google Books never
 * catalogued most of these regional printings.
 *
 * This uses evidence we already own and have never queried: the live catalogue.
 * If every active book by David Walliams sits in childrens, his six hidden ones
 * are childrens. That is not a guess about the book, it is an observation about
 * the author, and it is free.
 *
 * Where it is deliberately narrow:
 *
 *   • Only authors whose ACTIVE books agree. Default gate is a 75% dominant
 *     shelf, so Neil Gaiman splitting across fiction and sci-fi-fantasy is held
 *     for a human rather than forced onto whichever has one more book.
 *   • Books whose only active sibling is category-only (kids/manga/loksewa carry
 *     no genre) are skipped, not shelved as `undefined`.
 *   • --min-active raises the bar when one matching book feels too thin.
 *
 * Multi-author credits fall back to the first named author: "Jhumpa Lahiri &
 * Ilan Stavans" matches Jhumpa Lahiri's shelf, which is how the catalogue
 * actually credits her elsewhere. The fallback is recorded in the CSV so a
 * reviewer can see which rows leaned on it.
 *
 * Genre and visibility are separate, as in activate-drafts.js: --apply sets the
 * shelf, --activate additionally publishes. Shelving is reversible; publishing
 * puts a book on a public URL.
 *
 * Dry run by default.
 *   node scripts/classify-by-author.js
 *   node scripts/classify-by-author.js --apply
 *   node scripts/classify-by-author.js --apply --activate --min-active 2
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');

const HOLDING = 'unclassified';
const DEFAULT_MIN_ACTIVE = 1;
const DEFAULT_DOMINANCE = 0.75;

function parseArgs(argv) {
  const a = {
    apply: false,
    activate: false,
    minActive: DEFAULT_MIN_ACTIVE,
    dominance: DEFAULT_DOMINANCE,
    limit: Infinity,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--activate') a.activate = true;
    else if (argv[i] === '--min-active') a.minActive = Math.max(1, Number(argv[i + 1]) || DEFAULT_MIN_ACTIVE);
    else if (argv[i] === '--dominance') a.dominance = Number(argv[i + 1]) || DEFAULT_DOMINANCE;
    else if (argv[i] === '--limit') a.limit = Number(argv[i + 1]) || Infinity;
  }
  return a;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isUsable = (a) => a && norm(a) && norm(a) !== 'unknown';

/** "Jhumpa Lahiri & Ilan Stavans" -> "jhumpa lahiri" */
function firstAuthor(s) {
  return norm(String(s).split(/\s*(?:&|,| and | with )\s*/i)[0]);
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').trim()}"`;

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectMongo();
  try {
    const liveGenres = new Set(
      (await Genre.find({ isActive: true }).select('slug').lean()).map((g) => g.slug)
    );

    // Build the evidence table from the live catalogue. Only books that carry a
    // real, browsable genre count as evidence.
    const active = await Book.find({ isActive: true }).select('author genre').lean();
    const shelfByAuthor = new Map();
    const record = (key, genre) => {
      if (!key) return;
      if (!shelfByAuthor.has(key)) shelfByAuthor.set(key, new Map());
      const m = shelfByAuthor.get(key);
      m.set(genre, (m.get(genre) || 0) + 1);
    };
    for (const b of active) {
      if (!b.genre || b.genre === HOLDING || !liveGenres.has(b.genre)) continue;
      if (!isUsable(b.author)) continue;
      record(norm(b.author), b.genre);
      const fa = firstAuthor(b.author);
      if (fa && fa !== norm(b.author)) record(fa, b.genre);
    }

    /** Best shelf for an author key, or null when the evidence is not clean. */
    function verdict(key) {
      const m = shelfByAuthor.get(key);
      if (!m) return null;
      const entries = [...m.entries()].sort((x, y) => y[1] - x[1]);
      const total = entries.reduce((n, e) => n + e[1], 0);
      if (total < args.minActive) return { held: `author has only ${total} active book(s)` };
      const [genre, n] = entries[0];
      const share = n / total;
      if (entries.length > 1 && share < args.dominance) {
        return { held: `author spans genres (${entries.map((e) => `${e[0]}:${e[1]}`).join(', ')})` };
      }
      return { genre, evidence: `${n}/${total} of this author's active books are ${genre}` };
    }

    const drafts = await Book.find({ isActive: false, genre: HOLDING })
      .select('slug title author')
      .lean();
    const books = drafts.slice(0, args.limit);

    console.log(`${args.apply ? 'APPLYING' : 'DRY RUN'} — ${drafts.length} hidden draft(s)`);
    console.log(`gate: author needs >= ${args.minActive} active book(s) and a >= ${Math.round(args.dominance * 100)}% dominant shelf`);
    console.log(`evidence table: ${shelfByAuthor.size} author keys from the live catalogue\n`);

    const decided = [];
    const held = [];

    for (const b of books) {
      if (!isUsable(b.author)) {
        held.push({ ...b, reason: 'no usable author on the book' });
        continue;
      }
      const exact = norm(b.author);
      let v = verdict(exact);
      let via = 'exact author';
      if (!v || v.held) {
        const fa = firstAuthor(b.author);
        if (fa && fa !== exact) {
          const v2 = verdict(fa);
          if (v2 && v2.genre) { v = v2; via = 'first author'; }
          else if (!v) v = v2;
        }
      }
      if (!v) {
        held.push({ ...b, reason: 'author has no active books in the catalogue' });
      } else if (v.held) {
        held.push({ ...b, reason: v.held });
      } else {
        decided.push({ ...b, proposed: v.genre, evidence: v.evidence, via });
      }
    }

    const dist = {};
    for (const d of decided) dist[d.proposed] = (dist[d.proposed] || 0) + 1;
    console.log(`would shelve  : ${decided.length}`);
    console.log(`stays hidden  : ${held.length}\n`);
    if (decided.length) {
      console.log('proposed distribution:');
      Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([g, n]) => console.log(`  ${String(n).padStart(4)}  ${g}`));
      const viaFirst = decided.filter((d) => d.via === 'first author').length;
      console.log(`\nmatched via first author only: ${viaFirst}`);
      console.log('\nfirst 5 examples:');
      decided.slice(0, 5).forEach((d) => console.log(`  ${d.proposed.padEnd(22)} ${String(d.author).slice(0, 28).padEnd(30)} ${d.evidence}`));
    }

    const reasons = {};
    for (const h of held) {
      const key = h.reason.replace(/\(.*/, '').trim();
      reasons[key] = (reasons[key] || 0) + 1;
    }
    console.log('\nwhy the rest stay hidden:');
    Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([r, n]) => console.log(`  ${String(n).padStart(4)}  ${r}`));

    const stamp = Date.now();
    const outDir = path.join(__dirname, '..');
    const decidedCsv = path.join(outDir, `author-decided-${stamp}.csv`);
    fs.writeFileSync(
      decidedCsv,
      ['slug,title,author,proposed_genre,matched_via,evidence']
        .concat(decided.map((d) => [d.slug, d.title, d.author, d.proposed, d.via, d.evidence].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );
    const heldCsv = path.join(outDir, `author-held-${stamp}.csv`);
    fs.writeFileSync(
      heldCsv,
      ['slug,title,author,reason']
        .concat(held.map((h) => [h.slug, h.title, h.author, h.reason].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );
    console.log(`\ndecided CSV: ${decidedCsv}`);
    console.log(`held CSV:    ${heldCsv}`);

    if (!args.apply) {
      console.log('\nNothing was written. Review the decided CSV, then re-run with --apply.');
      return;
    }

    let updated = 0;
    for (const d of decided) {
      await Book.updateOne(
        { _id: d._id },
        { $set: { genre: d.proposed, ...(args.activate ? { isActive: true } : {}) } }
      );
      updated += 1;
    }
    logger.info({ updated, activated: args.activate, stillHidden: held.length }, 'Author-signal classification applied');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'classify-by-author failed');
  process.exit(1);
});
