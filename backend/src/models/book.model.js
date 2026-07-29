'use strict';

const mongoose = require('mongoose');
const imageSchema = require('./image.schema');

const STOCK_STATUS = ['in-stock', 'low-stock', 'out-of-stock', 'discontinued'];
const FORMATS = ['Paperback', 'Hardcover', 'E-book', 'Audiobook'];
// Top-level browse sections, independent of the literary `genre` silo. A book
// can be genre='fiction' AND category='kids'. Empty = a general catalogue book.
const CATEGORIES = ['manga', 'kids', 'loksewa'];

// A purchasable edition of a title (e.g. Hardcover vs Paperback) with its own
// price + stock. Each variant keeps a stable _id used by the cart/orders.
const variantSchema = new mongoose.Schema({
  format: { type: String, enum: FORMATS, required: true },
  price: { type: Number, required: true, min: 0 }, // NPR, integer rupees
  comparePrice: { type: Number, min: 0 },
  stock: { type: Number, required: true, default: 0, min: 0 },
  isbn: { type: String, trim: true },
});

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

    // Silo architecture (SEO Guide §1): lower-kebab genre slug, indexed. Required
    // unless the book lives in a Section (Manga/Kids/Loksewa), which is its silo.
    genre: {
      type: String,
      required: [function requireGenre() { return !this.category; }, 'Either a genre or a section is required'],
      index: true,
      lowercase: true,
      trim: true,
    },
    // Browse section (Manga / Kids / Loksewa), independent of genre. Optional.
    category: { type: String, enum: [...CATEGORIES, null], default: null, lowercase: true, trim: true, index: true },
    subgenre: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    relatedSlugs: [{ type: String }], // same-silo only

    price: { type: Number, required: true, min: 0 }, // NPR, integer rupees
    comparePrice: { type: Number, min: 0 },
    costPrice: { type: Number, min: 0, select: false }, // admin-only margin data

    // Format variants. Empty = single-format book (top-level price/stock are the
    // source of truth, exactly as before). When non-empty, top-level price/stock
    // are DERIVED in pre('save') (min price / summed stock) so every existing
    // list/sort/filter query and index keeps working unchanged.
    variants: { type: [variantSchema], default: [] },

    // Optional: titles contained in a box set (display only).
    includedTitles: { type: [String], default: undefined },

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
      isbn10: { type: String, trim: true }, // ISBN-13 lives in the top-level `isbn`; this keeps the 10-digit form too
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
// Category section page (newest within a section).
bookSchema.index({ isActive: 1, category: 1, createdAt: -1 });

/**
 * At or below this many copies a title counts as low stock.
 *
 * The shop carries a standing 2 copies of every title, so the old threshold of
 * 3 would have marked the entire catalogue low-stock — drowning the admin's
 * low-stock alert in 2,000+ entries and making it useless. At a baseline of 2,
 * "low" means genuinely one copy left.
 *
 * This is an internal signal only: no public page surfaces low-stock, because
 * a scarcity notice true of every title is just noise.
 */
const LOW_STOCK_AT = 1;

// Keep top-level price/stock in sync with variants, then derive stockStatus.
// With variants, top-level price = cheapest variant ("from NPR X") and stock =
// sum of variant stock — so catalogue queries, sorting and indexes are unchanged.
// 'discontinued' is set explicitly by admin and preserved.
bookSchema.pre('validate', function deriveStockAndStatus() {
  if (Array.isArray(this.variants) && this.variants.length > 0) {
    this.price = Math.min(...this.variants.map((v) => v.price));
    this.stock = this.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
  }
  if (this.stockStatus !== 'discontinued') {
    if (this.stock === 0) this.stockStatus = 'out-of-stock';
    else if (this.stock <= LOW_STOCK_AT) this.stockStatus = 'low-stock';
    else this.stockStatus = 'in-stock';
  }
});

bookSchema.statics.STOCK_STATUS = STOCK_STATUS;
bookSchema.statics.FORMATS = FORMATS;
bookSchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.models.Book || mongoose.model('Book', bookSchema);
