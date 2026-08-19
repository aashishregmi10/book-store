'use strict';

const express = require('express');
const { stringify } = require('csv-stringify/sync');

const Book = require('../models/book.model');
const Genre = require('../models/genre.model');
const Order = require('../models/order.model');
const User = require('../models/user.model');
const Review = require('../models/review.model');
const Question = require('../models/question.model');
const Article = require('../models/article.model');
const Activity = require('../models/activity.model');
const Coupon = require('../models/coupon.model');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z, objectId, trimmedString, intQuery } = require('../utils/zod');
const { restoreStock } = require('../services/stock');
const { cacheDel } = require('../config/redis');
const { ok, created, fail } = require('../utils/apiResponse');
const logger = require('../config/logger');
const email = require('../utils/emailService');
const { pingIndexNow } = require('../utils/indexnow');
const { uploadCoverFromUrl } = require('../utils/coverUpload');
const { deleteImage } = require('../config/cloudinary');
const { lookupBook } = require('../utils/bookLookup');
const { normalizeIsbns, isbnSearchForms } = require('../utils/isbn');
const { detectOrigin, scoreConfidence } = require('../utils/bookOrigin');
const { randomUUID } = require('crypto');

const router = express.Router();
router.use(authenticate, requireAdmin);

// ── Shared validation schemas (loose: only listed fields are checked, the rest
// pass through unchanged — matching the previous express-validator behaviour). ──
const idParams = z.object({ id: objectId() });
const slugParams = z.object({ slug: trimmedString() });
const userIdParams = z.object({ userId: objectId() });
const looseImage = z.object({ secureUrl: trimmedString(), publicId: trimmedString() }).catchall(z.unknown());
const bookBody = z
  .object({
    title: trimmedString(),
    author: trimmedString(),
    genre: z.string().trim().optional(),
    category: z.string().trim().optional().refine((v) => !v || ['manga', 'kids', 'loksewa'].includes(v), 'Invalid section'),
    price: z.coerce.number().int().min(0).optional(),
    stock: z.coerce.number().int().min(0).optional(),
    variants: z
      .array(
        z.object({
          format: z.enum(['Paperback', 'Hardcover', 'E-book', 'Audiobook']).optional(),
          price: z.coerce.number().int().min(0).optional(),
          stock: z.coerce.number().int().min(0).optional(),
        }).catchall(z.unknown())
      )
      .max(6)
      .optional(),
    includedTitles: z.array(z.unknown()).max(50).optional(),
    coverImage: z.object({ secureUrl: z.string().trim().min(1, 'A cover image is required'), publicId: trimmedString() }).catchall(z.unknown()),
    images: z.array(looseImage).max(10).optional(),
    description: z.string().trim().min(10),
  })
  .catchall(z.unknown());
const genreBody = z
  .object({
    name: z.string().trim().min(1, 'Genre name is required'),
    description: z.string().trim().optional(),
    color: z.string().trim().optional(),
    metaTitle: z.string().trim().max(70).optional(),
    metaDesc: z.string().trim().max(160).optional(),
  })
  .catchall(z.unknown());
const articleBody = z
  .object({
    title: trimmedString(),
    body: z.string().trim().min(20),
    excerpt: z.string().trim().max(300).optional(),
    status: z.enum(['draft', 'published']).optional(),
  })
  .catchall(z.unknown());
const answerBody = z.object({ answer: z.string().trim().min(2).max(2000) }).catchall(z.unknown());
// HTML number/date inputs post "" for "not set", which would otherwise coerce to
// NaN / Invalid Date and fail validation for a field the admin left blank.
const optional = (schema) => z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());
// Not z.coerce.boolean(): that is Boolean(v), so the string "false" arrives as
// true — which would quietly publish a coupon the admin had switched off.
const flag = () => z.preprocess((v) => (typeof v === 'string' ? v !== 'false' && v !== '' : v), z.boolean().optional());
const couponBody = z
  .object({
    code: z.string().trim().toUpperCase().min(3, 'Coupon code must be at least 3 characters').max(24),
    description: optional(z.string().trim().max(200)),
    type: z.enum(['percentage', 'fixed', 'free_shipping']),
    value: z.coerce.number().min(0),
    minOrderAmount: optional(z.coerce.number().int().min(0)),
    maxDiscount: optional(z.coerce.number().int().min(1)),
    usageLimit: optional(z.coerce.number().int().min(1)),
    perUserLimit: optional(z.coerce.number().int().min(1)),
    startDate: optional(z.coerce.date()),
    endDate: optional(z.coerce.date()),
    isActive: flag(),
    newUserOnly: flag(),
    applicableGenres: z.array(z.string().trim()).optional(),
  })
  .refine((c) => c.type !== 'percentage' || c.value <= 100, {
    message: 'A percentage coupon cannot exceed 100%',
    path: ['value'],
  })
  .refine((c) => !c.startDate || !c.endDate || c.endDate > c.startDate, {
    message: 'The end date must be after the start date',
    path: ['endDate'],
  });
// Writable coupon fields. usageCount/usedBy are ledger state owned by checkout —
// never let a form payload overwrite how many times a code has been redeemed.
const COUPON_FIELDS = [
  'code', 'description', 'type', 'value', 'minOrderAmount', 'maxDiscount',
  'usageLimit', 'perUserLimit', 'startDate', 'endDate', 'isActive',
  'newUserOnly', 'applicableGenres',
];
// Lookup accepts any combination of identifiers; at least one is required.
const lookupQuery = z
  .object({
    isbn: z.string().trim().optional(),
    title: z.string().trim().optional(),
    author: z.string().trim().optional(),
    publisher: z.string().trim().optional(),
  })
  .refine((q) => q.isbn || q.title || q.author || q.publisher, {
    message: 'Provide an ISBN, title, author, or publisher',
  });

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Email every shopper who has this book wishlisted that its price dropped.
// Honours the opt-outs in notificationPreferences (email + promotions).
async function notifyWishlistPriceDrop(book, oldPrice) {
  const users = await User.find({ wishlist: book._id })
    .select('email fullName notificationPreferences')
    .lean();
  const recipients = users.filter(
    (u) => u.notificationPreferences?.email !== false && u.notificationPreferences?.promotions !== false
  );
  await Promise.all(recipients.map((u) => email.sendPriceDrop(u, book, oldPrice, book.price)));
}

// Best-effort Cloudinary cleanup for images no longer referenced by a book
// (removed cover, removed gallery entries, or the whole book deleted). Never
// throws — a failed cleanup just leaves an orphaned asset, which is far
// preferable to blocking or failing the admin's save/delete.
function cleanupImages(publicIds, slug) {
  const ids = [...new Set(publicIds.filter(Boolean))];
  if (!ids.length) return;
  Promise.all(
    ids.map((id) => deleteImage(id).catch((err) => logger.warn({ err: err.message, publicId: id, slug }, 'cloudinary cleanup failed')))
  ).catch(() => {});
}

