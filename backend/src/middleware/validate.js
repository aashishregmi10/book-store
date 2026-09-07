'use strict';

const { ZodError } = require('zod');
const { fail } = require('../utils/apiResponse');

/**
 * Zod request validation.
 *
 *   validate({ body, query, params })
 *
 * Each schema is optional. On success the parsed (and coerced) values are merged
 * over the originals so handlers get numbers/booleans, not strings, while query
 * keys the schema does not declare survive untouched. On failure it
 * returns the { message, errors:[{ field, message }] } 400 envelope — the same
 * shape the rest of the API (and the tests) expect.
 */
function validate(schemas = {}) {
  return (req, res, next) => {
    try {
      // Express 5 exposes req.query and req.params through getters. The getter
      // returns a FRESH object each read, so the old Object.assign(req.query, …)
      // mutated a throwaway copy and every coercion was silently discarded:
      // handlers kept receiving the raw strings this middleware exists to
      // convert. The visible symptom was /books?page=2 advertising its next
      // page as page=21, because the API echoed page back as "2" and the client
      // computed "2" + 1. Anything doing arithmetic or a strict compare on a
      // validated query number had the same bug.
      //
      // defineProperty replaces the property outright, which does stick. The
      // parsed values are merged OVER the originals rather than replacing them:
      // zod strips keys a schema does not declare, and the listing routes
      // deliberately read undeclared pass-through filters (genre, category,
      // search, author, …) straight off req.query. Replacing wholesale would
      // silently drop every one of those filters.
      const define = (obj) => ({ value: obj, writable: true, configurable: true, enumerable: true });
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params || {});
        Object.defineProperty(req, 'params', define({ ...req.params, ...parsed }));
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query || {});
        Object.defineProperty(req, 'query', define({ ...req.query, ...parsed }));
      }
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
