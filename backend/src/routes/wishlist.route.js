'use strict';

const express = require('express');

const User = require('../models/user.model');
const Book = require('../models/book.model');
const Activity = require('../models/activity.model');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z, objectId } = require('../utils/zod');
const { ok, fail } = require('../utils/apiResponse');

const router = express.Router();

const WISHLIST_FIELDS = 'slug title author price comparePrice coverImage avgRating reviewCount stockStatus genre';

const addWishlistBody = z.object({ bookId: objectId(), source: z.string().optional() });
const bookIdParams = z.object({ bookId: objectId() });

// ── GET /api/wishlist — current user's saved books ───────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'wishlist',
      select: WISHLIST_FIELDS,
      match: { isActive: true },
    });
    // filter(Boolean) drops any refs whose book was deleted/deactivated.
    return ok(res, (user?.wishlist || []).filter(Boolean), 'Wishlist');
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/wishlist — add (idempotent via $addToSet) ──
router.post('/', authenticate, validate({ body: addWishlistBody }), async (req, res, next) => {
  try {
    const exists = await Book.exists({ _id: req.body.bookId, isActive: true });
    if (!exists) return fail(res, 'Book not found', 404, [{ code: 'NOT_FOUND' }]);

    // Was it already saved? (Decides whether to log the behavioural event.)
    const already = await User.exists({ _id: req.userId, wishlist: req.body.bookId });
    await User.updateOne({ _id: req.userId }, { $addToSet: { wishlist: req.body.bookId } });

    if (!already) {
      Activity.create({ type: 'wishlist_add', user: req.userId, book: req.body.bookId, metadata: { source: req.body.source || 'unknown' } }).catch(() => {});
    }
    return ok(res, { added: true }, 'Added to wishlist');
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /api/wishlist/:bookId ─────────────────────────
router.delete('/:bookId', authenticate, validate({ params: bookIdParams }), async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.userId }, { $pull: { wishlist: req.params.bookId } });
    return ok(res, { removed: true }, 'Removed from wishlist');
  } catch (err) {
    return next(err);
  }
});

// ── GET /api/wishlist/check/:bookId — heart state ────────
router.get('/check/:bookId', optionalAuth, validate({ params: bookIdParams }), async (req, res, next) => {
  try {
    if (!req.userId) return ok(res, { isWishlisted: false }, 'Guest');
    const user = await User.findById(req.userId).select('wishlist');
    const isWishlisted = (user?.wishlist || []).some((id) => String(id) === req.params.bookId);
    return ok(res, { isWishlisted }, 'Checked');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
