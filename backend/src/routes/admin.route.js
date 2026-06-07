'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const { stringify } = require('csv-stringify/sync');

const Book = require('../models/book.model');
const Genre = require('../models/genre.model');
const Order = require('../models/order.model');
const User = require('../models/user.model');
const Review = require('../models/review.model');
const Activity = require('../models/activity.model');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { restoreStock } = require('../services/stock');
const { cacheDel } = require('../config/redis');
const { ok, created, fail } = require('../utils/apiResponse');
const email = require('../utils/emailService');

const router = express.Router();
router.use(authenticate, requireAdmin);

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function invalidateCatalogCaches(slug) {
  await Promise.all([
    slug ? cacheDel(`book:${slug}`) : Promise.resolve(),
    cacheDel('featured_books'),
    cacheDel('filters_metadata'),
    cacheDel('suggestions:*'),
    cacheDel('genres_list'),
    cacheDel('genre:*'),
  ]);
}

// ── OVERVIEW ─────────────────────────────────────────────
router.get('/overview', async (req, res, next) => {
  try {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [totalOrders, monthOrders, revenueAgg, customers, books, lowStock, pendingReviews, recentOrders] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Order.aggregate([
        { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      User.countDocuments({ isAdmin: false }),
      Book.countDocuments({ isActive: true }),
      Book.find({ isActive: true, stock: { $lte: 5 } }).select('title slug stock').sort({ stock: 1 }).limit(10).lean(),
      Review.countDocuments({ isApproved: false }),
      Order.find().sort({ createdAt: -1 }).limit(8).populate('user', 'fullName email').lean(),
    ]);

    return ok(
      res,
      {
        kpis: {
          totalOrders,
          monthOrders,
          revenue: revenueAgg[0]?.total || 0,
          customers,
          books,
          lowStockCount: lowStock.length,
          pendingReviews,
        },
        lowStock,
        recentOrders: recentOrders.map((o) => ({
          orderNumber: o.orderNumber,
          customer: o.user?.fullName || o.deliveryAddress?.fullName || 'Guest',
          total: o.total,
          status: o.status,
          createdAt: o.createdAt,
        })),
      },
      'Overview'
    );
  } catch (err) {
    return next(err);
  }
});

// ══ BOOKS ════════════════════════════════════════════════
router.get('/books', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.search) filter.$or = [
      { title: new RegExp(String(req.query.search), 'i') },
      { author: new RegExp(String(req.query.search), 'i') },
    ];
    const books = await Book.find(filter).select('+costPrice').sort({ createdAt: -1 }).limit(200).lean();
    return ok(res, books, 'Books');
  } catch (err) {
    return next(err);
  }
});

router.get('/books/:slug', [param('slug').trim().notEmpty()], validate, async (req, res, next) => {
  try {
    const book = await Book.findOne({ slug: req.params.slug }).select('+costPrice').lean();
    if (!book) return fail(res, 'Book not found', 404, [{ code: 'NOT_FOUND' }]);
    return ok(res, book, 'Book');
  } catch (err) {
    return next(err);
  }
});

const bookRules = [
  body('title').trim().notEmpty(),
  body('author').trim().notEmpty(),
  body('genre').trim().notEmpty(),
  body('price').toInt().isInt({ min: 0 }),
  body('stock').optional().toInt().isInt({ min: 0 }),
  // Cover is the image subdocument: { publicId, secureUrl, name }.
  body('coverImage.secureUrl').trim().notEmpty().withMessage('A cover image is required'),
  body('coverImage.publicId').trim().notEmpty(),
  body('images').optional().isArray({ max: 10 }).withMessage('Up to 10 gallery images'),
  body('images.*.secureUrl').optional().trim().notEmpty(),
  body('images.*.publicId').optional().trim().notEmpty(),
  body('description').trim().isLength({ min: 10 }),
];

router.post('/books', bookRules, validate, async (req, res, next) => {
  try {
    const payload = { ...req.body };
    payload.slug = payload.slug ? slugify(payload.slug) : slugify(payload.title);
    payload.genre = slugify(payload.genre);
    const book = await Book.create(payload);
    await invalidateCatalogCaches(book.slug);
    return created(res, book, 'Book created');
  } catch (err) {
    return next(err);
  }
});

router.put('/books/:slug', [param('slug').trim().notEmpty()], validate, async (req, res, next) => {
  try {
    const book = await Book.findOne({ slug: req.params.slug });
    if (!book) return fail(res, 'Book not found', 404, [{ code: 'NOT_FOUND' }]);
    // Whitelist updatable fields.
    const fields = ['title', 'author', 'isbn', 'genre', 'subgenre', 'tags', 'condition', 'price', 'comparePrice', 'costPrice', 'stock', 'stockStatus', 'reorderPoint', 'coverImage', 'images', 'description', 'shortDescription', 'specifications', 'metaTitle', 'metaDescription', 'isBestseller', 'isNewArrival', 'isFeatured', 'isStaffPick', 'staffPickNote', 'isActive'];
    for (const f of fields) if (f in req.body) book[f] = req.body[f];
    if (req.body.genre) book.genre = slugify(req.body.genre);
    await book.save(); // triggers stockStatus recompute
    await invalidateCatalogCaches(book.slug);
    return ok(res, book, 'Book updated');
  } catch (err) {
    return next(err);
  }
});

