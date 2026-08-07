'use strict';

const rateLimit = require('express-rate-limit');
const { verify } = require('../utils/token');
const { ApiError } = require('../utils/apiResponse');
const User = require('../models/user.model');

function getBearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * Require a valid access token. Sets req.userId.
 * jwt errors are forwarded to the central error handler, which maps
 * them to TOKEN_EXPIRED / INVALID_TOKEN (403).
 */
function authenticate(req, _res, next) {
  const token = getBearer(req);
  if (!token) return next(new ApiError('Access denied: no token', 401, 'NO_TOKEN'));
  try {
    const decoded = verify(token);
    // Access tokens only. Both kinds are signed with the same secret, so
    // without this check a refresh token works as a bearer credential — and a
    // refresh token lives for 180 days and bypasses the rotation/reuse
    // detection that is the whole point of keeping it in an httpOnly cookie.
    // /auth/refresh makes the mirror-image check; this is the missing half.
    if (decoded.type !== 'access') {
      return next(new ApiError('Invalid token', 401, 'INVALID_TOKEN'));
    }
    req.userId = decoded.userId;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Like authenticate, but anonymous requests pass through (req.userId stays undefined). */
function optionalAuth(req, _res, next) {
  const token = getBearer(req);
  if (!token) return next();
  try {
    const decoded = verify(token);
    if (decoded.type === 'access') req.userId = decoded.userId; // see authenticate
  } catch {
    /* ignore invalid token for optional routes */
  }
  return next();
}

/** Require an authenticated, non-banned admin. Loads the user fresh so bans/role changes take effect immediately. */
async function requireAdmin(req, _res, next) {
  try {
    if (!req.userId) return next(new ApiError('Access denied', 401, 'NO_TOKEN'));
    const user = await User.findById(req.userId).select('isAdmin isBanned');
    if (!user || !user.isAdmin) return next(new ApiError('Admin access required', 403, 'ADMIN_REQUIRED'));
    if (user.isBanned) return next(new ApiError('Account suspended', 403, 'BANNED'));
    return next();
  } catch (err) {
    return next(err);
  }
}

// ── Rate limiters (Master Guide §9.2) ────────────────────
const makeLimiter = (windowMs, max, code) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV !== 'production',
    message: { message: 'Too many requests, please try again later.', errors: [{ code }] },
  });

const loginLimiter = makeLimiter(15 * 60 * 1000, 10, 'RATE_LIMITED');
const registerLimiter = makeLimiter(60 * 60 * 1000, 5, 'RATE_LIMITED'); // account creation: stricter
const forgotPasswordLimiter = makeLimiter(15 * 60 * 1000, 5, 'RATE_LIMITED');

module.exports = {
  authenticate,
  optionalAuth,
  requireAdmin,
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
};
