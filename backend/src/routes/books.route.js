'use strict';

const express = require('express');

const Book = require('../models/book.model');
const Genre = require('../models/genre.model');
const Review = require('../models/review.model');
const Question = require('../models/question.model');
const Order = require('../models/order.model');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { z, trimmedString, intQuery } = require('../utils/zod');
const { withCache } = require('../utils/cache');
const { cacheDel } = require('../config/redis');
const { ok, created, fail } = require('../utils/apiResponse');

const router = express.Router();

const LIST_FIELDS = 'slug title author price comparePrice coverImage avgRating reviewCount stockStatus genre condition isBestseller isNewArrival variants';

const SORTS = {
  popular: { soldCount: -1 },
  newest: { createdAt: -1 },
  'price-low': { price: 1 },
  'price-high': { price: -1 },
  rating: { avgRating: -1 },
};

// ── Validation schemas (free-text filters like genre/category pass through) ──
const booksListQuery = z.object({
  page: intQuery({ min: 1 }).optional(),
  limit: intQuery({ min: 1, max: 50 }).optional(),
  minPrice: intQuery({ min: 0 }).optional(),
  maxPrice: intQuery({ min: 0 }).optional(),
  sort: z.enum(Object.keys(SORTS)).optional(),
});
const suggestQuery = z.object({ q: trimmedString() });
const sitemapQuery = z.object({
  page: intQuery({ min: 1 }).optional(),
  limit: intQuery({ min: 1, max: 50000 }).optional(),
});
const slugParams = z.object({ slug: trimmedString() });
const questionBody = z.object({ question: z.string().trim().min(5).max(500) });
const reviewBody = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional(),
  body: z.string().trim().min(10).max(2000),
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── GET /api/books — list with filters, sort, pagination ──
router.get(
  '/',
  validate({ query: booksListQuery }),
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
      // Category section (manga / kids / loksewa).
      if (req.query.category) filter.category = String(req.query.category).toLowerCase();

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
      const key = `books_list:${page}:${limit}:${req.query.sort || 'newest'}:${req.query.genre || ''}:${req.query.category || ''}:${req.query.condition || ''}:${req.query.format || ''}:${req.query.language || ''}:${req.query.year || ''}:${req.query.minPrice || ''}:${req.query.maxPrice || ''}:${req.query.search || ''}`;
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
router.get('/search-suggestions', validate({ query: suggestQuery }), async (req, res, next) => {
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

// Books that have been sold out / discontinued for more than this long are
// dropped from the sitemap (SEO Guide: don't index long-dead listings). There is
// no soldOutAt field, so updatedAt is the proxy — a restock or any admin edit
// bumps the book back into the sitemap. Reused by both sitemap endpoints.
const SITEMAP_PAGE_SIZE = 50000; // Google's hard limit of 50k URLs per sitemap
const sitemapFilter = () => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return {
    isActive: true,
    $nor: [{ stockStatus: { $in: ['out-of-stock', 'discontinued'] }, updatedAt: { $lt: cutoff } }],
  };
};

// ── GET /api/books/sitemap?page=&limit= — paged indexable books for the sitemap ──
// Returns { total, items } so the Next sitemap can compute its shard count and
// page through titles, keeping each shard under the 50k-URL limit. `title` feeds
// the cover image entry; `image` is the raw Cloudinary URL (the frontend applies
// the f_auto,q_auto delivery transform).
router.get('/sitemap', validate({ query: sitemapQuery }), async (req, res, next) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || SITEMAP_PAGE_SIZE;
    const result = await withCache(`books_sitemap:${page}:${limit}`, 3600, async () => {
      const filter = sitemapFilter();
      const [items, total] = await Promise.all([
        Book.find(filter)
          .select('slug title updatedAt coverImage')
          .sort({ updatedAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Book.countDocuments(filter),
      ]);
      return {
        total,
        items: items.map((b) => ({
          slug: b.slug,
          title: b.title,
          updatedAt: b.updatedAt,
          image: b.coverImage?.secureUrl,
        })),
      };
    });
    res.set('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400'); // 6h / 24h
    return ok(res, result, 'Sitemap');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/books/sitemap/sections — per-section freshness for the sitemap ──
// One aggregation yields the latest book updatedAt per category (Manga/Kids/
// Loksewa) and per genre, so those sitemap entries get an accurate <lastmod>.
// Only sections holding at least one indexable book are returned — empty genres
// must not appear in the sitemap. Two segments, so /:slug never captures it.
router.get('/sitemap/sections', async (_req, res, next) => {
  try {
    const data = await withCache('books_sitemap_sections', 3600, async () => {
      const [agg] = await Book.aggregate([
        { $match: sitemapFilter() },
        {
          $facet: {
            categories: [
              { $match: { category: { $ne: null } } },
              { $group: { _id: '$category', lastmod: { $max: '$updatedAt' } } },
            ],
            genres: [{ $group: { _id: '$genre', lastmod: { $max: '$updatedAt' } } }],
          },
        },
      ]);
      const shape = (arr) => arr.filter((x) => x._id).map((x) => ({ slug: x._id, lastmod: x.lastmod }));
      return { categories: shape(agg.categories), genres: shape(agg.genres) };
    });
    res.set('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400'); // 12h / 24h
    return ok(res, data, 'Sitemap sections');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/books/active?ids=… — which of these books are still purchasable ──
// Lets the client cart/wishlist drop deleted/deactivated books AND refresh the
// available stock so quantity steppers can cap at what's actually in stock.
// Returns [{ _id, stock }] where stock is the purchasable count (0 when the
// book is out-of-stock or discontinued).
router.get('/active', async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[a-f0-9]{24}$/i.test(s));
    if (!ids.length) return ok(res, [], 'Active');
    const found = await Book.find({ _id: { $in: ids }, isActive: true })
      .select('stock stockStatus variants')
      .lean();
    const data = found.map((b) => {
      const dead = b.stockStatus === 'out-of-stock' || b.stockStatus === 'discontinued';
      return {
        _id: String(b._id),
        stock: dead ? 0 : b.stock,
        ...(b.variants?.length
          ? { variants: b.variants.map((v) => ({ variantId: String(v._id), stock: dead ? 0 : v.stock })) }
          : {}),
      };
    });
    return ok(res, data, 'Active');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/books/:slug — detail + same-silo related + reviews ──
router.get('/:slug', validate({ params: slugParams }), async (req, res, next) => {
  try {
    const slug = String(req.params.slug).toLowerCase();
    const book = await Book.findOne({ slug, isActive: true }).lean();
    if (!book) return fail(res, 'Book not found', 404, [{ code: 'NOT_FOUND' }]);

    // Fire-and-forget view counter (don't block the response).
    Book.updateOne({ _id: book._id }, { $inc: { viewCount: 1 } }).catch(() => {});

    // Related: prefer explicit relatedSlugs (same silo); then fill from the same
    // section (Manga/Kids/Loksewa) when the book has one, else the same genre.
    const related = await (async () => {
      let books = [];
      if (book.relatedSlugs?.length) {
        books = await Book.find({ slug: { $in: book.relatedSlugs }, isActive: true }).select(LIST_FIELDS).limit(4).lean();
      }
      if (books.length < 4) {
        const have = new Set(books.map((b) => b.slug));
        have.add(book.slug);
        const siblingFilter = book.category ? { category: book.category } : { genre: book.genre };
        const fill = await Book.find({ ...siblingFilter, slug: { $nin: [...have] }, isActive: true })
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
  validate({ params: slugParams, body: questionBody }),
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

// Helper: has this user received (delivered) an order containing this book?
const hasPurchased = (userId, bookId) =>
  Order.exists({ user: userId, status: 'delivered', 'items.book': bookId });

// ── GET /api/books/:slug/can-review — eligibility for the review form (auth) ──
// Lets the storefront show the right state without the user writing a review
// only to be rejected. Verified-purchasers-only policy.
router.get('/:slug/can-review', authenticate, validate({ params: slugParams }), async (req, res, next) => {
  try {
    const book = await Book.findOne({ slug: String(req.params.slug).toLowerCase(), isActive: true }).select('_id');
    if (!book) return fail(res, 'Book not found', 404, [{ code: 'NOT_FOUND' }]);
    const [purchased, already] = await Promise.all([
      hasPurchased(req.userId, book._id),
      Review.exists({ book: book._id, user: req.userId }),
    ]);
    return ok(
      res,
      { eligible: Boolean(purchased) && !already, purchased: Boolean(purchased), alreadyReviewed: Boolean(already) },
      'Eligibility'
    );
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/books/:slug/reviews — write a review (auth, verified buyers) ──
// Policy: only customers with a delivered order for this book; reviews publish
// immediately and recompute the book's avgRating/reviewCount.
router.post(
  '/:slug/reviews',
  authenticate,
  validate({ params: slugParams, body: reviewBody }),
  async (req, res, next) => {
    try {
      const book = await Book.findOne({ slug: String(req.params.slug).toLowerCase(), isActive: true }).select('_id');
      if (!book) return fail(res, 'Book not found', 404, [{ code: 'NOT_FOUND' }]);

      if (!(await hasPurchased(req.userId, book._id))) {
        return fail(res, 'Only verified buyers can review this book.', 403, [{ code: 'NOT_VERIFIED_BUYER' }]);
      }
      if (await Review.exists({ book: book._id, user: req.userId })) {
        return fail(res, "You've already reviewed this book.", 409, [{ code: 'ALREADY_REVIEWED' }]);
      }

      await Review.create({
        book: book._id,
        user: req.userId,
        rating: req.body.rating,
        ...(req.body.title ? { title: req.body.title } : {}),
        body: req.body.body,
        isVerifiedPurchase: true,
        isApproved: true, // publish immediately
      });
      await Review.calculateAverageRating(book._id);
      return created(res, null, 'Thanks for your review!');
    } catch (err) {
      if (err && err.code === 11000) {
        return fail(res, "You've already reviewed this book.", 409, [{ code: 'ALREADY_REVIEWED' }]);
      }
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
