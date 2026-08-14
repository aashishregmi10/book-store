'use strict';

/**
 * Romanise a Devanagari title well enough to build a slug from it.
 *
 * Why: slugs are generated with /[^a-z0-9]+/, which strips Devanagari to an
 * empty string. The importer treats an empty slug as a hard failure, so books
 * titled only in Nepali or Hindi could not be imported at all — and those are
 * exactly the titles this shop stocks that no international retailer does.
 *
 * This is a pragmatic transliteration, not a scholarly one (no ISO 15919
 * diacritics, no schwa-deletion rules). A slug only has to be stable, unique
 * and readable — "pahilo-sansad" beats both a failed import and "book-9789937".
 * Where a character has no sensible Latin form it is dropped rather than
 * guessed, and the caller falls back to the ISBN if nothing usable survives.
 */

// Independent vowels.
const VOWELS = {
  अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri',
  ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', अं: 'an', अः: 'ah',
};

// Matras (dependent vowel signs) — applied after the consonant they follow.
const MATRAS = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ः': 'h', 'ँ': 'n',
};

// Consonants carry an inherent 'a', which the caller strips when a matra or
// halant follows.
const CONSONANTS = {
  क: 'ka', ख: 'kha', ग: 'ga', घ: 'gha', ङ: 'nga',
  च: 'cha', छ: 'chha', ज: 'ja', झ: 'jha', ञ: 'nya',
  ट: 'ta', ठ: 'tha', ड: 'da', ढ: 'dha', ण: 'na',
  त: 'ta', थ: 'tha', द: 'da', ध: 'dha', न: 'na',
  प: 'pa', फ: 'pha', ब: 'ba', भ: 'bha', म: 'ma',
  य: 'ya', र: 'ra', ल: 'la', व: 'wa', श: 'sha', ष: 'sha', स: 'sa', ह: 'ha',
  क्ष: 'ksha', त्र: 'tra', ज्ञ: 'gya', ळ: 'la',
};

const HALANT = '्';
const DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };

/** Romanise Devanagari; leaves any Latin already present untouched. */
function romanise(input) {
  const s = String(input || '');
  let out = '';

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    const next = s[i + 1];

    if (DIGITS[ch]) { out += DIGITS[ch]; continue; }
    if (VOWELS[ch]) { out += VOWELS[ch]; continue; }

    if (CONSONANTS[ch]) {
      let base = CONSONANTS[ch];
      // A halant or a matra kills the consonant's inherent 'a'.
      if (next === HALANT) {
        out += base.slice(0, -1);
        i += 1;
        continue;
      }
      if (MATRAS[next] !== undefined) {
        out += base.slice(0, -1) + MATRAS[next];
        i += 1;
        continue;
      }
      out += base;
      continue;
    }

    if (MATRAS[ch] !== undefined) { out += MATRAS[ch]; continue; }

    // Anything else (Latin, spaces, punctuation) passes through for the
    // slugifier to deal with.
    out += ch;
  }

  return out;
}

module.exports = { romanise };
