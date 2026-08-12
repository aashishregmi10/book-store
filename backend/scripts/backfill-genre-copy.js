'use strict';

/*
 * Give every genre a real BLUF intro.
 *
 * seed-taxonomy.js writes `description` with $setOnInsert so it never clobbers
 * copy an admin edited — which also means it can never REPAIR copy. Production
 * ended up holding placeholders ("Test for fiction", "Poetry Test") and three
 * empty strings, and the genre page had stopped rendering the field at all, so
 * nobody noticed. This backfills real copy for the slugs listed below.
 *
 * Why it matters: a genre page whose only text is its H1 and a product grid is
 * a thin page. These are the URLs targeting "{genre} books in nepal", so they
 * need something worth ranking. Each entry leads with an extractable definition
 * (CLAUDE.md: 40-80 word BLUF) and then says what a reader in Nepal actually
 * gets, without repeating one template sixteen times.
 *
 * Dry-run by default — prints what it would replace. Pass --apply to write.
 *
 *   node scripts/backfill-genre-copy.js
 *   node scripts/backfill-genre-copy.js --apply
 *
 * Requires MONGODB_URI.
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Genre = require('../src/models/genre.model');

const APPLY = process.argv.includes('--apply');

// Deliberately varied in shape as well as content: the previous blurbs were
// removed precisely because they read as one sentence with a word swapped.
const COPY = {
  fiction:
    'Fiction is invented storytelling: novels and short-story collections built from imagined characters and events rather than reported fact. This shelf spans the modern classics that turn up on every reading list, contemporary literary prize-winners, and the commercial bestsellers people actually finish. If you are starting somewhere, the short novels are the kindest entry point; the doorstops reward a holiday. Everything here is priced in Nepali Rupees and ships anywhere in Nepal on cash on delivery, so you can pay when the book is in your hands.',

  'sci-fi-fantasy':
    'Science fiction and fantasy are the literatures of the impossible. One extrapolates from what science might permit, the other builds worlds that answer to their own rules. Expect epic multi-book sagas, standalone novels you can finish in a weekend, dystopias, space opera and quiet speculative fiction. Series are the thing to watch here: check which volume you are buying, because book three of a trilogy is a poor place to begin. Prices are in NPR, and we deliver to all seven provinces with cash on delivery.',

  'mystery-thriller':
    'Mystery and thriller writing is built on withheld information: a crime to solve, a threat closing in, or a narrator you cannot quite trust. The shelf covers classic detective fiction, police procedurals, psychological suspense, legal and spy thrillers, and horror. These are the books readers describe as unputdownable, which makes them a reliable gift and a good way back into reading after a long gap. Paperbacks dominate, so this is one of the more affordable shelves in the shop. NPR pricing, cash on delivery nationwide.',

  romance:
    'Romance centres a love story and, by convention, delivers an emotionally satisfying ending. The range is wider than the reputation suggests: literary love stories, historical romance, contemporary and small-town novels, and the commercial bestsellers that dominate reader recommendations online. Popular series often run to many volumes, so it is worth checking the reading order before ordering. Every title is listed in Nepali Rupees, packed carefully, and delivered across Nepal on cash on delivery.',

  'young-adult':
    'Young adult fiction is written for readers roughly 13 to 18, though a large share of the audience is older. The defining feature is a protagonist of about that age facing a first: first love, first loss, first real decision. The shelf covers contemporary realism, fantasy, dystopia and coming-of-age stories. It is a dependable place to look for a gift for a teenager who says they do not read, because the pacing tends to be quick. NPR prices and cash on delivery anywhere in Nepal.',

  childrens:
    "Children's books here run from board books and picture books for the very young, through early readers, to middle-grade novels for roughly ages eight to twelve. The useful thing to match is reading stage rather than age: a confident seven-year-old and a reluctant ten-year-old often want the same book. Illustrated hardbacks make durable gifts; paperback series keep a new reader going. Everything is priced in Nepali Rupees, and cash on delivery means you can check the condition of a gift before paying.",

  'biography-memoir':
    'Biography and memoir are life writing: biography written about someone, memoir and autobiography written by them. The shelf covers political figures, scientists, athletes, business founders, writers, and people whose single extraordinary experience became a book. Readers who say they do not enjoy novels often turn out to read this shelf happily, because the events are real. Expect a mix of recent bestsellers and long-standing standards, all priced in NPR and delivered across Nepal with cash on delivery.',

  'business-economics':
    'Business and economics covers how organisations and markets actually work: management, entrepreneurship, marketing, negotiation, investing, personal finance and popular economics. The practical titles suit anyone running or joining a business in Nepal; the popular-economics end is closer to narrative non-fiction and reads like it. This is one of the shelves where edition matters most, since data-heavy books date, so check the year before buying. Prices are in Nepali Rupees, with cash on delivery to all seven provinces.',

  'self-help':
    'Self-help is practical non-fiction aimed at changing something specific: habits, focus, confidence, money, relationships or how you spend your time. The strongest books in the category are built on research and give you something to do; the weakest restate one idea for two hundred pages, so reviews are worth reading first. This is consistently among the most-bought shelves in Nepal, which keeps popular titles in stock and competitively priced. NPR pricing, cash on delivery nationwide.',

  psychology:
    'Psychology books explain why people think, feel and behave as they do, drawing on research rather than opinion. The shelf ranges from accessible popular psychology on decision-making, memory and bias, through books on anxiety, trauma and relationships, to introductory texts used by students. It overlaps with self-help but is descriptive where self-help is prescriptive: it explains the mechanism rather than prescribing a routine. Listed in Nepali Rupees and delivered anywhere in Nepal on cash on delivery.',

  'spirituality-religion':
    'This shelf holds scripture, commentary and writing on religious and spiritual practice, with Hindu and Buddhist texts prominent among them, alongside comparative religion, meditation and contemporary spiritual writing. Editions differ enormously: translation, commentary, script and completeness all vary between printings of the same title, so it is worth checking which edition you are ordering. Many titles are available in both Nepali and English. Everything is priced in NPR with cash on delivery across the country.',

  philosophy:
    'Philosophy is the systematic examination of the questions that resist measurement: what exists, what we can know, what a good life requires. The shelf runs from primary texts by Plato, the Stoics and the modern European tradition to readable introductions and histories written for newcomers. Start with a good introduction rather than a primary text if the field is new to you; the classics are short but rarely easy. Priced in Nepali Rupees, delivered across Nepal with cash on delivery.',

  'politics-society':
    'Politics and society covers how power is held and contested, and how societies change: political history, current affairs, sociology, journalism and long-form reportage. Alongside international titles the shelf carries writing on Nepal and South Asia specifically, which is where readers here tend to start. These books date faster than most, so publication year is worth a look before ordering. All prices are in Nepali Rupees and every order can be paid on delivery.',

  'science-technology':
    'Science and technology books explain the physical and digital world for readers who are not specialists: physics, biology, medicine, mathematics, computing, engineering and the history of how discoveries were made. Popular science reads like narrative non-fiction and needs no background; reference and textbook titles assume more, so check the level before buying. Editions matter in fast-moving fields. Prices are listed in NPR, with cash on delivery to all seven provinces of Nepal.',

  poetry:
    'Poetry is language compressed: verse written to be reread rather than got through. The shelf holds single-poet collections, anthologies that are the sensible way in if you are unsure what you like, and translations that let you read across languages. Nepali poetry sits alongside English-language work, and slim volumes make this one of the more affordable shelves in the shop. Because collections are short, a poetry book is easy to give and hard to regret. NPR pricing, cash on delivery nationwide.',

  'nepali-literature':
    'Nepali literature is writing from and about Nepal: novels, short stories, poetry and essays, in Nepali and in English translation. The shelf carries the writers taught in schools and colleges here alongside contemporary fiction, including work that never reaches international publishers and is genuinely difficult to buy outside the country. If you are building a shelf of Nepali writing, this is the place to start. Prices are in Nepali Rupees, with delivery and cash on delivery available across all seven provinces.',
};

const wc = (s) => s.trim().split(/\s+/).length;

(async function main() {
  await connectMongo();
  try {
    let changed = 0;
    let missing = 0;

    for (const [slug, description] of Object.entries(COPY)) {
      const genre = await Genre.findOne({ slug }).select('slug name description metaTitle metaDesc').lean();
      if (!genre) {
        logger.warn({ slug }, 'genre not found — run seed-taxonomy.js first');
        missing += 1;
        continue;
      }
      const before = (genre.description || '').trim();
      if (before === description.trim()) continue;

      logger.info(
        { slug, words: wc(description), replacing: before ? `${before.slice(0, 60)}…` : '(empty)' },
        APPLY ? 'updating' : 'would update'
      );
      changed += 1;

      if (APPLY) {
        await Genre.updateOne(
          { slug },
          {
            $set: {
              description,
              // metaDesc has a length budget; keep it a clean sentence rather
              // than a hard slice mid-word.
              metaDesc: description.slice(0, description.lastIndexOf('.', 155) + 1) || description.slice(0, 155),
              ...(genre.metaTitle ? {} : { metaTitle: `${genre.name} Books in Nepal` }),
            },
          }
        );
      }
    }

    logger.info(
      { changed, missing, applied: APPLY },
      APPLY ? 'Genre copy updated' : 'Dry run — pass --apply to write'
    );
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'backfill-genre-copy failed');
  process.exit(1);
});
