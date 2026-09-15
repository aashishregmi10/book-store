'use strict';

const express = require('express');

const Article = require('../models/article.model');
// Required for its side effect: both populate() calls below resolve
// `relatedBooks` against the Book model, and Mongoose throws
// "Schema hasn't been registered" unless something has loaded it first. That
// has always been true here and has only ever worked by accident of load order.
require('../models/book.model');
const { validate } = require('../middleware/validate');
const { z, trimmedString, intQuery } = require('../utils/zod');
const { withCache } = require('../utils/cache');
const { ok, fail } = require('../utils/apiResponse');

const router = express.Router();

const LIST = 'slug title excerpt coverImage author category tags publishedAt readingTime';
const BOOK_FIELDS = 'slug title author price comparePrice coverImage avgRating reviewCount stockStatus genre isBestseller isNewArrival';

// max 200 rather than 50 so the sitemap can pull the whole article list in one
// or two pages. At 50 the sitemap's request was rejected outright and the
// frontend's .catch() turned that 400 into an empty <urlset> — every published
// article silently vanished from the sitemap. Still bounded: this is a public,
// cached endpoint and an unbounded limit is a cheap way to make it expensive.
//
// `category`, `tag` and `search` are declared here rather than left undeclared.
// The handler has always read req.query.category, and it happened to work only
// because validate() merges parsed values over req.query instead of replacing
// it — an undeclared filter is one refactor away from silently doing nothing.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageQuery = z.object({
  page: intQuery({ min: 1 }).optional(),
  limit: intQuery({ min: 1, max: 200 }).optional(),
  category: trimmedString().optional(),
  tag: trimmedString().optional(),
  search: trimmedString().optional(),
  genre: trimmedString().optional(),
});
const slugParams = z.object({ slug: trimmedString() });
const sitemapQuery = z.object({
  page: intQuery({ min: 1 }).optional(),
  limit: intQuery({ min: 1, max: 5000 }).optional(),
});

/**
 * Which published articles are relevant to each genre, best match first.
 *
 * Articles carry no genre of their own — they carry the books they recommend,
 * and those have genres. Asking the question the other way round (find every
 * book in this genre, then find articles referencing any of them) means an
 * `$in` over hundreds of ids per genre page. There are 27 articles, so one pass
 * over them builds the whole map for the price of a single query, and it holds
 * for an hour.
 *
 * A genre counts only if the article recommends at least two live books from it,
 * which keeps a guide to Nepali fiction that happens to mention one cookbook out
 * of the cookery genre. Single-book articles are exempt, or they would match
 * nothing at all.
 */
async function genreIndex() {
  return withCache('articles_genre_index', 3600, async () => {
    const arts = await Article.find({ status: 'published' })
      .select('_id slug relatedBooks')
      .populate({ path: 'relatedBooks', select: 'genre isActive' })
      .lean();

    const byGenre = {};
    const bySlug = {};
    for (const a of arts) {
      const live = (a.relatedBooks || []).filter((b) => b && b.isActive && b.genre);
      const counts = {};
      for (const b of live) counts[b.genre] = (counts[b.genre] || 0) + 1;
      bySlug[a.slug] = Object.keys(counts);
      const floor = live.length <= 1 ? 1 : 2;
      for (const [genre, n] of Object.entries(counts)) {
        if (n < floor) continue;
        (byGenre[genre] ||= []).push({ id: String(a._id), n });
      }
    }
    // Strongest association first, so a genre page showing three guides shows
    // the three that are most about it.
    for (const g of Object.keys(byGenre)) {
      byGenre[g].sort((x, y) => y.n - x.n);
      byGenre[g] = byGenre[g].map((x) => x.id);
    }
    return { byGenre, bySlug };
  });
}

