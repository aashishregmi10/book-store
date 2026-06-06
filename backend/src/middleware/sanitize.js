'use strict';

/**
 * Express-5-safe NoSQL-injection guard.
 *
 * Why custom: express-mongo-sanitize and hpp both reassign `req.query`,
 * which is a read-only getter in Express 5 and throws. Express 5 also
 * defaults to the 'simple' query parser, so `?x[$gt]=1` arrives as the
 * literal string key 'x[$gt]' rather than a nested operator object —
 * query-string operator injection is already neutralized.
 *
 * This middleware deep-cleans the freely-mutable `req.body` and
 * `req.params`, stripping any key that starts with '$' or contains '.'
 * (Mongo operator / dotted-path injection vectors).
 */

function scrub(value) {
  if (Array.isArray(value)) {
    value.forEach(scrub);
    return value;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete value[key];
      } else {
        scrub(value[key]);
      }
    }
  }
  return value;
}

function sanitizeRequest(req, _res, next) {
  if (req.body) scrub(req.body);
  if (req.params) scrub(req.params);
  next();
}

module.exports = { sanitizeRequest, scrub };
