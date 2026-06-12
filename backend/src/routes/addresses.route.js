'use strict';

const express = require('express');

const User = require('../models/user.model');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z, objectId, trimmedString } = require('../utils/zod');
const { ok, created, fail } = require('../utils/apiResponse');

const router = express.Router();
router.use(authenticate);

const addressBody = z.object({
  fullName: trimmedString(),
  phone: trimmedString(),
  address1: trimmedString(),
  city: trimmedString(),
  province: z.enum(User.PROVINCES),
  label: z.enum(['Home', 'Office', 'Other']).optional(),
});
const addressParams = z.object({ addressId: objectId() });

// ── GET /api/addresses ───────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('addresses');
    return ok(res, user?.addresses || [], 'Addresses');
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/addresses ──────────────────────────────────
router.post('/', validate({ body: addressBody }), async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('addresses');
    if (!user) return fail(res, 'User not found', 404, [{ code: 'NOT_FOUND' }]);

    const makeDefault = req.body.isDefault === true || user.addresses.length === 0;
    if (makeDefault) user.addresses.forEach((a) => { a.isDefault = false; });
    user.addresses.push({ ...req.body, isDefault: makeDefault });
    await user.save();
    return created(res, user.addresses, 'Address added');
  } catch (err) {
    return next(err);
  }
});

// ── PUT /api/addresses/:addressId ────────────────────────
router.put('/:addressId', validate({ params: addressParams, body: addressBody.partial() }), async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('addresses');
    const addr = user?.addresses.id(req.params.addressId);
    if (!addr) return fail(res, 'Address not found', 404, [{ code: 'NOT_FOUND' }]);

    for (const k of ['fullName', 'phone', 'address1', 'address2', 'city', 'province', 'label']) {
      if (k in req.body) addr[k] = req.body[k];
    }
    if (req.body.isDefault === true) {
      user.addresses.forEach((a) => { a.isDefault = false; });
      addr.isDefault = true;
    }
    await user.save();
    return ok(res, user.addresses, 'Address updated');
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /api/addresses/:addressId ─────────────────────
router.delete('/:addressId', validate({ params: addressParams }), async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('addresses');
    const addr = user?.addresses.id(req.params.addressId);
    if (!addr) return fail(res, 'Address not found', 404, [{ code: 'NOT_FOUND' }]);

    const wasDefault = addr.isDefault;
    addr.deleteOne();
    // Promote the first remaining address to default if we removed the default.
    if (wasDefault && user.addresses.length > 0) user.addresses[0].isDefault = true;
    await user.save();
    return ok(res, user.addresses, 'Address removed');
  } catch (err) {
    return next(err);
  }
});

// ── PUT /api/addresses/:addressId/default ────────────────
router.put('/:addressId/default', validate({ params: addressParams }), async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('addresses');
    const addr = user?.addresses.id(req.params.addressId);
    if (!addr) return fail(res, 'Address not found', 404, [{ code: 'NOT_FOUND' }]);
    user.addresses.forEach((a) => { a.isDefault = false; });
    addr.isDefault = true;
    await user.save();
    return ok(res, user.addresses, 'Default address set');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