router.delete('/books/:id', [param('id').isMongoId()], validate, async (req, res, next) => {
  try {
    const book = await Book.findByIdAndDelete(req.params.id);
    if (book) await invalidateCatalogCaches(book.slug);
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

const genreRules = [
  body('name').trim().notEmpty().withMessage('Genre name is required'),
  body('description').optional().trim(),
  body('color').optional().trim(),
  body('metaTitle').optional().trim().isLength({ max: 70 }),
  body('metaDesc').optional().trim().isLength({ max: 160 }),
];

router.post('/genres', genreRules, validate, async (req, res, next) => {
  try {
    const slug = req.body.slug ? slugify(req.body.slug) : slugify(req.body.name);
    if (!slug) return fail(res, 'Genre name must contain letters or numbers', 400, [{ field: 'name', code: 'INVALID' }]);
    if (await Genre.exists({ slug })) {
      return fail(res, 'A genre with that name already exists', 409, [{ field: 'name', code: 'DUPLICATE' }]);
    }
    const genre = await Genre.create({ ...req.body, slug });
    await cacheDel('genres_list');
    return created(res, genre, 'Genre created');
  } catch (err) {
    return next(err);
  }
});

router.put('/genres/:slug', [param('slug').trim().notEmpty()], validate, async (req, res, next) => {
  try {
    const genre = await Genre.findOne({ slug: req.params.slug });
    if (!genre) return fail(res, 'Genre not found', 404, [{ code: 'NOT_FOUND' }]);
    const fields = ['name', 'description', 'curatorNote', 'icon', 'color', 'metaTitle', 'metaDesc', 'isActive'];
    for (const f of fields) if (f in req.body) genre[f] = req.body[f];
    await genre.save();
    await cacheDel('genres_list');
    return ok(res, genre, 'Genre updated');
  } catch (err) {
    return next(err);
  }
});

router.delete('/genres/:id', [param('id').isMongoId()], validate, async (req, res, next) => {
  try {
    const genre = await Genre.findById(req.params.id);
    if (!genre) return fail(res, 'Genre not found', 404, [{ code: 'NOT_FOUND' }]);
    const inUse = await Book.countDocuments({ genre: genre.slug });
    if (inUse > 0) {
      return fail(res, `${inUse} book${inUse > 1 ? 's' : ''} still shelved under this genre — reassign them first.`, 409, [{ code: 'GENRE_IN_USE' }]);
    }
    await genre.deleteOne();
    await cacheDel('genres_list');
    return ok(res, null, 'Genre deleted');
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

router.get('/orders/:id', [param('id').isMongoId()], validate, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'fullName email phone').lean();
    if (!order) return fail(res, 'Order not found', 404, [{ code: 'NOT_FOUND' }]);
    return ok(res, order, 'Order');
  } catch (err) {
    return next(err);
  }
});

const STATUS_FLOW = ['placed', 'confirmed', 'processing', 'shipped', 'delivered'];

router.put('/orders/:id/status', [param('id').isMongoId(), body('status').isIn(STATUS_FLOW)], validate, async (req, res, next) => {
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

router.put('/orders/:id/cancel', [param('id').isMongoId()], validate, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'Order not found', 404, [{ code: 'NOT_FOUND' }]);
    if (['delivered', 'cancelled', 'refunded'].includes(order.status)) {
      return fail(res, `Cannot cancel an order that is ${order.status}`, 400, [{ code: 'NOT_CANCELLABLE' }]);
    }
    await Promise.all(order.items.map((i) => restoreStock(i.book, i.quantity)));
    if (order.user) {
      const u = await User.findById(order.user);
      if (u) {
        u.points = Math.max(0, u.points + order.pointsUsed - order.pointsEarned);
        if (order.pointsUsed) u.pointsHistory.push({ amount: order.pointsUsed, reason: 'Order cancelled — points restored', orderId: order._id });
        if (order.pointsEarned) u.pointsHistory.push({ amount: -order.pointsEarned, reason: 'Order cancelled — reward reversed', orderId: order._id });
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

router.put('/orders/:id/refund', [param('id').isMongoId()], validate, async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'Order not found', 404, [{ code: 'NOT_FOUND' }]);
    if (order.paymentStatus === 'refunded') return fail(res, 'Already refunded', 400, [{ code: 'ALREADY_REFUNDED' }]);
    await Promise.all(order.items.map((i) => restoreStock(i.book, i.quantity)));
    if (order.user && order.pointsEarned > 0) {
      await User.updateOne({ _id: order.user }, {
        $inc: { points: -order.pointsEarned },
        $push: { pointsHistory: { amount: -order.pointsEarned, reason: 'Refund — reward reversed', orderId: order._id } },
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

router.put('/users/:id/ban', [param('id').isMongoId()], validate, async (req, res, next) => {
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

router.put('/users/:id/unban', [param('id').isMongoId()], validate, async (req, res, next) => {
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

router.put('/reviews/:id/approve', [param('id').isMongoId()], validate, async (req, res, next) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, { isApproved: true }, { returnDocument: 'after' });
    if (!review) return fail(res, 'Review not found', 404, [{ code: 'NOT_FOUND' }]);
    await recalcBookRating(review.book);
    return ok(res, null, 'Review approved');
  } catch (err) {
    return next(err);
  }
});

router.put('/reviews/:id/reject', [param('id').isMongoId()], validate, async (req, res, next) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (review) await recalcBookRating(review.book);
    return ok(res, null, 'Review rejected');
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