async function invalidateCatalogCaches(slug) {
  await Promise.all([
    slug ? cacheDel(`book:${slug}`) : Promise.resolve(),
    cacheDel('books_list:*'),
    cacheDel('books_sitemap'),
    cacheDel('featured_books'),
    cacheDel('filters_metadata'),
    cacheDel('suggestions:*'),
    cacheDel('genres_list'),
    cacheDel('genre:*'),
  ]);
}

// ── OVERVIEW (admin dashboard) ───────────────────────────
const TZ = 'Asia/Kathmandu';
const REVENUE_MATCH = { status: { $nin: ['cancelled', 'refunded'] } }; // revenue counts only fulfilled-track orders
const sumTotal = (match) => Order.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$total' }, n: { $sum: 1 } } }]);

router.get('/overview', async (req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const since14 = new Date(startOfToday); since14.setDate(since14.getDate() - 13); // 14-day window incl. today

    const [
      totalOrders, monthOrders, todayOrders,
      lifetimeAgg, monthAgg, lastMonthAgg, todayAgg,
      customers, newCustomers, books,
      hiddenBooks, unshelvedBooks,
      lowStock, pendingReviews, unansweredQuestions,
      statusAgg, seriesAgg, topBooks, mostWishlisted,
      recentOrders, recentCustomers,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Order.countDocuments({ createdAt: { $gte: startOfToday } }),
      sumTotal(REVENUE_MATCH),
      sumTotal({ ...REVENUE_MATCH, createdAt: { $gte: startOfMonth } }),
      sumTotal({ ...REVENUE_MATCH, createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),
      sumTotal({ ...REVENUE_MATCH, createdAt: { $gte: startOfToday } }),
      User.countDocuments({ isAdmin: false }),
      User.countDocuments({ isAdmin: false, createdAt: { $gte: startOfMonth } }),
      Book.countDocuments({ isActive: true }),
      // The import backlog. It was invisible from here, which is how ~1,200
      // bought-and-paid-for books sat hidden without anyone being reminded:
      // the dashboard only ever counted what was already live.
      Book.countDocuments({ isActive: false }),
      Book.countDocuments({ isActive: false, genre: 'unclassified' }),
      Book.find({ isActive: true, stock: { $lte: 5 } }).select('title slug stock').sort({ stock: 1 }).limit(8).lean(),
      Review.countDocuments({ isApproved: false }),
      Question.countDocuments({ isAnswered: false, isActive: true }),
      Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { ...REVENUE_MATCH, createdAt: { $gte: since14 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      ]),
      Book.find({ isActive: true, soldCount: { $gt: 0 } }).select('title slug soldCount price').sort({ soldCount: -1 }).limit(5).lean(),
      User.aggregate([
        { $unwind: '$wishlist' },
        { $group: { _id: '$wishlist', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'book' } },
        { $unwind: '$book' },
        { $match: { 'book.isActive': true } },
        { $project: { _id: 0, title: '$book.title', slug: '$book.slug', count: '$n' } },
      ]),
      Order.find().sort({ createdAt: -1 }).limit(8).populate('user', 'fullName email').lean(),
      User.find({ isAdmin: false }).select('fullName email createdAt').sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    const revenue = lifetimeAgg[0]?.total || 0;
    const paidOrders = lifetimeAgg[0]?.n || 0;
    const monthRevenue = monthAgg[0]?.total || 0;
    const lastMonthRevenue = lastMonthAgg[0]?.total || 0;

    // Status counts → object; derive "to fulfill" (placed/confirmed/processing).
    const ordersByStatus = Object.fromEntries(Order.ORDER_STATUS.map((s) => [s, 0]));
    for (const s of statusAgg) if (s._id in ordersByStatus) ordersByStatus[s._id] = s.n;
    const ordersToFulfill = ordersByStatus.placed + ordersByStatus.confirmed + ordersByStatus.processing;

    // Fill the 14-day series so every day is present (zeros for quiet days).
    const seriesMap = new Map(seriesAgg.map((d) => [d._id, d]));
    const revenueSeries = [];
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(since14); d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const hit = seriesMap.get(key);
      revenueSeries.push({ date: key, revenue: hit?.revenue || 0, orders: hit?.orders || 0 });
    }

    return ok(
      res,
      {
        kpis: {
          revenue,
          monthRevenue,
          lastMonthRevenue,
          monthRevenueDelta: lastMonthRevenue ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : null,
          todayRevenue: todayAgg[0]?.total || 0,
          totalOrders,
          monthOrders,
          todayOrders,
          avgOrderValue: paidOrders ? Math.round(revenue / paidOrders) : 0,
          customers,
          newCustomers,
          books,
          hiddenBooks,
          unshelvedBooks,
          lowStockCount: lowStock.length,
          pendingReviews,
          unansweredQuestions,
          ordersToFulfill,
        },
        ordersByStatus,
        revenueSeries,
        topBooks,
        mostWishlisted,
        lowStock,
        recentOrders: recentOrders.map((o) => ({
          orderNumber: o.orderNumber,
          customer: o.user?.fullName || o.deliveryAddress?.fullName || 'Guest',
          total: o.total,
          status: o.status,
          createdAt: o.createdAt,
        })),
        recentCustomers: recentCustomers.map((u) => ({ fullName: u.fullName, email: u.email, createdAt: u.createdAt })),
      },
      'Overview'
    );
  } catch (err) {
    return next(err);
  }
});

// ══ BOOKS ════════════════════════════════════════════════
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const adminBooksQuery = z.object({
  page: intQuery({ min: 1 }).optional(),
  limit: intQuery({ min: 1, max: 100 }).optional(),
  search: z.string().trim().optional(),
  filter: z.enum(['all', 'active', 'inactive', 'bestseller', 'featured', 'new-arrival']).optional(),
  // Free-form rather than an enum of the live taxonomy on purpose: the holding
  // pen `unclassified` is not a live genre (seed-taxonomy.js never publishes
  // it), and filtering to it is the single most useful view in here — it is the
  // backlog worklist. An enum built from live genres would exclude the one
  // value an admin most needs to select.
  genre: z.string().trim().optional(),
});

// Map a tab name → the Mongo filter clause it adds.
const BOOK_FILTERS = {
  active: { isActive: true },
  inactive: { isActive: false },
  bestseller: { isBestseller: true },
  featured: { isFeatured: true },
  'new-arrival': { isNewArrival: true },
};

