'use strict';

const mongoose = require('mongoose');
const imageSchema = require('./image.schema');

const STOCK_STATUS = ['in-stock', 'low-stock', 'out-of-stock', 'discontinued'];

const bookSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    // ISBN-13 only — Google rejects ISBN-10, and bookLd() emits this as gtin13
    // (must be 13 digits). The setter strips hyphens/spaces so admins can paste
    // the human-readable form (978-9-9337-0123-4).
    isbn: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      set: (v) => (v ? String(v).replace(/[\s-]/g, '') : v),
      validate: {
        validator: (v) => !v || /^\d{13}$/.test(v),
        message: 'ISBN must be a 13-digit ISBN-13 (got "{VALUE}")',
      },
    },
    publicationYear: { type: Number, min: 1800 },

    // Silo architecture (SEO Guide §1): lower-kebab genre slug, indexed.
    genre: { type: String, required: true, index: true, lowercase: true, trim: true },
    subgenre: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    relatedSlugs: [{ type: String }], // same-silo only

    condition: { type: String, enum: ['new', 'used'], default: 'new' },

    price: { type: Number, required: true, min: 0 }, // NPR, integer rupees
    comparePrice: { type: Number, min: 0 },
    costPrice: { type: Number, min: 0, select: false }, // admin-only margin data

    stock: { type: Number, required: true, default: 0, min: 0 },
    stockStatus: { type: String, enum: STOCK_STATUS, default: 'in-stock', index: true },
    reorderPoint: { type: Number, default: 5, min: 0 },
    reorderQuantity: { type: Number, default: 20, min: 0 },
    supplier: { type: String },

    // Primary cover + gallery, stored as Cloudinary image subdocuments
    // ({ publicId, secureUrl, name }). The frontend enforces gallery min/max.
    coverImage: { type: imageSchema, required: true },
    images: { type: [imageSchema], default: [] },

    description: { type: String, required: true },
    shortDescription: { type: String, maxlength: 160 },

    specifications: {
      format: { type: String, enum: ['Paperback', 'Hardcover', 'E-book', 'Audiobook'] },
      pages: { type: Number, min: 1 },
      language: { type: String, default: 'English' },
      publisher: { type: String },
      publishedDate: { type: String },
      dimensions: { type: String },
      weight: { type: String },
    },

    metaTitle: { type: String, maxlength: 70 },
    metaDescription: { type: String, maxlength: 160 },

    avgRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },

    isBestseller: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isStaffPick: { type: Boolean, default: false },
    staffPickNote: { type: String },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Full-text search across the key fields (Master Guide §7.7).
bookSchema.index({ title: 'text', author: 'text', description: 'text', tags: 'text' });

// Catalogue queries are { isActive: true, … } sorted by one of soldCount /
// createdAt / price / avgRating. These compound indexes (ESR rule) let Mongo
// satisfy both the filter and the sort from the index — no in-memory SORT stage.
bookSchema.index({ isActive: 1, soldCount: -1 });
bookSchema.index({ isActive: 1, createdAt: -1 });
bookSchema.index({ isActive: 1, price: 1 });
bookSchema.index({ isActive: 1, avgRating: -1 });
// Genre silo page default (popular within a genre).
bookSchema.index({ isActive: 1, genre: 1, soldCount: -1 });

// Derive stockStatus from stock on every save (Master Guide §8.3 / Admin Supplement §2).
// 'discontinued' is set explicitly by admin and preserved.
bookSchema.pre('save', function deriveStockStatus() {
  if (this.stockStatus !== 'discontinued') {
    if (this.stock === 0) this.stockStatus = 'out-of-stock';
    else if (this.stock <= 3) this.stockStatus = 'low-stock';
    else this.stockStatus = 'in-stock';
  }
});

bookSchema.statics.STOCK_STATUS = STOCK_STATUS;

module.exports = mongoose.models.Book || mongoose.model('Book', bookSchema);
