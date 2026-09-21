'use strict';

/*
 * Populate the five gap genres (food-cooking, art-craft, health-wellness,
 * games-hobbies, education-reference) from the `unclassified` holding pen by
 * TITLE — a deterministic, no-network pass for the books whose title alone
 * names the genre unambiguously.
 *
 * Only sets `genre`; it does NOT publish. A hidden book stays hidden (the
 * import-quality-bar rule: don't push unenriched books live), it is just filed
 * under the right genre so it stops sitting in the backlog and so the genre
 * isn't empty. Books that are already active move onto the new genre page.
 *
 * Conservative: a book is moved only when its title matches exactly ONE genre's
 * keyword set (no ambiguous multi-genre hits), and never a combo/bundle title.
 *
 *   node scripts/shelve-new-genres.js            # dry run (default)
 *   node scripts/shelve-new-genres.js --apply     # write genre only
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { connectMongo, disconnectMongo } = require('../src/config/database');
const { cacheDel } = require('../src/config/redis');
const Book = require('../src/models/book.model');

const APPLY = process.argv.includes('--apply');
const COMBO_RE = /\bcombo\b|\bbundle\b|\bbox\s*set\b|\bset of \d|\bbuy\s*1\s*get\s*1\b|\d\s*pcs?\b/i;

// Tight title keywords per new genre. Kept unambiguous — no bare 'art'/'game'/
// 'food'/'guide' that would false-match unrelated titles.
const RULES = {
  'food-cooking': ['cookbook', 'cooking', 'recipe', 'cuisine', 'culinary', 'baking', 'the flavour', 'the flavor'],
  'art-craft': ['arts and crafts', 'art of drawing', 'how to draw', 'calligraphy', 'origami', 'colouring book', 'coloring book', 'art journal', 'sketching', 'watercolour', 'watercolor', 'book of arts and crafts'],
  'health-wellness': ['nutrition', 'wellness', 'mental health', 'wellbeing', 'well-being', 'healthy living', 'weight loss', 'yoga for'],
  'games-hobbies': ['chess', 'sudoku', 'crossword', 'jigsaw', 'board game', 'card game', 'gardening', 'knitting', 'rubik'],
  'education-reference': ['dictionary', 'dictionaries', 'thesaurus', 'encyclopedia', 'encyclopaedia', 'grammar', 'vocabulary', 'language course', 'bhasha', 'textbook', 'wren & martin', 'wren and martin'],
};

const norm = (s) => String(s || '').toLowerCase();

// Which genres does this title hit? (unique set)
function genresFor(title) {
  const t = norm(title);
  const hits = new Set();
  for (const [genre, subs] of Object.entries(RULES)) {
    if (subs.some((s) => t.includes(s))) hits.add(genre);
  }
  return [...hits];
}

(async function main() {
  await connectMongo();
  try {
    const books = await Book.find({ genre: 'unclassified' }).select('slug title isActive').lean();

    const moves = [];
    let ambiguous = 0;
    let comboSkip = 0;
    for (const b of books) {
      if (COMBO_RE.test(b.title || '')) { comboSkip += 1; continue; }
      const hits = genresFor(b.title);
      if (hits.length === 1) moves.push({ book: b, genre: hits[0] });
      else if (hits.length > 1) ambiguous += 1;
    }

    const byGenre = moves.reduce((a, m) => ((a[m.genre] = (a[m.genre] || 0) + 1), a), {});
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — title-based shelving from unclassified`);
    console.log(`unclassified scanned: ${books.length}`);
    console.log(`unambiguous single-genre matches: ${moves.length}  ${JSON.stringify(byGenre)}`);
    console.log(`skipped (combo/bundle): ${comboSkip} | ambiguous multi-genre: ${ambiguous}\n`);

    console.log('--- matches (title -> genre, [state]) ---');
    for (const m of moves) {
      console.log(`  [${m.genre.padEnd(20)}] ${m.book.isActive ? 'live ' : 'hidden'}  ${String(m.book.title).slice(0, 60)}`);
    }
    console.log('');

    if (!APPLY) {
      console.log(`Nothing written. Re-run with --apply (sets genre only, never publishes).`);
      return;
    }
    if (moves.length === 0) { console.log('Nothing to move.'); return; }

    const backupPath = path.resolve(__dirname, `../../shelve-new-genres-backup-${Date.now()}.csv`);
    fs.writeFileSync(
      backupPath,
      ['slug,title,old_genre,new_genre'].concat(
        moves.map((m) => [m.book.slug, JSON.stringify(m.book.title || ''), 'unclassified', m.genre].join(','))
      ).join('\n'),
      'utf8'
    );
    console.log(`Backup -> ${backupPath}`);

    let n = 0;
    for (const m of moves) {
      await Book.updateOne({ _id: m.book._id }, { $set: { genre: m.genre } });
      n += 1;
    }
    console.log(`Moved ${n} book(s) onto a gap genre (genre only; publish state untouched).`);

    await Promise.all([cacheDel('books_list:*'), cacheDel('genre:*'), cacheDel('filters_metadata')]);
    console.log('Caches invalidated.');
  } finally {
    await disconnectMongo();
  }
  process.exit(0);
})().catch((err) => {
  console.error('shelve-new-genres failed:', err.message);
  process.exit(1);
});