// Paginated so the table scales past a few hundred titles. Returns
// { items, total, page, pages } — the client renders 10 per page.
router.get('/books', validate({ query: adminBooksQuery }), async (req, res, next) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const filter = { ...(BOOK_FILTERS[req.query.filter] || {}) };
    if (req.query.genre) filter.genre = req.query.genre;
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i'); // escaped: search is user input
      filter.$or = [{ title: rx }, { author: rx }];
    }
    const [items, total] = await Promise.all([
      Book.find(filter).select('+costPrice').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Book.countDocuments(filter),
    ]);
    return ok(res, { items, total, page, pages: Math.ceil(total / limit) || 1 }, 'Books');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/admin/books/lookup?isbn=&title=&author=&publisher= ──
// Autofill from Open Library / Google Books. ISBN (if given) takes priority;
// otherwise searches by title/author/publisher.
router.get('/books/lookup', validate({ query: lookupQuery }), async (req, res, next) => {
  try {
    const { title, author, publisher } = req.query;
    let isbn;
    let isbn10 = null;
    let isbn13 = null;
    if (req.query.isbn) {
      const norm = normalizeIsbns(req.query.isbn);
      if (!norm.valid) return fail(res, 'That ISBN looks invalid, check the digits.', 400, [{ code: 'INVALID_ISBN' }]);
      isbn = norm.isbn13 || norm.clean; // providers prefer ISBN-13
      isbn10 = norm.isbn10;
      isbn13 = norm.isbn13;
    }

    const meta = await lookupBook({ isbn, title, author, publisher });
    if (!meta) return fail(res, 'No match found, add the book manually.', 404, [{ code: 'NOT_FOUND' }]);

    // From a title/author/publisher search the resolved ISBNs come back on the result.
    isbn13 = isbn13 || meta.isbn13 || null;
    isbn10 = isbn10 || meta.isbn10 || null;

    // Store the cover in Cloudinary so we own a permanent, fast asset.
    const coverImage = await uploadCoverFromUrl(meta.coverUrl, meta.title || isbn13 || 'cover');

    const origin = detectOrigin({
      isbn13,
      publisher: meta.specifications?.publisher,
      author: meta.author,
      title: meta.title,
      language: meta.specifications?.language,
    });
    const confidence = scoreConfidence({ isbn: req.query.isbn, title, author, publisher }, true);

    return ok(
      res,
      {
        title: meta.title,
        author: meta.author,
        coverImage,
        specifications: meta.specifications,
        source: meta.source,
        isbn13,
        isbn10,
        confidence,
        ...origin, // origin, market, currency, language, nepaliDetected, signals
      },
      'Lookup'
    );
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/admin/books/lookup/bulk — look up many books at once ──
const BULK_MAX = 20;
const BULK_CONCURRENCY = 2; // keep within Open Library (~3/s) / Google (~1/s) limits
const BULK_STAGGER_MS = 500; // space out each worker's calls to avoid 429 bursts
const bulkLookupBody = z.object({
  books: z
    .array(
      z.object({
        isbn: z.string().trim().optional(),
        title: z.string().trim().optional(),
        author: z.string().trim().optional(),
        publisher: z.string().trim().optional(),
      })
    )
    .min(1),
});

// Run fn over items with bounded concurrency, preserving input order.
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
      if (next < items.length) await new Promise((r) => setTimeout(r, BULK_STAGGER_MS));
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// One bulk item → a result row. Never throws; failures are reported per-item.
// Bulk does NOT upload covers to Cloudinary (too heavy for 20×) — it returns the
// raw coverUrl, and the cover is fetched/stored when the book is actually saved.
async function lookupOneBulk(item, index) {
  try {
    const query = { ...item };
    if (item.isbn) {
      const norm = normalizeIsbns(item.isbn);
      if (!norm.valid) return { input_index: index, success: false, error: 'invalid_isbn', book: null };
      query.isbn = norm.isbn13 || norm.clean;
    }
    if (!query.isbn && !query.title && !query.author && !query.publisher) {
      return { input_index: index, success: false, error: 'insufficient_data', book: null };
    }

    const meta = await lookupBook(query);
    if (!meta) return { input_index: index, success: false, error: 'not_found', book: null };

    const isbn13 = meta.isbn13 || (item.isbn ? normalizeIsbns(item.isbn).isbn13 : null);
    const isbn10 = meta.isbn10 || (item.isbn ? normalizeIsbns(item.isbn).isbn10 : null);
    const origin = detectOrigin({
      isbn13,
      publisher: meta.specifications?.publisher,
      author: meta.author,
      title: meta.title,
      language: meta.specifications?.language,
    });
    return {
      input_index: index,
      success: true,
      source: meta.source,
      confidence: scoreConfidence(item, true),
      nepaliDetected: origin.nepaliDetected,
      book: {
        title: meta.title,
        authors: meta.author ? [meta.author] : [],
        publisher: meta.specifications?.publisher || null,
        publishedDate: meta.specifications?.publishedDate || null,
        pageCount: meta.specifications?.pages || null,
        language: origin.language || meta.specifications?.language || null,
        isbn13,
        isbn10,
        description: meta.description || null,
        categories: meta.categories || [],
        coverUrl: meta.coverUrl || null,
        origin: origin.origin,
        market: origin.market,
        currency: origin.currency,
        signals: origin.signals,
      },
    };
  } catch {
    return { input_index: index, success: false, error: 'lookup_failed', book: null };
  }
}

router.post('/books/lookup/bulk', validate({ body: bulkLookupBody }), async (req, res, next) => {
  try {
    const { books } = req.body;
    if (books.length > BULK_MAX) {
      return fail(res, `Too many books, max ${BULK_MAX} per batch.`, 400, [
        { code: 'BULK_LIMIT_EXCEEDED', max_allowed: BULK_MAX },
      ]);
    }
    const results = await mapPool(books, BULK_CONCURRENCY, lookupOneBulk);
    const successful = results.filter((r) => r.success).length;
    return ok(
      res,
      {
        bulk: true,
        batch_id: randomUUID(),
        total: results.length,
        successful,
        failed: results.length - successful,
        results,
      },
      'Bulk lookup'
    );
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/admin/books/bulk-create — create draft books from lookup rows ──
// Lookup data alone can't satisfy the model (price/genre/description are required
// and not in the metadata), so this creates each book as a DRAFT (isActive:false)
// using batch-wide defaults; the admin finishes and publishes from the edit form.
const bulkCreateBody = z.object({
  defaults: z.object({
    genre: z.string().trim().optional(),
    category: z.string().trim().optional(),
    price: z.coerce.number().int().min(0),
    stock: z.coerce.number().int().min(0).optional(),
  }),
  books: z
    .array(
      z.object({
        title: trimmedString(),
        author: z.string().trim().optional(),
        coverUrl: z.string().trim().optional(),
        isbn13: z.string().trim().optional(),
        publisher: z.string().trim().optional(),
        pages: z.coerce.number().int().optional(),
        language: z.string().trim().optional(),
        description: z.string().trim().optional(),
        // Per-row overrides — fall back to batch defaults when omitted.
        price: z.coerce.number().int().min(0).optional(),
        stock: z.coerce.number().int().min(0).optional(),
      })
    )
    .min(1),
});

async function createOneDraft(item, defaults) {
  try {
    // coverImage is required by the model — skip rows we can't get a cover for.
    const coverImage = await uploadCoverFromUrl(item.coverUrl, item.title);
    if (!coverImage) return { title: item.title, success: false, error: 'no_cover' };

    const description =
      item.description && item.description.trim().length >= 10
        ? item.description.trim()
        : `${item.title}${item.author ? ` by ${item.author}` : ''}. Details to be added.`;

    const book = await Book.create({
      slug: slugify(item.title),
      title: item.title,
      author: item.author || 'Unknown',
      genre: defaults.genre ? slugify(defaults.genre) : undefined,
      category: defaults.category || null,
      price: item.price ?? defaults.price,
      stock: item.stock ?? defaults.stock ?? 0,
      coverImage,
      description,
      isbn: item.isbn13 || undefined,
      specifications: {
        pages: item.pages || undefined,
        publisher: item.publisher || undefined,
        language: item.language || undefined,
      },
      isActive: false, // draft — not live until the admin completes & publishes it
    });
    return { title: item.title, success: true, slug: book.slug };
  } catch (err) {
    return { title: item.title, success: false, error: err?.code === 11000 ? 'duplicate' : 'create_failed' };
  }
}

router.post('/books/bulk-create', validate({ body: bulkCreateBody }), async (req, res, next) => {
  try {
    const { defaults, books } = req.body;
    if (!defaults.genre && !defaults.category) {
      return fail(res, 'Pick a genre or section for the batch.', 400, [{ code: 'GENRE_OR_SECTION' }]);
    }
    if (books.length > BULK_MAX) {
      return fail(res, `Too many books, max ${BULK_MAX} per batch.`, 400, [{ code: 'BULK_LIMIT_EXCEEDED', max_allowed: BULK_MAX }]);
    }
    const results = await mapPool(books, BULK_CONCURRENCY, (item) => createOneDraft(item, defaults));
    const createdCount = results.filter((r) => r.success).length;
    return created(
      res,
      { total: results.length, created: createdCount, failed: results.length - createdCount, results },
      'Bulk create'
    );
  } catch (err) {
    return next(err);
  }
});

// ── PATCH /api/admin/books/bulk — shelve or publish many at once ──
//
// The hidden backlog is ~1,200 books, and every existing route through it is a
// script with a database connection: activate-drafts.js, classify-by-author.js,
// publish-ready-drafts.js. Those handle the cases a rule can decide. What was
// left had no route at all — a person who can look at twenty titles and know
// they are cookbooks had to edit them one at a time through a form, which is
// why the backlog stopped moving.
//
// Deliberately narrow: genre, category and isActive only. Anything that needs
// per-book judgement (price, description, cover) stays on the single-book form,
// where you can see what you are changing.
const bulkUpdateBody = z.object({
  ids: z.array(objectId()).min(1).max(100),
  set: z
    .object({
      genre: trimmedString().optional(),
      category: z.enum(['kids', 'manga', 'loksewa', '']).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((s) => Object.keys(s).length > 0, { message: 'Nothing to change.' }),
});

router.patch('/books/bulk', validate({ body: bulkUpdateBody }), async (req, res, next) => {
  try {
    const { ids, set } = req.body;
    const update = {};

    if ('genre' in set) {
      // Only a genre that actually renders a page. Publishing into a genre with
      // no Genre document gives the book a breadcrumb and JSON-LD pointing at
      // "Genre not found" — the exact bug publish-ready-drafts.js guards.
      const genre = await Genre.findOne({ slug: set.genre, isActive: true }).select('slug').lean();
      if (!genre) return fail(res, 'Not a live genre.', 400, [{ field: 'genre', code: 'UNKNOWN_GENRE' }]);
      update.genre = genre.slug;
    }
    if ('category' in set) update.category = set.category || null;
    if ('isActive' in set) update.isActive = set.isActive;

    // Publishing is the one direction that can break a public page, so it gets
    // the same gate publish-ready-drafts.js applies rather than trusting the
    // click: a book with no browsable genre, no cover or no price must not go
    // live just because it was in a selection.
    if (update.isActive === true) {
      const candidates = await Book.find({ _id: { $in: ids } })
        .select('slug title genre category coverImage price')
        .lean();
      const liveGenres = new Set((await Genre.find({ isActive: true }).select('slug').lean()).map((g) => g.slug));
      const targetGenre = update.genre;
      const notReady = candidates.filter((b) => {
        const genre = targetGenre || b.genre;
        const genreOk = genre && genre !== 'unclassified' && liveGenres.has(genre);
        const category = 'category' in update ? update.category : b.category;
        if (!genreOk && !category) return true;
        if (!b.coverImage?.secureUrl) return true;
        if (!b.price || b.price < 1) return true;
        return false;
      });
      if (notReady.length) {
        return fail(
          res,
          `${notReady.length} of ${candidates.length} can't be published yet — they need a genre, a cover and a price.`,
          400,
          notReady.slice(0, 10).map((b) => ({ code: 'NOT_PUBLISHABLE', slug: b.slug, title: b.title }))
        );
      }
    }

    const result = await Book.updateMany({ _id: { $in: ids } }, { $set: update });
    const touched = await Book.find({ _id: { $in: ids } }).select('slug genre category').lean();

    await invalidateCatalogCaches(null);
    // Only ping when something became publicly visible — an IndexNow ping for a
    // book we just hid asks Google to recrawl a page that now 404s.
    if (update.isActive === true) {
      pingIndexNow([
        '/books',
        ...touched.map((b) => `/books/${b.slug}`),
        ...[...new Set(touched.map((b) => b.genre).filter(Boolean))].map((g) => `/genre/${g}`),
      ]);
    }

    logger.info({ count: result.modifiedCount, set: update, admin: req.user?._id }, 'bulk book update');
    return ok(res, { matched: result.matchedCount, modified: result.modifiedCount }, 'Books updated');
  } catch (err) {
    return next(err);
  }
});

router.get('/books/:slug', validate({ params: slugParams }), async (req, res, next) => {
  try {
    const book = await Book.findOne({ slug: req.params.slug }).select('+costPrice').lean();
    if (!book) return fail(res, 'Book not found', 404, [{ code: 'NOT_FOUND' }]);
    return ok(res, book, 'Book');
  } catch (err) {
    return next(err);
  }
});

router.post('/books', validate({ body: bookBody }), async (req, res, next) => {
  try {
    const payload = { ...req.body };
    payload.slug = payload.slug ? slugify(payload.slug) : slugify(payload.title);
    payload.category = payload.category || null; // '' → no section
    payload.genre = payload.genre ? slugify(payload.genre) : undefined;
    if (!payload.genre && !payload.category) {
      return fail(res, 'Pick a genre or a section.', 400, [{ field: 'genre', code: 'GENRE_OR_SECTION' }]);
    }
    const book = await Book.create(payload);
    await invalidateCatalogCaches(book.slug);
    pingIndexNow([`/books/${book.slug}`, '/books', ...(book.genre ? [`/genre/${book.genre}`] : []), ...(book.category ? [`/category/${book.category}`] : [])]);
    return created(res, book, 'Book created');
  } catch (err) {
    return next(err);
  }
});

router.put('/books/:slug', validate({ params: slugParams }), async (req, res, next) => {
  try {
    const book = await Book.findOne({ slug: req.params.slug });
    if (!book) return fail(res, 'Book not found', 404, [{ code: 'NOT_FOUND' }]);
    const prevPrice = book.price; // capture before edits to detect a drop
    // Cloudinary public IDs before the edit, so we can tell which cover/gallery
    // images were removed once the new values are saved.
    const prevPublicIds = [book.coverImage?.publicId, ...(book.images || []).map((i) => i.publicId)];
    // Whitelist updatable fields.
    const fields = ['title', 'author', 'isbn', 'genre', 'category', 'subgenre', 'tags', 'price', 'comparePrice', 'costPrice', 'stock', 'stockStatus', 'reorderPoint', 'coverImage', 'images', 'description', 'shortDescription', 'specifications', 'variants', 'includedTitles', 'metaTitle', 'metaDescription', 'isBestseller', 'isNewArrival', 'isFeatured', 'isStaffPick', 'staffPickNote', 'isActive'];
    for (const f of fields) if (f in req.body) book[f] = req.body[f];
    if ('category' in req.body) book.category = req.body.category || null; // '' → no section
    if ('genre' in req.body) book.genre = req.body.genre ? slugify(req.body.genre) : undefined;
    if (!book.genre && !book.category) {
      return fail(res, 'Pick a genre or a section.', 400, [{ field: 'genre', code: 'GENRE_OR_SECTION' }]);
    }
    await book.save(); // triggers stockStatus + price (from variants) recompute

    // Any cover/gallery image present before the edit but not after was removed
    // in the admin UI — delete it from Cloudinary now that the save succeeded.
    const nextPublicIds = new Set([book.coverImage?.publicId, ...(book.images || []).map((i) => i.publicId)].filter(Boolean));
    cleanupImages(prevPublicIds.filter((id) => id && !nextPublicIds.has(id)), book.slug);

    // Price dropped while the book sits in wishlists → email those shoppers.
    // Fire-and-forget so the admin response isn't held up by mail delivery.
    if (book.isActive && book.price < prevPrice) {
      notifyWishlistPriceDrop(book, prevPrice).catch((err) => logger.warn({ err: err.message, slug: book.slug }, 'price-drop notify failed'));
    }

    await invalidateCatalogCaches(book.slug);
    pingIndexNow([`/books/${book.slug}`, '/books', ...(book.genre ? [`/genre/${book.genre}`] : []), ...(book.category ? [`/category/${book.category}`] : [])]);
    return ok(res, book, 'Book updated');
  } catch (err) {
    return next(err);
  }
});

router.delete('/books/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const book = await Book.findByIdAndDelete(req.params.id);
    if (book) {
      // Remove the dangling reference from every user's wishlist.
      await User.updateMany({ wishlist: book._id }, { $pull: { wishlist: book._id } });
      cleanupImages([book.coverImage?.publicId, ...(book.images || []).map((i) => i.publicId)], book.slug);
      await invalidateCatalogCaches(book.slug);
    }
    return ok(res, null, 'Book deleted');
  } catch (err) {
    return next(err);
  }
});

// ══ GENRES ═══════════════════════════════════════════════
// Admin-curated genre list. The book form's genre dropdown reads the public
// GET /api/genres; these endpoints let an admin statically manage that list.
router.get('/genres', async (_req, res, next) => {
  try {
    const genres = await Genre.find().sort({ name: 1 }).lean();
    const counts = await Book.aggregate([{ $group: { _id: '$genre', n: { $sum: 1 } } }]);
    const byGenre = new Map(counts.map((c) => [c._id, c.n]));
    return ok(res, genres.map((g) => ({ ...g, bookCount: byGenre.get(g.slug) || 0 })), 'Genres');
  } catch (err) {
    return next(err);
  }
});

router.post('/genres', validate({ body: genreBody }), async (req, res, next) => {
  try {
    const slug = req.body.slug ? slugify(req.body.slug) : slugify(req.body.name);
    if (!slug) return fail(res, 'Genre name must contain letters or numbers', 400, [{ field: 'name', code: 'INVALID' }]);
    if (await Genre.exists({ slug })) {
      return fail(res, 'A genre with that name already exists', 409, [{ field: 'name', code: 'DUPLICATE' }]);
    }
    const genre = await Genre.create({ ...req.body, slug });
    await cacheDel('genres_list');
    pingIndexNow([`/genre/${genre.slug}`, '/books']);
    return created(res, genre, 'Genre created');
  } catch (err) {
    return next(err);
  }
});

router.put('/genres/:slug', validate({ params: slugParams }), async (req, res, next) => {
  try {
    const genre = await Genre.findOne({ slug: req.params.slug });
    if (!genre) return fail(res, 'Genre not found', 404, [{ code: 'NOT_FOUND' }]);
    const fields = ['name', 'description', 'curatorNote', 'icon', 'color', 'metaTitle', 'metaDesc', 'isActive'];
    for (const f of fields) if (f in req.body) genre[f] = req.body[f];
    await genre.save();
    await cacheDel('genres_list');
    pingIndexNow([`/genre/${genre.slug}`, '/books']);
    return ok(res, genre, 'Genre updated');
  } catch (err) {
    return next(err);
  }
});

router.delete('/genres/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const genre = await Genre.findById(req.params.id);
    if (!genre) return fail(res, 'Genre not found', 404, [{ code: 'NOT_FOUND' }]);
    const inUse = await Book.countDocuments({ genre: genre.slug });
    if (inUse > 0) {
      return fail(res, `${inUse} book${inUse > 1 ? 's' : ''} still shelved under this genre, reassign them first.`, 409, [{ code: 'GENRE_IN_USE' }]);
    }
    await genre.deleteOne();
    await cacheDel('genres_list');
    return ok(res, null, 'Genre deleted');
  } catch (err) {
    return next(err);
  }
});

// ══ ARTICLES (content hub) ═══════════════════════════════
const readingTime = (body = '') => Math.max(1, Math.round(String(body).split(/\s+/).filter(Boolean).length / 200));

async function invalidateArticleCaches(slug) {
  await Promise.all([slug ? cacheDel(`article:${slug}`) : Promise.resolve(), cacheDel('articles_list:*')]);
}

router.get('/articles', async (_req, res, next) => {
  try {
    const articles = await Article.find().select('-body').sort({ updatedAt: -1 }).limit(200).lean();
    return ok(res, articles, 'Articles');
  } catch (err) {
    return next(err);
  }
});

router.get('/articles/:slug', validate({ params: slugParams }), async (req, res, next) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug }).populate('relatedBooks', 'title slug').lean();
    if (!article) return fail(res, 'Article not found', 404, [{ code: 'NOT_FOUND' }]);
    return ok(res, article, 'Article');
  } catch (err) {
    return next(err);
  }
});

