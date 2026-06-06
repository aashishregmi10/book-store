'use strict';

const express = require('express');
const { param, query } = require('express-validator');

const Genre = require('../models/genre.model');
const Book = require('../models/book.model');
const { validate } = require('../middleware/validate');
const { withCache } = require('../utils/cache');
const { ok, fail } = require('../utils/apiResponse');

const router = express.Router();

const LIST_FIELDS = 'slug title author price comparePrice coverImage avgRating reviewCount stockStatus genre condition isBestseller isNewArrival';

const SORTS = {
  popular: { soldCount: -1 },
  newest: { createdAt: -1 },
  'price-low': { price: 1 },
  'price-high': { price: -1 },
  rating: { avgRating: -1 },
};

// ── GET /api/genres — all active genres (nav + footer) ──
router.get('/', async (_req, res, next) => {
  try {
    const data = await withCache('genres_list', 3600, () =>
      Genre.find({ isActive: true }).select('slug name description color icon bookCount').sort({ name: 1 }).lean()
    );
    return ok(res, data, 'Genres');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/genres/:slug — silo page: genre + its books (SEO) ──
router.get(
  '/:slug',
  [
    param('slug').trim().notEmpty(),
    query('page').optional().toInt().isInt({ min: 1 }),
    query('limit').optional().toInt().isInt({ min: 1, max: 50 }),
    query('sort').optional().isIn(Object.keys(SORTS)),
  ],
  validate,
  async (req, res, next) => {
    try {
      const slug = String(req.params.slug).toLowerCase();
      const genre = await Genre.findOne({ slug, isActive: true }).lean();
      if (!genre) return fail(res, 'Genre not found', 404, [{ code: 'NOT_FOUND' }]);

      const page = req.query.page || 1;
      const limit = req.query.limit || 24;
      const sort = SORTS[req.query.sort] || SORTS.popular;

      const filter = { genre: slug, isActive: true };
      const [items, total] = await Promise.all([
        Book.find(filter).select(LIST_FIELDS).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
        Book.countDocuments(filter),
      ]);

      return ok(res, { genre, items, total, page, pages: Math.ceil(total / limit) }, 'Genre');
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
