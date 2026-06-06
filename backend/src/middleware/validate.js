'use strict';

const { validationResult } = require('express-validator');
const { fail } = require('../utils/apiResponse');

/**
 * Run after a chain of express-validator checks. Returns the
 * { message, errors:[{field,message}] } envelope on failure.
 */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
  return fail(res, 'Validation failed', 400, errors);
}

module.exports = { validate };
