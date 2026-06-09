'use strict';

const jwt = require('jsonwebtoken');

const ACCESS_EXPIRE = process.env.JWT_ACCESS_EXPIRE || '15m';
const REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';

function signAccess(userId) {
  return jwt.sign({ userId, type: 'access' }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRE });
}

function signRefresh(userId) {
  return jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: REFRESH_EXPIRE });
}

function generateTokens(userId) {
  return { accessToken: signAccess(userId), refreshToken: signRefresh(userId) };
}

function verify(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

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

module.exports = { generateTokens, signAccess, signRefresh, verify, refreshCookieOptions };
