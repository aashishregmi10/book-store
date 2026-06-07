'use strict';

const mongoose = require('mongoose');

/**
 * An immutable ledger entry for the loyalty-points system. One row per points
 * movement (earn on purchase, redeem at checkout, referral bonus, expiry). The
 * User's running `points` balance is the sum of these; keep both in sync.
 */
const pointsTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['earned', 'redeemed', 'bonus', 'expired', 'referral'], required: true },
    points: { type: Number, required: true },
    description: { type: String, required: true },
    source: { type: String, enum: ['purchase', 'referral', 'tier_upgrade', 'manual', 'redemption'], required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    referredUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    expiresAt: { type: Date, default: null },
    isExpired: { type: Boolean, default: false },
  },
  { timestamps: true }
);

pointsTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.PointsTransaction || mongoose.model('PointsTransaction', pointsTransactionSchema);