// ── GET /api/articles — published list (blog index) ──
router.get(
  '/',
  validate({ query: pageQuery }),
  async (req, res, next) => {
    try {
      const page = req.query.page || 1;
      const limit = req.query.limit || 12;
      const filter = { status: 'published' };
      if (req.query.category) filter.category = String(req.query.category);
      if (req.query.tag) filter.tags = String(req.query.tag);
      if (req.query.genre) {
        const ids = (await genreIndex()).byGenre[String(req.query.genre)] || [];
        // An empty list has to mean "no matches", not "no filter" — otherwise a
        // genre with no guides quietly shows the newest articles on the site.
        filter._id = { $in: ids };
      }
      if (req.query.search) {
        // Escaped: this is user input reaching a regex. Title and excerpt only —
        // searching bodies would mean scanning every article's full text on a
        // collection meant to grow into the thousands.
        const rx = new RegExp(escapeRegex(String(req.query.search)), 'i');
        filter.$or = [{ title: rx }, { excerpt: rx }];
      }

      // Every filter belongs in the key. A missing one does not just serve a
      // stale list, it serves a different genre's list under this genre's URL.
      const key = `articles_list:${page}:${limit}:${req.query.category || ''}:${req.query.tag || ''}:${req.query.search || ''}:${req.query.genre || ''}`;
      const data = await withCache(key, 600, async () => {
        const [items, total] = await Promise.all([
          // _id tiebreaker: a seeded batch shares publishedAt to the millisecond, and
          // tied documents have no stable order across requests, so paging without
          // it repeats some articles and skips others (see books.route.js).
          Article.find(filter).select(LIST).sort({ publishedAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
          Article.countDocuments(filter),
        ]);
        return { items, total, page, pages: Math.ceil(total / limit) || 1 };
      });
      res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return ok(res, data, 'Articles');
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/articles/meta — categories with counts (blog filter bar) ──
//
// Declared before /:slug, or the slug route captures it. Counting client-side
// from the current page cannot work once the archive is paginated: page 1 knows
// nothing about the categories on page 40. Cached for an hour — a category set
// changes when someone publishes into a new one, not on a timer.
router.get('/meta', async (_req, res, next) => {
  try {
    const data = await withCache('articles_meta', 3600, async () => {
      const [categories, total] = await Promise.all([
        Article.aggregate([
          { $match: { status: 'published' } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ]),
        Article.countDocuments({ status: 'published' }),
      ]);
      return {
        total,
        categories: categories
          .filter((c) => c._id)
          .map((c) => ({ name: c._id, count: c.count })),
      };
    });
    res.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    return ok(res, data, 'Article meta');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/articles/sitemap — slugs + dates only, paged ──
//
// The sitemap used to be built by paging the full list endpoint 100 rows at a
// time and keeping every field, including excerpts and cover images, purely to
// read a slug and a date. At a few dozen articles that was wasteful; at a few
// thousand it is a hundred sequential round trips on a route the sitemap index
// re-runs on every request. This returns the two fields a <url> entry needs,
// with a total so the index can compute its shard count from one call.
router.get('/sitemap', validate({ query: sitemapQuery }), async (req, res, next) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 1000;
    const filter = { status: 'published' };
    const data = await withCache(`articles_sitemap:${page}:${limit}`, 1800, async () => {
      const [items, total] = await Promise.all([
        Article.find(filter)
          .select('slug publishedAt updatedAt')
          .sort({ publishedAt: -1, _id: 1 }) // stable paging — see books.route.js
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Article.countDocuments(filter),
      ]);
      return { total, items };
    });
    res.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    return ok(res, data, 'Article sitemap');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/articles/:slug — published article + related books ──
router.get('/:slug', validate({ params: slugParams }), async (req, res, next) => {
  try {
    const slug = String(req.params.slug).toLowerCase();
    const article = await withCache(`article:${slug}`, 600, () =>
      Article.findOne({ slug, status: 'published' }).populate('relatedBooks', BOOK_FIELDS).lean()
    );
    if (!article) return fail(res, 'Article not found', 404, [{ code: 'NOT_FOUND' }]);

    // Guides had exactly one inbound link each — the blog index — because
    // nothing on the site pointed at an individual article, not even another
    // article. Three siblings per guide turns 27 dead ends into a web a crawler
    // can actually walk.
    article.relatedArticles = await withCache(`article_related:${slug}`, 600, async () => {
      const pool = await Article.find({ status: 'published', slug: { $ne: slug } })
        .select('slug title excerpt coverImage category tags publishedAt readingTime')
        .lean();

      // Rarity-weight the tags. Counting shared tags flat ranks almost at
      // random here, because "nepal" is on 25 of the 27 articles and so every
      // pair shares it — the self-help guide came back matched to Nepali
      // literature, romance and a Dashain gift list. A tag is worth something
      // only to the extent it is not on everything else.
      const freq = {};
      for (const a of [...pool, article]) for (const t of a.tags || []) freq[t] = (freq[t] || 0) + 1;
      const total = pool.length + 1;
      const weight = (t) => Math.log(total / (freq[t] || 1));

      // Tags alone are not enough either. The self-help guide's only
      // distinguishing tags — "self-help", "personal development" — are unique to
      // it, so nothing shares them and the ranking falls back to recency. What
      // it does share with its real siblings is the *shelf* it recommends from,
      // which the articles already record in relatedBooks.
      const { bySlug } = await genreIndex();
      const myGenres = new Set(bySlug[slug] || []);

      const mine = new Set((article.tags || []).filter(Boolean));
      const score = (a) => {
        let s = 0;
        for (const t of a.tags || []) if (mine.has(t)) s += weight(t);
        // Capped, because it stacks. A wide-ranging gift list recommends books
        // from eight shelves and so overlaps with everything; uncapped, that
        // out-scored a rare shared tag and pushed the Colleen Hoover guide off
        // the romance article. Worth less in total than one exact rare-tag
        // match (~3.3): a genuine signal, not a deciding one.
        let g = 0;
        for (const genre of bySlug[a.slug] || []) if (myGenres.has(genre)) g += 1.5;
        s += Math.min(g, 3);
        // A small nudge, not a tiebreaker of its own: it keeps a buying guide
        // beside buying guides when everything else is genuinely equally close.
        if (a.category === article.category) s += 0.25;
        return s;
      };
      return pool
        .sort((x, y) => score(y) - score(x) || new Date(y.publishedAt) - new Date(x.publishedAt))
        .slice(0, 3);
    });

    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return ok(res, article, 'Article');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