router.post('/articles', validate({ body: articleBody }), async (req, res, next) => {
  try {
    const payload = { ...req.body };
    payload.slug = slugify(payload.slug || payload.title);
    if (!payload.slug) return fail(res, 'Title must contain letters or numbers', 400, [{ field: 'title', code: 'INVALID' }]);
    if (await Article.exists({ slug: payload.slug })) {
      return fail(res, 'An article with that slug already exists', 409, [{ field: 'slug', code: 'DUPLICATE' }]);
    }
    payload.readingTime = readingTime(payload.body);
    if (payload.status === 'published' && !payload.publishedAt) payload.publishedAt = new Date();
    const article = await Article.create(payload);
    await invalidateArticleCaches(article.slug);
    if (article.status === 'published') pingIndexNow([`/blog/${article.slug}`, '/blog']);
    return created(res, article, 'Article created');
  } catch (err) {
    return next(err);
  }
});

router.put('/articles/:slug', validate({ params: slugParams }), async (req, res, next) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug });
    if (!article) return fail(res, 'Article not found', 404, [{ code: 'NOT_FOUND' }]);
    // Remember the outgoing cover before it's overwritten — books already do
    // this on update, articles did not, so every replaced article cover leaked
    // an orphaned Cloudinary asset that nothing would ever reference again.
    const previousCoverId = article.coverImage?.publicId;
    const fields = ['title', 'excerpt', 'body', 'coverImage', 'author', 'category', 'tags', 'status', 'metaTitle', 'metaDesc', 'relatedBooks'];
    for (const f of fields) if (f in req.body) article[f] = req.body[f];
    if ('body' in req.body) article.readingTime = readingTime(article.body);
    if (article.status === 'published' && !article.publishedAt) article.publishedAt = new Date();
    await article.save();
    if (previousCoverId && previousCoverId !== article.coverImage?.publicId) {
      cleanupImages([previousCoverId], article.slug);
    }
    await invalidateArticleCaches(article.slug);
    if (article.status === 'published') pingIndexNow([`/blog/${article.slug}`, '/blog']);
    return ok(res, article, 'Article updated');
  } catch (err) {
    return next(err);
  }
});

