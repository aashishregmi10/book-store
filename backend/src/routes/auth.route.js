'use strict';

const express = require('express');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const User = require('../models/user.model');
const { validate } = require('../middleware/validate');
const { authenticate, loginLimiter, registerLimiter, forgotPasswordLimiter } = require('../middleware/auth');
const { generateTokens, verify, refreshCookieOptions, newFamilyId, hashToken, REFRESH_TTL_MS } = require('../utils/token');
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
const googleBody = z.object({ credential: z.string().min(1) });

// Verifies Google ID tokens (the "credential" from the Sign in with Google button).
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Starts a new login session: mint an access + refresh pair in a fresh rotation
// family, persist the refresh hash on the user, and set the refresh cookie.
// Returns the access token to hand back in the JSON body.
async function issueSession(res, user) {
  const familyId = newFamilyId();
  const { accessToken, refreshToken } = generateTokens(user._id, familyId);
  user.startRefreshSession(familyId, hashToken(refreshToken), new Date(Date.now() + REFRESH_TTL_MS));
  await user.save();
  res.cookie('refreshToken', refreshToken, refreshCookieOptions);
  return accessToken;
}

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

      const accessToken = await issueSession(res, user);
      email.sendWelcomeEmail(user).catch(() => {}); // fire-and-forget
      return created(res, { user: publicUser(user), accessToken }, 'Account created');
    } catch (err) {
      return next(err);
    }
  }
);

// ── GOOGLE SIGN-IN ───────────────────────────────────────
// Frontend sends the ID token (credential) from the Google button; we verify it
// with Google, then find-or-create the user and issue our own tokens.
router.post('/google', loginLimiter, validate({ body: googleBody }), async (req, res, next) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return fail(res, 'Google sign-in is not configured', 503, [{ code: 'OAUTH_DISABLED' }]);
    }
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: process.env.GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return fail(res, 'Invalid Google sign-in', 401, [{ code: 'INVALID_GOOGLE_TOKEN' }]);
    }
    if (!payload?.email || !payload.email_verified) {
      return fail(res, 'Your Google email is not verified', 401, [{ code: 'EMAIL_UNVERIFIED' }]);
    }

    const emailAddr = payload.email.toLowerCase();
    const googleId = payload.sub;

    let user = await User.findOne({ $or: [{ googleId }, { email: emailAddr }] }).select('+password +refreshTokens');
    if (user) {
      if (user.isBanned) return fail(res, 'Account suspended. Contact support.', 403, [{ code: 'BANNED' }]);
      if (!user.googleId) user.googleId = googleId; // link an existing email/password account
    } else {
      user = new User({
        email: emailAddr,
        googleId,
        fullName: payload.name || emailAddr.split('@')[0],
        avatar: payload.picture,
        points: 65,
        pointsHistory: [{ amount: 65, reason: 'Signup bonus' }],
      });
      email.sendWelcomeEmail(user).catch(() => {});
    }
    user.lastLogin = new Date();
    const accessToken = await issueSession(res, user); // persists lastLogin + the new session
    return ok(res, { user: publicUser(user), accessToken }, 'Logged in with Google');
  } catch (err) {
    return next(err);
  }
});

