'use strict';

const Book = require('../models/book.model');

const STATUS_RECALC = {
  $set: {
    stockStatus: {
      $cond: [
        { $eq: ['$stockStatus', 'discontinued'] },
        'discontinued',
        {
          $switch: {
            branches: [
              { case: { $eq: ['$stock', 0] }, then: 'out-of-stock' },
              { case: { $lte: ['$stock', 3] }, then: 'low-stock' },
            ],
            default: 'in-stock',
          },
        },
      ],
    },
  },
};

// Add `delta` to a single variant's stock inside a $map (used by variant restore).
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

/** Add stock back (order cancel/refund) and recompute stockStatus atomically. */
function restoreStock(bookId, qty, variantId) {
  if (variantId) {
    return Book.updateOne(
      { _id: bookId, 'variants._id': variantId },
      [
        adjustVariant(variantId, qty),
        { $set: { soldCount: { $max: [{ $subtract: ['$soldCount', qty] }, 0] } } },
        { $set: { stock: { $sum: '$variants.stock' }, price: { $min: '$variants.price' } } },
        STATUS_RECALC,
      ],
      { updatePipeline: true }
    );
  }
  return Book.updateOne(
    { _id: bookId },
    [
      { $set: { stock: { $add: ['$stock', qty] }, soldCount: { $max: [{ $subtract: ['$soldCount', qty] }, 0] } } },
      STATUS_RECALC,
    ],
    { updatePipeline: true }
  );
}

module.exports = { restoreStock };
