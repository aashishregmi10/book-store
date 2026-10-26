'use strict';

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const logger = require('./config/logger');
const { corsOriginCheck, allowedOrigins } = require('./config/origins');
const { sanitizeRequest } = require('./middleware/sanitize');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { ok } = require('./utils/apiResponse');

const app = express();

// Behind a proxy (NGINX) in production — needed for correct client IPs / rate limiting.
app.set('trust proxy', 1);
// Express 5 default; explicit so query-operator injection stays neutralized.
app.set('query parser', 'simple');

// ── Security & parsing ───────────────────────────────────
app.use(
  helmet({
    // COOP governs whether a document keeps a handle on windows it opened, so
    // it only ever applies to HTML. This API serves JSON, so the setting is
    // inert here — it is NOT what makes the Google Sign-In popup's
    // window.postMessage work. That depends on the COOP of the page that
    // opened the popup, which is the Next.js frontend (currently sends no COOP
    // header, i.e. the permissive default, which is what GIS needs).
    //
    // Kept relaxed anyway so that if this app ever serves a page that opens an
    // OAuth popup, helmet's 'same-origin' default doesn't silently break it.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);
app.use(compression());
app.use(cors({ origin: corsOriginCheck, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Express 5 leaves `req.body` UNDEFINED when a request carries no body at all,
// where Express 4 left an empty object. Handlers that read an optional field
// off it — `req.body.reason` on the order-cancel routes, `req.body.isDefault`
// on addresses — then throw a TypeError and 500.
//
// That is not theoretical: "Cancel order" sends no body, so it crashed every
// time. Normalising here fixes the whole class at once, including the routes
// that validate only `params` and so never get a parsed body.
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

app.use(cookieParser());
app.use(sanitizeRequest);

// ── Request id + scoped logger ───────────────────────────
app.use((req, _res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  req.log = logger.child({ reqId: req.id });
  next();
});

// ── Global rate limit ────────────────────────────────────
// The ceiling is deliberately high, and that is not laziness.
//
// This limiter keys on IP, but in production almost none of our traffic
// arrives from a visitor's IP: the storefront is server-rendered, so Next
// fetches the catalogue from Vercel's egress addresses and *every shopper on
// the site shares one bucket*. A single filtered genre view costs three
// requests. At the old 100/15min ceiling a handful of simultaneous visitors
// would 429 the entire shop — the limiter would have been the outage.
//
// Brute-force protection is where it belongs instead: the per-action limiters
// on login / register / forgot-password (middleware/auth.js), which key the
// same way but guard endpoints no legitimate SSR render ever calls. This one
// is only a backstop against a runaway scraper.
//
// INTERNAL_API_KEY, when set on both apps, exempts our own server-side fetches
// entirely and is the proper fix; without it the ceiling alone carries the load.
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

app.use(
  '/api',
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 2000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Only rate-limit in production; dev hot-reload + SSR fan-out trips low limits instantly.
      if (process.env.NODE_ENV !== 'production') return true;
      return Boolean(INTERNAL_API_KEY) && req.headers['x-internal-key'] === INTERNAL_API_KEY;
    },
    message: { message: 'Too many requests, please try again later.', errors: [{ code: 'RATE_LIMITED' }] },
  })
);

// ── Health check (no DB dependency) ──────────────────────
// `allowedOrigins` is reported deliberately. When CORS rejects a request the
// browser only says the header is "not present", which tells you nothing about
// what the server would have accepted — and the usual cause (a new domain
// missing from FRONTEND_URL) is invisible from the outside. These are public
// URLs, not secrets, and having them one curl away turns a guessing game into
// a five-second check.
app.get('/api/health', (_req, res) =>
  ok(res, { status: 'ok', uptime: process.uptime(), allowedOrigins }, 'Healthy')
);

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
app.use('/api/contact', require('./routes/contact.route'));
app.use('/api/upload', require('./routes/upload.route'));
app.use('/api/feed', require('./routes/feed.route'));
// Mounted before the /api/admin catch-all so its own routes resolve first.
app.use('/api/admin/supplier-sync', require('./routes/supplierSync.route'));
app.use('/api/admin/merchandising', require('./routes/merchandising.route'));
app.use('/api/admin/ncm', require('./routes/ncmAdmin.route'));
// Nepal Can Move calls this when a parcel moves (secret-token protected).
app.use('/api/webhooks/ncm', require('./routes/ncmWebhook.route'));
app.use('/api/admin', require('./routes/admin.route'));

// ── 404 + central error handler (must be last) ───────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
