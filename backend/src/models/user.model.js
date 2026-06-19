'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const PROVINCES = ['Koshi', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim'];
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'];

// Referral codes: brand-prefixed, cryptographically random, no name leak.
// Alphabet excludes ambiguous chars (0/O/1/I/L) so codes are easy to read aloud.
// PT + 8 chars over a 31-symbol set ≈ 8.5×10^11 combinations — not guessable.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateReferralCode(len = 8) {
  let s = '';
  for (let i = 0; i < len; i += 1) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `PT${s}`;
}

const addressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address1: { type: String, required: true, trim: true },
    address2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    province: { type: String, required: true, enum: PROVINCES },
    label: { type: String, enum: ['Home', 'Office', 'Other'], default: 'Home' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    // Password is required for email/password accounts; Google sign-in users
    // have no password (they authenticate with Google).
    password: { type: String, required: [function requirePassword() { return !this.googleId; }, 'Password is required'], select: false },
    googleId: { type: String, unique: true, sparse: true, index: true }, // set for Google sign-in
    fullName: { type: String, required: true, trim: true },
    avatar: { type: String }, // Cloudinary URL
    avatarPublicId: { type: String },
    phone: { type: String, trim: true },

    addresses: [addressSchema],

    points: { type: Number, default: 65, min: 0 },
    pointsHistory: [
      {
        amount: { type: Number, required: true },
        reason: { type: String, required: true },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    tier: { type: String, enum: TIERS, default: 'Bronze' },

    referralCode: { type: String, unique: true, index: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    referralCount: { type: Number, default: 0 },
    // True once this user's first purchase has paid out the referrer's bonus, so
    // the referrer is rewarded exactly once "when their friend buys" (not at signup).
    referralRewarded: { type: Boolean, default: false },

    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    followedGenres: [{ type: String }],

    isEmailVerified: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },

    isBanned: { type: Boolean, default: false },
    banReason: { type: String },
    bannedAt: { type: Date },

    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // Active refresh-token rotation families — one per live login session.
    // Each entry stores only a SHA-256 hash of the family's *current* refresh
    // token; rotation overwrites `tokenHash` in place. select:false keeps these
    // off ordinary reads — load explicitly with `.select('+refreshTokens')` on
    // the routes that start or rotate a session.
    refreshTokens: {
      type: [
        {
          familyId: { type: String, required: true },
          tokenHash: { type: String, required: true },
          expiresAt: { type: Date, required: true },
          _id: false,
        },
      ],
      default: [],
      select: false,
    },

    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      orderUpdates: { type: Boolean, default: true },
      promotions: { type: Boolean, default: true },
    },

    lastLogin: { type: Date },
  },
  { timestamps: true }
);

// ── Hash password on change ──────────────────────────────
// Async hook: Mongoose 9 resolves via the returned promise — no `next`.
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// ── Auto referral code + tier from points ────────────────
userSchema.pre('save', async function deriveFields() {
  if (!this.referralCode) {
    // Generate until unique (collisions are astronomically unlikely, but the
    // unique index would otherwise reject the save — so guard against it).
    let code;
    do {
      code = generateReferralCode();
    } while (await this.constructor.exists({ referralCode: code }));
    this.referralCode = code;
  }
  if (this.points >= 5000) this.tier = 'Platinum';
  else if (this.points >= 1500) this.tier = 'Gold';
  else if (this.points >= 500) this.tier = 'Silver';
  else this.tier = 'Bronze';
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return Promise.resolve(false); // Google-only account, no password set
  return bcrypt.compare(candidate, this.password);
};

// ── Refresh-token session management ─────────────────────
// Cap concurrent sessions so the array can't grow without bound (e.g. a client
// that logs in repeatedly without logging out). Oldest families fall off first.
const MAX_SESSIONS = 10;

// Drop expired families. These routes always load refreshTokens via
// `.select('+refreshTokens')`; the guard only protects against a caller that
// forgot to — better an empty array than a thrown TypeError.
userSchema.methods.pruneRefreshTokens = function pruneRefreshTokens() {
  if (!Array.isArray(this.refreshTokens)) { this.refreshTokens = []; return; }
  const now = Date.now();
  this.refreshTokens = this.refreshTokens.filter((t) => t.expiresAt.getTime() > now);
};

// Begin a new login session: register a fresh family with its first token hash.
userSchema.methods.startRefreshSession = function startRefreshSession(familyId, tokenHash, expiresAt) {
  this.pruneRefreshTokens();
  this.refreshTokens.push({ familyId, tokenHash, expiresAt });
  if (this.refreshTokens.length > MAX_SESSIONS) {
    this.refreshTokens = this.refreshTokens.slice(-MAX_SESSIONS);
  }
};

// Rotate a family on /refresh. Returns:
//   'ok'      — hash matched the family's current token; rotated in place.
//   'reuse'   — a superseded token was replayed → the whole family is revoked.
//   'unknown' — no such family (already logged out, pruned/expired, or forged).
userSchema.methods.rotateRefreshSession = function rotateRefreshSession(familyId, presentedHash, nextHash, expiresAt) {
  this.pruneRefreshTokens();
  const family = this.refreshTokens.find((t) => t.familyId === familyId);
  if (!family) return 'unknown';
  if (family.tokenHash !== presentedHash) {
    // Replay of an old token from this family — treat the chain as compromised.
    this.refreshTokens = this.refreshTokens.filter((t) => t.familyId !== familyId);
    return 'reuse';
  }
  family.tokenHash = nextHash;
  family.expiresAt = expiresAt;
  return 'ok';
};

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    delete ret.refreshTokens;
    delete ret.__v;
    return ret;
  },
});

userSchema.statics.PROVINCES = PROVINCES;
userSchema.statics.TIERS = TIERS;

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
