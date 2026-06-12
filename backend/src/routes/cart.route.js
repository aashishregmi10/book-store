'use strict';

const express = require('express');

const User = require('../models/user.model');
const { optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z, objectId } = require('../utils/zod');
const { priceCart } = require('../services/pricing');
const { ok } = require('../utils/apiResponse');

const router = express.Router();

const cartItem = z.object({
  bookId: objectId(),
  variantId: objectId().optional(),
  quantity: z.coerce.number().int().min(1).optional(),
});
const validateCartBody = z.object({
  items: z.array(cartItem),
  deliveryMethod: z.enum(['standard', 'express', 'same-day']).optional(),
  couponCode: z.string().trim().optional(),
  pointsUsed: z.coerce.number().int().min(0).optional(),
});

/**
 * POST /api/cart/validate
 * The cart itself lives client-side (Zustand). This endpoint is the
 * server-authoritative pricing + stock check used by the cart drawer
 * and the checkout summary. Never trusts client prices.
 */
router.post(
  '/validate',
  optionalAuth,
  validate({ body: validateCartBody }),
  async (req, res, next) => {
    try {
      const user = req.userId ? await User.findById(req.userId).select('points') : null;
      const priced = await priceCart({
        items: req.body.items || [],
        deliveryMethod: req.body.deliveryMethod,
        couponCode: req.body.couponCode,
        pointsUsed: req.body.pointsUsed || 0,
        user,
      });
      // Strip the internal coupon doc before responding.
      const { appliedCoupon, ...payload } = priced;
      return ok(res, payload, payload.issues.length ? 'Cart has issues' : 'Cart priced');
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
