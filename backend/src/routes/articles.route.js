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
const pageQuery = z.object({ page: intQuery({ min: 1 }).optional(), limit: intQuery({ min: 1, max: 200 }).optional() });
const slugParams = z.object({ slug: trimmedString() });

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

      const key = `articles_list:${page}:${limit}:${req.query.category || ''}:${req.query.tag || ''}`;
      const data = await withCache(key, 600, async () => {
        const [items, total] = await Promise.all([
          Article.find(filter).select(LIST).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
          Article.countDocuments(filter),
        ]);
        return { items, total, page, pages: Math.ceil(total / limit) };
      });
      res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return ok(res, data, 'Articles');
    } catch (err) {
      return next(err);
    }
  }
);

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