router.delete('/articles/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (article) {
      cleanupImages([article.coverImage?.publicId], article.slug);
      await invalidateArticleCaches(article.slug);
    }
    return ok(res, null, 'Article deleted');
  } catch (err) {
    return next(err);
  }
});

// ══ COUPONS ══════════════════════════════════════════════
// Redemption rules live in services/pricing.evaluateCoupon — these routes only
// own the record. Keep them dumb so the cart and the admin can never disagree
// about what a code is worth.
router.get('/coupons', async (_req, res, next) => {
  try {
    const coupons = await Coupon.find().select('-usedBy').sort({ createdAt: -1 }).limit(200).lean();
    return ok(res, coupons, 'Coupons');
  } catch (err) {
    return next(err);
  }
});

router.get('/coupons/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id).select('-usedBy').lean();
    if (!coupon) return fail(res, 'Coupon not found', 404, [{ code: 'NOT_FOUND' }]);
    return ok(res, coupon, 'Coupon');
  } catch (err) {
    return next(err);
  }
});

router.post('/coupons', validate({ body: couponBody }), async (req, res, next) => {
  try {
    const payload = {};
    for (const f of COUPON_FIELDS) if (f in req.body) payload[f] = req.body[f];
    if (await Coupon.exists({ code: payload.code })) {
      return fail(res, 'A coupon with that code already exists', 409, [{ field: 'code', code: 'DUPLICATE' }]);
    }
    const coupon = await Coupon.create(payload);
    return created(res, coupon, 'Coupon created');
  } catch (err) {
    return next(err);
  }
});

