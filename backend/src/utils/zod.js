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

/**
 * Nepali phone number.
 *
 * This is a COD shop: the courier rings this number to arrange handover, so an
 * unreachable one is an undeliverable parcel and a lost sale. It was previously
 * a bare `trimmedString()`, which accepted "1" and "asdf" alike.
 *
 * Accepts, with or without a +977 / 977 / 0 prefix and any spacing or dashes:
 *   · mobile   — 10 digits starting 96/97/98 (NTC, Ncell, Smart)
 *   · landline — 1–3 digit area code + 6–7 digits (e.g. 01-4123456)
 */
const NEPAL_MOBILE = /^9[678]\d{8}$/;

/** Digits only, with the country code and any trunk zero stripped. */
function localDigits(raw) {
  const digits = String(raw).replace(/\D/g, '');
  return digits.replace(/^977/, '').replace(/^0+/, '');
}

function isNepaliPhone(raw) {
  const local = localDigits(raw);
  // 10 digits is a mobile, and only 96/97/98 prefixes are allocated — this is
  // the branch that has to stay strict, since a typo'd mobile is the common
  // failure and it is what the courier actually dials.
  if (local.length === 10) return NEPAL_MOBILE.test(local);
  // 7–9 digits is a landline (area code + subscriber). A leading 9 here means
  // a mobile that lost digits, not a landline, so it is rejected.
  if (local.length >= 7 && local.length <= 9) return !local.startsWith('9');
  return false;
}

const phone = () =>
  z
    .string()
    .trim()
    .refine(isNepaliPhone, 'Enter a valid Nepali phone number, e.g. 9801234567');

// Coerce a query-string value to an int with bounds (strings come from the URL).
const intQuery = ({ min, max } = {}) => {
  let s = z.coerce.number().int();
  if (min !== undefined) s = s.min(min);
  if (max !== undefined) s = s.max(max);
  return s;
};

module.exports = { z, objectId, trimmedString, email, phone, isNepaliPhone, intQuery };
