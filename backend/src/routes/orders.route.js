'use strict';

const express = require('express');

const Order = require('../models/order.model');
const Book = require('../models/book.model');
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');
const Activity = require('../models/activity.model');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z, objectId, trimmedString } = require('../utils/zod');
const { priceCart } = require('../services/pricing');
const { ok, created, fail } = require('../utils/apiResponse');
const email = require('../utils/emailService');
const logger = require('../config/logger');

const router = express.Router();

const PROVINCES = User.PROVINCES;

const orderItem = z.object({
  bookId: objectId(),
  variantId: objectId().optional(),
  quantity: z.coerce.number().int().min(1).optional(),
});
const createOrderBody = z.object({
  items: z.array(orderItem).min(1),
  deliveryMethod: z.enum(['standard', 'express', 'same-day']).optional(),
  paymentMethod: z.string().optional(),
  pointsUsed: z.coerce.number().int().min(0).optional(),
  couponCode: z.string().trim().optional(),
  deliveryAddress: z.object({
    fullName: trimmedString(),
    phone: trimmedString(),
    address1: trimmedString(),
    address2: z.string().optional(),
    city: trimmedString(),
    province: z.enum(PROVINCES),
  }),
});
const orderNumberParams = z.object({ orderNumber: trimmedString() });

// Decrement stock + bump soldCount + recompute stockStatus atomically.
// Conditional on stock>=qty so a raced order can't oversell.
// Recompute top-level stock/price from variants, then derive stockStatus.
const SYNC_FROM_VARIANTS = { $set: { stock: { $sum: '$variants.stock' }, price: { $min: '$variants.price' } } };
const STATUS_FROM_STOCK = {
  $set: {
    stockStatus: {
      $switch: {
        branches: [
          { case: { $eq: ['$stock', 0] }, then: 'out-of-stock' },
          { case: { $lte: ['$stock', 3] }, then: 'low-stock' },
        ],
        default: 'in-stock',
      },
    },
  },
};

// Adjust a single variant's stock by `delta` (negative to reserve) inside a $map.
const adjustVariant = (variantId, delta) => ({
  $set: {
    variants: {
      $map: {
        input: '$variants',
        as: 'v',
        in: {
          $cond: [
            { $eq: [{ $toString: '$$v._id' }, String(variantId)] },
            { $mergeObjects: ['$$v', { stock: { $add: ['$$v.stock', delta] } }] },
            '$$v',
          ],
        },
      },
    },
  },
});

function decrementStock(bookId, qty, variantId) {
  if (variantId) {
    return Book.updateOne(
      { _id: bookId, stockStatus: { $ne: 'discontinued' }, variants: { $elemMatch: { _id: variantId, stock: { $gte: qty } } } },
      [adjustVariant(variantId, -qty), { $set: { soldCount: { $add: ['$soldCount', qty] } } }, SYNC_FROM_VARIANTS, STATUS_FROM_STOCK],
      { updatePipeline: true }
    );
  }
  return Book.updateOne(
    { _id: bookId, stock: { $gte: qty }, stockStatus: { $ne: 'discontinued' } },
    [{ $set: { stock: { $subtract: ['$stock', qty] }, soldCount: { $add: ['$soldCount', qty] } } }, STATUS_FROM_STOCK],
    { updatePipeline: true }
  );
}

// Reverse a decrement (compensation on partial failure / cancellation).
const STATUS_FROM_STOCK_KEEP_DISC = {
  $set: {
    stockStatus: {
      $cond: [
        { $eq: ['$stockStatus', 'discontinued'] },
        'discontinued',
        {
          $switch: {
            branches: [
              { case: { $eq: ['$stock', 0] }, then: 'out-of-stock' },
              { case: { $lte: ['$stock', 3] }, then: 'low-stock' },
            ],
            default: 'in-stock',
          },
        },
      ],
    },
  },
};

