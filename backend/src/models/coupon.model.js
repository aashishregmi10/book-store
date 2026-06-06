'use strict';

const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    description: { type: String },
    type: { type: String, enum: ['percentage', 'fixed', 'free_shipping'], required: true },
    value: { type: Number, required: true, min: 0 }, // % for percentage, NPR for fixed, 0 for free_shipping
    minOrderAmount: { type: Number, default: 0 },
    maxDiscount: { type: Number }, // cap for percentage coupons

    usageLimit: { type: Number }, // total redemptions allowed (null = unlimited)
    usageCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1 },

    startDate: { type: Date },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true },

    applicableGenres: [{ type: String }],
    applicableBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    newUserOnly: { type: Boolean, default: false },
    isStackable: { type: Boolean, default: false },

    usedBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
        order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
