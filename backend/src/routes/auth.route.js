'use strict';

const express = require('express');
const crypto = require('crypto');

const User = require('../models/user.model');
const { validate } = require('../middleware/validate');
const { authenticate, loginLimiter, registerLimiter, forgotPasswordLimiter } = require('../middleware/auth');
const { generateTokens, verify, refreshCookieOptions } = require('../utils/token');
const { z, trimmedString, email: emailSchema } = require('../utils/zod');
const { ok, created, fail, ApiError } = require('../utils/apiResponse');
const email = require('../utils/emailService');
const logger = require('../config/logger');

const router = express.Router();

// ── Validation schemas ──
const registerBody = z.object({
  email: emailSchema(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().trim().min(1, 'Full name is required'),
  referralCode: z.string().trim().optional(),
});
const credentialsBody = z.object({ email: emailSchema(), password: z.string().min(1) });
const profileBody = z.object({
  fullName: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional(),
  avatar: z.string().optional(),
  notificationPreferences: z.record(z.string(), z.unknown()).optional(),
});
const changePasswordBody = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });
const forgotBody = z.object({ email: emailSchema() });
const resetQuery = z.object({ token: z.string().min(1) });
const resetBody = z.object({ token: z.string().min(1), password: z.string().min(8) });

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const publicUser = (u) => ({
  id: u._id,
  email: u.email,
  fullName: u.fullName,
  points: u.points,
  tier: u.tier,
  isAdmin: u.isAdmin,
  referralCode: u.referralCode,
});

// ── REGISTER ─────────────────────────────────────────────
router.post(
  '/register',
  registerLimiter,
  validate({ body: registerBody }),
  async (req, res, next) => {
    try {
      const { email: emailAddr, password, fullName, referralCode } = req.body;
      if (await User.exists({ email: emailAddr })) {
        return fail(res, 'Email already registered', 409, [{ field: 'email', code: 'DUPLICATE' }]);
      }

      let referredBy = null;
      let signupPoints = 65;
      if (referralCode) {
        const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
        if (referrer) {
          referredBy = referrer._id;
          signupPoints += 50;
          referrer.referralCount += 1;
          referrer.points += 100;
          referrer.pointsHistory.push({ amount: 100, reason: 'Referral bonus' });
          await referrer.save();
        }
      }

      const user = await User.create({
        email: emailAddr,
        password,
        fullName,
        referredBy,
        points: signupPoints,
        pointsHistory: [{ amount: signupPoints, reason: 'Signup bonus' }],
      });

      const tokens = generateTokens(user._id);
      res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);
      email.sendWelcomeEmail(user).catch(() => {}); // fire-and-forget
      return created(res, { user: publicUser(user), accessToken: tokens.accessToken }, 'Account created');
    } catch (err) {
      return next(err);
    }
  }
);

// ── LOGIN ────────────────────────────────────────────────
router.post(
  '/login',
  loginLimiter,
  validate({ body: credentialsBody }),
  async (req, res, next) => {
    try {
      const user = await User.findOne({ email: req.body.email }).select('+password');
      if (!user || !(await user.comparePassword(req.body.password))) {
        return fail(res, 'Invalid credentials', 401, [{ code: 'INVALID_CREDENTIALS' }]);
      }
      if (user.isBanned) return fail(res, 'Account suspended. Contact support.', 403, [{ code: 'BANNED' }]);

      user.lastLogin = new Date();
      await user.save();

      const tokens = generateTokens(user._id);
      res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);
      return ok(res, { user: publicUser(user), accessToken: tokens.accessToken }, 'Logged in');
    } catch (err) {
      return next(err);
    }
  }
);

// ── ADMIN LOGIN ──────────────────────────────────────────
router.post(
  '/admin/login',
  loginLimiter,
  validate({ body: credentialsBody }),
  async (req, res, next) => {
    try {
      const user = await User.findOne({ email: req.body.email }).select('+password');
      if (!user || !(await user.comparePassword(req.body.password))) {
        return fail(res, 'Invalid credentials', 401, [{ code: 'INVALID_CREDENTIALS' }]);
      }
      if (!user.isAdmin) {
        return fail(res, 'Access denied — admin account required', 403, [{ code: 'NOT_ADMIN' }]);
      }
      if (user.isBanned) return fail(res, 'Account suspended. Contact support.', 403, [{ code: 'BANNED' }]);

      user.lastLogin = new Date();
      await user.save();

      const tokens = generateTokens(user._id);
      res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);
      return ok(res, { user: publicUser(user), accessToken: tokens.accessToken }, 'Admin logged in');
    } catch (err) {
      return next(err);
    }
  }
);

