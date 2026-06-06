'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const PROVINCES = ['Koshi', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim'];
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum'];

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
    password: { type: String, required: true, select: false },
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
userSchema.pre('save', function deriveFields() {
  if (!this.referralCode) {
    const base = (this.fullName || 'USER').replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase() || 'USER';
    this.referralCode = `${base}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  }
  if (this.points >= 5000) this.tier = 'Platinum';
  else if (this.points >= 1500) this.tier = 'Gold';
  else if (this.points >= 500) this.tier = 'Silver';
  else this.tier = 'Bronze';
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
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
