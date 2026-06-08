'use strict';

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const logger = require('./config/logger');
const { sanitizeRequest } = require('./middleware/sanitize');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { ok } = require('./utils/apiResponse');

const app = express();

// Behind a proxy (NGINX) in production — needed for correct client IPs / rate limiting.
app.set('trust proxy', 1);
// Express 5 default; explicit so query-operator injection stays neutralized.
app.set('query parser', 'simple');

// ── Security & parsing ───────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(sanitizeRequest);

// ── Request id + scoped logger ───────────────────────────
app.use((req, _res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  req.log = logger.child({ reqId: req.id });
  next();
});

// ── Global rate limit (Master Guide §9.2: 100 / 15 min) ──
app.use(
  '/api',
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    // Only rate-limit in production; dev hot-reload + SSR fan-out trips low limits instantly.
    skip: () => process.env.NODE_ENV !== 'production',
    message: { message: 'Too many requests, please try again later.', errors: [{ code: 'RATE_LIMITED' }] },
  })
);

// ── Health check (no DB dependency) ──────────────────────
app.get('/api/health', (_req, res) => ok(res, { status: 'ok', uptime: process.uptime() }, 'Healthy'));

// ── Feature routes (mounted as they are built) ───────────
app.use('/api/auth', require('./routes/auth.route'));
app.use('/api/books', require('./routes/books.route'));
app.use('/api/genres', require('./routes/genres.route'));
app.use('/api/articles', require('./routes/articles.route'));
app.use('/api/cart', require('./routes/cart.route'));
app.use('/api/wishlist', require('./routes/wishlist.route'));
app.use('/api/addresses', require('./routes/addresses.route'));
app.use('/api/orders', require('./routes/orders.route'));
// app.use('/api/coupons', require('./routes/coupons.route'));
// app.use('/api/inventory', require('./routes/inventory.route'));
// app.use('/api/reviews', require('./routes/reviews.route'));
// app.use('/api/notifications', require('./routes/notifications.route'));
app.use('/api/upload', require('./routes/upload.route'));
app.use('/api/feed', require('./routes/feed.route'));
app.use('/api/admin', require('./routes/admin.route'));

// ── 404 + central error handler (must be last) ───────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