// ── REFRESH ──────────────────────────────────────────────
router.post('/refresh', (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return fail(res, 'No refresh token', 401, [{ code: 'NO_TOKEN' }]);
    const decoded = verify(token);
    if (decoded.type !== 'refresh') return fail(res, 'Invalid token', 403, [{ code: 'INVALID_TOKEN' }]);
    // Rotate: issue a fresh refresh token alongside the new access token, so a
    // leaked refresh token has a bounded lifetime instead of living the full 7d.
    const tokens = generateTokens(decoded.userId);
    res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);
    return ok(res, { accessToken: tokens.accessToken }, 'Token refreshed');
  } catch (err) {
    return next(err);
  }
});

// ── LOGOUT ───────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', { ...refreshCookieOptions, maxAge: undefined });
  return ok(res, null, 'Logged out');
});

// ── ME ───────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return fail(res, 'User not found', 404, [{ code: 'NOT_FOUND' }]);
    return ok(res, user.toJSON(), 'OK');
  } catch (err) {
    return next(err);
  }
});

// ── UPDATE PROFILE ───────────────────────────────────────
router.put(
  '/profile',
  authenticate,
  validate({ body: profileBody }),
  async (req, res, next) => {
    try {
      const allowed = ['fullName', 'phone', 'avatar', 'notificationPreferences'];
      const updates = {};
      for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
      const user = await User.findByIdAndUpdate(req.userId, updates, { returnDocument: 'after', runValidators: true });
      if (!user) return fail(res, 'User not found', 404, [{ code: 'NOT_FOUND' }]);
      return ok(res, user.toJSON(), 'Profile updated');
    } catch (err) {
      return next(err);
    }
  }
);

// ── CHANGE PASSWORD ──────────────────────────────────────
router.put(
  '/change-password',
  authenticate,
  validate({ body: changePasswordBody }),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.userId).select('+password');
      if (!user || !(await user.comparePassword(req.body.currentPassword))) {
        return fail(res, 'Current password is incorrect', 400, [{ field: 'currentPassword', code: 'INVALID' }]);
      }
      user.password = req.body.newPassword; // hashed by pre-save hook
      await user.save();
      return ok(res, null, 'Password changed');
    } catch (err) {
      return next(err);
    }
  }
);

// ── FORGOT PASSWORD (no email enumeration) ───────────────
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate({ body: forgotBody }),
  async (req, res, next) => {
    try {
      const user = await User.findOne({ email: req.body.email });
      if (user) {
        const raw = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = hashToken(raw);
        user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await user.save();
        email.sendPasswordReset(user, raw).catch((e) => logger.warn({ err: e.message }, 'reset email failed'));
      }
      // Identical response whether or not the email exists.
      return ok(res, null, 'If that email exists, a reset link has been sent.');
    } catch (err) {
      return next(err);
    }
  }
);

// ── VERIFY RESET TOKEN ───────────────────────────────────
router.get(
  '/verify-reset-token',
  validate({ query: resetQuery }),
  async (req, res, next) => {
    try {
      const user = await User.findOne({
        resetPasswordToken: hashToken(req.query.token),
        resetPasswordExpires: { $gt: new Date() },
      }).select('+resetPasswordToken +resetPasswordExpires');
      if (!user) return fail(res, 'Invalid or expired token', 400, [{ code: 'INVALID_TOKEN' }]);
      return ok(res, { valid: true }, 'Token valid');
    } catch (err) {
      return next(err);
    }
  }
);

// ── RESET PASSWORD ───────────────────────────────────────
router.post(
  '/reset-password',
  validate({ body: resetBody }),
  async (req, res, next) => {
    try {
      const user = await User.findOne({
        resetPasswordToken: hashToken(req.body.token),
        resetPasswordExpires: { $gt: new Date() },
      }).select('+resetPasswordToken +resetPasswordExpires +password');
      if (!user) return fail(res, 'Invalid or expired token', 400, [{ code: 'INVALID_TOKEN' }]);

      user.password = req.body.password; // hashed by pre-save hook
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      return ok(res, null, 'Password reset. You can now log in.');
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
