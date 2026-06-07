'use strict';

const mongoose = require('mongoose');

/**
 * Customer Q&A on a book ("Is this the Nepali or English edition?"). Answered
 * by staff; answered questions surface on the book page (great for SEO FAQPage).
 */
const questionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
    question: { type: String, required: true, trim: true, maxlength: 500 },
    answer: { type: String, trim: true, maxlength: 2000, default: null },
    answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    answeredAt: { type: Date, default: null },
    isAnswered: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

questionSchema.index({ book: 1, isAnswered: 1, createdAt: -1 });

module.exports = mongoose.models.Question || mongoose.model('Question', questionSchema);
