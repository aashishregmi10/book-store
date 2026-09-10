'use strict';

const mongoose = require('mongoose');

/**
 * Reusable stored-image subdocument. Holds enough to both render the image
 * (secureUrl) and manage it later (publicId — the object key in R2, needed to
 * delete it). `name` keeps the original filename for admin UIs. Embed it
 * anywhere a model carries an uploaded image: `image: imageSchema` or
 * `images: [imageSchema]`.
 *
 * The field names date from Cloudinary and were kept through the move to R2 so
 * the migration touched no documents beyond the two values it rewrote; see
 * src/config/storage.js.
 */
const imageSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    secureUrl: { type: String, required: true },
    name: { type: String, default: '' },
  },
  { _id: false }
);

module.exports = imageSchema;
