'use strict';

/**
 * Populate `relatedBooks` on each article, and give each one a cover image.
 *
 * All five articles shipped with an empty relatedBooks array, so the
 * "Books from this guide" section and the new sidebar rail never rendered —
 * the in-body internal links into the catalogue are the entire point of these
 * guides, and half that funnel was missing.
 *
 * Covers use a real book jacket from the article's own topic rather than a
 * stock photo, per the house rule in CLAUDE.md. Articles with no match keep
 * ArticleCover's designed editorial fallback, which is a deliberate jacket
 * rather than a broken image.
 *
 * Usage:
 *   node scripts/link-article-books.js            # dry run
 *   node scripts/link-article-books.js --apply
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const Article = require('../src/models/article.model');
const Book = require('../src/models/book.model');

// Per-article selection rules, keyed by slug. Genre first, then a title regex
// so a guide about a specific topic pulls the obviously-relevant titles rather
// than whatever happens to sort first.
const RULES = {
  'best-loksewa-preparation-books-nepal': {
    filter: { $or: [{ category: 'loksewa' }, { genre: 'politics-society' }] },
    prefer: /loksewa|public service|gk|general knowledge|nepal/i,
  },
  'essential-nepali-literature-books': {
    filter: { genre: 'nepali-literature' },
  },
  'buy-books-online-nepal-cod-guide': {
    filter: { genre: { $in: ['fiction', 'self-help'] }, isBestseller: true },
  },
  'best-self-help-books-nepal': {
    filter: { genre: 'self-help' },
    prefer: /habit|atomic|monk|think|mindset|discipline|power/i,
  },
  'daily-reading-habit-guide': {
    filter: { genre: { $in: ['self-help', 'psychology'] } },
    prefer: /habit|focus|deep work|read|discipline/i,
  },
};

const LIMIT = 6;

async function main() {
  const apply = process.argv.includes('--apply');
  await connectMongo();

  const articles = await Article.find().select('slug title coverImage relatedBooks').lean();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${articles.length} article(s)\n`);

  for (const a of articles) {
    const rule = RULES[a.slug];
    if (!rule) {
      console.log(`  ${a.slug}\n    no rule — skipped`);
      continue;
    }

    // Pull a wider pool, then float the preferred titles to the front.
    const pool = await Book.find({ isActive: true, stock: { $gt: 0 }, ...rule.filter })
      .select('title author slug coverImage soldCount')
      .sort({ soldCount: -1 })
      .limit(60)
      .lean();

    const ranked = rule.prefer
      ? [...pool].sort((x, y) => Number(rule.prefer.test(y.title)) - Number(rule.prefer.test(x.title)))
      : pool;
    const picked = ranked.slice(0, LIMIT);

    console.log(`  ${a.slug}`);
    console.log(`    pool ${pool.length} → linking ${picked.length}`);
    picked.forEach((b) => console.log(`      · ${b.title.slice(0, 58)}`));

    if (!apply) continue;

    const update = { relatedBooks: picked.map((b) => b._id) };
    // Only set a cover if the article has none — never overwrite one an admin
    // has uploaded.
    if (!a.coverImage?.secureUrl && picked[0]?.coverImage?.secureUrl) {
      update.coverImage = picked[0].coverImage;
      console.log(`    cover ← ${picked[0].title.slice(0, 40)}`);
    }
    await Article.updateOne({ _id: a._id }, { $set: update });
  }

  if (!apply) console.log('\nNothing written. Re-run with --apply.');
  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err.message);
  await disconnectMongo().catch(() => {});
  process.exit(1);
});
