'use strict';

const express = require('express');

const { authenticate, requireAdmin } = require('../middleware/auth');
const { ok } = require('../utils/apiResponse');
const { cacheDel } = require('../config/redis');
const { buildRails, shuffleRails, getShuffleState } = require('../services/homepageRails');

const router = express.Router();
router.use(authenticate, requireAdmin);

// Just enough for the admin to recognise the books in each rail.
const PREVIEW_FIELDS = 'slug title author coverImage';

async function snapshot(state) {
  const rails = await buildRails(PREVIEW_FIELDS, state.seed);
  return {
    shuffledAt: state.shuffledAt,
    shuffledBy: state.shuffledBy,
    rails: {
      bestsellers: rails.bestsellers,
      newArrivals: rails.newArrivals,
      featured: rails.featured,
    },
  };
}

// ── GET /api/admin/merchandising — current homepage rail order ──
router.get('/', async (_req, res, next) => {
  try {
    return ok(res, await snapshot(await getShuffleState()), 'Homepage rails');
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/admin/merchandising/shuffle — re-roll the homepage rails ──
// Stores a new seed and drops the API's cached rails so the very next request
// is built in the new order. The storefront's own data cache is expired
// separately by the admin page (a Next Server Action — see
// frontend/src/app/admin/(dash)/books/_actions/rails.ts).
router.post('/shuffle', async (req, res, next) => {
  try {
    const state = await shuffleRails(req.userId);
    await cacheDel('featured_books');
    req.log.info({ userId: req.userId }, 'Homepage rails shuffled');
    return ok(res, await snapshot(state), 'Homepage rails shuffled');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
