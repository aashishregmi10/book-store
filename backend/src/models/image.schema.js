'use strict';

const mongoose = require('mongoose');

/**
 * Reusable Cloudinary image subdocument. Stores enough to both render the image
 * (secureUrl) and manage it later (publicId — needed to delete/transform the
 * asset). `name` keeps the original filename for admin UIs. Embed it anywhere a
 * model carries an uploaded image: `image: imageSchema` or `images: [imageSchema]`.
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
