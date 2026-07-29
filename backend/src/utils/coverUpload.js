'use strict';

const { uploadBuffer } = require('../config/cloudinary');

// Download a single image URL and store it in Cloudinary (bookstemple/books).
// Returns the image subdocument { publicId, secureUrl, name } or null on any
// failure (bad URL, non-image, tiny/empty body, upload error). Never throws.
async function uploadCoverFromUrl(url, name) {
  if (!url || typeof fetch !== 'function') return null;
  try {
    const img = await fetch(url);
    if (!img.ok) return null;
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length <= 1024) return null; // guard against 1px/placeholder responses
    const up = await uploadBuffer(buf, { folder: 'bookstemple/books' });
    return { publicId: up.public_id, secureUrl: up.secure_url, name: `${name || 'cover'}.jpg` };
  } catch {
    return null;
  }
}

/**
 * Try several candidate cover URLs in order; return the first that uploads.
 * Used to fall back from a metadata-provider cover (Google/Open Library) to the
 * Daraz product image when the provider has none. Returns null if all fail.
 */
async function uploadCover(urls, name) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  for (const url of list) {
    // eslint-disable-next-line no-await-in-loop -- intentional fallback chain: stop at the first success
    const cover = await uploadCoverFromUrl(url, name);
    if (cover) return cover;
  }
  return null;
}

module.exports = { uploadCoverFromUrl, uploadCover };
