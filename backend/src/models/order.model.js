'use strict';

const mongoose = require('mongoose');
const { nextSequence } = require('./counter.model');

const PAYMENT_METHODS = ['cod', 'esewa', 'khalti', 'fonepay', 'connectips', 'card'];
const PAYMENT_STATUS = ['pending', 'paid', 'failed', 'refunded', 'partial'];
const ORDER_STATUS = ['placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'returned'];

const orderItemSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId }, // which format variant, if any
    format: { type: String }, // snapshot of the variant format (e.g. 'Hardcover')
    title: { type: String, required: true }, // snapshot at purchase
    author: { type: String, required: true },
    coverImage: { type: String },
    condition: { type: String, enum: ['new', 'used'], default: 'new' },
    price: { type: Number, required: true }, // snapshot
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for guest checkout
    isGuest: { type: Boolean, default: false },

    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },

    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    couponCode: { type: String },
    couponDiscount: { type: Number, default: 0 },
    pointsUsed: { type: Number, default: 0 },
    pointsEarned: { type: Number, default: 0 },
    total: { type: Number, required: true },

    deliveryAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      address1: { type: String, required: true },
      address2: { type: String },
      city: { type: String, required: true },
      province: { type: String, required: true },
    },
    deliveryMethod: { type: String, enum: ['standard', 'express', 'same-day'], default: 'standard' },

    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cod' },
    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: 'pending' },

    status: { type: String, enum: ORDER_STATUS, default: 'placed', index: true },
    statusHistory: [
      {
        status: { type: String },
        note: { type: String },
        timestamp: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],

    trackingNumber: { type: String },
    estimatedDelivery: { type: Date },
    deliveredAt: { type: Date },

    returnRequest: {
      requestedAt: { type: Date },
      reason: { type: String },
      status: { type: String, enum: ['requested', 'approved', 'rejected', 'completed'] },
      refundAmount: { type: Number },
    },

    cancellationReason: { type: String },
    customerNote: { type: String },
    adminNote: { type: String },
  },
  { timestamps: true }
);

// "My orders" lists a user's orders newest-first — index the exact shape so it
// uses an IXSCAN instead of a collection scan + in-memory sort.
orderSchema.index({ user: 1, createdAt: -1 });

// Generate PT-YYYYMMDD-XXXXX from an atomic per-day counter (collision-free).
// Async hook: Mongoose 9 resolves via the returned promise — no `next`.
orderSchema.pre('validate', async function genOrderNumber() {
  if (this.orderNumber) return;
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const seq = await nextSequence(`order-${ymd}`);
  this.orderNumber = `PT-${ymd}-${String(seq).padStart(5, '0')}`;
});

orderSchema.statics.PAYMENT_METHODS = PAYMENT_METHODS;
orderSchema.statics.ORDER_STATUS = ORDER_STATUS;

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