router.put('/coupons/:id', validate({ params: idParams, body: couponBody }), async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return fail(res, 'Coupon not found', 404, [{ code: 'NOT_FOUND' }]);
    // A code is the customer-facing handle; renaming onto an existing one would
    // make two records claim the same redemption ledger.
    if (req.body.code !== coupon.code && (await Coupon.exists({ code: req.body.code }))) {
      return fail(res, 'A coupon with that code already exists', 409, [{ field: 'code', code: 'DUPLICATE' }]);
    }
    for (const f of COUPON_FIELDS) if (f in req.body) coupon[f] = req.body[f];
    await coupon.save();
    return ok(res, coupon, 'Coupon updated');
  } catch (err) {
    return next(err);
  }
});

router.delete('/coupons/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    return ok(res, null, 'Coupon deleted');
  } catch (err) {
    return next(err);
  }
});

// ══ ORDERS ═══════════════════════════════════════════════
router.get('/orders', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.search) filter.orderNumber = new RegExp(String(req.query.search), 'i');
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(200).populate('user', 'fullName email').lean();
    return ok(res, orders.map((o) => ({ ...o, itemCount: o.items.length })), 'Orders');
  } catch (err) {
    return next(err);
  }
});

router.get('/orders/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'fullName email phone')
      // Who moved the order to each status — the timeline names them rather
      // than showing a raw id. Guest-placed orders have no updatedBy on the
      // first entry, so the UI falls back to "Customer".
      .populate('statusHistory.updatedBy', 'fullName email isAdmin')
      .lean();
    if (!order) return fail(res, 'Order not found', 404, [{ code: 'NOT_FOUND' }]);
    return ok(res, order, 'Order');
  } catch (err) {
    return next(err);
  }
});

