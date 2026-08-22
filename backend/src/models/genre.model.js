'use strict';

const mongoose = require('mongoose');

/**
 * Genre = silo category page (SEO Guide §1). The metaTitle/metaDesc drive
 * <generateMetadata>, and curatorNote powers the E-E-A-T "curated by" copy.
 */
const genreSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String }, // BLUF intro for the genre page
    curatorNote: { type: String },
    icon: { type: String },
    color: { type: String, default: '#1D76BC' },
    bookCount: { type: Number, default: 0 },
    metaTitle: { type: String, maxlength: 70 },
    metaDesc: { type: String, maxlength: 160 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Genre || mongoose.model('Genre', genreSchema);
