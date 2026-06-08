'use strict';

const logger = require('../config/logger');

// Normalise language codes (Google: 2-letter, Open Library: 3-letter) to names.
const LANG = {
  en: 'English', eng: 'English', ne: 'Nepali', nep: 'Nepali', hi: 'Hindi', hin: 'Hindi',
  fr: 'French', fre: 'French', es: 'Spanish', spa: 'Spanish',
};
const mapLang = (c) => (c ? LANG[String(c).toLowerCase()] || c : undefined);

async function fromGoogleBooks(isbn) {
  const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`);
  if (!r.ok) throw new Error(`Google Books ${r.status}`);
  const v = (await r.json())?.items?.[0]?.volumeInfo;
  if (!v) return null;
  const cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
  return {
    source: 'google',
    title: v.title,
    author: Array.isArray(v.authors) ? v.authors[0] : undefined,
    coverUrl: cover ? cover.replace(/^http:/, 'https:').replace(/&edge=curl/, '') : undefined,
    specifications: {
      pages: v.pageCount || undefined,
      publisher: v.publisher || undefined,
      publishedDate: v.publishedDate ? String(v.publishedDate).slice(0, 4) : undefined,
      language: mapLang(v.language),
    },
  };
}

async function fromOpenLibrary(isbn) {
  const url = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&fields=title,author_name,cover_i,publisher,first_publish_year,number_of_pages_median,language&limit=1`;
  const r = await fetch(url, { headers: { 'User-Agent': 'PageTurnNepal/1.0 (hello@pageturn.com.np)' } });
  if (!r.ok) throw new Error(`Open Library ${r.status}`);
  const doc = (await r.json())?.docs?.[0];
  if (!doc) return null;
  const langCode = Array.isArray(doc.language) ? doc.language[0] : undefined;
  return {
    source: 'openlibrary',
    title: doc.title,
    author: Array.isArray(doc.author_name) ? doc.author_name[0] : undefined,
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
    specifications: {
      pages: doc.number_of_pages_median || undefined,
      publisher: Array.isArray(doc.publisher) ? doc.publisher[0] : undefined,
      publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
      language: mapLang(langCode),
    },
  };
}

/**
 * Resilient ISBN metadata lookup. Tries Google Books first; on empty result or
 * error, falls back to Open Library. Returns normalised data or null. Never throws.
 */
async function lookupByIsbn(isbn) {
  if (typeof fetch !== 'function') return null;
  for (const [name, fn] of [['google', fromGoogleBooks], ['openlibrary', fromOpenLibrary]]) {
    try {
      const result = await fn(isbn);
      if (result && result.title) return result;
    } catch (err) {
      logger.warn({ err: err.message, provider: name }, 'ISBN lookup provider failed');
    }
  }
  return null;
}

module.exports = { lookupByIsbn };
