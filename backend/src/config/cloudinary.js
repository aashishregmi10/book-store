'use strict';

const { v2: cloudinary } = require('cloudinary');

/**
 * Lazily configure the Cloudinary SDK from env. We configure on first use
 * (not at module load) so the API can boot even when image credentials are
 * absent — only the upload route fails, with a clear message.
 */
let configured = false;

function getCloudinary() {
  if (!configured) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
    }
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

/**
 * Upload an in-memory image buffer to Cloudinary. Resolves with the result
 * (secure_url, public_id, dimensions). Rejects on transport/credential errors.
 */
function uploadBuffer(buffer, { folder = 'pageturn/books' } = {}) {
  return new Promise((resolve, reject) => {
    const stream = getCloudinary().uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

module.exports = { getCloudinary, uploadBuffer };
