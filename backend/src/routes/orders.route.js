'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const Order = require('../models/order.model');
const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');
const Activity = require('../models/activity.model');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z, objectId, trimmedString, phone } = require('../utils/zod');
const { priceCart } = require('../services/pricing');
// Stock moves through the shared service so checkout, cancellation and the
// admin refund paths can never drift apart again (see services/stock.js).
const { decrementStock, restoreStock } = require('../services/stock');
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
    phone: phone(),
    address1: trimmedString(),
    address2: z.string().optional(),
    city: trimmedString(),
    province: z.enum(PROVINCES),
  }),
});
const orderNumberParams = z.object({ orderNumber: trimmedString() });

// ── POST /api/orders — place order (sign-in required) ──
// Guest checkout was removed: an order has to belong to an account so the
// buyer can find it under /account, earn points on it, and be emailed about
// it. This is the real boundary. The storefront also hides the checkout form
// from signed-out visitors, but that alone is cosmetic and curl walks past
// it. Orders placed before this change keep isGuest:true and stay readable
// through /orders/lookup, which is why that route is left alone.
router.post(
  '/',
  authenticate,
  validate({ body: createOrderBody }),
  async (req, res, next) => {
    const { paymentMethod = 'cod', deliveryAddress, deliveryMethod, couponCode, pointsUsed = 0, customerNote } = req.body;

    // COD-only guard (Master Guide: enum carries other methods for v2; service rejects them now).
    if (paymentMethod !== 'cod') {
      return fail(res, 'Only Cash on Delivery is available right now.', 422, [{ field: 'paymentMethod', code: 'COD_ONLY' }]);
    }

    const decremented = [];
    try {
      // authenticate guarantees req.userId, but the account can have been
      // deleted mid-session — refuse rather than write an ownerless order.
      const user = await User.findById(req.userId);
      if (!user) return fail(res, 'Please sign in again.', 401, [{ code: 'NO_ACCOUNT' }]);
      if (user.isBanned) return fail(res, 'Account suspended', 403, [{ code: 'BANNED' }]);

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
          return fail(res, 'Stock changed while checking out, please try again.', 409, [{ bookId: li.bookId, code: 'STOCK_RACE' }]);
        }
      }

      const order = await Order.create({
        user: user?._id,
        isGuest: false, // kept on the model for orders placed before sign-in was required
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
            referrer.pointsHistory.push({ amount: 100, reason: 'Referral bonus: friend made first purchase', orderId: order._id });
            await referrer.save();
            // Tell them. The bonus used to land silently, so the one person the
            // programme rewards had no idea it had paid out.
            email.sendReferralBonus(referrer, 100, user.fullName).catch(() => {});
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
      await Promise.all(decremented.map((d) => restoreStock(d.book, d.quantity, d.variantId))).catch(() => {});
      logger.error({ err: err.message }, 'Order creation failed');
      return next(err);
    }
  }
);

// ── GET /api/orders/my-orders ────────────────────────────
// What a customer may see of their own order. The admin's internal note and
// the courier-booking bookkeeping (who booked it, in-flight locks) stay behind.
const CUSTOMER_FIELDS = '-adminNote -ncm.bookedBy -ncm.booking -ncm.bookingStartedAt -ncm.lastSyncedAt -statusHistory.updatedBy';

router.get('/my-orders', authenticate, async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.userId }).select(CUSTOMER_FIELDS).sort({ createdAt: -1 }).lean();
    return ok(res, orders, 'Your orders');
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/orders/lookup — guest order tracking ───────
// Guests can check out, so guests end up holding an order number that, until
// now, nothing would accept: every read on this router required a session, and
// a guest order has no user to match. They were handed a reference and no way
// to use it.
//
// Order numbers are sequential (PT-YYYYMMDD-00001), so the number alone proves
// nothing — pairing it with the delivery phone is what makes this safe, and it
// is something the real customer always has. Phones are compared on digits
// only, since nobody retypes their number the same way twice.
const lookupBody = z.object({ orderNumber: trimmedString(), phone: trimmedString() });

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { message: 'Too many lookups, please try again shortly.', errors: [{ code: 'RATE_LIMITED' }] },
});

const digitsOf = (v) => String(v || '').replace(/\D/g, '');

router.post('/lookup', lookupLimiter, validate({ body: lookupBody }), async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: req.body.orderNumber.toUpperCase() }).select(CUSTOMER_FIELDS).lean();

    // One message for "no such order" and "wrong phone" alike. Distinguishing
    // them would turn this into an oracle for which order numbers exist.
    const mismatch = () =>
      fail(res, "We couldn't find an order with that number and phone number.", 404, [{ code: 'NOT_FOUND' }]);

    if (!order) return mismatch();

    const given = digitsOf(req.body.phone);
    const onOrder = digitsOf(order.deliveryAddress?.phone);
    // Compare the last 9 digits so +977/0 prefixes don't cause false misses.
    const tail = (d) => d.slice(-9);
    if (!given || !onOrder || tail(given) !== tail(onOrder)) return mismatch();

    return ok(res, order, 'Order');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/orders/:orderNumber (own order) ─────────────
router.get('/:orderNumber', authenticate, validate({ params: orderNumberParams }), async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber, user: req.userId }).select(CUSTOMER_FIELDS).lean();
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

    // Restore stock. `variantId` is not optional here: for a multi-format book
    // the top-level `stock` is derived from the variants ($sum), so restoring
    // without it adds the quantity to the derived field while the variant that
    // was actually sold stays decremented — the two then disagree permanently.
    await Promise.all(order.items.map((i) => restoreStock(i.book, i.quantity, i.variantId)));

    // Refund redeemed points + reverse earned points.
    if (order.user) {
      const user = await User.findById(order.user);
      if (user) {
        user.points = Math.max(0, user.points + order.pointsUsed - order.pointsEarned);
        if (order.pointsUsed) user.pointsHistory.push({ amount: order.pointsUsed, reason: 'Order cancelled, points restored', orderId: order._id });
        if (order.pointsEarned) user.pointsHistory.push({ amount: -order.pointsEarned, reason: 'Order cancelled, reward reversed', orderId: order._id });
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
