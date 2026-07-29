'use strict';

// Classify a book from its own text — title, description, author — rather than
// from third-party subject strings.
//
// Why this exists alongside genreMap.js: that one maps clean provider subjects
// ("Business & Economics", "Juvenile Fiction") and is the right tool when a
// lookup succeeds. But Open Library has no record of a large share of this
// catalogue (regional printings, Indian-market editions, Daraz-sourced
// titles), so subject lookup returns nothing for them. Every one of those
// books does have a title and a description, and those turn out to be strongly
// indicative — "The Poetry of William Wordsworth", "Annihilation of Caste",
// "On Writing: A Memoir of The Craft".
//
// Matching is token/phrase based with real word boundaries, not substring:
// substring matching puts "invest" inside "investigation" and "god" inside
// "goddamn", which is exactly the kind of silent miscategorisation that is
// worse than leaving a book unclassified.

const GENRE_TERMS = {
  childrens: [
    'children', "children's", 'kids', 'picture book', 'fairy tale', 'fairytale', 'bedtime',
    'nursery', 'toddler', 'early reader', 'storybook', 'illustrated for children', 'young readers',
  ],
  'young-adult': ['young adult', 'teenage', 'teenager', 'coming of age', 'high school', 'ya novel'],
  'sci-fi-fantasy': [
    'fantasy', 'science fiction', 'sci fi', 'dystopian', 'dystopia', 'wizard', 'wizards', 'dragon',
    'dragons', 'sorcerer', 'magical', 'spaceship', 'alien', 'aliens', 'time travel', 'supernatural',
    'mythical', 'quest', 'kingdom', 'sorcery',
  ],
  'mystery-thriller': [
    'thriller', 'mystery', 'murder', 'detective', 'crime', 'suspense', 'whodunit', 'serial killer',
    'horror', 'haunted', 'ghost', 'espionage', 'spy', 'conspiracy', 'investigation', 'homicide',
  ],
  romance: ['romance', 'romantic', 'love story', 'falling in love', 'heartbreak', 'soulmate', 'lovers'],
  poetry: ['poetry', 'poems', 'poem', 'verse', 'verses', 'sonnet', 'sonnets', 'ghazal', 'haiku'],
  'biography-memoir': [
    'memoir', 'biography', 'autobiography', 'autobiographical', 'life story', 'his life', 'her life',
    'my life', 'life and times', 'personal journey', 'true story of',
  ],
  'business-economics': [
    'business', 'entrepreneur', 'entrepreneurship', 'startup', 'marketing', 'management', 'manager',
    'leadership', 'finance', 'financial', 'investing', 'investment', 'investments', 'investor',
    'wealth', 'wealthy', 'economy', 'economic', 'economics', 'negotiation', 'sales', 'profit',
    'corporate', 'stock market', 'trading', 'millionaire', 'billionaire', 'capitalism',
    'marketplace', 'branding', 'customers', 'advertising', 'advertisement',
    // Local share-trading titles are a real category on this shelf and are
    // published under romanised Nepali/Hindi names.
    'share bazar', 'share market', 'share bata', 'candlestick', 'karodpati', 'shares',
    // 'rich' is deliberately absent — "rich history", "rich flavours", "rich
    // tradition" are far more common in blurbs than the financial sense.
  ],
  'self-help': [
    'self help', 'self improvement', 'habits', 'habit', 'motivation', 'motivational', 'personal growth',
    'personal development', 'mindset', 'confidence', 'discipline', 'productivity', 'manifestation',
    'manifest', 'law of attraction', 'positive thinking', 'life lessons', 'self esteem', 'goals',
    'inspirational', 'transform your life', 'better life', 'happiness', 'purpose',
    // "Subconscious" is routinely set as two words on these editions.
    'subconscious', 'sub conscious', 'letting go', 'overthinking', 'procrastination',
  ],
  psychology: [
    'psychology', 'psychological', 'cognitive', 'behaviour', 'behavior', 'behavioural', 'behavioral',
    'emotions', 'emotional intelligence', 'mental health', 'anxiety', 'depression', 'therapy',
    'subconscious', 'neuroscience', 'resilience', 'trauma', 'the brain', 'human mind',
  ],
  'spirituality-religion': [
    'spiritual', 'spirituality', 'religion', 'religious', 'hindu', 'hinduism', 'buddhism', 'buddhist',
    'buddha', 'islam', 'muslim', 'quran', 'bible', 'christian', 'christianity', 'vedas',
    'vedic', 'upanishad', 'yoga', 'meditation', 'karma', 'dharma', 'enlightenment', 'monk', 'faith',
    'prayer', 'guru', 'zen', 'mindfulness', 'soul', 'divine', 'sacred', 'scripture', 'saint',
    // Transliterations vary by publisher — "Gita" is also printed Geeta/Gitaa,
    // and these South Asian devotional titles are a large part of the shelf.
    'gita', 'geeta', 'bhagwat', 'bhagavad', 'krishna', 'shiva', 'ramayan', 'ramayana', 'mahabharat',
    'puran', 'sutra', 'sadhana', 'bhakti', 'ashram', 'swami', 'yogi',
    // Esoteric/occult sits closest to this shelf in a general bookshop.
    'tarot', 'astrology', 'horoscope', 'zodiac', 'chakra', 'mantra', 'occult', 'numerology',
  ],
  philosophy: [
    'philosophy', 'philosopher', 'philosophical', 'ethics', 'existential', 'existentialism', 'stoic',
    'stoicism', 'metaphysics', 'morality', 'nietzsche', 'plato', 'socrates', 'aristotle',
    'consciousness', 'epistemology',
  ],
  'politics-society': [
    'politics', 'political', 'government', 'democracy', 'democratic', 'election', 'elections', 'caste',
    'society', 'societal', 'sociology', 'history', 'historical', 'war', 'revolution', 'empire',
    'colonial', 'colonialism', 'immigration', 'immigrant', 'immigrants', 'policy', 'diplomacy',
    'diplomatic', 'international relations', 'human rights', 'feminism', 'feminist', 'gender',
    'activism', 'journalism', 'constitution', 'geopolitics', 'nationalism', 'reform', 'protest',
  ],
  'science-technology': [
    'scientific', 'technology', 'physics', 'chemistry', 'biology', 'mathematics', 'algebra',
    'computer', 'computing', 'programming', 'coding', 'software', 'artificial intelligence',
    'machine learning', 'engineering', 'medicine', 'medical', 'evolution', 'universe', 'cosmos',
    'climate', 'astronomy', 'quantum', 'genetics', 'biotechnology', 'data science',
    // Reference and exam prep have no genre of their own in this taxonomy, and
    // they are unmistakably non-fiction study material — shelving them here
    // beats leaving dictionaries and IELTS workbooks unclassified.
    'dictionary', 'encyclopedia', 'thesaurus', 'grammar', 'vocabulary', 'textbook',
    'practice tests', 'exam', 'ielts', 'toefl', 'quiz', 'workbook', 'study guide', 'handbook',
    // Health/body/parenting is non-fiction reference with no shelf of its own
    // here; it reads as applied science rather than self-help.
    'health', 'wellness', 'nutrition', 'fitness', 'pregnancy', 'parenting', 'anatomy',
    'longevity', 'ageing', 'aging', 'immunity', 'diet', 'the human body',
  ],
  'nepali-literature': [
    'nepali', 'nepal', 'kathmandu', 'himalaya', 'himalayan', 'gorkha', 'newari', 'madhesh',
    'pokhara', 'everest',
  ],
  // 'literary' is deliberately absent: it appears in blurbs for non-fiction
  // ("literary style", "a literary sensation") and was pulling creativity and
  // essay collections onto the fiction shelf. 'novel'/'fiction' already cover
  // the real cases, including "literary fiction".
  fiction: ['novel', 'fiction', 'saga', 'short stories', 'a tale', 'storytelling'],
};

