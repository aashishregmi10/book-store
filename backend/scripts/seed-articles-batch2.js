'use strict';

/*
 * Second batch of blog articles.
 *
 * Five articles is not a content programme, and the blog is the only part of
 * this site that can rank for anything other than a product query. These three
 * are chosen for what they can realistically win rather than for volume:
 *
 *  - "under NPR 500" is a commercial-investigational query with no good answer
 *    in the market and it maps directly onto stock we actually hold.
 *  - "how to spot a pirated book" is a question Nepali buyers genuinely ask,
 *    nobody local has written it properly, and it is the kind of concrete,
 *    attributable answer AI engines quote. It also builds the trust a COD shop
 *    lives on.
 *  - the Dostoevsky guide targets the "{title} book nepal" long tail, which is
 *    thousands of near-zero-competition queries. This one is the template.
 *
 * House rules applied: the excerpt is a self-contained 40-60 word answer (the
 * article page renders it as the lede, and it is what a featured snippet or an
 * AI answer lifts); every ## heading is a question answered immediately below;
 * prices are real and dated, because a stale number is worse than none; and
 * every recommendation links to a book actually in the catalogue.
 *
 * Idempotent: upserts by slug and preserves the original publishedAt.
 *
 *   node scripts/seed-articles-batch2.js
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Article = require('../src/models/article.model');
const Book = require('../src/models/book.model');

const readingTime = (body) => Math.max(1, Math.round(String(body).split(/\s+/).filter(Boolean).length / 200));

const ARTICLES = [
  {
    slug: 'best-books-under-500-nepal',
    title: 'Best Books Under NPR 500 in Nepal (2026)',
    metaTitle: 'Best Books Under NPR 500 in Nepal (2026)',
    excerpt:
      'You can buy a genuinely good book in Nepal for under NPR 500. The sweet spot is short classics and paperback self-help, where NPR 150 to 500 buys a complete, unabridged title rather than an abridgement. Here are the ones worth your money, with current prices.',
    metaDesc:
      'The best books you can buy in Nepal for under NPR 500, with real prices and what to avoid. Cash on delivery across all seven provinces.',
    category: 'Reading guides',
    tags: ['budget books', 'nepal', 'buying guide'],
    body: `A small budget is not a barrier to a good bookshelf in Nepal. Short classics have been out of copyright for decades, which is why a complete *Animal Farm* costs less than lunch, while modern hardbacks of the same length cost five times as much. This guide is about spending that budget well.

Prices below are what we charge as of August 2026 and move with our supplier, so treat them as a guide rather than a quote.

## What can you actually get for under NPR 500 in Nepal?

Three things: out-of-copyright classics, paperback self-help, and slim poetry collections. What you cannot get at this price is a new-release hardback or an illustrated reference book, and any listing promising one should be treated with suspicion.

## Which classics are worth buying first?

Short ones. A 100-page novel you finish beats a 900-page one you abandon.

- [Animal Farm](/books/animal-farm) by George Orwell, around NPR 137. A political fable you can read in an evening and think about for years.
- [Notes From Underground](/books/notes-from-underground) by Fyodor Dostoevsky, around NPR 180. The shortest way into Dostoevsky, and the most bad-tempered.
- [As A Man Thinketh](/books/as-a-man-thinketh) by James Allen, around NPR 252. Fifty pages, written in 1903, and the ancestor of most of the self-help shelf.
- [The Game of Life and How to Play It](/books/the-game-of-life-and-how-to-play-it), around NPR 216.
- [White Nights](/books/white-nights) by Dostoevsky, around NPR 360. A short, sad, beautiful story about loneliness in a city.

## Is cheap self-help worth it?

Sometimes. The category rewards the reader who does something rather than the one who reads widely, so one good book applied beats five skimmed.

[How To Stop Worrying And Start Living](/books/how-to-stop-worrying-and-start-living) at around NPR 359 is the pick here: Carnegie is repetitive but practical, and the anxiety advice has aged better than most. [The Art of War](/books/the-art-of-war) at around NPR 208 is worth having on a shelf, though be aware editions vary enormously in translation quality and commentary.

## What should you avoid at this price?

Two things. First, abridged editions sold without saying so. A 200-page *Crime and Punishment* is not *Crime and Punishment*. Check the page count against the real one before buying. Second, anything with no ISBN and no publisher listed, which is often a pirated print run.

## How do you stretch the budget furthest?

Buy short and buy paperback. Hardbacks cost more for the binding, not the words. Combo offers can be genuine value when the individual titles are ones you wanted anyway, and poor value when they are padding around one book you actually want.

## Frequently asked questions

**Are these prices per book or for a set?**
Per book, unless the title says combo or set.

**Do you deliver outside Kathmandu?**
Yes, to all seven provinces. Typically 1 to 2 days inside the Kathmandu Valley and 3 to 5 days elsewhere.

**Is there a delivery charge?**
The order total covers the books. The courier charges its own fee when it hands over the parcel, based on where it is going.

Browse the whole shelf in [fiction](/genre/fiction) and [self-help](/genre/self-help), or see [everything in stock](/books).`,
    bookSlugs: ['animal-farm', 'notes-from-underground', 'as-a-man-thinketh', 'white-nights', 'how-to-stop-worrying-and-start-living', 'the-art-of-war'],
  },

  {
    slug: 'how-to-spot-pirated-book-nepal',
    title: 'How to Spot a Pirated Book in Nepal',
    metaTitle: 'How to Spot a Pirated Book in Nepal',
    excerpt:
      'A pirated book in Nepal usually gives itself away before you open it: grey or blurry cover printing, a spine that cracks on first opening, thin paper that shows the next page through, and no ISBN or publisher on the copyright page. Here is how to check in under a minute.',
    metaDesc:
      'How to tell a pirated book from a genuine one in Nepal: cover printing, paper weight, binding, ISBN and price checks you can do in a minute.',
    category: 'Buying guides',
    tags: ['pirated books', 'nepal', 'buying guide'],
    body: `Pirated books are common enough in South Asia that most regular readers have bought one without realising. They are not always obvious, and a good fake can look fine in a photograph. These are the checks that actually work, roughly in the order they are worth doing.

None of this is about blaming buyers. A pirated copy is usually sold as genuine, and the tells are easy to miss until someone points them out.

## What does a pirated cover look like?

Washed out. Piracy works by photographing or scanning a real cover and reprinting it, and every generation of copying loses colour depth and sharpness. Blacks come out grey, and fine text near the edges blurs. Hold it next to any mainstream paperback and the difference is immediate.

## What does the paper tell you?

More than the cover. Genuine trade paperbacks use paper heavy enough that the print on the next page does not show through. Pirated copies almost always use thinner, brighter white stock, because paper is the biggest cost in a print run. If you can read the reverse side through the page, be suspicious.

## Does the binding give it away?

Usually. Open the book to the middle and hold it flat. A properly bound book resists a little and springs back. A pirated one often cracks audibly, and pages start loosening within a few readings. Look at the spine edge too: uneven glue, or pages that do not line up, are a bad sign.

## What should the copyright page have?

An ISBN, a publisher name and address, and a printing history. A missing ISBN is the single strongest signal, because it is the one thing a pirate cannot fake usefully. Also check that the ISBN on the copyright page matches the barcode on the back. On a genuine book they agree.

## Is a low price always a red flag?

No, and this is where people go wrong. Out-of-copyright classics are legitimately cheap: Orwell, Dostoevsky and Austen can be printed by anyone, so NPR 150 for *Animal Farm* is normal and legal. What is not normal is a current bestseller at a fraction of its usual price. If a book published in the last few years costs a third of what everyone else charges, the discount is coming from somewhere.

## What should you do if you have bought one?

Contact the seller. Any shop that stands behind its stock will replace it. At Books Temple Nepal every title is sourced as a new copy and the edition details, including publisher, format, page count and ISBN, are listed on the book's page. If what arrives does not match, we replace it.

## Frequently asked questions

**Is buying a pirated book illegal in Nepal?**
Selling pirated books infringes copyright. Buyers are not usually the target of enforcement, but the money does bypass the author and publisher entirely.

**Are all cheap books pirated?**
No. Public-domain classics and Indian-market editions of international titles are both legitimately cheaper, and the second is why many genuine books cost less here than in Europe.

**Can I tell from an online listing?**
Only partly. Look for a stated ISBN, publisher and page count. A listing with none of those is worth a question before ordering.

See our [terms and returns](/terms) for how replacements work, or [browse the catalogue](/books).`,
    bookSlugs: ['animal-farm', 'notes-from-underground', 'white-nights'],
  },

  {
    slug: 'dostoevsky-books-nepal-where-to-start',
    title: 'Dostoevsky in Nepal: Which Book to Read First',
    metaTitle: 'Dostoevsky Books in Nepal: Where to Start (2026)',
    excerpt:
      'Start with White Nights or Notes From Underground, not Crime and Punishment. Both are short, both are complete, and both cost under NPR 400 in Nepal. They tell you within an evening whether Dostoevsky is for you, before you commit to a 700-page novel.',
    metaDesc:
      'Which Dostoevsky book to read first, which translation to buy in Nepal, and what each costs. White Nights, Notes From Underground and the big novels compared.',
    category: 'Reading guides',
    tags: ['dostoevsky', 'classics', 'nepal', 'reading order'],
    body: `Dostoevsky is the most recommended and least finished novelist on most reading lists. The usual reason is that people start with a 700-page novel featuring nine characters who each have three names. There is a much kinder way in, and it costs under NPR 400.

## Which Dostoevsky should you read first?

[White Nights](/books/white-nights), at around NPR 360. It is a short story about a lonely man who meets someone over four nights in St Petersburg. It has no crime, no philosophy lecture and no cast of thousands, and it contains everything people love about him: the feverish narration, the aching sincerity, the sense of someone talking directly at you.

If you want something with more edge, read [Notes From Underground](/books/notes-from-underground) at around NPR 180. It is the most influential 150 pages he wrote, and the narrator is deliberately unpleasant company, which some readers find bracing and others find exhausting.

## When should you attempt the big novels?

Once a short one has landed. [The Brothers Karamazov](/books/the-originals-the-brothers-karamazov) at around NPR 719 is his last and largest novel, and generally considered his best. *Crime and Punishment* is the more common entry point but is a harder first book than its reputation suggests.

A practical tip for the long novels: write the character names down as they appear, with their nicknames next to them. Russian names shift between formal, familiar and diminutive forms, and most people who give up on Dostoevsky give up on the names rather than the story.

## Does the translation matter?

Yes, more than for almost any other author. The same paragraph can read as stiff and Victorian or as urgent and modern depending on who translated it. Editions sold in Nepal vary widely, so check the translator named on the copyright page before buying, and be wary of any edition that names none at all.

## What order should you read them in?

There is no required order. Nothing carries over between books. A reasonable path is White Nights, then Notes From Underground, then Crime and Punishment, then The Brothers Karamazov, moving up in length as your patience for Russian patronymics grows.

## Frequently asked questions

**Which Dostoevsky book is shortest?**
White Nights, at around 80 pages depending on edition.

**Are these available in Nepal?**
Yes, all of the above are in stock with delivery to all seven provinces and cash on delivery.

**Are cheap editions abridged?**
Not usually for these titles, but check the page count. An 80-page *Crime and Punishment* is an abridgement, not a bargain.

Browse more in [fiction](/genre/fiction), or see [everything in stock](/books).`,
    bookSlugs: ['white-nights', 'notes-from-underground', 'the-originals-the-brothers-karamazov', 'no-longer-human'],
  },
];

(async function main() {
  await connectMongo();
  try {
    for (const a of ARTICLES) {
      // Only link books that genuinely exist and are live, so a guide never
      // recommends something a reader cannot buy.
      const books = await Book.find({ slug: { $in: a.bookSlugs }, isActive: true }).select('_id slug').lean();
      const missing = a.bookSlugs.filter((s) => !books.some((b) => b.slug === s));
      if (missing.length) logger.warn({ slug: a.slug, missing }, 'article references books not live — link dropped');

      const existing = await Article.findOne({ slug: a.slug }).select('publishedAt').lean();
      await Article.updateOne(
        { slug: a.slug },
        {
          $set: {
            title: a.title,
            metaTitle: a.metaTitle,
            metaDesc: a.metaDesc,
            excerpt: a.excerpt,
            body: a.body,
            category: a.category,
            tags: a.tags,
            author: 'Books Temple Editors',
            status: 'published',
            readingTime: readingTime(a.body),
            relatedBooks: books.map((b) => b._id),
            publishedAt: existing?.publishedAt || new Date(),
          },
        },
        { upsert: true }
      );
      logger.info({ slug: a.slug, words: a.body.split(/\s+/).length, linkedBooks: books.length }, 'article upserted');
    }
    logger.info({ count: ARTICLES.length }, 'Batch 2 articles seeded');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'seed-articles-batch2 failed');
  process.exit(1);
});
