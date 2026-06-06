'use strict';

/**
 * Consistent response envelopes (Master Guide §13.1).
 *   success:    { data, message }
 *   error:      { message, errors }
 *   validation: { message: 'Validation failed', errors: [{ field, message }] }
 */

function ok(res, data = null, message = 'OK', status = 200) {
  return res.status(status).json({ data, message });
}

function created(res, data = null, message = 'Created') {
  return res.status(201).json({ data, message });
}

function fail(res, message = 'Something went wrong', status = 500, errors = []) {
  return res.status(status).json({ message, errors });
}

/**
 * Typed error for throwing inside handlers/services. The central error
 * handler reads `.status`, `.code`, and `.errors`.
 */
class ApiError extends Error {
  constructor(message, status = 500, code = undefined, errors = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

module.exports = { ok, created, fail, ApiError };
