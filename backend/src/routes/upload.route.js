'use strict';

const express = require('express');
const multer = require('multer');

const { authenticate, requireAdmin } = require('../middleware/auth');
const { uploadBuffer } = require('../config/storage');
const { ok, fail } = require('../utils/apiResponse');
const logger = require('../config/logger');

const router = express.Router();

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

// Buffer the file in memory; we stream it straight to Cloudinary (no disk writes).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('Only JPEG, PNG, WebP, AVIF or GIF images are allowed.'));
  },
});

const FOLDERS = { books: 'bookstemple/books', avatars: 'bookstemple/avatars' };

// POST /api/upload  (admin only) — multipart form field "image"
router.post('/', authenticate, requireAdmin, (req, res, next) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 5MB).' : err.message;
      return fail(res, msg, 400, [{ field: 'image', code: 'UPLOAD_REJECTED' }]);
    }
    if (!req.file) return fail(res, 'No image file provided.', 400, [{ field: 'image', code: 'REQUIRED' }]);

    try {
      const folder = FOLDERS[req.query.folder] || FOLDERS.books;
      const result = await uploadBuffer(req.file.buffer, { folder });
      // Shape matches the reusable `image` subdocument (publicId/secureUrl/name)
      // so the client can persist the whole object. `url` kept for compatibility.
      return ok(
        res,
        {
          publicId: result.public_id,
          secureUrl: result.secure_url,
          name: req.file.originalname || '',
          url: result.secure_url,
          width: result.width,
          height: result.height,
        },
        'Image uploaded'
      );
    } catch (e) {
      // Log the real Cloudinary error (it can contain the API key); never echo it to the client.
      logger.error({ err: e.message }, 'Cloudinary upload failed');
      return fail(res, 'Image upload failed. Please check the image and try again.', 502, [{ code: 'UPLOAD_FAILED' }]);
    }
  });
});

module.exports = router;
