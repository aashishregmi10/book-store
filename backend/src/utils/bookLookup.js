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
// Google reports 2-letter codes; callers pass a name ("Hindi") or a code.
const langCode = (l) => {
  const s = String(l || "").trim().toLowerCase();
  if (!s) return "en";
  if (s.length === 2) return s;
  const hit = Object.entries(LANG).find(([code, name]) => code.length === 2 && name.toLowerCase() === s);
  return hit ? hit[0] : "en";
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Matching helpers ─────────────────────────────────────
// A plain-text search returns *candidates*; these decide which one, if any, is
// our book. Titles compare after normalising (case, accents, punctuation,
// "&"/"and") and tolerate a subtitle on either side; authors compare by surname.
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const realAuthor = (a) => {
  const s = String(a || "").trim();
  return s && !/^(unknown|various|n\/?a|anonymous)$/i.test(s) ? s : "";
};
const surnames = (a) =>
  String(a || "")
    .split(/,|&|\band\b/i)
    .map((x) => norm(x).split(" ").filter((w) => w.length > 1).pop())
    .filter(Boolean);
const mainTitle = (t) => norm(String(t || "").split(/\s*[:(]\s*|\s+-\s+/)[0]);

function titleMatches(ours, v) {
  const a = norm(ours);
  const m = mainTitle(ours);
  const theirs = norm(v.title);
  const full = norm([v.title, v.subtitle].filter(Boolean).join(" "));
  return Boolean(a) && (a === theirs || a === full || (m.length >= 6 && m === theirs));
}
function authorAgrees(ours, theirs) {
  const s = surnames(ours);
  const t = (theirs || []).map(norm);
  return s.length > 0 && s.some((x) => t.some((n) => n.split(" ").includes(x)));
}

// "A", "A & B", "A, B & C" — the catalogue's own style for multiple authors.
function formatAuthors(list) {
  const a = (list || []).map((x) => String(x || "").trim()).filter(Boolean).slice(0, 4);
  if (a.length <= 1) return a[0];
  return `${a.slice(0, -1).join(", ")} & ${a[a.length - 1]}`;
}

// Provider descriptions arrive as HTML (Google) or Markdown (Open Library).
// Stored as-is they render literal tags on the book page.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function plainText(text) {
  if (!text) return undefined;
  const out = String(text)
    .split(/\n-{3,}/)[0] // Open Library appends "----------" + source notes
    .replace(/^\s*\[\d+\]:\s*\S+.*$/gm, "") // Markdown link references
    .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, "$1") // [text](url) -> text
    .replace(/\(\[source\]\[\d+\]\)/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, (_, n) => ENTITIES[n.toLowerCase()] ?? " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out || undefined;
}

// A work-level match may be another printing of the book, so a sentence that
// sells that printing ("This beautiful gift edition…", "PRE-ORDER NOW") would
// be false for the copy we stock. Those sentences are dropped; the rest of the
// blurb describes the work and stands.
const EDITION_CLAIM =
  /\b(gift|anniversary|special|deluxe|collector'?s|illustrated|limited|expanded|revised|paperback|hardback|hardcover|new|fiftieth|25th|50th)\s+edition\b|\bthis edition\b|\bpre-?order\b|\bnew in paperback\b|\bfor use in schools\b|\bcover art\b|\bnew (introduction|foreword|afterword|preface)\b|\bcomprehensively updated\b/i;
function stripEditionClaims(text) {
  if (!text) return text;
  const kept = String(text)
    .replace(/^(PRE-?ORDER NOW:?|C-format)\s*/i, "")
    .split(/(?<=[.!?])\s+(?=[A-Z"'‘“(])/)
    .filter((s) => !EDITION_CLAIM.test(s))
    .join(" ")
    .trim();
  return kept || undefined;
}

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

const OL_HEADERS = { "User-Agent": "BooksTempleNepal/1.0 (bookstemple01@gmail.com)" };
async function openLibraryJson(path) {
  const r = await fetchRetry(`https://openlibrary.org${path}.json`, { headers: OL_HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Open Library ${r.status}`);
  return r.json();
}

// Resolve the EXACT edition by ISBN (…/isbn/<isbn>.json) so the publisher/pages
// belong to that specific edition — the work-level search returns an aggregated
// publisher list whose first entry is frequently the wrong edition.
//
// The edition record names its authors only by key and carries no blurb, so
// both are followed: author keys to names, and the edition's work for its
// description. Without that this path returned neither — and it is the path
// every import falls back to whenever Google has nothing.
async function fromOpenLibraryIsbn(isbn) {
  const ed = await openLibraryJson(`/isbn/${encodeURIComponent(isbn)}`);
  if (!ed || !ed.title) return null;
  const edLang = ed.languages?.[0]?.key?.split("/").pop();

  const workKey = ed.works?.[0]?.key;
  const work = workKey ? await openLibraryJson(workKey).catch(() => null) : null;
  const authorKeys = (ed.authors?.length ? ed.authors.map((a) => a.key) : (work?.authors || []).map((a) => a.author?.key))
    .filter(Boolean)
    .slice(0, 4);
  const names = await Promise.all(
    authorKeys.map((k) => openLibraryJson(k).then((a) => a?.name).catch(() => undefined)),
  );
  const rawDescription = typeof work?.description === "string" ? work.description : work?.description?.value;

  return {
    source: "openlibrary",
    match: "isbn",
    title: ed.title,
    author: formatAuthors(names.filter(Boolean)),
    description: plainText(rawDescription),
    coverUrl: ed.covers?.[0]
      ? `https://covers.openlibrary.org/b/id/${ed.covers[0]}-L.jpg`
      : undefined,
    isbn13: Array.isArray(ed.isbn_13) ? ed.isbn_13[0] : undefined,
    isbn10: Array.isArray(ed.isbn_10) ? ed.isbn_10[0] : undefined,
    categories: Array.isArray(work?.subjects) ? work.subjects.slice(0, 5) : [],
    specifications: {
      pages: ed.number_of_pages || undefined,
      publisher: Array.isArray(ed.publishers) ? ed.publishers[0] : undefined,
      publishedDate: ed.publish_date || undefined,
      language: mapLang(edLang),
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
const googleIds = (v) =>
  (Array.isArray(v.industryIdentifiers) ? v.industryIdentifiers : []).map((x) => String(x.identifier || "").replace(/[^0-9Xx]/g, ""));

function mapGoogleVolume(v) {
  const cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
  const ids = Array.isArray(v.industryIdentifiers) ? v.industryIdentifiers : [];
  const pick = (type) => ids.find((x) => x.type === type)?.identifier || null;
  return {
    source: "google",
    title: v.title,
    author: formatAuthors(v.authors),
    coverUrl: cover
      ? cover.replace(/^http:/, "https:").replace(/&edge=curl/, "")
      : undefined,
    isbn13: pick("ISBN_13"),
    isbn10: pick("ISBN_10"),
    description: plainText(v.description),
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

// A volume that is the same WORK but not provably the same edition: keep only
// what describes the work. Its ISBNs, cover, pages and publisher belong to some
// other printing and would be wrong on ours.
function workLevel(v) {
  const m = mapGoogleVolume(v);
  return {
    source: "google",
    match: "work",
    title: m.title,
    author: m.author,
    description: stripEditionClaims(m.description),
    categories: m.categories,
    isbn13: null,
    isbn10: null,
    coverUrl: undefined,
    specifications: { language: m.specifications.language },
  };
}

// An API key raises the keyless quota (which 429s quickly) — strongly
// recommended for bulk lookups. The quota that runs out under a backfill is
// per-minute, so a 429 moves to the spare key first and only then backs off;
// the spare used to be swapped in by hand when the main key started 429ing.
async function googleSearch(q, maxResults = 1) {
  const keys = [process.env.GOOGLE_BOOKS_API_KEY, process.env.GOOGLE_BOOKS_API_KEY_SPARE].filter(Boolean);
  const url = (key) =>
    `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=${maxResults}&printType=books${key ? `&key=${key}` : ""}`;
  const attempts = Math.max(keys.length, 1) * 3;
  let r;
  for (let i = 0; i < attempts; i += 1) {
    r = await fetch(url(keys[i % Math.max(keys.length, 1)]));
    if (r.status !== 429) break;
    // Every key tried once this round: wait before the next round.
    if ((i + 1) % Math.max(keys.length, 1) === 0) await sleep(1500 * ((i + 1) / Math.max(keys.length, 1)));
  }
  if (!r.ok) throw new Error(`Google Books ${r.status}`);
  return ((await r.json())?.items || []).map((i) => i.volumeInfo).filter(Boolean);
}

// Google stopped answering field-qualified queries for our keys (Oct 2026):
// `isbn:`, `intitle:` and `inauthor:` all return zero results, even for
// The Hobbit, while the same book found by plain words comes back complete.
// So the qualified query is tried first (exact, and the right one whenever it
// works) and a plain-text search follows — whose candidates must then prove
// they are our book before anything is taken from them.
const plainQuery = (title, author) =>
  encodeURIComponent([String(title || "").replace(/\s*\([^)]*\)\s*/g, " "), surnames(author)[0] || ""].join(" ").replace(/\s+/g, " ").trim());

async function fromGoogleIsbn(isbn, hints = {}) {
  const exact = await googleSearch(`isbn:${encodeURIComponent(isbn)}`, 1);
  if (exact[0]) return { ...mapGoogleVolume(exact[0]), match: "isbn" };
  if (!hints.title) return null;

  const items = await googleSearch(plainQuery(hints.title, realAuthor(hints.author)), 10);
  const wanted = new Set([toIsbn13(isbn), toIsbn10(isbn), String(isbn)].filter(Boolean));
  // The same edition, found by words: as good as the ISBN query.
  const sameEdition = items.find((v) => googleIds(v).some((id) => wanted.has(id)));
  if (sameEdition) return { ...mapGoogleVolume(sameEdition), match: "isbn" };

  // The same work: exact title, an author who agrees, and the language we sell.
  // Without a known author a title alone is not enough — generic titles
  // ("Fever Dream", "Think Like a CEO") name several unrelated books.
  const author = realAuthor(hints.author);
  if (!author) return null;
  const lang = langCode(hints.language);
  const work = items
    .filter((v) => titleMatches(hints.title, v) && authorAgrees(author, v.authors) && (!v.language || v.language === lang))
    .sort((a, b) => String(b.description || "").length - String(a.description || "").length)[0];
  return work ? workLevel(work) : null;
}

// Title/author search (no ISBN). The top hit is accepted only if its title is
// ours and, when an author was given, the author agrees.
async function fromGoogleSearch({ title, author } = {}) {
  if (!title) return null;
  const items = await googleSearch(plainQuery(title, author), 10);
  const v = items.find((x) => titleMatches(title, x) && (!realAuthor(author) || authorAgrees(author, x.authors)));
  return v ? mapGoogleVolume(v) : null;
}

// ── Public API ───────────────────────────────────────────
async function attempt(name, fn) {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err: err.message, provider: name }, "book lookup provider failed");
    return null;
  }
}

// Edition facts (ISBNs, cover, pages, publisher) come only from a source that
// matched this exact ISBN. Work facts (blurb, author, categories) come from
// whichever source has them, Google first — its blurbs are the fuller ones.
function combine(google, openlibrary) {
  const sources = [google, openlibrary].filter(Boolean);
  if (!sources.length) return null;
  const exact = google?.match === "isbn" ? google : openlibrary;
  const first = (key) => sources.map((s) => s[key]).find((v) => (Array.isArray(v) ? v.length : v));
  const base = exact || google;
  return {
    ...base,
    match: exact ? "isbn" : "work",
    author: first("author"),
    description: first("description"),
    categories: first("categories") || [],
  };
}

/**
 * ISBN metadata lookup. Returns normalised data or null; never throws.
 *
 * `hints` ({ title, author, language }) is optional but worth passing: Google
 * no longer answers its ISBN query, and with a title it can still be searched
 * by words (see fromGoogleIsbn). The result's `match` is "isbn" when the
 * edition facts belong to this exact ISBN, "work" when only the work-level
 * facts (blurb, author, categories) could be confirmed.
 */
async function lookupByIsbn(isbn, hints = {}) {
  if (typeof fetch !== "function") return null;
  const google = await attempt("google", () => fromGoogleIsbn(isbn, hints));
  // Exact and complete: nothing Open Library could add.
  if (google?.match === "isbn" && google.description && google.author) return google;
  const openlibrary = await attempt("openlibrary", () => fromOpenLibraryIsbn(isbn));
  return combine(google, openlibrary);
}

/**
 * General lookup by any combination of { isbn, title, author, publisher }.
 * ISBN (when present) wins and uses the ISBN path above. Otherwise it searches
 * by title/author: Google first — its hit is verified against the title (and
 * author, when given) and carries a blurb — then Open Library, whose search
 * returns no blurb and an arbitrary edition's publisher, so it only fills what
 * Google left blank. Returns normalised data or null; never throws.
 */
async function lookupBook(query = {}) {
  if (typeof fetch !== "function") return null;
  const { isbn, title, author, publisher } = query;
  if (isbn) return lookupByIsbn(isbn, { title, author });
  if (!title && !author && !publisher) return null;
  const google = await attempt("google", () => fromGoogleSearch({ title, author }));
  if (google?.description && google.author) return google;
  const openlibrary = await attempt("openlibrary", () => fromOpenLibrarySearch({ title, author, publisher }));
  if (!google) return openlibrary;
  return {
    ...google,
    author: google.author || openlibrary?.author,
    categories: google.categories?.length ? google.categories : openlibrary?.categories || [],
  };
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
