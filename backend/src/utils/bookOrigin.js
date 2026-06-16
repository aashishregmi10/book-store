'use strict';

// Heuristic origin/market detection for catalogue context. Signals are returned
// alongside the verdict so a human can audit *why* a book was flagged — important
// because some signals are weak: Devanagari is shared with Hindi, and several
// "Nepali" surnames (Sharma, Joshi, Rana, Pradhan, Malla) are common in India
// too. ISBN registration group (978-9937) and publisher name are the reliable
// ones; script/surname only decide when nothing stronger is present.

const DEVANAGARI = /[ऀ-ॿ]/;

const NEPALI_PUBLISHERS = [
  'nepal', 'kathmandu', 'patan', 'lalitpur', 'bhaktapur', 'pokhara', 'sajha',
  'makalu', 'bhrikuti', 'fineprint', 'book hill', 'nepal academy', 'nirala',
  'ratna pustak', 'ekta', 'pairavi', 'budha subba', 'kathalaya',
];
const NEPALI_PUBLISHERS_DEV = ['नेपाल', 'काठमाडौं', 'साझा', 'रत्न'];

// Weak signal — see header note. Whole-word, case-insensitive match on author.
const NEPALI_SURNAMES = [
  'ghimire', 'lamichhane', 'poudel', 'bhandari', 'adhikari', 'koirala', 'dahal',
  'bhattarai', 'shrestha', 'pradhan', 'joshi', 'pokharel', 'aryal', 'basnet',
  'gautam', 'subedi', 'sharma', 'rana', 'malla', 'nepali',
];

/**
 * @returns {{ origin: 'nepal'|'india'|'international'|'unknown', market: 'domestic'|'imported',
 *            currency: 'NPR'|'INR'|'USD', language: string|undefined, nepaliDetected: boolean,
 *            signals: string[] }}
 */
function detectOrigin({ isbn13, publisher = '', author = '', title = '', language } = {}) {
  const signals = [];
  const pub = String(publisher || '').toLowerCase();
  const auth = String(author || '').toLowerCase();
  const isbn = String(isbn13 || '');
  const text = `${title} ${author} ${publisher}`;

  let origin = 'unknown';

  // 1. ISBN registration group — strongest signal.
  if (isbn.startsWith('9789937')) {
    origin = 'nepal';
    signals.push('isbn_nepal_9937');
  } else if (isbn.startsWith('97881') || isbn.startsWith('97893')) {
    origin = 'india';
    signals.push('isbn_india');
  }

  // 2. Publisher name (Latin or Devanagari keyword).
  const pubMatch =
    NEPALI_PUBLISHERS.find((k) => pub.includes(k)) ||
    NEPALI_PUBLISHERS_DEV.find((k) => String(publisher).includes(k));
  if (pubMatch) {
    signals.push('publisher_nepal');
    if (origin !== 'india') origin = 'nepal';
  }

  // 3. Weak signals: script + surname.
  if (DEVANAGARI.test(text)) signals.push('devanagari');
  const surname = NEPALI_SURNAMES.find((s) => new RegExp(`\\b${s}\\b`, 'i').test(auth));
  if (surname) signals.push(`surname_${surname}`);

  // Weak signals only decide when ISBN/publisher gave us nothing.
  if (origin === 'unknown') {
    if (signals.includes('devanagari') || surname) origin = 'nepal';
    else if (isbn) origin = 'international';
  }

  const nepaliDetected = origin === 'nepal';
  return {
    origin,
    market: origin === 'nepal' ? 'domestic' : 'imported',
    currency: origin === 'nepal' ? 'NPR' : origin === 'india' ? 'INR' : 'USD',
    language: language || (nepaliDetected ? 'Nepali' : undefined),
    nepaliDetected,
    signals,
  };
}

// Confidence from which identifiers the caller supplied (per the spec's table).
function scoreConfidence(query = {}, found = true) {
  if (!found) return 0;
  const { isbn, title, author, publisher } = query;
  if (isbn) return 1.0;
  if (title && author) return 0.85;
  if (title && publisher) return 0.75;
  if (title) return 0.6;
  if (author) return 0.4;
  if (publisher) return 0.2;
  return 0;
}

module.exports = { detectOrigin, scoreConfidence };