function restoreStock(bookId, qty, variantId) {
  if (variantId) {
    return Book.updateOne(
      { _id: bookId, 'variants._id': variantId },
      [
        adjustVariant(variantId, qty),
        { $set: { soldCount: { $max: [{ $subtract: ['$soldCount', qty] }, 0] } } },
        SYNC_FROM_VARIANTS,
        STATUS_FROM_STOCK_KEEP_DISC,
      ],
      { updatePipeline: true }
    );
  }
  return Book.updateOne(
    { _id: bookId },
    [{ $set: { stock: { $add: ['$stock', qty] }, soldCount: { $max: [{ $subtract: ['$soldCount', qty] }, 0] } } }, STATUS_FROM_STOCK_KEEP_DISC],
    { updatePipeline: true }
  );
}

// ── POST /api/orders — place order (auth optional → guest checkout) ──
router.post(
  '/',
  optionalAuth,
  validate({ body: createOrderBody }),
  async (req, res, next) => {
    const { paymentMethod = 'cod', deliveryAddress, deliveryMethod, couponCode, pointsUsed = 0, customerNote } = req.body;

    // COD-only guard (Master Guide: enum carries other methods for v2; service rejects them now).
    if (paymentMethod !== 'cod') {
      return fail(res, 'Only Cash on Delivery is available right now.', 422, [{ field: 'paymentMethod', code: 'COD_ONLY' }]);
    }

    const decremented = [];
    try {
      const user = req.userId ? await User.findById(req.userId) : null;
      if (user?.isBanned) return fail(res, 'Account suspended', 403, [{ code: 'BANNED' }]);

      const priced = await priceCart({ items: req.body.items, deliveryMethod, couponCode, pointsUsed, user });
      if (priced.issues.length) return fail(res, 'Some items are unavailable', 409, priced.issues);
      if (priced.lineItems.length === 0) return fail(res, 'Cart is empty', 400, [{ code: 'EMPTY_CART' }]);
      if (couponCode && priced.couponError) return fail(res, priced.couponError, 400, [{ field: 'couponCode', code: 'COUPON_INVALID' }]);

      // Reserve stock atomically; compensate if any line races out.
      for (const li of priced.lineItems) {
        const r = await decrementStock(li.book, li.quantity, li.variantId);
        if (r.modifiedCount === 1) decremented.push(li);
        else {
          await Promise.all(decremented.map((d) => restoreStock(d.book, d.quantity, d.variantId)));
          return fail(res, 'Stock changed while checking out — please try again.', 409, [{ bookId: li.bookId, code: 'STOCK_RACE' }]);
        }
      }

      const order = await Order.create({
        user: user?._id,
        isGuest: !user,
        items: priced.lineItems.map((li) => ({
          book: li.book, title: li.title, author: li.author, coverImage: li.coverImage, condition: li.condition, price: li.price, quantity: li.quantity,
          ...(li.variantId ? { variantId: li.variantId } : {}), ...(li.format ? { format: li.format } : {}),
        })),
        subtotal: priced.subtotal,
        deliveryFee: priced.deliveryFee,
        deliveryMethod: priced.deliveryMethod,
        discount: priced.couponDiscount + priced.pointsDiscount,
        couponCode: priced.couponCode,
        couponDiscount: priced.couponDiscount,
        pointsUsed: priced.pointsUsed,
        pointsEarned: priced.pointsEarned,
        total: priced.total,
        deliveryAddress,
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        status: 'placed',
        statusHistory: [{ status: 'placed', note: 'Order placed', timestamp: new Date(), updatedBy: user?._id }],
        customerNote,
      });

      // Loyalty + coupon side-effects (logged-in users only earn/spend points).
      if (user) {
        user.points = Math.max(0, user.points - priced.pointsUsed + priced.pointsEarned);
        if (priced.pointsUsed) user.pointsHistory.push({ amount: -priced.pointsUsed, reason: 'Redeemed at checkout', orderId: order._id });
        if (priced.pointsEarned) user.pointsHistory.push({ amount: priced.pointsEarned, reason: 'Purchase reward', orderId: order._id });

        // Referral payout: the first time a referred user buys, credit their
        // referrer 100 points (once). `referralRewarded` guards against repeats.
        if (user.referredBy && !user.referralRewarded) {
          const referrer = await User.findById(user.referredBy);
          if (referrer) {
            referrer.points += 100;
            referrer.pointsHistory.push({ amount: 100, reason: 'Referral bonus — friend made first purchase', orderId: order._id });
            await referrer.save();
          }
          user.referralRewarded = true; // mark even if the referrer is gone, so we don't retry every order
        }
        await user.save();

        Activity.insertMany(
          priced.lineItems.map((li) => ({ type: 'purchase', user: user._id, book: li.book, metadata: { quantity: li.quantity, source: 'checkout' } }))
        ).catch(() => {});
      }

      if (priced.appliedCoupon) {
        await Coupon.updateOne(
          { _id: priced.appliedCoupon._id },
          { $inc: { usageCount: 1 }, $push: { usedBy: { user: user?._id, order: order._id, usedAt: new Date() } } }
        );
      }

      // Notify (best-effort).
      if (user) email.sendOrderConfirmation(user, order).catch(() => {});
      const io = req.app.get('io');
      if (io) {
        io.to('admin').emit('order:created', { orderNumber: order.orderNumber, total: order.total });
        if (user) io.to(`user:${user._id}`).emit('order:created', { orderNumber: order.orderNumber });
      }

      return created(res, { order }, 'Order placed');
    } catch (err) {
      // Best-effort compensation if we failed after reserving stock.
      await Promise.all(decremented.map((d) => restoreStock(d.book, d.quantity))).catch(() => {});
      logger.error({ err: err.message }, 'Order creation failed');
      return next(err);
    }
  }
);

