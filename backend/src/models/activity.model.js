'use strict';

const mongoose = require('mongoose');

/**
 * Lightweight behavioural event log (Admin Wishlist Supplement §7).
 * Powers admin analytics: which books are most wishlisted, and which are
 * added to cart but never purchased (checkout-friction signal).
 */
const activitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['wishlist_add', 'cart_add', 'view', 'purchase'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    timestamp: { type: Date, default: Date.now },
    metadata: {
      quantity: { type: Number },
      source: { type: String }, // 'homepage' | 'genre_page' | 'search' | 'book_card' | ...
    },
  },
  { timestamps: true }
);

activitySchema.index({ book: 1, type: 1, timestamp: -1 });
activitySchema.index({ user: 1, timestamp: -1 });

module.exports = mongoose.models.Activity || mongoose.model('Activity', activitySchema);
