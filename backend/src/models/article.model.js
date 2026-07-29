'use strict';

const mongoose = require('mongoose');
const imageSchema = require('./image.schema');

// Editorial content (reading guides, "best X books in Nepal", buying guides).
// This is the engine for GEO/AEO: long-form, citable content that funnels into
// product pages via relatedBooks + in-body internal links.
const articleSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    excerpt: { type: String, trim: true, maxlength: 300 },
    body: { type: String, required: true }, // lightweight markdown
    coverImage: imageSchema,
    author: { type: String, default: 'Books Temple Editors', trim: true },
    category: { type: String, trim: true, default: 'Reading guides' },
    tags: [{ type: String, trim: true }],
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    publishedAt: { type: Date },
    metaTitle: { type: String, maxlength: 70 },
    metaDesc: { type: String, maxlength: 160 },
    relatedBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    readingTime: { type: Number, default: 1 }, // minutes
  },
  { timestamps: true }
);

articleSchema.index({ status: 1, publishedAt: -1 });

module.exports = mongoose.models.Article || mongoose.model('Article', articleSchema);
