'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_EXPIRE = process.env.JWT_ACCESS_EXPIRE || '15m';
const REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signAccess(userId) {
  return jwt.sign({ userId, type: 'access' }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRE });
}

// A refresh token carries `fid` — the id of its rotation *family*, the chain of
// tokens descending from one login. Rotation keeps `fid` stable and changes only
// the token (via `nonce` + a fresh signature), so the server can recognise every
// member of a family by its stored hash and flag replay of a superseded token.
// The `nonce` guarantees each rotation yields a distinct token even within the
// same second (otherwise an identical payload would produce an identical JWT).
function signRefresh(userId, familyId) {
  return jwt.sign(
    { userId, type: 'refresh', fid: familyId, nonce: crypto.randomBytes(9).toString('base64url') },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_EXPIRE }
  );
}

function generateTokens(userId, familyId) {
  return { accessToken: signAccess(userId), refreshToken: signRefresh(userId, familyId) };
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
const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth',
};

module.exports = {
  generateTokens,
  signAccess,
  signRefresh,
  verify,
  refreshCookieOptions,
  newFamilyId,
  hashToken,
  REFRESH_TTL_MS,
};
