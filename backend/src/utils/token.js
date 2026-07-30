'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_EXPIRE = process.env.JWT_ACCESS_EXPIRE || '15m';

const DAY_MS = 24 * 60 * 60 * 1000;

// How long a login survives. Every /refresh rotates the token and re-stamps
// this window, so an active shopper is never signed out — the clock only runs
// while they stay away. Short access tokens (15m) are what make that safe: a
// leaked one dies in minutes, and a stolen refresh token is caught by the
// family replay check below.
//
// Admins get a much shorter window deliberately. A shopper session can place a
// COD order; an admin session can rewrite prices, delete books and read every
// customer's address, and it is usually the same laptop that gets left open.
const SHOPPER_REFRESH_DAYS = Number(process.env.JWT_REFRESH_DAYS) || 180;
const ADMIN_REFRESH_DAYS = Number(process.env.JWT_ADMIN_REFRESH_DAYS) || 7;

const refreshDays = (isAdmin) => (isAdmin ? ADMIN_REFRESH_DAYS : SHOPPER_REFRESH_DAYS);

// One source of truth for the window. This lifetime previously lived in three
// places — the JWT's own expiresIn (from env), the stored session's expiresAt,
// and the cookie's maxAge — with the latter two hardcoded to 7 days. Raising
// only the env var would have left the cookie and the DB record expiring on the
// old schedule, signing people out while the token itself was still valid.
const refreshTtlMs = (isAdmin) => refreshDays(isAdmin) * DAY_MS;

function signAccess(userId) {
  return jwt.sign({ userId, type: 'access' }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRE });
}

// A refresh token carries `fid` — the id of its rotation *family*, the chain of
// tokens descending from one login. Rotation keeps `fid` stable and changes only
// the token (via `nonce` + a fresh signature), so the server can recognise every
// member of a family by its stored hash and flag replay of a superseded token.
// The `nonce` guarantees each rotation yields a distinct token even within the
// same second (otherwise an identical payload would produce an identical JWT).
function signRefresh(userId, familyId, isAdmin = false) {
  return jwt.sign(
    { userId, type: 'refresh', fid: familyId, nonce: crypto.randomBytes(9).toString('base64url') },
    process.env.JWT_SECRET,
    { expiresIn: `${refreshDays(isAdmin)}d` }
  );
}

function generateTokens(userId, familyId, isAdmin = false) {
  return { accessToken: signAccess(userId), refreshToken: signRefresh(userId, familyId, isAdmin) };
}

function verify(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

const newFamilyId = () => crypto.randomUUID();

// We persist only a SHA-256 of each refresh token, never the token itself, so a
// database leak yields nothing replayable.
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// httpOnly cookie options for the refresh token.
// In production the frontend (Vercel) and API are on different domains, so the
// refresh cookie is sent cross-site — that requires SameSite=None, which the
// browser only accepts together with Secure. Locally we keep Strict (same-site,
// best CSRF posture).
const isProd = process.env.NODE_ENV === 'production';

// Attributes only — no maxAge. clearCookie() must be handed the same flags it
// was set with, and a stale lifetime here is what silently capped the session.
const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'strict',
  path: '/api/auth',
};

const refreshCookieFor = (isAdmin) => ({ ...refreshCookieOptions, maxAge: refreshTtlMs(isAdmin) });

module.exports = {
  generateTokens,
  signAccess,
  signRefresh,
  verify,
  refreshCookieOptions,
  refreshCookieFor,
  refreshTtlMs,
  refreshDays,
  newFamilyId,
  hashToken,
};
