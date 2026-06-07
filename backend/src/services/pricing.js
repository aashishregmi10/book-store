'use strict';

const Book = require('../models/book.model');
const Coupon = require('../models/coupon.model');
const Order = require('../models/order.model');

// Tunable commerce rules (Nepal store).
const DELIVERY_FEES = { standard: 120, express: 300, 'same-day': 500 };
const FREE_DELIVERY_THRESHOLD = 1500; // NPR — free delivery at/above this subtotal
const POINTS_EARN_RATE = 0.05; // earn 5% of subtotal as points
const POINTS_REDEEM_VALUE = 1; // 1 point == NPR 1 at checkout

/**
 * Validate a coupon for a given cart context. Returns
 * { ok, discount, freeShipping, coupon } or { ok:false, reason }.
 */
async function evaluateCoupon(code, { subtotal, items, userId }) {
  const coupon = await Coupon.findOne({ code: String(code).toUpperCase() });
  if (!coupon || !coupon.isActive) return { ok: false, reason: 'Invalid coupon' };

  const now = new Date();
  if (coupon.startDate && now < coupon.startDate) return { ok: false, reason: 'Coupon not active yet' };
  if (coupon.endDate && now > coupon.endDate) return { ok: false, reason: 'Coupon expired' };
  if (subtotal < (coupon.minOrderAmount || 0)) return { ok: false, reason: `Minimum order NPR ${coupon.minOrderAmount}` };
  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) return { ok: false, reason: 'Coupon usage limit reached' };

  if (userId) {
    const usedByUser = coupon.usedBy.filter((u) => String(u.user) === String(userId)).length;
    if (usedByUser >= (coupon.perUserLimit || 1)) return { ok: false, reason: 'Coupon already used' };
    if (coupon.newUserOnly) {
      const priorOrders = await Order.countDocuments({ user: userId });
      if (priorOrders > 0) return { ok: false, reason: 'Coupon is for new customers only' };
    }
  } else if (coupon.newUserOnly) {
    // guests count as new — allowed
  }

  // Genre/book applicability: at least one line item must qualify.
  if (coupon.applicableGenres?.length || coupon.applicableBooks?.length) {
    const genres = new Set(coupon.applicableGenres || []);
    const books = new Set((coupon.applicableBooks || []).map(String));
    const qualifies = items.some((i) => genres.has(i.genre) || books.has(String(i.bookId)));
    if (!qualifies) return { ok: false, reason: 'Coupon does not apply to these items' };
  }

  if (coupon.type === 'free_shipping') return { ok: true, discount: 0, freeShipping: true, coupon };
  if (coupon.type === 'fixed') return { ok: true, discount: Math.min(coupon.value, subtotal), freeShipping: false, coupon };
  // percentage
  let discount = Math.floor((subtotal * coupon.value) / 100);
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  return { ok: true, discount, freeShipping: false, coupon };
}

/**
 * Server-authoritative pricing. Re-prices from the DB; never trusts
 * client-sent prices. Returns line snapshots, totals, and an `issues`
 * array (out-of-stock / unavailable / quantity problems).
 */
async function priceCart({ items = [], deliveryMethod = 'standard', couponCode, pointsUsed = 0, user = null }) {
  const issues = [];
  const ids = items.map((i) => i.bookId);
  const books = await Book.find({ _id: { $in: ids } }).select('+costPrice').lean();
  const byId = new Map(books.map((b) => [String(b._id), b]));

  const lineItems = [];
  let subtotal = 0;

  for (const { bookId, quantity } of items) {
    const b = byId.get(String(bookId));
    const qty = Math.max(1, Number(quantity) || 1);
    if (!b || !b.isActive) {
      issues.push({ bookId, code: 'UNAVAILABLE', message: 'Book is no longer available' });
      continue;
    }
    if (b.stockStatus === 'discontinued') {
      issues.push({ bookId, code: 'DISCONTINUED', message: `${b.title} is discontinued` });
      continue;
    }
    if (b.stock < qty) {
      issues.push({ bookId, code: 'INSUFFICIENT_STOCK', message: `Only ${b.stock} of ${b.title} left`, available: b.stock });
      continue;
    }
    subtotal += b.price * qty;
    lineItems.push({
      book: b._id,
      bookId: String(b._id),
      slug: b.slug,
      genre: b.genre,
      title: b.title,
      author: b.author,
      coverImage: b.coverImage?.secureUrl || '', // order/cart snapshot is a plain URL
      condition: b.condition,
      price: b.price,
      quantity: qty,
      lineTotal: b.price * qty,
    });
  }

  // Delivery
  const baseFee = DELIVERY_FEES[deliveryMethod] ?? DELIVERY_FEES.standard;
  let deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : baseFee;

  // Coupon
  let couponDiscount = 0;
  let appliedCoupon = null;
  let couponError = null;
  if (couponCode && subtotal > 0) {
    const result = await evaluateCoupon(couponCode, { subtotal, items: lineItems, userId: user?._id });
    if (result.ok) {
      appliedCoupon = result.coupon;
      if (result.freeShipping) deliveryFee = 0;
      else couponDiscount = result.discount;
    } else {
      couponError = result.reason;
    }
  }

  // Points redemption (logged-in only). Cannot exceed remaining payable.
  let pointsApplied = 0;
  if (user && pointsUsed > 0) {
    const maxRedeemable = Math.min(user.points || 0, Math.floor((subtotal - couponDiscount) / POINTS_REDEEM_VALUE));
    pointsApplied = Math.max(0, Math.min(Number(pointsUsed), maxRedeemable));
  }
  const pointsDiscount = pointsApplied * POINTS_REDEEM_VALUE;

  const total = Math.max(0, subtotal + deliveryFee - couponDiscount - pointsDiscount);
  const pointsEarned = user ? Math.floor(subtotal * POINTS_EARN_RATE) : 0;

  return {
    lineItems,
    subtotal,
    deliveryFee,
    deliveryMethod: DELIVERY_FEES[deliveryMethod] ? deliveryMethod : 'standard',
    couponCode: appliedCoupon?.code || null,
    couponDiscount,
    couponError,
    pointsUsed: pointsApplied,
    pointsDiscount,
    pointsEarned,
    total,
    issues,
    appliedCoupon,
  };
}

module.exports = { priceCart, evaluateCoupon, DELIVERY_FEES, FREE_DELIVERY_THRESHOLD, POINTS_EARN_RATE, POINTS_REDEEM_VALUE };
