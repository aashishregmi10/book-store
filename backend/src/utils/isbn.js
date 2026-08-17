'use strict';

// ISBN validation + ISBN-10 ⇄ ISBN-13 conversion. Pure functions, no I/O.

const clean = (raw) => String(raw || '').replace(/[\s-]/g, '').toUpperCase();

function isValidIsbn10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const v = s[i] === 'X' ? 10 : Number(s[i]);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

function isValidIsbn13(s) {
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i += 1) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

const isbn10Check = (first9) => {
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(first9[i]) * (10 - i);
  const r = (11 - (sum % 11)) % 11;
  return r === 10 ? 'X' : String(r);
};

const isbn13Check = (first12) => {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
};

// Returns a valid ISBN-13 for any valid ISBN-10/13 input, else null.
function toIsbn13(raw) {
  const s = clean(raw);
  if (isValidIsbn13(s)) return s;
  if (isValidIsbn10(s)) {
    const core = `978${s.slice(0, 9)}`;
    return core + isbn13Check(core);
  }
  return null;
}

// Returns a valid ISBN-10 when one exists, else null. 979-prefixed ISBN-13s
// have no ISBN-10 equivalent, so they correctly return null.
function toIsbn10(raw) {
  const s = clean(raw);
  if (isValidIsbn10(s)) return s;
  if (isValidIsbn13(s) && s.startsWith('978')) {
    const core = s.slice(3, 12);
    return core + isbn10Check(core);
  }
  return null;
}

// Normalise an arbitrary ISBN string into { clean, valid, isbn10, isbn13 }.
function normalizeIsbns(raw) {
  const s = clean(raw);
  return {
    clean: s,
    valid: isValidIsbn10(s) || isValidIsbn13(s),
    isbn10: toIsbn10(s),
    isbn13: toIsbn13(s),
  };
}

/**
 * Every stored form a search term could be trying to reach, or [] when the
 * term is not ISBN-shaped.
 *
 * Two mismatches make a raw regex search miss real books. ISBNs are printed on
 * covers with separators ("978-0-241-34427-7") while the schema setter strips
 * them, and a hyphen is not a regex metacharacter, so the escaped term keeps
 * its hyphens and can never match the stored digits. Separately, a customer
 * reading the 10-digit number off an older cover is searching for a book the
 * catalogue files under its 13-digit form.
 *
 * So: strip separators, then return the cleaned term together with whichever
 * counterparts are derivable. Callers match these against `isbn` and
 * `specifications.isbn10` with $in rather than a regex.
 *
 * Deliberately returns [] for anything that is not a complete, valid ISBN —
 * a partial number is still better served by the substring regex, and a
 * checksum-failing string should not be silently "corrected" into a different
 * book's number.
 */
function isbnSearchForms(term) {
  const s = clean(term);
  if (!/^[\dX]{10}$|^\d{13}$/.test(s)) return [];
  if (!isValidIsbn10(s) && !isValidIsbn13(s)) return [];
  const forms = new Set([s]);
  const t13 = toIsbn13(s);
  const t10 = toIsbn10(s);
  if (t13) forms.add(t13);
  if (t10) forms.add(t10);
  return [...forms];
}

module.exports = {
  clean,
  isValidIsbn10,
  isValidIsbn13,
  toIsbn10,
  toIsbn13,
  normalizeIsbns,
  isbnSearchForms,
};
