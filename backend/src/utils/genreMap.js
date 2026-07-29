'use strict';

// Map third-party subject/category strings (Google Books `categories`,
// Open Library `subject`) onto Books Temple's taxonomy:
//   • sections → the fixed `category` enum: 'manga' | 'kids' | 'loksewa'
//   • genres   → one of the 16 slugs in GENRES below
//
// History: the first version of this file recognised only 8 outcomes and
// returned null for everything else. Both import scripts fall back to
// `genre: 'general'` on null, which is how 90% of the catalogue ended up in a
// single bucket. Every genre in the taxonomy now has rules, and there is no
// "general" left to fall into.
//
// Scoring rather than first-match: provider subjects are noisy and a book
// routinely matches several buckets ("Business & Economics", "Psychology" and
// "Self-Help" all on one title). Each rule contributes weight, the highest
// total wins, and the margin over the runner-up becomes the confidence — which
// lets a bulk reclassification auto-apply the clear cases and set aside the
// genuinely ambiguous ones for a human.

const GENRES = [
  'fiction',
  'sci-fi-fantasy',
  'mystery-thriller',
  'romance',
  'young-adult',
  'childrens',
  'biography-memoir',
  'business-economics',
  'self-help',
  'psychology',
  'spirituality-religion',
  'philosophy',
  'politics-society',
  'science-technology',
  'poetry',
  'nepali-literature',
];

// [genre, weight, ...substrings]. Weight 3 = the subject names the genre almost
// unambiguously; 2 = strong; 1 = a hint that should lose to anything stronger.
const RULES = [
  ['poetry', 3, 'poetry', 'poems', 'verse', 'sonnet'],

  ['sci-fi-fantasy', 3, 'science fiction', 'fantasy', 'dystopian', 'space opera', 'epic fantasy'],
  ['sci-fi-fantasy', 2, 'magic', 'dragons', 'wizards', 'speculative'],

  ['mystery-thriller', 3, 'mystery', 'thriller', 'suspense', 'crime', 'detective', 'horror'],
  ['mystery-thriller', 2, 'noir', 'espionage', 'murder'],

  ['romance', 3, 'romance', 'romantic'],
  ['romance', 1, 'love stories'],

  ['young-adult', 3, 'young adult', 'ya fiction', 'teen', 'coming of age'],

  ['biography-memoir', 3, 'biography', 'autobiography', 'memoir'],
  ['biography-memoir', 2, 'personal memoirs', 'letters', 'diaries'],

  // Stems, not whole words: 'econom' catches economics/economic/economy,
  // 'invest' catches investing/investment/investments, 'financ' catches
  // finance/financial/financiers. The original whole-word list missed all of
  // those plural and adjectival forms, which is why subjects like
  // "Investments" or "Economic policy" matched no rule at all.
  ['business-economics', 3, 'business', 'econom', 'management', 'marketing', 'financ', 'invest', 'entrepreneur', 'commerce'],
  ['business-economics', 2, 'leadership', 'negotiation', 'startup', 'strategy', 'corporate', 'accounting', 'trade',
    'consumer behavior', 'consumer behaviour', 'decision making', 'money', 'millionaire', 'stock market', 'new products'],

  ['self-help', 3, 'self-help', 'self help', 'personal development', 'personal growth', 'motivational'],
  ['self-help', 2, 'habits', 'productivity', 'success', 'time management', 'self-improvement'],

  ['psychology', 3, 'psychology', 'psychoanalysis', 'behavioural science', 'behavioral science'],
  ['psychology', 2, 'cognitive', 'neuroscience', 'mental health', 'emotions'],

  ['spirituality-religion', 3, 'religion', 'spiritual', 'hindu', 'buddhis', 'islam', 'christian', 'yoga', 'meditation'],
  ['spirituality-religion', 2, 'mysticism', 'vedanta', 'scripture', 'theology', 'gita', 'sufi', 'dharma'],

  ['philosophy', 3, 'philosophy', 'philosophical', 'ethics', 'metaphysics', 'existential'],
  ['philosophy', 2, 'logic', 'stoic', 'epistemolog'],

  ['politics-society', 3, 'political science', 'politics', 'current affairs', 'history', 'social science', 'sociology'],
  ['politics-society', 2, 'government', 'international relations', 'law', 'war', 'anthropology', 'journalism', 'feminism'],

  // NB: bare 'science' is handled separately below — "Political Science" and
  // "Social Science" would otherwise tie this against politics-society.
  ['science-technology', 3, 'technology', 'computers', 'mathematics', 'engineering', 'medical'],
  ['science-technology', 2, 'physics', 'biology', 'chemistry', 'astronomy', 'artificial intelligence', 'nature', 'education', 'study aids'],

  // Deliberately weak: providers stamp "Fiction" on nearly every novel, so it
  // must lose to any specific fiction sub-genre that also matched.
  ['fiction', 1, 'literary', 'novel', 'short stories', 'classics'],
];

/**
 * @param {string[]} categories provider category/subject strings
 * @param {string[]} signals    origin signals from detectOrigin() (Nepal hints)
 * @returns {{genre:string, confidence:number, runnerUp?:string}
 *          |{category:string, confidence:number}
 *          |null}
 */
function mapGenre(categories = [], signals = []) {
  const hay = (Array.isArray(categories) ? categories : []).map((c) => String(c).toLowerCase());
  const has = (...subs) => hay.some((c) => subs.some((s) => c.includes(s)));
  const nepali = Array.isArray(signals) && signals.some((s) => /nepal|devanagari/i.test(s));

  // ── Sections (fixed enum) take priority over any genre ───
  if (has('juvenile', 'children', "children's", 'picture book', 'early reader')) {
    return { category: 'kids', confidence: 3 };
  }
  if (has('manga', 'graphic novel', 'comics', 'comic')) return { category: 'manga', confidence: 3 };
  if (has('loksewa', 'civil service', 'competitive exam', 'public service commission')) {
    return { category: 'loksewa', confidence: 3 };
  }

  // ── Score every genre ────────────────────────────────────
  const score = new Map();
  const bump = (g, w) => score.set(g, (score.get(g) || 0) + w);

  for (const [genre, weight, ...subs] of RULES) {
    if (has(...subs)) bump(genre, weight);
  }

  // "Fiction" as a bare subject, but never from "Nonfiction"/"Non-fiction".
  if (hay.some((c) => c.includes('fiction') && !c.includes('nonfiction') && !c.includes('non-fiction'))) {
    bump('fiction', 1);
  }

  // "Science" on its own means the discipline — but "Political Science" and
  // "Social Science" are politics subjects that merely contain the word.
  if (hay.some((c) => c.includes('science') && !c.includes('political science') && !c.includes('social science'))) {
    bump('science-technology', 3);
  }

  // A Nepali-language or Nepal-authored title belongs in the local silo, but
  // only when nothing more specific outscored it — a Nepali business book is
  // still a business book.
  if (nepali) bump('nepali-literature', 2);

  if (score.size === 0) return null;

  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  const [genre, top] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;

  // Confidence = how decisively the winner beat the runner-up. A book matching
  // one bucket at weight 3 and nothing else is certain; two buckets tied at 3
  // is a coin flip and belongs in review.
  return { genre, confidence: top - second, runnerUp: ranked[1]?.[0] };
}

module.exports = { mapGenre, GENRES };
