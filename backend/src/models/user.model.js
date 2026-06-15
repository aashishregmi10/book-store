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

    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    followedGenres: [{ type: String }],

    isEmailVerified: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },

    isBanned: { type: Boolean, default: false },
    banReason: { type: String },
    bannedAt: { type: Date },

    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

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

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    delete ret.__v;
    return ret;
  },
});

userSchema.statics.PROVINCES = PROVINCES;
userSchema.statics.TIERS = TIERS;

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
