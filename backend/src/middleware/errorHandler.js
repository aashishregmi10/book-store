'use strict';

const logger = require('../config/logger');
const { fail } = require('../utils/apiResponse');

function notFound(req, res) {
  return fail(res, `Route not found: ${req.method} ${req.originalUrl}`, 404, [{ code: 'NOT_FOUND' }]);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Mongoose validation
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return fail(res, 'Validation failed', 400, errors);
  }
  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return fail(res, `Duplicate value for ${field}`, 409, [{ field, code: 'DUPLICATE' }]);
  }
  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    return fail(res, `Invalid ${err.path}`, 400, [{ field: err.path, code: 'INVALID_ID' }]);
  }
  // JWT
  if (err.name === 'TokenExpiredError') return fail(res, 'Token expired', 403, [{ code: 'TOKEN_EXPIRED' }]);
  if (err.name === 'JsonWebTokenError') return fail(res, 'Invalid token', 403, [{ code: 'INVALID_TOKEN' }]);

  const status = err.status || 500;
  if (status >= 500) {
    logger.error({ err: err.message, stack: err.stack, path: req.originalUrl }, 'Unhandled error');
  }
  // Surface an ApiError's `code` into the errors array for consistent client handling.
  const errors = err.errors && err.errors.length ? err.errors : err.code ? [{ code: err.code }] : [];
  return fail(res, err.message || 'Internal server error', status, errors);
}

module.exports = { notFound, errorHandler };