// ── GET /api/orders/my-orders ────────────────────────────
router.get('/my-orders', authenticate, async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.userId }).sort({ createdAt: -1 }).lean();
    return ok(res, orders, 'Your orders');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/orders/:orderNumber (own order) ─────────────
router.get('/:orderNumber', authenticate, validate({ params: orderNumberParams }), async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber, user: req.userId }).lean();
    if (!order) return fail(res, 'Order not found', 404, [{ code: 'NOT_FOUND' }]);
    return ok(res, order, 'Order');
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/orders/:orderNumber/cancel (own, pre-shipment) ──
router.post('/:orderNumber/cancel', authenticate, validate({ params: orderNumberParams }), async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber, user: req.userId });
    if (!order) return fail(res, 'Order not found', 404, [{ code: 'NOT_FOUND' }]);
    if (!['placed', 'confirmed', 'processing'].includes(order.status)) {
      return fail(res, `Cannot cancel an order that is ${order.status}`, 400, [{ code: 'NOT_CANCELLABLE' }]);
    }

    // Restore stock.
    await Promise.all(order.items.map((i) => restoreStock(i.book, i.quantity)));

    // Refund redeemed points + reverse earned points.
    if (order.user) {
      const user = await User.findById(order.user);
      if (user) {
        user.points = Math.max(0, user.points + order.pointsUsed - order.pointsEarned);
        if (order.pointsUsed) user.pointsHistory.push({ amount: order.pointsUsed, reason: 'Order cancelled — points restored', orderId: order._id });
        if (order.pointsEarned) user.pointsHistory.push({ amount: -order.pointsEarned, reason: 'Order cancelled — reward reversed', orderId: order._id });
        await user.save();
      }
    }

    order.status = 'cancelled';
    order.cancellationReason = req.body.reason || 'Cancelled by customer';
    order.statusHistory.push({ status: 'cancelled', note: order.cancellationReason, timestamp: new Date(), updatedBy: req.userId });
    await order.save();

    return ok(res, { order }, 'Order cancelled');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