// Terms that are far more decisive when they appear in a TITLE than buried in
// marketing copy. A description mentioning "success" says little; a title
// containing "Poems" is the whole answer.
const TITLE_WEIGHT = 3;
const DESC_WEIGHT = 1;
const SUBJECT_WEIGHT = 2;

/** Lowercase, strip punctuation, collapse whitespace, pad for phrase matching. */
function normalise(s) {
  return ` ${String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

/** How many of `terms` appear in `text` as whole words/phrases. */
function hits(text, terms) {
  let n = 0;
  const matched = [];
  for (const term of terms) {
    if (text.includes(` ${term.replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ')} `)) {
      n += 1;
      matched.push(term);
    }
  }
  return { n, matched };
}

/**
 * Score every genre from the book's own text.
 *
 * @param {{title?:string, description?:string, author?:string, subjects?:string[]}} book
 * @returns {{genre:string, confidence:number, runnerUp?:string, evidence:string[]}|null}
 */
function classifyText({ title, description, author, subjects } = {}) {
  const titleText = normalise(`${title || ''} ${author || ''}`);
  const descText = normalise(description);
  const subjText = normalise((subjects || []).join(' '));

  // "Political science" and "social science" are politics, not science — the
  // bare word 'science' is deliberately absent from the science term list and
  // handled here so it can be excluded in those two contexts.
  const scienceish = (t) =>
    t.includes(' science ') && !t.includes(' political science ') && !t.includes(' social science ');

  const scores = new Map();
  const evidence = new Map();
  const add = (genre, weight, terms) => {
    if (!weight) return;
    scores.set(genre, (scores.get(genre) || 0) + weight);
    if (terms?.length) {
      evidence.set(genre, [...(evidence.get(genre) || []), ...terms]);
    }
  };

  for (const [genre, terms] of Object.entries(GENRE_TERMS)) {
    const t = hits(titleText, terms);
    const d = hits(descText, terms);
    const s = hits(subjText, terms);
    add(genre, t.n * TITLE_WEIGHT, t.matched);
    add(genre, d.n * DESC_WEIGHT, d.matched);
    add(genre, s.n * SUBJECT_WEIGHT, s.matched);
  }

  if (scienceish(titleText)) add('science-technology', TITLE_WEIGHT, ['science']);
  if (scienceish(descText)) add('science-technology', DESC_WEIGHT, ['science']);
  if (scienceish(subjText)) add('science-technology', SUBJECT_WEIGHT, ['science']);

  // A title set in Devanagari is a local-language edition. Scored below a
  // title keyword on purpose: a Hindi translation of a business book is still
  // a business book, so any content signal in the title should outrank this.
  // It only decides the case where nothing else matched at all.
  if (/[ऀ-ॿ]/.test(String(title || ''))) {
    add('nepali-literature', TITLE_WEIGHT, ['devanagari script']);
  }

  if (scores.size === 0) return null;

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [genre, top] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;

  return {
    genre,
    // Margin over the runner-up, same contract as genreMap so a caller can use
    // one threshold for both.
    confidence: top - second,
    // Absolute weight behind the winner. Callers must gate on this as well as
    // on the margin: a single stray description keyword scores 1 and wins by 1
    // against a field of zeroes, which looks confident and isn't. That is how
    // "wealth" in a blurb filed The Great Gatsby under business, and "war"
    // filed the Iliad under politics.
    score: top,
    runnerUp: ranked[1]?.[0],
    evidence: [...new Set(evidence.get(genre) || [])].slice(0, 6),
  };
}

module.exports = { classifyText, GENRE_TERMS };
