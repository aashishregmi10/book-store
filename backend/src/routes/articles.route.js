'use strict';

const express = require('express');
const { param, query } = require('express-validator');

const Article = require('../models/article.model');
const { validate } = require('../middleware/validate');
const { withCache } = require('../utils/cache');
const { ok, fail } = require('../utils/apiResponse');

const router = express.Router();

const LIST = 'slug title excerpt coverImage author category tags publishedAt readingTime';
const BOOK_FIELDS = 'slug title author price comparePrice coverImage avgRating reviewCount stockStatus genre condition isBestseller isNewArrival';

// ── GET /api/articles — published list (blog index) ──
router.get(
  '/',
  [query('page').optional().toInt().isInt({ min: 1 }), query('limit').optional().toInt().isInt({ min: 1, max: 50 })],
  validate,
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
      return ok(res, data, 'Articles');
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/articles/:slug — published article + related books ──
router.get('/:slug', [param('slug').trim().notEmpty()], validate, async (req, res, next) => {
  try {
    const slug = String(req.params.slug).toLowerCase();
    const article = await withCache(`article:${slug}`, 600, () =>
      Article.findOne({ slug, status: 'published' }).populate('relatedBooks', BOOK_FIELDS).lean()
    );
    if (!article) return fail(res, 'Article not found', 404, [{ code: 'NOT_FOUND' }]);
    return ok(res, article, 'Article');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
