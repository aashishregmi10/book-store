'use strict';

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // links to the purchase
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 100, trim: true },
    body: { type: String, required: true, maxlength: 2000 },

    isVerifiedPurchase: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false }, // held for admin moderation
    helpfulCount: { type: Number, default: 0 },
    helpfulBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // prevents double votes

    adminReply: { type: String },
  },
  { timestamps: true }
);

// One review per user per book.
reviewSchema.index({ book: 1, user: 1 }, { unique: true });
// Fast public listing of approved reviews for a book.
reviewSchema.index({ book: 1, isApproved: 1, createdAt: -1 });

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);
