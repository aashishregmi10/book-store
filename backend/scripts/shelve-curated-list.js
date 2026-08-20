'use strict';

/*
 * Shelve and publish a hand-curated list from the shop owner.
 *
 * ~250 titles picked out of the hidden backlog, each with a proposed genre in
 * free text ("True Crime / Cybercrime / Non-fiction"). This maps every one onto
 * the closed 16-slug taxonomy, because free-text genres are exactly what
 * produced the original mess — see /CLAUDE.md.
 *
 * NO NEW GENRE IS CREATED, and none is needed. Every awkward kind on the list
 * already has a home the live catalogue established:
 *
 *   cookbook (Nepali)       → nepali-literature   (Timmur is shelved there)
 *   law / legal reference   → politics-society    (Oxford Dictionary of Law)
 *   test prep, dictionaries,
 *   health, reference       → science-technology  (IELTS, Oxford Dict of Chemistry)
 *   comics / superhero      → category `manga`    (Batman, Superman — genre unset)
 *   Nepal non-fiction,
 *   travel, birds           → nepali-literature   (History of Nepal, Kathmandu Dilemma)
 *
 * Shelving and publishing stay separate, as everywhere else in this repo: a
 * genre is reversible metadata, publishing puts a book on a public crawlable
 * URL. So every match gets its genre, and only the ones that clear the same
 * gates publish-ready-drafts.js applies go live. Anything held back is listed
 * with its reason, so the report doubles as a worklist.
 *
 * Dry run by default.
 *   node scripts/shelve-curated-list.js
 *   node scripts/shelve-curated-list.js --apply
 *   node scripts/shelve-curated-list.js --apply --shelve-only
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');
const { isTemplateDescription } = require('../src/utils/cleanDescription');

const MIN_DESC_CHARS = 200;
const HOLDING = 'unclassified';

// [title, genre, category]. genre null + category 'manga' follows the live
// comics precedent, where the section carries the book and genre is unset.
const LIST = [
  // ── batch 1 ──────────────────────────────────────────────
  ['The Love Songs of W.E.B. Du Bois', 'fiction', null],
  ['The Digital Matrix', 'business-economics', null],
  ['The Swift and the Harrier', 'fiction', null],
  ['Jerks at Work', 'business-economics', null],
  ["Agatha Christie's Poirot", 'mystery-thriller', null],
  ['The Great Tech Game', 'politics-society', null],
  ['The Lazarus Heist', 'science-technology', null],
  ['Killer in the Kremlin', 'politics-society', null],
  ['Acts of Service', 'fiction', null],
  ['Diana, William and Harry', 'biography-memoir', null],
  ['The Fight for Privacy', 'science-technology', null],
  ['Ideaflow', 'business-economics', null],
  ['Lata Mangeshkar', 'biography-memoir', null],
  ['The Case Of The Alperton Angels', 'mystery-thriller', null],
  ['This Book Will Change Your Mind About Mental Health', 'psychology', null],
  ['Bad Data', 'politics-society', null],
  ['Defeating the Dictators', 'politics-society', null],
  ['Progressive Capitalism', 'politics-society', null],
  ['Pathogenesis', 'science-technology', null],
  ['Scary Monsters', 'fiction', null],
  ['The Gender Bias', 'politics-society', null],
  ['The Daily Dad', 'self-help', null],
  ['Desperate Remedies', 'psychology', null],
  ['The Whole Story', 'politics-society', null],
  ["Putin's Prisoner", 'biography-memoir', null],

  // ── batch 2 ──────────────────────────────────────────────
  ['The Performance Paradox', 'self-help', null],
  ['Talking Heads', 'science-technology', null],
  ['Clear Thinking', 'self-help', null],
  ['How (Not) to Have an Arranged Marriage', 'romance', null],
  ['Extremely Online', 'science-technology', null],
  ["Osho: The Razor's Edge", 'spirituality-religion', null],
  ['Your Face Belongs to Us', 'science-technology', null],
  ['Hidden Potential', 'psychology', null],
  ['When China Attacks', 'politics-society', null],
  ['The Year of the Locust', 'mystery-thriller', null],
  ['The Bill Gates Problem', 'biography-memoir', null],
  ['Precisely', 'business-economics', null],
  ['Envisioning A Tibetan Luminary', 'spirituality-religion', null],
  ['How to Raise Happy and Successful Children', 'self-help', null],
  ['Meeting Churchill', 'biography-memoir', null],
  ['Law and the Economy in India', 'business-economics', null],
  ['Minecraft Mega Bite-Size Builds', 'childrens', 'kids'],
  ['The Joy of Wintering', 'self-help', null],
  ['The Delhi Model', 'politics-society', null],
  ['House of Huawei', 'business-economics', null],
  ['How Not to Die', 'science-technology', null],
  ['An Evening of Long Goodbyes', 'fiction', null],
  ['The Once and Future World Order', 'politics-society', null],
  ['Water Moon', 'sci-fi-fantasy', null],
  ['A Short History Of Nearly Everything', 'science-technology', null],

  // ── batch 3 ──────────────────────────────────────────────
  ['Pakistan: Ideologies', 'politics-society', null],
  ['The Man Who Became Cinema', 'biography-memoir', null],
  ['Abortion Stories', 'politics-society', null],
  ['How to Be Less Socially Anxious', 'psychology', null],
  ['My Friends', 'fiction', null],
  ['Jadunama', 'biography-memoir', null],
  ['Dark Squares', 'biography-memoir', null],
  ['Vanishing World', 'sci-fi-fantasy', null],
  ['Dissection of a Murder', 'mystery-thriller', null],
  ['Build: An Unorthodox Guide', 'business-economics', null],
  ['I Am a Cat', 'fiction', null],
  ['The Wealth Habit', 'business-economics', null],
  ['Golden Son', 'sci-fi-fantasy', null],
  ['Recession', 'business-economics', null],
  ['The Age of Alchemy', 'science-technology', null],
  ['Weddings', 'romance', null],
  ['Covid: Nasocheko', 'nepali-literature', null],
  ['Sports Encyclopedia', 'science-technology', null],
  ['Oxford Dictionary Of Physics', 'science-technology', null],
  ['Smash And Grab', 'politics-society', null],
  ['Collection Of Fantastic Fairy Tales For Children', 'childrens', 'kids'],
  ['Decision Time', 'psychology', null],
  ["The Revolution That Wasn't", 'business-economics', null],
  ['A Dictionary of Media and Communication', 'science-technology', null],
  ['War Without Rules', 'politics-society', null],

  // ── batch 4 ──────────────────────────────────────────────
  ['The Brianna Wiest Collection', 'self-help', null],
  ['Encyclopedia of Amazing Questions', 'childrens', 'kids'],
  ['Shiva Purana', 'spirituality-religion', null],
  ['X-Men', null, 'manga'],
  ['The World of David Walliams: Amazing Adventures', 'childrens', 'kids'],
  ['Percy Jackson: Ultimate Collection', 'sci-fi-fantasy', 'kids'],
  ['Nepalmandal Sanga Jodieko', 'nepali-literature', null],
  ['Superman Unchained', null, 'manga'],
  ['The All Time Favourite Classics', 'childrens', 'kids'],
  ['My First Picture Library', 'childrens', 'kids'],
  ['Superman: The Final Days of Superman', null, 'manga'],
  ['One Belt One Road', 'politics-society', null],
  ['Dr. Brian Weiss Collection', 'spirituality-religion', null],
  ['An Introduction to Tantric Philosophy', 'spirituality-religion', null],
  ['Tarot of the Divine', 'spirituality-religion', null],
  ['The Official Guide to the TOEFL', 'science-technology', null],
  ['The Official Guide to the GRE', 'science-technology', null],
  ['The Dharma Of Justice', 'spirituality-religion', null],
  ['When? Encyclopedia', 'childrens', 'kids'],
  ['Mithila Art', 'nepali-literature', null],
  ['The Maze Runner', 'young-adult', null],
  ['The Power of Creative Destruction', 'business-economics', null],
  ['The Original Rider Waite Tarot', 'spirituality-religion', null],
  ['Guinness World Records 2025', 'science-technology', null],
  ['Bhagavata Purana', 'spirituality-religion', null],

  // ── batch 5 ──────────────────────────────────────────────
  ['The Business of Philanthropy', 'business-economics', null],
  ["China's 90% Model", 'business-economics', null],
  ['Nepali Diaspora', 'nepali-literature', null],
  ['Science Experiments', 'childrens', 'kids'],
  ['Jataka Tales', 'childrens', 'kids'],
  ['Collection Of Virtue Stories For Children', 'childrens', 'kids'],
  ['The Great Artists', 'childrens', 'kids'],
  ['Mahabharata Stories', 'childrens', 'kids'],
  ['How? Encyclopedia', 'childrens', 'kids'],
  ['The Classic Shakespeare Collection', 'fiction', null],
  ['Guinness World Records 2024', 'science-technology', null],
  ['Tipu Sultan', 'biography-memoir', null],
  ['Stories with Life Lessons', 'childrens', 'kids'],
  ['Save Your Environment', 'childrens', 'kids'],
  ['Ratan Tata', 'biography-memoir', null],
  ['Incomplete Justice', 'politics-society', null],
  ['Land, Labour, and Agrarian Change', 'nepali-literature', null],
  ['Demystifying cybersecurity', 'science-technology', null],
  ['A Short History of America', 'politics-society', null],
  ['Ayla', 'nepali-literature', null],
  ['Anthropological Perspectives On Education In Nepal', 'nepali-literature', null],
  ['Mission R&AW', 'politics-society', null],
  ["Innnovator's Dilemma", 'business-economics', null],
  ['The Greatest Collection of Charles Dickens', 'fiction', null],

  // ── batch 6 ──────────────────────────────────────────────
  ['Analytical Codification of National Policies', 'nepali-literature', null],
  ['The Hunger Game Trilogy', 'young-adult', null],
  ['Raising Critical Thinkers', 'self-help', null],
  ["The World's Worst Children", 'childrens', 'kids'],
  ['Black Panther', null, 'manga'],
  ['The Architecture Book', 'science-technology', null],
  ["Nepal's Foreign Policy", 'nepali-literature', null],
  ['The Blue Commons', 'business-economics', null],
  ["The King's Road", 'politics-society', null],
  ['The Visionaries', 'philosophy', null],
  ['Sparks: China', 'politics-society', null],
  ['These Are the Plunderers', 'business-economics', null],
  ['Trouble', null, 'manga'],
  ['Green Hornet Volume 1', null, 'manga'],
  ['Green Hornet Sins Of The Father', null, 'manga'],
  ['Green Hornet: Year One', null, 'manga'],
  ['The Crisis Of Democratic Capitalism', 'business-economics', null],
  ['Read It Yourself with Ladybird', 'childrens', 'kids'],
  ['The Genetic Book of the Dead', 'science-technology', null],
  ['Strong Ground', 'self-help', null],
  ['The Maker of Filmmakers', 'biography-memoir', null],
  ["Kicking the Hornet's Nest", 'politics-society', null],
  ["To All The Boys I've Loved Before", 'young-adult', null],
  ['Dino World', 'childrens', 'kids'],

  // ── batch 7 ──────────────────────────────────────────────
  ['How to Win at College', 'self-help', null],
  ['Junja Bahadur Ko Muluki Ain', 'nepali-literature', null],
  ['IELTS 19 & IELTS 20 General Training', 'science-technology', null],
  ['Amazing Encyclopedia Books', 'childrens', 'kids'],
  ['Encyclopedia Of Knowledge', 'childrens', 'kids'],
  ['The Bright Ages', 'politics-society', null],
  ['No One Prayed Over Their Graves', 'fiction', null],
  ['Churchill : A Life', 'biography-memoir', null],
  ['Sunrise on the Reaping', 'young-adult', null],
  ['Unit X', 'science-technology', null],
  ['Bhutan : New Pathways', 'business-economics', null],
  ['Encylopedia Of Question And Answer', 'childrens', 'kids'],
  ['Sherlock Holmes', 'mystery-thriller', null],
  ['The Constitution Of The United States', 'politics-society', null],
  ['Etymological Dictionary Of Nepali', 'nepali-literature', null],
  ["Saved : A War Reporter", 'biography-memoir', null],
  ['Kid Scientists', 'childrens', 'kids'],
  ['Tibetan Buddhist Philosophy', 'spirituality-religion', null],
  ['September Love', 'poetry', null],
  ['Criminal Law General Principles', 'politics-society', null],
  ['Procedural Law', 'politics-society', null],
  ['The Book of Moods', 'psychology', null],
  ["Avtar Singh's Contract", 'politics-society', null],
  ['The Rough Guide To Nepal', 'nepali-literature', null],
  ['Moral Stories: Pack Of 10', 'childrens', 'kids'],

  // ── batch 8 ──────────────────────────────────────────────
  ['Animal Stories: Pack Of 10', 'childrens', 'kids'],
  ['STEAM : My First Engineering Library', 'childrens', 'kids'],
  ['Grasping Greatness', 'politics-society', null],
  ['How To Be You', 'philosophy', null],
  ["She's In Ctrl", 'science-technology', null],
  ['Why We Meditate', 'spirituality-religion', null],
  ['Who am I? Learn About Community Helpers', 'childrens', 'kids'],
  ['My Life in Design', 'biography-memoir', null],
  ['Phenomenological Reflections on Mindfulness', 'spirituality-religion', null],
  ['Love Letters to My Baby', 'self-help', null],
  ['Sicker in the Head', 'biography-memoir', null],
  ['Material World', 'science-technology', null],
  ['Birds of Nepal with Reference', 'nepali-literature', null],
  ['My First Box of Books', 'childrens', 'kids'],
  ['TAROT : Includes an Illustrated', 'spirituality-religion', null],
  ['Absolutely Everything', 'childrens', 'kids'],
  ['Indian Nepalis', 'nepali-literature', null],
  ['Death of an Industry', 'nepali-literature', null],
  ['Self Defence', 'science-technology', null],
  ['Robin Hood Maths', 'science-technology', null],
  ['Becoming Yourself', 'spirituality-religion', null],
  ['Big Trust', 'psychology', null],
  ['Seventy Years Of Nepal', 'nepali-literature', null],
  ['Outlive', 'science-technology', null],
  ['Your Mind, Your Rules', 'self-help', null],

  // ── batch 9 ──────────────────────────────────────────────
  ['The 21st Century Brain', 'science-technology', null],
  ['After Nations', 'politics-society', null],
  ['A Practical Dictionary of Modern Nepali', 'nepali-literature', null],
  ['Birds Of Nepal', 'nepali-literature', null],
  ['The Concept of Active Defence', 'politics-society', null],
  ['Evolving Security Dynamic', 'politics-society', null],
  ['Reimagining South Asia', 'politics-society', null],
  ['Face off India and China', 'politics-society', null],
  ['Breaking Non-Tariff Barriers', 'business-economics', null],
  ['Modi: Shaping a Global Order', 'politics-society', null],
  ['Beyond the Break', 'romance', null],
  ['Bridging Borders', 'nepali-literature', null],
  ['Migration, Development and Social Change', 'nepali-literature', null],
  ['An Antique Land', 'biography-memoir', null],
  ['Women in Power', 'politics-society', null],
  ['Neuromancer', 'sci-fi-fantasy', null],
  ['14 Lawyers', 'biography-memoir', null],
  ['Trekking In The Himalayas', 'nepali-literature', null],
  ['365 Wonders of the World', 'childrens', 'kids'],
  ['Bank 4.0', 'business-economics', null],
  ['Kissinger the Negotiator', 'biography-memoir', null],
  ['365 Amazing Questions and Answers', 'childrens', 'kids'],
  ['Understanding Sustainable Microfinance', 'business-economics', null],
  ['Too Smart for This', 'self-help', null],
  ['Collection Of Arabian Night Stories', 'childrens', 'kids'],

  // ── batch 10 ─────────────────────────────────────────────
  ['Collection Of Life Connect Moral Value Stories', 'childrens', 'kids'],
  ['Collection Of Go Green Books For Children', 'childrens', 'kids'],
  ['All Set To Read Stories book level 4', 'childrens', 'kids'],
  ['नेपाल गणतन्त्रबाट स्वतन्त्र', 'nepali-literature', null],
  ['पहिलो संसद', 'nepali-literature', null],
  ['All Set To Read Stories book level 2 phonic', 'childrens', 'kids'],
  ['All Set To Read Stories book level 5', 'childrens', 'kids'],
  ['All Set To Read Stories book level 2 Reader', 'childrens', 'kids'],
  ['All Set To Read Stories book level 3', 'childrens', 'kids'],
  ['Unicorn Stories', 'childrens', 'kids'],
  ['No Love Lost', 'fiction', null],
  ['The Fraud Squad', 'fiction', null],
  ['Shakespeare Stories', 'childrens', 'kids'],
  ['Original Sin: Power, Technology', 'politics-society', null],
  ['Eight Nights Of Flirting', 'young-adult', null],
  ['My First Experience', 'childrens', 'kids'],
  ["India's Tryst with the World", 'politics-society', null],
  ['Bhrashtachar', 'nepali-literature', null],
  ['Essential Legal Dictionary', 'nepali-literature', null],
  ['Awaken The Giant Within', 'self-help', null],
  ['Too Small To Fall', 'business-economics', null],
  ['The Making Of Hero', 'business-economics', null],
  ['Daughters of the Sun', 'politics-society', null],
  ['The Power Wish', 'spirituality-religion', null],
];

/** Lowercase, strip punctuation, collapse whitespace. Keeps Devanagari. */
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function parseArgs(argv) {
  const a = { apply: false, shelveOnly: false };
  for (const v of argv) {
    if (v === '--apply') a.apply = true;
    else if (v === '--shelve-only') a.shelveOnly = true;
  }
  return a;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').trim()}"`;

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectMongo();
  try {
    const liveGenres = new Set(
      (await Genre.find({ isActive: true }).select('slug').lean()).map((g) => g.slug)
    );
    // Fail loudly rather than writing a genre that renders "Genre not found".
    const bad = [...new Set(LIST.map((r) => r[1]).filter(Boolean))].filter((g) => !liveGenres.has(g));
    if (bad.length) throw new Error(`not live genres: ${bad.join(', ')}`);

    // Candidate pool: everything currently hidden. Matching against the whole
    // collection would risk re-shelving a live book on a loose title match.
    const hidden = await Book.find({ isActive: false })
      .select('slug title author genre category description coverImage price stock stockStatus')
      .lean();
    const byNorm = hidden.map((b) => ({ ...b, n: norm(b.title) }));

    const matched = [];
    const unmatched = [];
    const seen = new Set();

    for (const [title, genre, category] of LIST) {
      const n = norm(title);
      // Exact, then prefix either way, then substring. First unused hit wins.
      const pick =
        byNorm.find((b) => b.n === n && !seen.has(String(b._id))) ||
        byNorm.find((b) => b.n.startsWith(n) && !seen.has(String(b._id))) ||
        byNorm.find((b) => n.startsWith(b.n) && b.n.length > 8 && !seen.has(String(b._id))) ||
        byNorm.find((b) => b.n.includes(n) && n.length > 10 && !seen.has(String(b._id)));
      if (!pick) {
        unmatched.push(title);
        continue;
      }
      seen.add(String(pick._id));
      matched.push({ book: pick, genre, category, listTitle: title });
    }

    // Which matched books could actually go live? Same gates as
    // publish-ready-drafts.js — a genre that renders, real prose, cover, price, stock.
    const ready = [];
    const held = [];
    for (const m of matched) {
      const genreOk = m.genre ? liveGenres.has(m.genre) : false;
      if (!genreOk && !m.category) {
        held.push({ ...m, reason: 'no browsable genre or section' });
        continue;
      }
      const d = (m.book.description || '').trim();
      if (!d || d.length < MIN_DESC_CHARS) {
        held.push({ ...m, reason: 'description too short' });
        continue;
      }
      if (isTemplateDescription(d)) {
        held.push({ ...m, reason: 'placeholder description' });
        continue;
      }
      if (!m.book.coverImage?.secureUrl) {
        held.push({ ...m, reason: 'no cover image' });
        continue;
      }
      if (!m.book.price || m.book.price < 1) {
        held.push({ ...m, reason: 'price is zero or missing' });
        continue;
      }
      if (m.book.stockStatus === 'out-of-stock' || m.book.stockStatus === 'discontinued') {
        held.push({ ...m, reason: 'not in stock' });
        continue;
      }
      ready.push(m);
    }

    console.log(`${args.apply ? 'APPLYING' : 'DRY RUN'} — ${LIST.length} titles on the list`);
    console.log(`matched to a hidden book : ${matched.length}`);
    console.log(`not found                : ${unmatched.length}`);
    console.log(`would shelve             : ${matched.length}`);
    console.log(`would publish            : ${args.shelveOnly ? 0 : ready.length}`);
    console.log(`shelved but held back    : ${held.length}\n`);

    const dist = {};
    for (const m of matched) {
      const k = m.category ? `${m.genre || '(none)'} + section:${m.category}` : m.genre;
      dist[k] = (dist[k] || 0) + 1;
    }
    console.log('target shelves:');
    Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .forEach(([g, n]) => console.log(`  ${String(n).padStart(4)}  ${g}`));

    if (held.length) {
      const reasons = {};
      held.forEach((h) => (reasons[h.reason] = (reasons[h.reason] || 0) + 1));
      console.log('\nheld back from publishing (still shelved):');
      Object.entries(reasons)
        .sort((a, b) => b[1] - a[1])
        .forEach(([r, n]) => console.log(`  ${String(n).padStart(4)}  ${r}`));
    }

    if (unmatched.length) {
      console.log('\nno hidden book matched these list entries:');
      unmatched.forEach((t) => console.log(`  - ${t}`));
    }

    const stamp = Date.now();
    const csv = path.join(__dirname, '..', `curated-shelving-${stamp}.csv`);
    fs.writeFileSync(
      csv,
      ['slug,title,author,genre,section,price,action,reason']
        .concat(
          matched.map((m) => {
            const h = held.find((x) => String(x.book._id) === String(m.book._id));
            return [
              m.book.slug,
              m.book.title,
              m.book.author,
              m.genre || '',
              m.category || '',
              m.book.price,
              h ? 'shelved only' : args.shelveOnly ? 'shelved only' : 'shelved + published',
              h ? h.reason : '',
            ]
              .map(csvCell)
              .join(',');
          })
        )
        .join('\n'),
      'utf8'
    );
    console.log(`\nreview CSV: ${csv}`);

    if (!args.apply) {
      console.log('\nNothing was written. Re-run with --apply.');
      return;
    }

    let shelved = 0;
    let published = 0;
    for (const m of matched) {
      const set = {};
      const unset = {};
      if (m.genre) set.genre = m.genre;
      // Comics carry the section and no genre, matching the live Batman and
      // Superman rows — clearing the holding-pen value rather than leaving
      // `unclassified` behind on a published book.
      else if (m.book.genre === HOLDING) unset.genre = '';
      if (m.category) set.category = m.category;

      const goLive = !args.shelveOnly && ready.some((r) => String(r.book._id) === String(m.book._id));
      if (goLive) set.isActive = true;

      const update = { $set: set };
      if (Object.keys(unset).length) update.$unset = unset;
      await Book.updateOne({ _id: m.book._id }, update);
      shelved += 1;
      if (goLive) published += 1;
    }

    logger.info({ shelved, published, held: held.length, unmatched: unmatched.length }, 'curated list shelved');
    console.log(`\nshelved: ${shelved}`);
    console.log(`published: ${published}`);
    console.log('Book pages are ISR at revalidate=120, so these appear within ~2 minutes.');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'shelve-curated-list failed');
  process.exit(1);
});
