'use strict';

const express = require('express');

const Book = require('../models/book.model');
const Genre = require('../models/genre.model');
const Review = require('../models/review.model');
const Question = require('../models/question.model');
const Order = require('../models/order.model');
const User = require('../models/user.model');
const RestockRequest = require('../models/restockRequest.model');
const { validate } = require('../middleware/validate');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { z, trimmedString, intQuery, email: emailSchema } = require('../utils/zod');
const { withCache } = require('../utils/cache');
const { isbnSearchForms } = require('../utils/isbn');
const { cacheDel } = require('../config/redis');
const { ok, created, fail } = require('../utils/apiResponse');

const router = express.Router();

const LIST_FIELDS = 'slug title author price comparePrice coverImage avgRating reviewCount stockStatus stock genre isBestseller isNewArrival variants';

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
  minRating: intQuery({ min: 1, max: 5 }).optional(),
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
      // 48, not 25: at 25 the catalogue ran to ~122 pages and most of it sat
      // far enough down the chain that crawlers rarely walked it. This nearly
      // halves that depth. It costs transfer bytes, not LCP — covers below the
      // fold are lazy-loaded, so the largest element in the viewport is
      // unchanged, and the extra rows are markup rather than images.
      const limit = req.query.limit || 48;
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
      if (req.query.minRating) filter.avgRating = { $gte: req.query.minRating };
      // Author / publisher — exact single-value match (these are free-text names
      // that can contain commas, so they are NOT comma-split like the enum facets).
      if (req.query.author) filter.author = String(req.query.author);
      if (req.query.publisher) filter['specifications.publisher'] = String(req.query.publisher);
      // Forgiving substring search across title / author / ISBN (matches the
      // "title, author, or ISBN" placeholder). $text only matched whole words and
      // ignored ISBNs, so partial titles and ISBN lookups found nothing.
      if (req.query.search) {
        const term = String(req.query.search).trim();
        if (term) {
          const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          const or = [{ title: rx }, { author: rx }];
          // A complete ISBN is matched by value, not by substring: covers print
          // it with hyphens and the schema stores it stripped, so the escaped
          // regex (hyphens are not metacharacters) could never match. The forms
          // list also covers a shopper typing the 10-digit number off an older
          // cover for a book we file under its 13-digit form.
          const forms = isbnSearchForms(term);
          if (forms.length) {
            or.push({ isbn: { $in: forms } }, { 'specifications.isbn10': { $in: forms } });
          } else {
            or.push({ isbn: rx }, { 'specifications.isbn10': rx });
          }
          and.push({ $or: or });
        }
      }
      if (and.length) filter.$and = and;

      // Cache each distinct query for 60s (busted on admin book mutations via
      // `books_list:*`). The count runs only on a cache miss.
      const key = `books_list:${page}:${limit}:${req.query.sort || 'newest'}:${req.query.genre || ''}:${req.query.category || ''}:${req.query.format || ''}:${req.query.language || ''}:${req.query.year || ''}:${req.query.minPrice || ''}:${req.query.maxPrice || ''}:${req.query.minRating || ''}:${req.query.author || ''}:${req.query.publisher || ''}:${req.query.search || ''}`;
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
      // Autocomplete matched title and author only, so typing an ISBN offered
      // nothing until the shopper hit enter. The search results page has
      // matched ISBNs for a while; the box in front of it did not.
      const isbnForms = isbnSearchForms(q);
      const bookOr = [{ title: rx }, { author: rx }];
      if (isbnForms.length) {
        bookOr.push({ isbn: { $in: isbnForms } }, { 'specifications.isbn10': { $in: isbnForms } });
      }
      const [books, genres, authors] = await Promise.all([
        Book.find({ isActive: true, $or: bookOr })
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
      const [genres, priceRange, authors, publishers] = await Promise.all([
        Genre.find({ isActive: true }).select('slug name').sort({ name: 1 }).lean(),
        Book.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
        ]),
        // Most common authors / publishers among active books (facet options).
        Book.aggregate([
          { $match: { isActive: true, author: { $nin: [null, ''] } } },
          { $sortByCount: '$author' },
          { $limit: 50 },
        ]),
        Book.aggregate([
          { $match: { isActive: true, 'specifications.publisher': { $nin: [null, ''] } } },
          { $sortByCount: '$specifications.publisher' },
          { $limit: 50 },
        ]),
      ]);
      return {
        genres,
        priceRange: priceRange[0] ? { min: priceRange[0].min, max: priceRange[0].max } : { min: 0, max: 0 },
        authors: authors.map((a) => a._id),
        publishers: publishers.map((p) => p._id),
        sorts: Object.keys(SORTS),
      };
    });
    return ok(res, data, 'Filter metadata');
  } catch (err) {
    return next(err);
  }
});

