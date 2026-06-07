'use strict';

const mongoose = require('mongoose');
const imageSchema = require('./image.schema');

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    type: {
      type: String,
      required: true,
      enum: [
        'order_update',      // Order status changed
        'payment',           // Payment success / failed
        'referral',          // Referral points earned
        'tier_upgrade',      // Bronze → Silver → Gold → Platinum
        'promotion',         // Site-wide sales / discounts
        'new_arrival',       // New title added
        'review',            // Review liked / replied
        'question_answered', // A book Q&A got an answer
        'points',            // Points earned / redeemed
        'delivery',          // Out for delivery / delivered
        'system',            // Maintenance, policy updates
      ],
      index: true,
    },

    // ── Targeting ──────────────────────────────────────────
    intendedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // When true the notification goes to everyone; intendedUsers may stay empty.
    isBroadcast: { type: Boolean, default: false, index: true },

    // ── Read tracking ──────────────────────────────────────
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // ── Deep linking (so the app can route on tap) ─────────
    link: { type: String, trim: true, default: '' },
    relatedEntity: {
      model: {
        type: String,
        enum: ['Order', 'Book', 'Review', 'Question', 'PointsTransaction', 'User'],
      },
      id: { type: mongoose.Schema.Types.ObjectId },
    },

    // ── Optional image (promo banners, book covers) ────────
    image: imageSchema,

    // ── Metadata ───────────────────────────────────────────
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ── Indexes for fast queries ─────────────────────────────
notificationSchema.index({ intendedUsers: 1, createdAt: -1 });
notificationSchema.index({ isBroadcast: 1, createdAt: -1 });
notificationSchema.index({ readBy: 1 });
notificationSchema.index({ isActive: 1, expiresAt: 1 });
notificationSchema.index({ 'relatedEntity.id': 1, 'relatedEntity.model': 1 });

// ── Instance methods ─────────────────────────────────────
// Mark this notification read by a specific user (idempotent).
notificationSchema.methods.markAsRead = async function markAsRead(userId) {
  const uid = userId.toString();
  if (!this.readBy.some((id) => id.toString() === uid)) {
    this.readBy.push(userId);
    await this.save();
  }
  return this;
};

// Has this notification been read by a specific user?
notificationSchema.methods.isReadBy = function isReadBy(userId) {
  const uid = userId.toString();
  return this.readBy.some((id) => id.toString() === uid);
};

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
