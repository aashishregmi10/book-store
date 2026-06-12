'use strict';

const { z } = require('zod');

// Common request-validation pieces shared across routes.
const objectId = () => z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const trimmedString = (min = 1) => z.string().trim().min(min);

// Validate + lowercase an email (mirrors express-validator's normalizeEmail
// intent; the User model also lowercases on save).
const email = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'A valid email is required');

// Coerce a query-string value to an int with bounds (strings come from the URL).
const intQuery = ({ min, max } = {}) => {
  let s = z.coerce.number().int();
  if (min !== undefined) s = s.min(min);
  if (max !== undefined) s = s.max(max);
  return s;
};

module.exports = { z, objectId, trimmedString, email, intQuery };
