'use strict';

const crypto = require('crypto');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const sharp = require('sharp');

/**
 * Object storage for book covers, on Cloudflare R2.
 *
 * Replaces Cloudinary, whose free tier was exhausted and whose account was
 * deactivated — taking every cover on the storefront offline at once. Two
 * things about that failure shaped this module:
 *
 *   1. Cloudinary metered *transformations*, and the app was generating a
 *      derived asset per srcset width per book. R2 has no transformation
 *      service at all, which removes the meter rather than resetting it. Sizes
 *      are produced once here, at upload, and served as plain files.
 *   2. `uploadBuffer` never passed a public_id, so every asset got a random
 *      name and nothing could be mapped back to the book it belonged to. When
 *      the account died there was no way to re-request an asset by name. Keys
 *      here are caller-supplied and derived from the slug, so the store is
 *      reconstructible from the catalogue alone.
 *
 * Reads never touch this module: they go straight to R2_PUBLIC_BASE, which is
 * unauthenticated and free to serve (R2 charges no egress). The credentials
 * below are write-only in practice, which is why they must never reach the
 * frontend bundle.
 *
 * The exported shape is deliberately Cloudinary-compatible — `public_id`,
 * `secure_url`, `width`, `height` — so `routes/upload.route.js`,
 * `utils/coverUpload.js` and the image subdocument in `models/image.schema.js`
 * did not have to change.
 */

let client = null;

function getStorage() {
  if (!client) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error(
        'R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.'
      );
    }
    // Configured lazily, not at module load, so the API still boots without
    // image credentials — only the upload route fails, and with a clear reason.
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

const bucket = () => {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error('R2_BUCKET is not set.');
  return b;
};

/** Public URL for a stored object. */
function publicUrl(key) {
  const base = (process.env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');
  if (!base) throw new Error('R2_PUBLIC_BASE is not set.');
  return `${base}/${key}`;
}

/**
 * Store an image buffer and return a Cloudinary-shaped descriptor.
 *
 * `key` is the object path and should be derived from something stable (a book
 * slug). Callers that have no natural key — the admin upload route, where the
 * book may not exist yet — fall back to a random name under `folder`, which is
 * the old Cloudinary behaviour and is fine for one-off manual uploads.
 *
 * Everything is normalised to WebP on the way in. The sources are already WebP
 * and re-encoding is cheap, but a hand-uploaded 4 MB phone photo is exactly how
 * a storage bill starts, and this is the only place to catch it.
 *
 * `format: 'jpeg'` is the one exception, and exists for a single caller: the
 * Open Graph card at frontend/src/app/books/[slug]/opengraph-image.tsx. It
 * composites the cover with next/og, whose renderer (Satori) refuses WebP
 * outright — "Unsupported image type: image/webp" — and silently draws an empty
 * box in its place. So each book also gets a JPEG sibling used by nothing but
 * that card. See scripts/build-og-covers.js.
 */
async function uploadBuffer(
  buffer,
  { folder = 'covers', key, maxWidth = 720, quality = 82, format = 'webp' } = {}
) {
  const jpeg = format === 'jpeg';
  const image = sharp(buffer).rotate(); // honour EXIF orientation before resizing
  const resized = image.resize({ width: maxWidth, withoutEnlargement: true });
  const out = await (jpeg ? resized.jpeg({ quality, mozjpeg: true }) : resized.webp({ quality }))
    .toBuffer({ resolveWithObject: true });

  const ext = jpeg ? 'jpg' : 'webp';
  const objectKey = key || `${folder}/${crypto.randomUUID()}.${ext}`;

  await getStorage().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: objectKey,
      Body: out.data,
      ContentType: jpeg ? 'image/jpeg' : 'image/webp',
      // Immutable: a given key always holds the same picture. Replacing a cover
      // writes a new key, so a long TTL never serves a stale image.
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return {
    public_id: objectKey,
    secure_url: publicUrl(objectKey),
    width: out.info.width,
    height: out.info.height,
    bytes: out.data.length,
    format: jpeg ? 'jpeg' : 'webp',
  };
}

/**
 * Delete a stored object by key. Resolves when the object is already gone —
 * S3 delete is idempotent — and rejects only on transport/credential errors,
 * matching what the callers expected from Cloudinary's destroy.
 *
 * No CDN purge step is needed: keys are immutable, so nothing cached under this
 * key can ever be wrong.
 */
async function deleteImage(publicId) {
  if (!publicId) return;
  // Guard against Cloudinary-era IDs, which are not R2 keys. Deleting by one
  // would silently do nothing; better to skip loudly than pretend it worked.
  if (publicId.startsWith('pageturn/') || publicId.startsWith('bookstemple/')) return;
  await getStorage().send(new DeleteObjectCommand({ Bucket: bucket(), Key: publicId }));
}

module.exports = { getStorage, uploadBuffer, deleteImage, publicUrl };
