"use strict";

const logger = require("../config/logger");
const { toIsbn10, toIsbn13 } = require("./isbn");

// Normalise language codes (Google: 2-letter, Open Library: 3-letter) to names.
const LANG = {
  en: "English",
  eng: "English",
  ne: "Nepali",
  nep: "Nepali",
  hi: "Hindi",
  hin: "Hindi",
  fr: "French",
  fre: "French",
  es: "Spanish",
  spa: "Spanish",
};
const mapLang = (c) => (c ? LANG[String(c).toLowerCase()] || c : undefined);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch with a single retry on HTTP 429 (rate limit), per the spec's backoff.
async function fetchRetry(url, opts) {
  let r = await fetch(url, opts);
  if (r.status === 429) {
    await sleep(1000);
    r = await fetch(url, opts);
  }
  return r;
}

// ── Open Library ─────────────────────────────────────────
const OL_FIELDS =
  "title,author_name,cover_i,publisher,first_publish_year,number_of_pages_median,language,isbn,subject";

function mapOpenLibraryDoc(doc) {
  const langCode = Array.isArray(doc.language) ? doc.language[0] : undefined;
  const isbns = Array.isArray(doc.isbn) ? doc.isbn : [];
  return {
    source: "openlibrary",
    title: doc.title,
    author: Array.isArray(doc.author_name) ? doc.author_name[0] : undefined,
    coverUrl: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : undefined,
    isbn13: isbns.map(toIsbn13).find(Boolean) || null,
    isbn10: isbns.map(toIsbn10).find(Boolean) || null,
    // Open Library "subjects" are noisy/numerous — keep the first few as genre signals.
    categories: Array.isArray(doc.subject) ? doc.subject.slice(0, 5) : [],
    specifications: {
      pages: doc.number_of_pages_median || undefined,
      publisher: Array.isArray(doc.publisher) ? doc.publisher[0] : undefined,
      publishedDate: doc.first_publish_year
        ? String(doc.first_publish_year)
        : undefined,
      language: mapLang(langCode),
    },
  };
}

async function openLibrary(queryString) {
  const url = `https://openlibrary.org/search.json?${queryString}&fields=${OL_FIELDS}&limit=1`;
  const r = await fetchRetry(url, {
    headers: { "User-Agent": "BooksTempleNepal/1.0 (bookstemple01@gmail.com)" },
  });
  if (!r.ok) throw new Error(`Open Library ${r.status}`);
  const doc = (await r.json())?.docs?.[0];
  return doc ? mapOpenLibraryDoc(doc) : null;
}

