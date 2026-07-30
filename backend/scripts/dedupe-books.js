'use strict';

/*
 * Merge books that are the same title listed twice.
 *
 * The Daraz import created one record per listing, and the seller listed some
 * books more than once under slightly different titles — "Tuesdays with Morrie"
 * and "Tuesday With Morrie", "How To Win Friends..." and "How To Win Friend...".
 * Exact-title grouping misses these entirely, so titles are matched on a light
 * stem: lowercased, punctuation dropped, a trailing plural 's' removed per word,
 * tokens sorted. Author must match under the same rule, which is what stops
 * "The Wisdom of Morrie" (a different book by a different author) collapsing in.
 *
 * Within a group the record with the most sales wins, because that is the one
 * order history and soldCount ranking already point at. The winner then adopts
 * whichever title looks least mangled and an ISBN if it was missing one — the
 * surviving record is usually the one with the typo, so a plain delete would
 * keep the wrong spelling.
 *
 * A loser is only ever deleted when nothing references it. If an order,
 * wishlist, review, question or article points at it, it is deactivated instead
 * so those references keep resolving.
 *
 *   node scripts/dedupe-books.js            # dry run (default)
 *   node scripts/dedupe-books.js --apply    # merge + delete/deactivate
 *
 * Makes no writes without --apply.
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const Book = require('../src/models/book.model');
const Order = require('../src/models/order.model');
const User = require('../src/models/user.model');
const Review = require('../src/models/review.model');
const Question = require('../src/models/question.model');
const Article = require('../src/models/article.model');
const { deleteImage } = require('../src/config/cloudinary');

const APPLY = process.argv.includes('--apply');

// Light stem so singular/plural and capitalisation variants land in one bucket.
// Only words longer than 3 chars lose a trailing 's', so "is"/"has" survive.
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .sort()
    .join(' ');

const isAllCaps = (s) => {
  const letters = String(s || '').replace(/[^A-Za-z]/g, '');
  return letters.length > 0 && letters === letters.toUpperCase();
};

// Prefer a title that isn't shouting, then the longer one — the mangled variant
// in this catalogue is consistently the one missing a letter.
function bestTitle(a, b) {
  if (isAllCaps(a) !== isAllCaps(b)) return isAllCaps(a) ? b : a;
  return b.length > a.length ? b : a;
}

async function referenceCount(id) {
  const [orders, wishlists, reviews, questions, articles] = await Promise.all([
    Order.countDocuments({ 'items.book': id }),
    User.countDocuments({ wishlist: id }),
    Review.countDocuments({ book: id }),
    Question.countDocuments({ book: id }),
    Article.countDocuments({ relatedBooks: id }),
  ]);
  return { orders, wishlists, reviews, questions, articles, total: orders + wishlists + reviews + questions + articles };
}

(async function main() {
  await connectMongo();

  const books = await Book.find({ isActive: true })
    .select('title author isbn slug price stock soldCount coverImage')
    .lean();

  const groups = new Map();
  for (const b of books) {
    const key = `${norm(b.title)}||${norm(b.author)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }

  const dupes = [...groups.values()].filter((v) => v.length > 1);
  console.log(`Scanned ${books.length} active books.`);
  console.log(`Duplicate groups: ${dupes.length}  (surplus records: ${dupes.reduce((s, v) => s + v.length - 1, 0)})\n`);

  if (dupes.length === 0) {
    console.log('Nothing to merge.');
    await disconnectMongo();
    process.exit(0);
  }

  const plans = [];
  for (const group of dupes) {
    const sorted = [...group].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
    const [winner, ...losers] = sorted;

    let title = winner.title;
    let isbn = winner.isbn || '';
    for (const l of losers) {
      title = bestTitle(title, l.title);
      if (!isbn && l.isbn) isbn = l.isbn;
    }

    // eslint-disable-next-line no-await-in-loop -- a handful of groups; clarity beats concurrency here
    const refs = await Promise.all(losers.map((l) => referenceCount(l._id)));
    plans.push({ winner, losers, title, isbn, refs });
  }

  for (const p of plans) {
    console.log(`KEEP  [${p.winner.slug}] "${p.winner.title}"  sold=${p.winner.soldCount || 0} isbn=${p.winner.isbn || 'none'}`);
    if (p.title !== p.winner.title) console.log(`      title -> "${p.title}"`);
    if (p.isbn !== (p.winner.isbn || '')) console.log(`      isbn  -> ${p.isbn}`);
    p.losers.forEach((l, i) => {
      const r = p.refs[i];
      const verb = r.total === 0 ? 'DELETE' : `DEACTIVATE (referenced: ${JSON.stringify(r)})`;
      console.log(`  ${verb}  [${l.slug}] "${l.title}"  sold=${l.soldCount || 0} isbn=${l.isbn || 'none'}`);
    });
    console.log('');
  }

  if (!APPLY) {
    console.log('DRY RUN — nothing written. Re-run with --apply.');
    await disconnectMongo();
    process.exit(0);
  }

  let merged = 0;
  let removed = 0;
  let deactivated = 0;

  for (const p of plans) {
    const update = {};
    if (p.title !== p.winner.title) update.title = p.title;
    if (p.isbn && p.isbn !== (p.winner.isbn || '')) update.isbn = p.isbn;
    if (Object.keys(update).length) {
      // eslint-disable-next-line no-await-in-loop -- sequential so the log reads in order
      await Book.updateOne({ _id: p.winner._id }, { $set: update });
      merged += 1;
    }

    for (let i = 0; i < p.losers.length; i += 1) {
      const l = p.losers[i];
      const r = p.refs[i];
      if (r.total === 0) {
        // eslint-disable-next-line no-await-in-loop
        await Book.deleteOne({ _id: l._id });
        // Cover is unreferenced once the record is gone; best-effort cleanup so
        // it doesn't sit in Cloudinary forever.
        if (l.coverImage?.publicId) deleteImage(l.coverImage.publicId).catch(() => {});
        removed += 1;
        console.log(`deleted   [${l.slug}]`);
      } else {
        // eslint-disable-next-line no-await-in-loop
        await Book.updateOne({ _id: l._id }, { $set: { isActive: false } });
        deactivated += 1;
        console.log(`deactivated [${l.slug}] — still referenced`);
      }
    }
  }

  console.log(`\nDone. Titles/ISBNs merged: ${merged}. Deleted: ${removed}. Deactivated: ${deactivated}.`);
  console.log('Catalogue caches are keyed per book — restart the API or wait for the TTL to see the change.');
  await disconnectMongo();
  process.exit(0);
})().catch((err) => {
  console.error('Dedupe failed:', err.message);
  process.exit(1);
});
