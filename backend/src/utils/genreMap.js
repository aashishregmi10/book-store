'use strict';

// Map third-party subject/category strings (Google Books `categories`,
// Open Library `subject`) onto PageTurn's own taxonomy:
//   • sections  → the fixed `category` enum: 'manga' | 'kids' | 'loksewa'
//   • genres    → a free-form genre slug ('fiction', 'business', …)
//
// This is a best-effort first guess for bulk imports — every imported book is a
// draft, so the admin confirms the genre before publishing. Sections win over
// genres (a children's novel belongs in `kids`, not `fiction`).

/**
 * @param {string[]} categories  provider category/subject strings
 * @param {string[]} signals     origin signals from detectOrigin() (Nepal hints)
 * @returns {{ genre: string } | { category: string } | null}
 */
function mapGenre(categories = [], signals = []) {
  const hay = (Array.isArray(categories) ? categories : []).map((c) => String(c).toLowerCase());
  const has = (...subs) => hay.some((c) => subs.some((s) => c.includes(s)));
  const nepali = Array.isArray(signals) && signals.some((s) => /nepal|devanagari/i.test(s));

  // ── Sections (fixed enum) take priority ──────────────────
  if (has('juvenile', 'children', "children's", 'picture book', 'early reader')) return { category: 'kids' };
  if (has('manga', 'graphic novel', 'comics', 'comic')) return { category: 'manga' };
  if (has('loksewa', 'civil service', 'competitive exam', 'public service commission')) return { category: 'loksewa' };

  // ── Genres ───────────────────────────────────────────────
  if (has('poetry')) return { genre: nepali ? 'nepali-literature' : 'poetry' };
  if (has('business', 'economics', 'management', 'marketing', 'finance', 'investing', 'entrepreneur')) {
    return { genre: 'business' };
  }
  if (has('self-help', 'self help', 'personal development', 'motivational', 'body, mind', 'success', 'psychology')) {
    return { genre: 'self-help' };
  }

  // "Fiction" must not match "Nonfiction"/"Non-fiction".
  const isFiction =
    hay.some((c) => c.includes('fiction') && !c.includes('nonfiction') && !c.includes('non-fiction')) ||
    has('novel', 'fantasy', 'romance', 'thriller', 'mystery', 'literary');
  if (isFiction) return { genre: nepali ? 'nepali-literature' : 'fiction' };

  // No category match but the book reads as Nepali → the local-literature silo.
  if (nepali) return { genre: 'nepali-literature' };

  return null;
}

module.exports = { mapGenre };