// Resolve the EXACT edition by ISBN (…/isbn/<isbn>.json) so the publisher/pages
// belong to that specific edition — the work-level search returns an aggregated
// publisher list whose first entry is frequently the wrong edition.
async function fromOpenLibraryIsbn(isbn) {
  const url = `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`;
  const r = await fetchRetry(url, {
    headers: {
      "User-Agent": "BooksTempleNepal/1.0 (bookstemple01@gmail.com)",
    },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Open Library ${r.status}`);
  const ed = await r.json();
  if (!ed || !ed.title) return null;
  const langCode = ed.languages?.[0]?.key?.split("/").pop();
  return {
    source: "openlibrary",
    title: ed.title,
    author: undefined, // editions reference authors by key; not needed for publisher
    coverUrl: ed.covers?.[0]
      ? `https://covers.openlibrary.org/b/id/${ed.covers[0]}-L.jpg`
      : undefined,
    isbn13: Array.isArray(ed.isbn_13) ? ed.isbn_13[0] : undefined,
    isbn10: Array.isArray(ed.isbn_10) ? ed.isbn_10[0] : undefined,
    categories: [],
    specifications: {
      pages: ed.number_of_pages || undefined,
      publisher: Array.isArray(ed.publishers) ? ed.publishers[0] : undefined,
      publishedDate: ed.publish_date || undefined,
      language: mapLang(langCode),
    },
  };
}

function fromOpenLibrarySearch({ title, author, publisher } = {}) {
  const p = new URLSearchParams();
  if (title) p.set("title", title);
  if (author) p.set("author", author);
  if (publisher) p.set("publisher", publisher);
  return openLibrary(p.toString());
}

// ── Google Books ─────────────────────────────────────────
function mapGoogleVolume(v) {
  const cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
  const ids = Array.isArray(v.industryIdentifiers) ? v.industryIdentifiers : [];
  const pick = (type) => ids.find((x) => x.type === type)?.identifier || null;
  return {
    source: "google",
    title: v.title,
    author: Array.isArray(v.authors) ? v.authors[0] : undefined,
    coverUrl: cover
      ? cover.replace(/^http:/, "https:").replace(/&edge=curl/, "")
      : undefined,
    isbn13: pick("ISBN_13"),
    isbn10: pick("ISBN_10"),
    description: v.description || undefined,
    categories: Array.isArray(v.categories) ? v.categories : [],
    specifications: {
      pages: v.pageCount || undefined,
      publisher: v.publisher || undefined,
      publishedDate: v.publishedDate
        ? String(v.publishedDate).slice(0, 4)
        : undefined,
      language: mapLang(v.language),
    },
  };
}

async function googleVolumes(q) {
  // An API key raises the keyless quota (which 429s quickly) — strongly
  // recommended for bulk lookups. Optional: lookups still work without it.
  const key = process.env.GOOGLE_BOOKS_API_KEY
    ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}`
    : "";
  const r = await fetchRetry(
    `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1${key}`,
  );
  if (!r.ok) throw new Error(`Google Books ${r.status}`);
  const v = (await r.json())?.items?.[0]?.volumeInfo;
  return v ? mapGoogleVolume(v) : null;
}

const fromGoogleIsbn = (isbn) =>
  googleVolumes(`isbn:${encodeURIComponent(isbn)}`);

function fromGoogleSearch({ title, author, publisher } = {}) {
  const parts = [];
  if (title) parts.push(`intitle:${encodeURIComponent(title)}`);
  if (author) parts.push(`inauthor:${encodeURIComponent(author)}`);
  if (publisher) parts.push(`inpublisher:${encodeURIComponent(publisher)}`);
  return googleVolumes(parts.join("+"));
}

// ── Public API ───────────────────────────────────────────
// Try providers in order; return the first result that has a title. Never throws.
async function race(providers, arg) {
  for (const [name, fn] of providers) {
    try {
      const result = await fn(arg);
      if (result && result.title) return result;
    } catch (err) {
      logger.warn(
        { err: err.message, provider: name },
        "book lookup provider failed",
      );
    }
  }
  return null;
}

/**
 * ISBN metadata lookup. Google Books first (richest ISBN coverage), Open Library
 * fallback. Returns normalised data or null.
 */
async function lookupByIsbn(isbn) {
  if (typeof fetch !== "function") return null;
  return race(
    [
      ["google", fromGoogleIsbn],
      ["openlibrary", fromOpenLibraryIsbn],
    ],
    isbn,
  );
}

/**
 * General lookup by any combination of { isbn, title, author, publisher }.
 * ISBN (when present) wins and uses the ISBN path above. Otherwise we search by
 * title/author/publisher — Open Library first (free, strong search), Google
 * fallback. Returns normalised data or null; never throws.
 */
async function lookupBook(query = {}) {
  if (typeof fetch !== "function") return null;
  const { isbn, title, author, publisher } = query;
  if (isbn) return lookupByIsbn(isbn);
  if (!title && !author && !publisher) return null;
  return race(
    [
      ["openlibrary", fromOpenLibrarySearch],
      ["google", fromGoogleSearch],
    ],
    query,
  );
}

/**
 * Subject/classification lookup, for bulk genre work.
 *
 * Deliberately separate from lookupBook: that one prefers the Open Library
 * *edition* endpoint (/isbn/<isbn>.json) because it gives the right publisher
 * and page count for a specific printing — but that endpoint carries no
 * subjects at all, so it returns `categories: []` and is useless for deciding a
 * genre. The *search* endpoint returns work-level `subject`, which is what
 * classification actually needs.
 *
 * Tries ISBN first (exact), then title+author. Returns up to 25 subjects —
 * more than the 5 lookupBook keeps, since the extra terms meaningfully improve
 * scoring. Never throws.
 *
 * @returns {{subjects: string[], publisher?: string, title?: string} | null}
 */
async function lookupSubjects({ isbn, title, author } = {}) {
  if (typeof fetch !== "function") return null;

  const queries = [];
  if (isbn)
    queries.push(new URLSearchParams({ isbn: String(isbn) }).toString());
  if (title) {
    const p = new URLSearchParams({ title: String(title) });
    if (author && author !== "Unknown") p.set("author", String(author));
    queries.push(p.toString());
    // Title-only last resort. Catalogue authors are frequently formatted
    // differently from Open Library's ("Karl Marx and Friedric", "Unknown"),
    // and a mismatched author filter returns zero docs where the title alone
    // would have matched. Less precise, so it runs only after the others miss.
    if (author && author !== "Unknown") {
      queries.push(new URLSearchParams({ title: String(title) }).toString());
    }
  }

  // A doc can name an author while listing no subjects. Subjects are what this
  // function is for, so keep trying the remaining queries for them — but hold
  // on to the author so a caller backfilling "Unknown" still gets an answer.
  let fallbackAuthor;

  for (const qs of queries) {
    try {
      const url = `https://openlibrary.org/search.json?${qs}&fields=title,author_name,subject,publisher&limit=1`;
      const r = await fetchRetry(url, {
        headers: {
          "User-Agent": "BooksTempleNepal/1.0 (bookstemple01@gmail.com)",
        },
      });
      if (!r.ok) continue;
      const doc = (await r.json())?.docs?.[0];
      const docAuthor = Array.isArray(doc?.author_name)
        ? doc.author_name[0]
        : undefined;
      if (!fallbackAuthor && docAuthor) fallbackAuthor = docAuthor;
      if (Array.isArray(doc?.subject) && doc.subject.length) {
        return {
          subjects: doc.subject.slice(0, 25),
          author: docAuthor,
          publisher: Array.isArray(doc.publisher)
            ? doc.publisher[0]
            : undefined,
          title: doc.title,
        };
      }
    } catch (err) {
      logger.warn(
        { err: err.message, provider: "openlibrary-subjects" },
        "subject lookup failed",
      );
    }
  }
  return fallbackAuthor ? { subjects: [], author: fallbackAuthor } : null;
}

module.exports = { lookupByIsbn, lookupBook, lookupSubjects };
