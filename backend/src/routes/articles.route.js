'use strict';

const express = require('express');

const Article = require('../models/article.model');
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
});
const slugParams = z.object({ slug: trimmedString() });
const sitemapQuery = z.object({
  page: intQuery({ min: 1 }).optional(),
  limit: intQuery({ min: 1, max: 5000 }).optional(),
});

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
      if (req.query.search) {
        // Escaped: this is user input reaching a regex. Title and excerpt only —
        // searching bodies would mean scanning every article's full text on a
        // collection meant to grow into the thousands.
        const rx = new RegExp(escapeRegex(String(req.query.search)), 'i');
        filter.$or = [{ title: rx }, { excerpt: rx }];
      }

      const key = `articles_list:${page}:${limit}:${req.query.category || ''}:${req.query.tag || ''}:${req.query.search || ''}`;
      const data = await withCache(key, 600, async () => {
        const [items, total] = await Promise.all([
          Article.find(filter).select(LIST).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
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
          .sort({ publishedAt: -1 })
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
    res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return ok(res, article, 'Article');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