// ── LOGIN ────────────────────────────────────────────────
router.post(
  '/login',
  loginLimiter,
  validate({ body: credentialsBody }),
  async (req, res, next) => {
    try {
      const user = await User.findOne({ email: req.body.email }).select('+password +refreshTokens');
      if (!user || !(await user.comparePassword(req.body.password))) {
        return fail(res, 'Invalid credentials', 401, [{ code: 'INVALID_CREDENTIALS' }]);
      }
      if (user.isBanned) return fail(res, 'Account suspended. Contact support.', 403, [{ code: 'BANNED' }]);

      user.lastLogin = new Date();
      const accessToken = await issueSession(res, user); // persists lastLogin + the new session
      return ok(res, { user: publicUser(user), accessToken }, 'Logged in');
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
      const user = await User.findOne({ email: req.body.email }).select('+password +refreshTokens');
      if (!user || !(await user.comparePassword(req.body.password))) {
        return fail(res, 'Invalid credentials', 401, [{ code: 'INVALID_CREDENTIALS' }]);
      }
      if (!user.isAdmin) {
        return fail(res, 'Access denied — admin account required', 403, [{ code: 'NOT_ADMIN' }]);
      }
      if (user.isBanned) return fail(res, 'Account suspended. Contact support.', 403, [{ code: 'BANNED' }]);

      user.lastLogin = new Date();
      const accessToken = await issueSession(res, user); // persists lastLogin + the new session
      return ok(res, { user: publicUser(user), accessToken }, 'Admin logged in');
    } catch (err) {
      return next(err);
    }
  }
);

// ── REFRESH ──────────────────────────────────────────────
// Stateful rotation with reuse detection. The presented refresh token must hash
// to the family's *current* stored hash; if it doesn't (an old, already-rotated
// token was replayed) the whole family is revoked and the caller must sign in
// again. On success the family's hash is advanced and a new cookie is set.
const clearRefreshCookie = (res) => res.clearCookie('refreshToken', { ...refreshCookieOptions, maxAge: undefined });

router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return fail(res, 'No refresh token', 401, [{ code: 'NO_TOKEN' }]);

    let decoded;
    try {
      decoded = verify(token);
    } catch {
      clearRefreshCookie(res);
      return fail(res, 'Invalid token', 401, [{ code: 'INVALID_TOKEN' }]);
    }
    if (decoded.type !== 'refresh' || !decoded.fid) {
      return fail(res, 'Invalid token', 403, [{ code: 'INVALID_TOKEN' }]);
    }

    const user = await User.findById(decoded.userId).select('+refreshTokens');
    if (!user) {
      clearRefreshCookie(res);
      return fail(res, 'Invalid token', 401, [{ code: 'INVALID_TOKEN' }]);
    }
    if (user.isBanned) {
      clearRefreshCookie(res);
      return fail(res, 'Account suspended. Contact support.', 403, [{ code: 'BANNED' }]);
    }

    const rotated = generateTokens(user._id, decoded.fid);
    const result = user.rotateRefreshSession(
      decoded.fid,
      hashToken(token),
      hashToken(rotated.refreshToken),
      new Date(Date.now() + REFRESH_TTL_MS)
    );

    if (result === 'reuse') {
      await user.save();
      clearRefreshCookie(res);
      logger.warn({ userId: String(user._id), fid: decoded.fid }, 'refresh token reuse detected — family revoked');
      return fail(res, 'Session revoked — please sign in again', 401, [{ code: 'TOKEN_REUSE' }]);
    }
    if (result === 'unknown') {
      // Family already gone: logged out, expired/pruned, or a forged fid.
      clearRefreshCookie(res);
      return fail(res, 'Session expired — please sign in again', 401, [{ code: 'SESSION_EXPIRED' }]);
    }

    await user.save();
    res.cookie('refreshToken', rotated.refreshToken, refreshCookieOptions);
    return ok(res, { accessToken: rotated.accessToken }, 'Token refreshed');
  } catch (err) {
    return next(err);
  }
});

// ── LOGOUT ───────────────────────────────────────────────
// Revoke the server-side session for this token's family, then clear the cookie.
// Best-effort: an expired/invalid cookie has nothing to revoke — we still clear it.
router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      try {
        const decoded = verify(token);
        if (decoded.type === 'refresh' && decoded.fid) {
          await User.updateOne({ _id: decoded.userId }, { $pull: { refreshTokens: { familyId: decoded.fid } } });
        }
      } catch {
        /* expired/invalid token — nothing to revoke */
      }
    }
    clearRefreshCookie(res);
    return ok(res, null, 'Logged out');
  } catch (err) {
    return next(err);
  }
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