const STATUS_FLOW = ['placed', 'confirmed', 'processing', 'shipped', 'delivered'];

router.put('/orders/:id/status', validate({ params: idParams, body: z.object({ status: z.enum(STATUS_FLOW) }).catchall(z.unknown()) }), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'Order not found', 404, [{ code: 'NOT_FOUND' }]);
    order.status = req.body.status;
    if (req.body.status === 'delivered') {
      order.deliveredAt = new Date();
      // Award points on delivery if not already (kept simple: pointsEarned already set at placement).
    }
    order.statusHistory.push({ status: req.body.status, note: req.body.note || `Marked ${req.body.status}`, timestamp: new Date(), updatedBy: req.userId });
    await order.save();
    if (order.user) {
      const u = await User.findById(order.user);
      if (u) email.sendOrderStatusUpdate(u, order).catch(() => {});
      const io = req.app.get('io');
      if (io) io.to(`user:${order.user}`).emit('order:status', { orderNumber: order.orderNumber, status: order.status });
    }
    return ok(res, order, 'Status updated');
  } catch (err) {
    return next(err);
  }
});

router.put('/orders/:id/cancel', validate({ params: idParams }), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'Order not found', 404, [{ code: 'NOT_FOUND' }]);
    if (['delivered', 'cancelled', 'refunded'].includes(order.status)) {
      return fail(res, `Cannot cancel an order that is ${order.status}`, 400, [{ code: 'NOT_CANCELLABLE' }]);
    }
    await Promise.all(order.items.map((i) => restoreStock(i.book, i.quantity, i.variantId)));
    if (order.user) {
      const u = await User.findById(order.user);
      if (u) {
        u.points = Math.max(0, u.points + order.pointsUsed - order.pointsEarned);
        if (order.pointsUsed) u.pointsHistory.push({ amount: order.pointsUsed, reason: 'Order cancelled, points restored', orderId: order._id });
        if (order.pointsEarned) u.pointsHistory.push({ amount: -order.pointsEarned, reason: 'Order cancelled, reward reversed', orderId: order._id });
        await u.save();
      }
    }
    order.status = 'cancelled';
    order.cancellationReason = req.body.reason || 'Cancelled by admin';
    order.statusHistory.push({ status: 'cancelled', note: order.cancellationReason, timestamp: new Date(), updatedBy: req.userId });
    await order.save();
    return ok(res, order, 'Order cancelled, stock restored');
  } catch (err) {
    return next(err);
  }
});

router.put('/orders/:id/refund', validate({ params: idParams }), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'Order not found', 404, [{ code: 'NOT_FOUND' }]);
    if (order.paymentStatus === 'refunded') return fail(res, 'Already refunded', 400, [{ code: 'ALREADY_REFUNDED' }]);
    await Promise.all(order.items.map((i) => restoreStock(i.book, i.quantity, i.variantId)));
    if (order.user && order.pointsEarned > 0) {
      await User.updateOne({ _id: order.user }, {
        $inc: { points: -order.pointsEarned },
        $push: { pointsHistory: { amount: -order.pointsEarned, reason: 'Refund, reward reversed', orderId: order._id } },
      });
    }
    order.paymentStatus = 'refunded';
    order.status = 'refunded';
    order.statusHistory.push({ status: 'refunded', note: req.body.reason || 'Refund processed', timestamp: new Date(), updatedBy: req.userId });
    await order.save();
    return ok(res, order, 'Refund processed');
  } catch (err) {
    return next(err);
  }
});

// ══ USERS ════════════════════════════════════════════════
router.get('/users', async (req, res, next) => {
  try {
    const filter = { isAdmin: false };
    if (req.query.search) filter.$or = [
      { fullName: new RegExp(String(req.query.search), 'i') },
      { email: new RegExp(String(req.query.search), 'i') },
    ];
    const users = await User.find(filter).limit(200).lean();
    const ids = users.map((u) => u._id);
    const stats = await Order.aggregate([
      { $match: { user: { $in: ids } } },
      { $group: { _id: '$user', count: { $sum: 1 }, spent: { $sum: '$total' } } },
    ]);
    const byId = new Map(stats.map((s) => [String(s._id), s]));
    const enriched = users.map((u) => ({
      _id: u._id, fullName: u.fullName, email: u.email, phone: u.phone, tier: u.tier, points: u.points,
      isBanned: u.isBanned, createdAt: u.createdAt, lastLogin: u.lastLogin,
      orderCount: byId.get(String(u._id))?.count || 0,
      totalSpent: byId.get(String(u._id))?.spent || 0,
    }));
    return ok(res, enriched, 'Users');
  } catch (err) {
    return next(err);
  }
});

router.put('/users/:id/ban', validate({ params: idParams }), async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return fail(res, 'User not found', 404, [{ code: 'NOT_FOUND' }]);
    if (target.isAdmin) return fail(res, 'Cannot ban an admin', 400, [{ code: 'CANNOT_BAN_ADMIN' }]);
    target.isBanned = true;
    target.banReason = req.body.reason || 'Violation of terms';
    target.bannedAt = new Date();
    await target.save();
    return ok(res, { isBanned: true }, 'User banned');
  } catch (err) {
    return next(err);
  }
});

router.put('/users/:id/unban', validate({ params: idParams }), async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isBanned: false, banReason: null, bannedAt: null });
    return ok(res, { isBanned: false }, 'User unbanned');
  } catch (err) {
    return next(err);
  }
});

// ══ REVIEWS ══════════════════════════════════════════════
router.get('/reviews', async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const filter = status === 'all' ? {} : { isApproved: status === 'approved' };
    const reviews = await Review.find(filter).sort({ createdAt: -1 }).limit(200)
      .populate('book', 'title coverImage slug').populate('user', 'fullName').lean();
    return ok(res, reviews, 'Reviews');
  } catch (err) {
    return next(err);
  }
});

// Recompute avgRating + reviewCount from approved reviews (see Review model).
const recalcBookRating = (bookId) => Review.calculateAverageRating(bookId);

router.put('/reviews/:id/approve', validate({ params: idParams }), async (req, res, next) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { isApproved: true }, { returnDocument: 'after' });
    if (!review) return fail(res, 'Review not found', 404, [{ code: 'NOT_FOUND' }]);
    await recalcBookRating(review.book);
    return ok(res, null, 'Review approved');
  } catch (err) {
    return next(err);
  }
});

router.put('/reviews/:id/reject', validate({ params: idParams }), async (req, res, next) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (review) await recalcBookRating(review.book);
    return ok(res, null, 'Review rejected');
  } catch (err) {
    return next(err);
  }
});