// A curated rail (isFeatured/isBestseller/isNewArrival) with fewer than this
// many books looks sparse/broken rather than "lightly curated" — top it up
// from a catalogue-wide fallback so the homepage rails are never empty just
// because an admin hasn't (or no longer has) flagged enough books.
const MIN_RAIL_SIZE = 6;

async function withFallback(curatedQuery, fallbackQuery) {
  const curated = await curatedQuery;
  if (curated.length >= MIN_RAIL_SIZE) return curated;
  const fallback = await fallbackQuery;
  const seen = new Set(curated.map((b) => String(b._id)));
  const merged = [...curated, ...fallback.filter((b) => !seen.has(String(b._id)))];
  return merged.slice(0, 20);
}

// ── GET /api/books/featured/books — homepage rails ──
router.get('/featured/books', async (_req, res, next) => {
  try {
    const data = await withCache('featured_books', 600, async () => {
      const base = { isActive: true };
      // Up to 20 per rail — the homepage rails scroll horizontally. Curated
      // picks come first; a catalogue-wide fallback tops up short rails so
      // they never go sparse or empty (see MIN_RAIL_SIZE above).
      const [featured, bestsellers, newArrivals] = await Promise.all([
        withFallback(
          Book.find({ ...base, isFeatured: true }).select(LIST_FIELDS).limit(20).lean(),
          // Rated first (best reviewed), soldCount as a tiebreaker for a young
          // catalogue where most books have no reviews yet — never comes back
          // empty just because nobody has reviewed anything.
          Book.find(base).select(LIST_FIELDS).sort({ avgRating: -1, soldCount: -1 }).limit(20).lean()
        ),
        withFallback(
          Book.find({ ...base, isBestseller: true }).select(LIST_FIELDS).sort({ soldCount: -1 }).limit(20).lean(),
          Book.find(base).select(LIST_FIELDS).sort({ soldCount: -1 }).limit(20).lean()
        ),
        withFallback(
          Book.find({ ...base, isNewArrival: true }).select(LIST_FIELDS).sort({ createdAt: -1 }).limit(20).lean(),
          Book.find(base).select(LIST_FIELDS).sort({ createdAt: -1 }).limit(20).lean()
        ),
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
          // `_id` is the tiebreaker, and it is not optional. `updatedAt` alone
          // is not unique — a bulk shelving pass stamps hundreds of books
          // within the same millisecond — and Mongo gives no stable order to
          // tied documents across separate queries. Each sitemap shard is its
          // own request, cached independently, so ties reshuffled between them:
          // the live sitemap was serving 5,882 rows containing only 5,301
          // unique URLs, which means ~581 books appeared twice and ~581 others
          // appeared nowhere at all. A unique tiebreaker makes the total order
          // deterministic, so skip/limit paginates the same way every time.
          .sort({ updatedAt: -1, _id: 1 })
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
      // Holding a book is necessary but not sufficient: the genre must also be
      // browsable. `unclassified` is the hidden holding pen (isActive:false, see
      // /CLAUDE.md) and 247 live books still sit in it, so grouping by $genre
      // alone emitted /genre/unclassified into the sitemap — a URL that renders
      // "Genre not found". Google reports that as a sitemap error, and it is the
      // kind of dead entry that makes it trust the rest of the file less.
      // Checking the Genre collection rather than hardcoding the slug means any
      // future retired or draft genre is excluded for free.
      const live = new Set(
        (await Genre.find({ isActive: true }).select('slug').lean()).map((g) => g.slug)
      );
      const shape = (arr) => arr.filter((x) => x._id).map((x) => ({ slug: x._id, lastmod: x.lastmod }));
      return {
        categories: shape(agg.categories),
        genres: shape(agg.genres).filter((g) => live.has(g.slug)),
      };
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
    //
    // RELATED_LIMIT is the lateral crawl graph. Most of the catalogue sits well
    // past page 1 of any listing, so these same-silo links are how a crawler
    // (and a browsing reader) actually reaches the middle of the shelf. At 4 the
    // graph was sparse enough that large stretches of the catalogue were only
    // reachable via the sitemap; 10 roughly triples the link density for the
    // cost of a larger $sample, and still fits the 5-column grid at two rows.
    const RELATED_LIMIT = 10;
    const related = await (async () => {
      let books = [];
      if (book.relatedSlugs?.length) {
        books = await Book.find({ slug: { $in: book.relatedSlugs }, isActive: true }).select(LIST_FIELDS).limit(RELATED_LIMIT).lean();
      }
      if (books.length < RELATED_LIMIT) {
        const have = new Set(books.map((b) => b.slug));
        have.add(book.slug);
        const siblingFilter = book.category ? { category: book.category } : { genre: book.genre };
        // Randomise the fill so "More in …" varies per visit instead of always
        // surfacing the same top-soldCount titles (every 'general' book looked alike).
        const project = LIST_FIELDS.split(' ').reduce((o, f) => ((o[f] = 1), o), {});
        const fill = await Book.aggregate([
          { $match: { ...siblingFilter, isActive: true, slug: { $nin: [...have] } } },
          { $sample: { size: RELATED_LIMIT - books.length } },
          { $project: project },
        ]);
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
      return created(res, null, "Thanks, we'll answer your question soon.");
    } catch (err) {
      return next(err);
    }
  }
);

// ── POST /api/books/:slug/restock-request — "tell me when it's back" ──
// Open to guests: the person most likely to want this is someone who just hit
// a sold-out page, and forcing a sign-up there loses the demand signal. Signed-in
// callers don't have to retype their address.
const restockBody = z.object({ email: emailSchema().optional() });

router.post(
  '/:slug/restock-request',
  optionalAuth,
  validate({ params: slugParams, body: restockBody }),
  async (req, res, next) => {
    try {
      const book = await Book.findOne({ slug: String(req.params.slug).toLowerCase(), isActive: true })
        .select('_id title slug stock stockStatus');
      if (!book) return fail(res, 'Book not found', 404, [{ code: 'NOT_FOUND' }]);

      // Only meaningful for something actually unavailable — accepting these
      // for in-stock titles would pollute the reorder list.
      const soldOut = book.stock === 0 || ['out-of-stock', 'discontinued'].includes(book.stockStatus);
      if (!soldOut) return fail(res, 'This book is in stock', 400, [{ code: 'IN_STOCK' }]);

      let addr = req.body.email;
      if (!addr && req.userId) {
        const u = await User.findById(req.userId).select('email');
        addr = u?.email;
      }
      if (!addr) return fail(res, 'An email address is required', 400, [{ field: 'email', code: 'REQUIRED' }]);

      // Upsert, so clicking twice is idempotent rather than a duplicate-key error.
      await RestockRequest.updateOne(
        { book: book._id, email: String(addr).toLowerCase() },
        {
          $setOnInsert: {
            book: book._id,
            bookTitle: book.title,
            bookSlug: book.slug,
            user: req.userId || null,
            email: String(addr).toLowerCase(),
          },
        },
        { upsert: true }
      );

      return created(res, null, "Noted, we'll email you when it's back in stock.");
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
