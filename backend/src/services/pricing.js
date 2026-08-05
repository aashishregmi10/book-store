'use strict';

const Book = require('../models/book.model');
const Coupon = require('../models/coupon.model');
const Order = require('../models/order.model');

// Tunable commerce rules (Nepal store).
//
// Delivery is NOT priced here, on purpose. The logistics company bills the
// customer directly at its own rates, which vary by destination and parcel —
// the shop neither sets nor collects that money. Quoting a figure at checkout
// would therefore be a number we cannot honour, so the order total is the
// goods only and `deliveryFee` is always 0. Anything that used to advertise a
// flat fee or a free-delivery threshold has been removed alongside this.
const DELIVERY_METHODS = ['standard', 'express', 'same-day'];
const POINTS_EARN_RATE = 0.02; // 1 point per NPR 50 spent
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

  for (const { bookId, variantId, quantity } of items) {
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

    // Resolve the priced edition: a specific variant when the book has them,
    // else the single top-level edition (unchanged behaviour).
    const hasVariants = Array.isArray(b.variants) && b.variants.length > 0;
    let unitPrice = b.price;
    let available = b.stock;
    let format = b.specifications?.format;
    let resolvedVariantId;

    if (hasVariants) {
      const variant = variantId && b.variants.find((v) => String(v._id) === String(variantId));
      if (!variant) {
        issues.push({ bookId, code: 'FORMAT_REQUIRED', message: `Choose a format for ${b.title}` });
        continue;
      }
      unitPrice = variant.price;
      available = variant.stock;
      format = variant.format;
      resolvedVariantId = String(variant._id);
    }

    if (available < qty) {
      const label = format ? `${b.title} (${format})` : b.title;
      issues.push({ bookId, variantId: resolvedVariantId, code: 'INSUFFICIENT_STOCK', message: `Only ${available} of ${label} left`, available });
      continue;
    }

    subtotal += unitPrice * qty;
    lineItems.push({
      book: b._id,
      bookId: String(b._id),
      variantId: resolvedVariantId,
      format,
      slug: b.slug,
      genre: b.genre,
      title: b.title,
      author: b.author,
      coverImage: b.coverImage?.secureUrl || '', // order/cart snapshot is a plain URL
      condition: b.condition,
      price: unitPrice,
      quantity: qty,
      lineTotal: unitPrice * qty,
    });
  }

  // Delivery: never charged by us — see the note at the top of this file.
  const deliveryFee = 0;

  // Coupon
  let couponDiscount = 0;
  let appliedCoupon = null;
  let couponError = null;
  if (couponCode && subtotal > 0) {
    const result = await evaluateCoupon(couponCode, { subtotal, items: lineItems, userId: user?._id });
    if (result.ok) {
      appliedCoupon = result.coupon;
      // A `free_shipping` coupon has nothing left to discount now that
      // delivery isn't billed here; it applies cleanly as a zero discount
      // rather than erroring, so any coupon already in circulation still
      // redeems instead of failing at checkout.
      couponDiscount = result.discount;
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

  const total = Math.max(0, subtotal - couponDiscount - pointsDiscount);
  const pointsEarned = user ? Math.floor(subtotal * POINTS_EARN_RATE) : 0;

  return {
    lineItems,
    subtotal,
    // Kept in the payload (and on the order record) at 0 so historical orders
    // that DID carry a fee stay readable in the admin alongside new ones.
    deliveryFee,
    deliveryMethod: DELIVERY_METHODS.includes(deliveryMethod) ? deliveryMethod : 'standard',
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

module.exports = { priceCart, evaluateCoupon, DELIVERY_METHODS, POINTS_EARN_RATE, POINTS_REDEEM_VALUE };
