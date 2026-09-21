'use strict';

/**
 * Create the 16-genre taxonomy (GENRE-TAXONOMY-PROPOSAL.md).
 *
 * The Book.genre field is a free string with no enum, so nothing stops a book
 * pointing at a slug that has no Genre document — the book just ends up on a
 * genre page that 404s. Run this BEFORE reclassify-genres.js so every slug the
 * reclassifier can produce already exists.
 *
 * Idempotent: upserts by slug, so re-running only fills in what's missing and
 * never clobbers copy an admin has since edited (description/curatorNote are
 * only set on insert).
 *
 * Retired genres are left in place; remove them with --prune once the
 * reclassification has emptied them.
 *
 * Usage:
 *   node scripts/seed-taxonomy.js
 *   node scripts/seed-taxonomy.js --prune   # delete retired genres holding 0 books
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const Genre = require('../src/models/genre.model');
const Book = require('../src/models/book.model');

// description doubles as the BLUF intro on each genre page (CLAUDE.md: 40–80
// words, extractable). Kept factual and Nepal-specific rather than salesy.
const TAXONOMY = [
  ['fiction', 'Fiction', 'Literary and contemporary novels, from modern classics to current award winners, stocked in Nepal with NPR pricing and cash on delivery.'],
  ['sci-fi-fantasy', 'Science Fiction & Fantasy', 'Speculative fiction, epic fantasy and science fiction — series and standalones, delivered across all seven provinces of Nepal.'],
  ['mystery-thriller', 'Mystery & Thriller', 'Crime novels, psychological thrillers, detective fiction and horror, available in Nepal with cash on delivery.'],
  ['romance', 'Romance', 'Contemporary and classic romance, from literary love stories to commercial bestsellers, priced in NPR.'],
  ['young-adult', 'Young Adult', 'Fiction written for teenage and young adult readers, spanning contemporary, fantasy and coming-of-age stories.'],
  ['childrens', "Children's", 'Picture books, early readers and middle-grade fiction for younger readers in Nepal.'],
  ['biography-memoir', 'Biography & Memoir', 'Life writing — autobiography, memoir and biography of figures from Nepal and around the world.'],
  ['business-economics', 'Business & Economics', 'Management, entrepreneurship, investing, marketing and economics titles for readers and professionals in Nepal.'],
  ['self-help', 'Self-Help', 'Habits, productivity, personal growth and motivation — the titles readers in Nepal buy most, with cash on delivery.'],
  ['psychology', 'Psychology', 'Behavioural science, cognitive psychology and mental health writing for general readers.'],
  ['spirituality-religion', 'Spirituality & Religion', 'Scripture, yoga, meditation and religious philosophy, including Hindu and Buddhist texts widely read in Nepal.'],
  ['philosophy', 'Philosophy', 'Classical and modern philosophy — ethics, metaphysics and political thought, in accessible editions.'],
  ['politics-society', 'Politics & Society', 'Current affairs, history, sociology and international relations, including titles on Nepal and South Asia.'],
  ['science-technology', 'Science & Technology', 'Popular science, technology and mathematics for general readers, delivered across Nepal.'],
  ['poetry', 'Poetry', 'Verse collections and anthologies, in English and in translation.'],
  ['nepali-literature', 'Nepali Literature', 'Nepali-language writing and books by Nepali authors — fiction, essays and poetry from Nepal’s own publishing scene.'],
  ['food-cooking', 'Food & Cooking', 'Cookbooks, recipe collections and food writing for home cooks in Nepal — regional Nepali and Indian cuisine, international recipes, baking, and the culture of spices and flavour. Priced in NPR with cash on delivery to all seven provinces.'],
  ['art-craft', 'Art & Craft', 'Art and craft books for makers in Nepal — drawing, painting and calligraphy, arts-and-crafts project books, art journals and colouring, and titles on design and handmade work. Practical guides and inspiration, priced in NPR with cash on delivery nationwide.'],
  ['health-wellness', 'Health & Wellness', 'Health and wellness books stocked in Nepal — nutrition and diet, fitness, sleep, mental wellbeing and everyday self-care, and accessible guides to the body and healthy living. Written for general readers, priced in NPR with cash on delivery.'],
  ['games-hobbies', 'Games & Hobbies', 'Books on games and hobbies for readers in Nepal — chess and puzzles, card and board games, gardening and other pastimes, and guides to picking up a new skill for fun. Priced in NPR with cash on delivery across all seven provinces.'],
  ['education-reference', 'Education & Reference', 'Reference and learning books for students and self-learners in Nepal — dictionaries, grammar and vocabulary, language-learning courses, encyclopedias, and study and exam guides. Everyday reference priced in NPR with cash on delivery nationwide.'],
];

// Slugs the restructure removes. Kept until they are empty.
const RETIRED = ['general', 'games', 'strategy', 'horror', 'law', 'educational', 'biography', 'business', 'politics', 'spirituality'];

// Where an import lands when the subject data doesn't determine a genre.
//
// This replaces the old `general` fallback, and the difference that matters is
// isActive: false — `general` was a *public, merchandised* genre page, so every
// unclassifiable import quietly swelled it until it held 90% of the catalogue
// and nobody noticed. A hidden holding pen makes the same failure visible as a
// backlog to work through instead of a browsable page full of everything.
const HOLDING = [
  'unclassified',
  'Unclassified',
  'Books awaiting a genre. Not shown in the storefront — this is an internal holding area for imports whose subject data was inconclusive.',
];

async function main() {
  const prune = process.argv.includes('--prune');
  await connectMongo();

  let created = 0;
  let existing = 0;
  for (const [slug, name, description] of TAXONOMY) {
    const res = await Genre.updateOne(
      { slug },
      {
        $set: { name, isActive: true },
        // Only on insert — never overwrite copy an admin has edited.
        $setOnInsert: {
          description,
          metaTitle: `${name} Books in Nepal`,
          metaDesc: description.slice(0, 155),
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount) created += 1;
    else existing += 1;
  }
  console.log(`taxonomy: ${created} created, ${existing} already present (${TAXONOMY.length} total)`);

  // The holding pen — exists so unclassified books never point at a missing
  // genre, but isActive:false keeps it out of the mega-menu and genre listings.
  const [hSlug, hName, hDesc] = HOLDING;
  await Genre.updateOne(
    { slug: hSlug },
    { $set: { name: hName, isActive: false }, $setOnInsert: { description: hDesc } },
    { upsert: true }
  );
  console.log(`holding genre "${hSlug}" ensured (hidden from the storefront)`);

  // Report what still sits on retired slugs.
  console.log('\nretired slugs still holding books:');
  let blocked = 0;
  for (const slug of RETIRED) {
    const n = await Book.countDocuments({ genre: slug });
    if (n > 0) {
      blocked += 1;
      console.log(`  ${String(n).padStart(5)}  ${slug}`);
    }
  }
  if (blocked === 0) console.log('  (none — safe to prune)');

  if (prune) {
    const empty = [];
    for (const slug of RETIRED) {
      if ((await Book.countDocuments({ genre: slug })) === 0) empty.push(slug);
    }
    if (empty.length) {
      const res = await Genre.deleteMany({ slug: { $in: empty } });
      console.log(`\npruned ${res.deletedCount} empty retired genre(s): ${empty.join(', ')}`);
    } else {
      console.log('\nnothing pruned — every retired genre still holds books.');
    }
  }

  // Genre.bookCount is denormalised and was stale for every genre (all zero),
  // which is why the header mega-menu showed no counts. Recompute from source.
  const counts = await Book.aggregate([
    { $match: { isActive: true, genre: { $ne: null } } },
    { $group: { _id: '$genre', n: { $sum: 1 } } },
  ]);
  await Genre.updateMany({}, { $set: { bookCount: 0 } });
  for (const c of counts) await Genre.updateOne({ slug: c._id }, { $set: { bookCount: c.n } });
  console.log(`\nbookCount refreshed for ${counts.length} genre(s)`);

  await disconnectMongo();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectMongo().catch(() => {});
  process.exit(1);
});
