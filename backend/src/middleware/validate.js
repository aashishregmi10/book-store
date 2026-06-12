'use strict';

const { ZodError } = require('zod');
const { fail } = require('../utils/apiResponse');

/**
 * Zod request validation.
 *
 *   validate({ body, query, params })
 *
 * Each schema is optional. On success the parsed (and coerced) values replace
 * the originals so handlers get numbers/booleans, not strings. On failure it
 * returns the { message, errors:[{ field, message }] } 400 envelope — the same
 * shape the rest of the API (and the tests) expect.
 */
function validate(schemas = {}) {
  return (req, res, next) => {
    try {
      // Express 5 exposes req.query / req.params via getters that can't be
      // reassigned, so mutate them in place; req.body is writable.
      if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params || {}));
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query || {}));
      if (schemas.body) req.body = { ...(req.body || {}), ...schemas.body.parse(req.body || {}) };
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.issues.map((i) => ({ field: i.path.join('.') || '_root', message: i.message }));
        return fail(res, 'Validation failed', 400, errors);
      }
      return next(err);
    }
  };
}

module.exports = { validate };
