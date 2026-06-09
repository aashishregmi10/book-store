'use strict';

const express = require('express');
const { body } = require('express-validator');

const User = require('../models/user.model');
const { optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { priceCart } = require('../services/pricing');
const { ok } = require('../utils/apiResponse');

const router = express.Router();

/**
 * POST /api/cart/validate
 * The cart itself lives client-side (Zustand). This endpoint is the
 * server-authoritative pricing + stock check used by the cart drawer
 * and the checkout summary. Never trusts client prices.
 */
router.post(
  '/validate',
  optionalAuth,
  [
    body('items').isArray({ min: 0 }),
    body('items.*.bookId').isMongoId(),
    body('items.*.variantId').optional().isMongoId(),
    body('items.*.quantity').optional().toInt().isInt({ min: 1 }),
    body('deliveryMethod').optional().isIn(['standard', 'express', 'same-day']),
    body('couponCode').optional().trim(),
    body('pointsUsed').optional().toInt().isInt({ min: 0 }),
  ],
  validate,
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
