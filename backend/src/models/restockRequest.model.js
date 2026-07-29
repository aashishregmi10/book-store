'use strict';

const mongoose = require('mongoose');

/**
 * A customer asking to be told when a sold-out title is back.
 *
 * Distinct from inventoryAlert.model.js, which is an *internal* signal about
 * stock levels (low_stock / reorder_needed) aimed at the shop. This is demand
 * coming the other way: it tells the shop which out-of-stock titles people
 * actually want reordered, which matters here because every title is stocked
 * two copies deep and sells out quickly.
 */
const restockRequestSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    bookTitle: { type: String, required: true }, // snapshot — survives a book rename/delete
    bookSlug: { type: String, required: true },

    // Signed-in requests carry the user; guests leave only an email. Either
    // way `email` is what a restock notification would actually be sent to.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, required: true, lowercase: true, trim: true },

    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One open request per person per book — clicking the button twice shouldn't
// inflate the demand signal the shop reorders from.
restockRequestSchema.index({ book: 1, email: 1 }, { unique: true });

// "Which sold-out titles are most wanted" — the query the shop actually runs.
restockRequestSchema.index({ notifiedAt: 1, createdAt: -1 });

module.exports =
  mongoose.models.RestockRequest || mongoose.model('RestockRequest', restockRequestSchema);
