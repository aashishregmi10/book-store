'use strict';

const express = require('express');
const { query, param, body } = require('express-validator');

const Book = require('../models/book.model');
const Genre = require('../models/genre.model');
const Review = require('../models/review.model');
const Question = require('../models/question.model');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { withCache } = require('../utils/cache');
const { cacheDel } = require('../config/redis');
const { ok, created, fail } = require('../utils/apiResponse');

const router = express.Router();

const LIST_FIELDS = 'slug title author price comparePrice coverImage avgRating reviewCount stockStatus genre condition isBestseller isNewArrival';

const SORTS = {
  popular: { soldCount: -1 },
  newest: { createdAt: -1 },
  'price-low': { price: 1 },
  'price-high': { price: -1 },
  rating: { avgRating: -1 },
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── GET /api/books — list with filters, sort, pagination ──
router.get(
  '/',
  [
    query('page').optional().toInt().isInt({ min: 1 }),
    query('limit').optional().toInt().isInt({ min: 1, max: 50 }),
    query('minPrice').optional().toInt().isInt({ min: 0 }),
    query('maxPrice').optional().toInt().isInt({ min: 0 }),
    query('sort').optional().isIn(Object.keys(SORTS)),
  ],
  validate,
  async (req, res, next) => {
    try {
      const page = req.query.page || 1;
      const limit = req.query.limit || 24;
      const sort = SORTS[req.query.sort] || SORTS.newest;

      const filter = { isActive: true };
      const and = [];
      const csv = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);

      // Genre — single or comma-separated multi-select.
      if (req.query.genre) {
        const genres = csv(req.query.genre).map((g) => g.toLowerCase());
        if (genres.length === 1) filter.genre = genres[0];
        else if (genres.length > 1) filter.genre = { $in: genres };
      }
      if (req.query.condition) filter.condition = req.query.condition;

      // Form / format.
      if (req.query.format) {
        const formats = csv(req.query.format);
        if (formats.length) filter['specifications.format'] = { $in: formats };
      }

      // Language — "Others" means anything that isn't Nepali/English.
      if (req.query.language) {
        const langs = csv(req.query.language);
        const named = langs.filter((l) => l !== 'Others');
        const langOr = [];
        if (named.length) langOr.push({ 'specifications.language': { $in: named } });
        if (langs.includes('Others')) langOr.push({ 'specifications.language': { $nin: ['Nepali', 'English'] } });
        if (langOr.length) and.push({ $or: langOr });
      }

      // Publication year — publishedDate is free text; match any selected year.
      if (req.query.year) {
        const years = csv(req.query.year).filter((y) => /^\d{4}$/.test(y));
        if (years.length) filter['specifications.publishedDate'] = new RegExp(years.join('|'));
      }

      if (req.query.minPrice || req.query.maxPrice) {
        filter.price = {};
        if (req.query.minPrice) filter.price.$gte = req.query.minPrice;
        if (req.query.maxPrice) filter.price.$lte = req.query.maxPrice;
      }
      if (req.query.search) filter.$text = { $search: String(req.query.search) };
      if (and.length) filter.$and = and;

      // Cache each distinct query for 60s (busted on admin book mutations via
      // `books_list:*`). The count runs only on a cache miss.
      const key = `books_list:${page}:${limit}:${req.query.sort || 'newest'}:${req.query.genre || ''}:${req.query.condition || ''}:${req.query.format || ''}:${req.query.language || ''}:${req.query.year || ''}:${req.query.minPrice || ''}:${req.query.maxPrice || ''}:${req.query.search || ''}`;
      const data = await withCache(key, 60, async () => {
        const [items, total] = await Promise.all([
          Book.find(filter).select(LIST_FIELDS).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
          Book.countDocuments(filter),
        ]);
        return { items, total, page, pages: Math.ceil(total / limit) };
      });

      // Let a CDN/browser serve repeats without hitting the origin.
      res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return ok(res, data, 'Books');
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/books/search-suggestions?q= — autocomplete ──
router.get('/search-suggestions', [query('q').trim().notEmpty()], validate, async (req, res, next) => {
  try {
    const q = String(req.query.q).slice(0, 60);
    const key = `suggestions:${q.toLowerCase()}`;
    const data = await withCache(key, 300, async () => {
      const rx = new RegExp(escapeRegex(q), 'i');
      const [books, genres, authors] = await Promise.all([
        Book.find({ isActive: true, $or: [{ title: rx }, { author: rx }] })
          .select('slug title author coverImage')
          .limit(6)
          .lean(),
        Genre.find({ isActive: true, name: rx }).select('slug name').limit(4).lean(),
        Book.distinct('author', { isActive: true, author: rx }),
      ]);
      return {
        books,
        genres,
        authors: authors.slice(0, 4).map((name) => ({ name })),
      };
    });
    return ok(res, data, 'Suggestions');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/books/filters/metadata — available filter options ──
router.get('/filters/metadata', async (_req, res, next) => {
  try {
    const data = await withCache('filters_metadata', 3600, async () => {
      const [genres, priceRange] = await Promise.all([
        Genre.find({ isActive: true }).select('slug name').sort({ name: 1 }).lean(),
        Book.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
        ]),
      ]);
      return {
        genres,
        priceRange: priceRange[0] ? { min: priceRange[0].min, max: priceRange[0].max } : { min: 0, max: 0 },
        conditions: ['new', 'used'],
        sorts: Object.keys(SORTS),
      };
    });
    return ok(res, data, 'Filter metadata');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/books/featured/books — homepage rails ──
router.get('/featured/books', async (_req, res, next) => {
  try {
    const data = await withCache('featured_books', 600, async () => {
      const base = { isActive: true };
      // Up to 20 per rail — the homepage rails scroll horizontally.
      const [featured, bestsellers, newArrivals] = await Promise.all([
        Book.find({ ...base, isFeatured: true }).select(LIST_FIELDS).limit(20).lean(),
        Book.find({ ...base, isBestseller: true }).select(LIST_FIELDS).sort({ soldCount: -1 }).limit(20).lean(),
        Book.find({ ...base, isNewArrival: true }).select(LIST_FIELDS).sort({ createdAt: -1 }).limit(20).lean(),
      ]);
      return { featured, bestsellers, newArrivals };
    });
    return ok(res, data, 'Featured');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/books/sitemap — lean list of all active books for the sitemap ──
router.get('/sitemap', async (_req, res, next) => {
  try {
    const data = await withCache('books_sitemap', 3600, () =>
      Book.find({ isActive: true })
        .select('slug updatedAt coverImage genre')
        .sort({ updatedAt: -1 })
        .limit(50000)
        .lean()
    );
    return ok(
      res,
      data.map((b) => ({ slug: b.slug, updatedAt: b.updatedAt, image: b.coverImage?.secureUrl, genre: b.genre })),
      'Sitemap'
    );
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/books/active?ids=… — which of these books are still purchasable ──
// Lets the client cart/wishlist prune items whose book was deleted/deactivated.
router.get('/active', async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[a-f0-9]{24}$/i.test(s));
    if (!ids.length) return ok(res, [], 'Active');
    const found = await Book.find({ _id: { $in: ids }, isActive: true }).distinct('_id');
    return ok(res, found.map(String), 'Active');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/books/:slug — detail + same-silo related + reviews ──
router.get('/:slug', [param('slug').trim().notEmpty()], validate, async (req, res, next) => {
  try {
    const slug = String(req.params.slug).toLowerCase();
    const book = await Book.findOne({ slug, isActive: true }).lean();
    if (!book) return fail(res, 'Book not found', 404, [{ code: 'NOT_FOUND' }]);

    // Fire-and-forget view counter (don't block the response).
    Book.updateOne({ _id: book._id }, { $inc: { viewCount: 1 } }).catch(() => {});

    // Related: prefer explicit relatedSlugs (same silo), fall back to genre.
    const related = await (async () => {
      let books = [];
      if (book.relatedSlugs?.length) {
        books = await Book.find({ slug: { $in: book.relatedSlugs }, isActive: true }).select(LIST_FIELDS).limit(4).lean();
      }
      if (books.length < 4) {
        const have = new Set(books.map((b) => b.slug));
        have.add(book.slug);
        const fill = await Book.find({ genre: book.genre, slug: { $nin: [...have] }, isActive: true })
          .select(LIST_FIELDS)
          .sort({ soldCount: -1 })
          .limit(4 - books.length)
          .lean();
        books = books.concat(fill);
      }
      return books;
    })();

    const [reviews, questions] = await Promise.all([
      Review.find({ book: book._id, isApproved: true })
        .populate('user', 'fullName')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      // Answered Q&A powers a visible section + QAPage schema (AEO).
      Question.find({ book: book._id, isAnswered: true, isActive: true })
        .select('question answer answeredAt createdAt')
        .sort({ answeredAt: -1 })
        .limit(10)
        .lean(),
    ]);

    return ok(res, { book, related, reviews, questions }, 'Book');
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/books/:slug/questions — ask a question (auth) ──
router.post(
  '/:slug/questions',
  authenticate,
  [param('slug').trim().notEmpty(), body('question').trim().isLength({ min: 5, max: 500 })],
  validate,
  async (req, res, next) => {
    try {
      const book = await Book.findOne({ slug: String(req.params.slug).toLowerCase(), isActive: true }).select('_id');
      if (!book) return fail(res, 'Book not found', 404, [{ code: 'NOT_FOUND' }]);
      await Question.create({ book: book._id, user: req.userId, question: req.body.question });
      return created(res, null, "Thanks — we'll answer your question soon.");
    } catch (err) {
      return next(err);
    }
  }
);

// Exposed so admin mutations can invalidate the read caches.
router.invalidateBookCaches = async (slug) => {
  await Promise.all([
    slug ? cacheDel(`book:${slug}`) : Promise.resolve(),
    cacheDel('books_list:*'),
    cacheDel('featured_books'),
    cacheDel('filters_metadata'),
    cacheDel('suggestions:*'),
  ]);
};

module.exports = router;
