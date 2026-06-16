'use strict';

const { isValidIsbn10, isValidIsbn13, toIsbn10, toIsbn13, normalizeIsbns } = require('../src/utils/isbn');

describe('ISBN validation', () => {
  it('accepts valid ISBN-13 and ISBN-10 (incl. X check digit)', () => {
    expect(isValidIsbn13('9780735211292')).toBe(true); // Atomic Habits
    expect(isValidIsbn10('0735211299')).toBe(true);
    expect(isValidIsbn10('080442957X')).toBe(true); // X check digit
  });

  it('rejects wrong check digits and malformed input', () => {
    expect(isValidIsbn13('9780735211293')).toBe(false);
    expect(isValidIsbn10('0735211298')).toBe(false);
    expect(isValidIsbn10('123')).toBe(false);
    expect(isValidIsbn13('')).toBe(false);
  });
});

describe('ISBN conversion', () => {
  it('converts ISBN-10 → ISBN-13 and back', () => {
    expect(toIsbn13('0735211299')).toBe('9780735211292');
    expect(toIsbn10('9780735211292')).toBe('0735211299');
  });

  it('is a no-op when already in the target form', () => {
    expect(toIsbn13('9780735211292')).toBe('9780735211292');
    expect(toIsbn10('0735211299')).toBe('0735211299');
  });

  it('returns null for a 979-prefixed ISBN-13 (no ISBN-10 equivalent)', () => {
    expect(toIsbn10('9791234567896')).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(toIsbn13('not-an-isbn')).toBeNull();
    expect(toIsbn10('1234567890')).toBeNull(); // wrong check digit
  });
});

describe('normalizeIsbns', () => {
  it('strips hyphens/spaces and reports both forms', () => {
    expect(normalizeIsbns('978-0-7352-1129-2')).toEqual({
      clean: '9780735211292',
      valid: true,
      isbn10: '0735211299',
      isbn13: '9780735211292',
    });
  });

  it('flags invalid ISBNs', () => {
    expect(normalizeIsbns('9780735211293').valid).toBe(false);
  });
});
