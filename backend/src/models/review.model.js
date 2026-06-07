'use strict';

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null }, // links to the purchase
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 100, trim: true },
    // Stored as `body`; readable/writable as `comment` too (alias) for newer code.
    body: { type: String, required: true, maxlength: 2000, trim: true, alias: 'comment' },

    // Stored as `isVerifiedPurchase`; also exposed as `verifiedPurchase` (alias).
    isVerifiedPurchase: { type: Boolean, default: false, alias: 'verifiedPurchase' },
    isApproved: { type: Boolean, default: false }, // held for admin moderation
    isActive: { type: Boolean, default: true },

    // "Helpful" votes — legacy counter + the richer likes ledger.
    helpfulCount: { type: Number, default: 0 },
    helpfulBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // prevents double votes
    likes: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    adminReply: { type: String },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One review per user per book.
reviewSchema.index({ book: 1, user: 1 }, { unique: true });
// Fast public listing of approved reviews for a book.
reviewSchema.index({ book: 1, isApproved: 1, createdAt: -1 });

/**
 * Recalculate a book's avgRating + reviewCount from its approved reviews and
 * persist them on the Book. Call after approving/deleting a review.
 */
reviewSchema.statics.calculateAverageRating = async function calculateAverageRating(bookId) {
  const [stats] = await this.aggregate([
    { $match: { book: new mongoose.Types.ObjectId(bookId), isApproved: true } },
    { $group: { _id: '$book', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const result = { avgRating: stats?.avg || 0, reviewCount: stats?.count || 0 };
  await mongoose.model('Book').findByIdAndUpdate(bookId, result);
  return result;
};

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);
