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

/** Add stock back (order cancel/refund) and recompute stockStatus atomically. */
function restoreStock(bookId, qty) {
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