// ══ QUESTIONS (customer Q&A → QAPage) ════════════════════
router.get('/questions', async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const filter = status === 'all' ? {} : { isAnswered: status === 'answered' };
    const questions = await Question.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('book', 'title slug')
      .populate('user', 'fullName')
      .lean();
    return ok(res, questions, 'Questions');
  } catch (err) {
    return next(err);
  }
});

router.put(
  '/questions/:id/answer',
  validate({ params: idParams, body: answerBody }),
  async (req, res, next) => {
    try {
      const q = await Question.findByIdAndUpdate(
        req.params.id,
        { answer: req.body.answer, answeredBy: req.userId, answeredAt: new Date(), isAnswered: true },
        { returnDocument: 'after' }
      ).populate('book', 'slug');
      if (!q) return fail(res, 'Question not found', 404, [{ code: 'NOT_FOUND' }]);
      if (q.book?.slug) {
        await invalidateCatalogCaches(q.book.slug);
        pingIndexNow([`/books/${q.book.slug}`]);
      }
      return ok(res, null, 'Answer published');
    } catch (err) {
      return next(err);
    }
  }
);

router.delete('/questions/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    return ok(res, null, 'Question deleted');
  } catch (err) {
    return next(err);
  }
});

// ══ ANALYTICS ════════════════════════════════════════════
router.get('/analytics/wishlist-counts', async (req, res, next) => {
  try {
    const counts = await User.aggregate([
      { $match: { wishlist: { $exists: true, $ne: [] } } },
      { $unwind: '$wishlist' },
      { $group: { _id: '$wishlist', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]);
    const books = await Book.find({ _id: { $in: counts.map((c) => c._id) } }).select('title author coverImage stock price').lean();
    const byId = new Map(books.map((b) => [String(b._id), b]));
    return ok(res, counts.map((c) => ({ book: byId.get(String(c._id)), count: c.count })).filter((r) => r.book), 'Wishlist counts');
  } catch (err) {
    return next(err);
  }
});

router.get('/analytics/cart-only', async (req, res, next) => {
  try {
    const carted = await Activity.aggregate([
      { $match: { type: 'cart_add' } },
      { $group: { _id: '$book', users: { $addToSet: '$user' } } },
    ]);
    const purchased = new Set((await Activity.distinct('book', { type: 'purchase' })).map(String));
    const cartOnly = carted
      .map((c) => ({ bookId: c._id, userCount: c.users.length }))
      .filter((c) => !purchased.has(String(c.bookId)))
      .sort((a, b) => b.userCount - a.userCount)
      .slice(0, 50);
    const books = await Book.find({ _id: { $in: cartOnly.map((c) => c.bookId) } }).select('title author coverImage stock price').lean();
    const byId = new Map(books.map((b) => [String(b._id), b]));
    return ok(res, cartOnly.map((c) => ({ book: byId.get(String(c.bookId)), userCount: c.userCount })).filter((r) => r.book), 'Cart-only');
  } catch (err) {
    return next(err);
  }
});

// ══ WISHLISTS (who saved what) ═══════════════════════════
// Per-user view so an admin can see which customers saved which titles and act
// on it (restock, promo, outreach).
router.get('/wishlists', async (req, res, next) => {
  try {
    const filter = { isAdmin: false, wishlist: { $exists: true, $ne: [] } };
    if (req.query.search) {
      filter.$or = [
        { fullName: new RegExp(String(req.query.search), 'i') },
        { email: new RegExp(String(req.query.search), 'i') },
      ];
    }
    const users = await User.find(filter)
      .select('fullName email wishlist')
      .populate({ path: 'wishlist', select: 'title slug price stockStatus genre' })
      .limit(200)
      .lean();

    const data = users
      .map((u) => {
        const items = (u.wishlist || []).filter(Boolean).map((b) => ({
          _id: b._id, title: b.title, slug: b.slug, price: b.price, stockStatus: b.stockStatus, genre: b.genre,
        }));
        return { _id: u._id, fullName: u.fullName, email: u.email, count: items.length, items };
      })
      .filter((u) => u.count > 0)
      .sort((a, b) => b.count - a.count);

    return ok(res, data, 'Wishlists');
  } catch (err) {
    return next(err);
  }
});

// One customer's wishlist in full — powers the dedicated detail page.
router.get('/wishlists/:userId', validate({ params: userIdParams }), async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.userId, isAdmin: false })
      .select('fullName email phone createdAt wishlist')
      .populate({ path: 'wishlist', select: 'title slug author price comparePrice stockStatus genre coverImage' })
      .lean();
    if (!user) return fail(res, 'Customer not found', 404, [{ code: 'NOT_FOUND' }]);

    const items = (user.wishlist || []).filter(Boolean).map((b) => ({
      _id: b._id, title: b.title, slug: b.slug, author: b.author, price: b.price,
      comparePrice: b.comparePrice, stockStatus: b.stockStatus, genre: b.genre,
      coverImage: b.coverImage?.secureUrl || '',
    }));
    return ok(
      res,
      { _id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, createdAt: user.createdAt, count: items.length, items },
      'Wishlist'
    );
  } catch (err) {
    return next(err);
  }
});

// ══ CSV EXPORT ═══════════════════════════════════════════
function sendCsv(res, filename, rows) {
  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}

router.get('/export/orders', async (req, res, next) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).populate('user', 'email').lean();
    return sendCsv(res, 'orders.csv', orders.map((o) => ({
      orderNumber: o.orderNumber, customer: o.deliveryAddress?.fullName, email: o.user?.email || 'guest',
      items: o.items.length, total: o.total, payment: o.paymentMethod, status: o.status,
      province: o.deliveryAddress?.province, date: o.createdAt?.toISOString(),
    })));
  } catch (err) {
    return next(err);
  }
});

router.get('/export/books', async (req, res, next) => {
  try {
    const books = await Book.find().select('+costPrice').lean();
    return sendCsv(res, 'books.csv', books.map((b) => ({
      title: b.title, author: b.author, isbn: b.isbn || '', genre: b.genre, price: b.price,
      costPrice: b.costPrice ?? '', stock: b.stock, status: b.stockStatus, sold: b.soldCount,
    })));
  } catch (err) {
    return next(err);
  }
});

router.get('/export/users', async (req, res, next) => {
  try {
    const users = await User.find({ isAdmin: false }).lean();
    return sendCsv(res, 'users.csv', users.map((u) => ({
      fullName: u.fullName, email: u.email, phone: u.phone || '', tier: u.tier, points: u.points,
      banned: u.isBanned ? 'yes' : 'no', joined: u.createdAt?.toISOString(),
    })));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
