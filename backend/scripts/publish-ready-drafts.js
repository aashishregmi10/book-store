'use strict';

/*
 * Publish hidden books that are actually ready, and only those.
 *
 * Shelving a book (giving it a genre) and publishing it are separate steps on
 * purpose: a genre is reversible metadata, while publishing puts the book on a
 * public, crawlable URL. classify-by-author.js and activate-drafts.js set the
 * genre; this decides what goes live.
 *
 * A book must clear every gate below. They are not stylistic: each one maps to
 * something that breaks on a live product page.
 *
 *   genre        A real, browsable genre. `unclassified` is the hidden holding
 *                pen — /genre/unclassified renders "Genre not found", so a book
 *                published into it has a breadcrumb and JSON-LD pointing at a
 *                dead page (see the sitemap fix in books.route.js).
 *   description  Real prose, not cleanDescription's placeholder and not a stub.
 *                Publishing placeholder text puts near-duplicate boilerplate on
 *                hundreds of indexable pages, which is what got the catalogue
 *                into trouble the first time.
 *   cover        BookCover falls back to a titled grey box without one. Fine as
 *                a failure mode, not fine as a launch state.
 *   price        A book priced at 0 is orderable for free. There is already one
 *                such book live; do not add more.
 *   stock        Nothing is published as immediately out of stock.
 *
 * Anything failing a gate stays hidden and is counted, so the report doubles as
 * a worklist: it tells you exactly what to fix to release the rest.
 *
 * Dry run by default.
 *   node scripts/publish-ready-drafts.js
 *   node scripts/publish-ready-drafts.js --apply
 *   node scripts/publish-ready-drafts.js --apply --limit 50
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');
const { isTemplateDescription } = require('../src/utils/cleanDescription');

const MIN_DESC_CHARS = 200;
const HOLDING = 'unclassified';

function parseArgs(argv) {
  const a = { apply: false, limit: Infinity, minDesc: MIN_DESC_CHARS };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--limit') a.limit = Number(argv[i + 1]) || Infinity;
    else if (argv[i] === '--min-desc') a.minDesc = Number(argv[i + 1]) || MIN_DESC_CHARS;
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
      .select('slug title author genre category description coverImage price stock stockStatus')
      .lean();

    const ready = [];
    const blocked = {};
    const note = (reason) => { blocked[reason] = (blocked[reason] || 0) + 1; };

    for (const b of drafts) {
      const genreOk = b.genre && b.genre !== HOLDING && liveGenres.has(b.genre);
      // A section book (kids/manga/loksewa) is allowed to have no genre: the
      // model requires one only when there is no category.
      if (!genreOk && !b.category) { note('no browsable genre'); continue; }

      const d = (b.description || '').trim();
      if (!d || d.length < args.minDesc) { note('description too short'); continue; }
      if (isTemplateDescription(d)) { note('placeholder description'); continue; }
      if (!b.coverImage || !b.coverImage.secureUrl) { note('no cover image'); continue; }
      if (!b.price || b.price < 1) { note('price is zero or missing'); continue; }
      if (b.stockStatus === 'out-of-stock' || b.stockStatus === 'discontinued') { note('not in stock'); continue; }

      ready.push(b);
    }

    const publish = ready.slice(0, args.limit);

    console.log(`${args.apply ? 'APPLYING' : 'DRY RUN'} — ${drafts.length} hidden book(s)`);
    console.log(`ready to publish : ${ready.length}${publish.length !== ready.length ? ` (limiting to ${publish.length})` : ''}`);
    console.log(`held back        : ${drafts.length - ready.length}\n`);

    console.log('why the rest stay hidden:');
    Object.entries(blocked).sort((a, b) => b[1] - a[1])
      .forEach(([r, n]) => console.log(`  ${String(n).padStart(5)}  ${r}`));

    const dist = {};
    for (const b of publish) {
      const k = b.genre && b.genre !== HOLDING ? b.genre : `(section: ${b.category})`;
      dist[k] = (dist[k] || 0) + 1;
    }
    if (publish.length) {
      console.log('\nwould publish into:');
      Object.entries(dist).sort((a, b) => b[1] - a[1])
        .forEach(([g, n]) => console.log(`  ${String(n).padStart(5)}  ${g}`));
      console.log('\nfirst 8:');
      publish.slice(0, 8).forEach((b) =>
        console.log(`  ${String(b.genre).padEnd(22)} ${String(b.title).slice(0, 50)}`)
      );
    }

    const stamp = Date.now();
    const csv = path.join(__dirname, '..', `published-drafts-${stamp}.csv`);
    fs.writeFileSync(
      csv,
      ['slug,title,author,genre,category,price']
        .concat(publish.map((b) => [b.slug, b.title, b.author, b.genre, b.category || '', b.price].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );
    console.log(`\nreview CSV: ${csv}`);

    if (!args.apply) {
      console.log('\nNothing was published. Re-run with --apply.');
      return;
    }

    let published = 0;
    for (const b of publish) {
      await Book.updateOne({ _id: b._id }, { $set: { isActive: true } });
      published += 1;
    }
    logger.info({ published, heldBack: drafts.length - ready.length }, 'Ready drafts published');
    console.log(`\npublished: ${published}`);
    console.log('Book pages are ISR at revalidate=120, so these appear within ~2 minutes.');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'publish-ready-drafts failed');
  process.exit(1);
});
