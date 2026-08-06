'use strict';

const logger = require('./logger');

/**
 * Parses FRONTEND_URL into the set of origins CORS/Socket.io should trust.
 *
 * Support for more than one matters because a platform like Vercel keeps the
 * previous URL live alongside a newly attached custom domain — traffic can
 * arrive from either for as long as both exist, e.g. right after buying a
 * domain and pointing it at an existing deploy. A single-origin CORS config
 * then rejects the very domain you just switched to.
 *
 * Format: comma-separated, e.g.
 *   FRONTEND_URL=https://www.bookstemple.com,https://book-store-tawny-two.vercel.app
 *
 * The FIRST entry is canonical — it's what emails, the sitemap, the merchant
 * feed and IndexNow build links against — so put the real domain first.
 */

const DEFAULT = 'http://localhost:3000';

function parseOrigins(raw) {
  return (raw || DEFAULT)
    .split(',')
    .map((s) => s.trim().replace(/\/$/, '')) // trailing slash breaks an exact Origin-header match
    .filter(Boolean);
}

const allowedOrigins = parseOrigins(process.env.FRONTEND_URL);

/** The canonical origin for building absolute links (emails, feeds, sitemap). */
const canonicalOrigin = allowedOrigins[0];

/** Origins already warned about, so one misconfigured front end logs once. */
const rejectedOriginsSeen = new Set();

/**
 * `cors`'s dynamic origin callback: reflects the request's Origin back only if
 * it's in the allow-list, and omits the header otherwise (the browser then
 * blocks the response) — the standard pattern for "more than one exact origin".
 */
function corsOriginCheck(origin, callback) {
  // No Origin header — same-origin requests, curl, server-to-server. Allow.
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);

  // A rejection is otherwise invisible: the browser just reports "No
  // 'Access-Control-Allow-Origin' header is present", which says nothing about
  // what the server WAS willing to accept. Attaching a custom domain without
  // updating FRONTEND_URL is the overwhelmingly likely cause, so name it and
  // print the live allow-list — the answer should be in the logs, not in a
  // guessing game. Deduped so a hammering client can't flood the log.
  if (!rejectedOriginsSeen.has(origin)) {
    rejectedOriginsSeen.add(origin);
    logger.warn(
      { origin, allowedOrigins },
      'CORS rejected an origin — if this is a real front end, add it to FRONTEND_URL (comma-separated) and redeploy'
    );
  }
  callback(null, false);
}

module.exports = { allowedOrigins, canonicalOrigin, corsOriginCheck };
