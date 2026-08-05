'use strict';

const Book = require('../models/book.model');

/**
 * Every write that moves stock lives here.
 *
 * These used to exist twice — once in this file (used by the admin routes) and
 * once copied into orders.route.js (used by checkout and customer cancellation).
 * The copies drifted: the customer-facing paths lost the `variantId` argument,
 * so cancelling an order for a multi-format book credited the derived
 * top-level `stock` while leaving the variant that was actually sold short.
 * One implementation, imported everywhere, is what stops that recurring.
 *
 * A word on `variantId`: for a book with variants the top-level `stock` is
 * DERIVED (`$sum` of the variants), so any adjustment must go through the
 * variant and let SYNC_FROM_VARIANTS recompute the total. Passing the id is
 * therefore mandatory whenever the line item has one.
 */

// Recompute the derived top-level fields from the variant array.
const SYNC_FROM_VARIANTS = {
  $set: { stock: { $sum: '$variants.stock' }, price: { $min: '$variants.price' } },
};

// Derive stockStatus from the resulting stock level.
const statusFromStock = (keepDiscontinued) => {
  const ladder = {
    $switch: {
      branches: [
        { case: { $eq: ['$stock', 0] }, then: 'out-of-stock' },
        { case: { $lte: ['$stock', 3] }, then: 'low-stock' },
      ],
      default: 'in-stock',
    },
  };
  return {
    $set: {
      stockStatus: keepDiscontinued
        ? { $cond: [{ $eq: ['$stockStatus', 'discontinued'] }, 'discontinued', ladder] }
        : ladder,
    },
  };
};

// A sale must never resurrect a discontinued title, and a restore must never
// silently un-discontinue one either — both keep the flag.
const STATUS_FROM_STOCK = statusFromStock(false);
const STATUS_KEEP_DISCONTINUED = statusFromStock(true);

// Adjust a single variant's stock by `delta` (negative to reserve) inside a $map.
const adjustVariant = (variantId, delta) => ({
  $set: {
    variants: {
      $map: {
        input: '$variants',
        as: 'v',
        in: {
          $cond: [
            { $eq: [{ $toString: '$$v._id' }, String(variantId)] },
            { $mergeObjects: ['$$v', { stock: { $add: ['$$v.stock', delta] } }] },
            '$$v',
          ],
        },
      },
    },
  },
});

/**
 * Reserve stock for a sale. The filter carries the `stock >= qty` condition, so
 * a raced order matches nothing and reports modifiedCount 0 rather than
 * overselling — callers must treat that as a failure and compensate.
 */
function decrementStock(bookId, qty, variantId) {
  if (variantId) {
    return Book.updateOne(
      { _id: bookId, stockStatus: { $ne: 'discontinued' }, variants: { $elemMatch: { _id: variantId, stock: { $gte: qty } } } },
      [adjustVariant(variantId, -qty), { $set: { soldCount: { $add: ['$soldCount', qty] } } }, SYNC_FROM_VARIANTS, STATUS_FROM_STOCK],
      { updatePipeline: true }
    );
  }
  return Book.updateOne(
    { _id: bookId, stock: { $gte: qty }, stockStatus: { $ne: 'discontinued' } },
    [{ $set: { stock: { $subtract: ['$stock', qty] }, soldCount: { $add: ['$soldCount', qty] } } }, STATUS_FROM_STOCK],
    { updatePipeline: true }
  );
}

/** Add stock back (order cancel/refund, or compensation after a partial failure). */
function restoreStock(bookId, qty, variantId) {
  if (variantId) {
    return Book.updateOne(
      { _id: bookId, 'variants._id': variantId },
      [
        adjustVariant(variantId, qty),
        { $set: { soldCount: { $max: [{ $subtract: ['$soldCount', qty] }, 0] } } },
        SYNC_FROM_VARIANTS,
        STATUS_KEEP_DISCONTINUED,
      ],
      { updatePipeline: true }
    );
  }
  return Book.updateOne(
    { _id: bookId },
    [
      { $set: { stock: { $add: ['$stock', qty] }, soldCount: { $max: [{ $subtract: ['$soldCount', qty] }, 0] } } },
      STATUS_KEEP_DISCONTINUED,
    ],
    { updatePipeline: true }
  );
}

module.exports = { decrementStock, restoreStock };
