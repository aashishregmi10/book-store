'use strict';

/*
 * Fifth batch — the four topics from the owner's 40-title intent map that are
 * not already published and that the catalogue can actually stand behind.
 *
 * Most of the 40 were already live from batches 1-4, and several of the rest
 * are pages rather than articles (/about, /contact, /track, /terms, /kathmandu).
 * Four are deliberately not written, and the reasons belong here rather than in
 * a reply that scrolls away:
 *
 *   "Buy Second-Hand Books Online in Nepal" — the shop sells new copies only
 *   (every Offer declares NewCondition, see lib/seo.ts) and a search of the live
 *   catalogue returns zero used titles. The article would advertise a product
 *   that does not exist.
 *
 *   "Best Books for Loksewa Preparation" — still zero books in the loksewa
 *   section. Unchanged since batch 4; see the note there.
 *
 *   "Book Shops Near Putalisadak" / "Book Shops in New Road" — this is an online
 *   shop with no premises on either street. Writing a local guide to somebody
 *   else's shopfronts is a doorway page: thin, about competitors, and nothing a
 *   reader could act on here.
 *
 *   "Books Temple Nepal vs Other Online Bookstores" — a comparison we cannot
 *   write neutrally about ourselves, and one that would put claims about named
 *   competitors' prices and service in print.
 *
 * House rules unchanged: the excerpt is a self-contained 40-60 word answer,
 * every ## heading is a question answered immediately below, prices are real as
 * of August 2026 and dated in the copy, and every slug was verified live before
 * seeding.
 *
 *   node scripts/seed-articles-batch5.js
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Article = require('../src/models/article.model');
const Book = require('../src/models/book.model');

const readingTime = (body) => Math.max(1, Math.round(String(body).split(/\s+/).filter(Boolean).length / 200));

const PRICE_NOTE =
  'Prices are what we charge as of August 2026 and move with our supplier, so treat them as a guide rather than a quote.';

const DELIVERY_FAQ = `**Do you deliver outside Kathmandu?**
Yes, to all seven provinces. Typically 1 to 2 days inside the Kathmandu Valley and 3 to 5 days elsewhere.

**Can I pay on delivery?**
Yes. Cash on delivery is currently the only payment method, and you pay the courier when the parcel reaches you.`;

const ARTICLES = [
  // ── 1 ──────────────────────────────────────────────────────────────────
  {
    slug: 'best-romance-books-nepal',
    title: 'Best Romance Books in Nepal (2026)',
    metaTitle: 'Best Romance Books in Nepal (2026)',
    excerpt:
      'For a first romance novel in Nepal, start with Icebreaker or The Spanish Love Deception at around NPR 720 — both are light, complete in one book, and finished in a weekend. If you would rather read something set closer to home, Ravinder Singh at NPR 360 is where most Nepali readers begin.',
    metaDesc:
      'The best romance novels available in Nepal — contemporary, spicy, South Asian and classic — with real NPR prices and cash on delivery.',
    category: 'Reading guides',
    tags: ['romance', 'fiction', 'nepal', 'reading guide'],
    body: `Romance is the fastest-growing shelf in this shop and the one people are most sheepish about buying from, which is a shame, because it is also the shelf most likely to get someone reading again after years away from books. The genre is not one thing: the gap between a gentle small-town love story and a 500-page fantasy romance is enormous, and picking the wrong one is why people decide romance "isn't for them".

${PRICE_NOTE}

## Which romance novel should you read first?

[Icebreaker](/books/icebreaker) by Hannah Grace, around NPR 720. A figure skater and a hockey captain forced to share a rink. It is warm, funny, low-stakes and completely self-contained — the romance equivalent of a good film on a wet afternoon.

[The Spanish Love Deception](/books/the-spanish-love-deception) by Elena Armas at around NPR 720 is the other safe first pick: fake dating, a wedding in Spain, slow burn. Both tell you within fifty pages whether the genre suits you.

## What if you want something set closer to home?

South Asian romance is the entry point for most readers in Nepal, and it is cheaper.

- [I Too Had A Love Story](/books/i-too-had-a-love-story) by Ravinder Singh, around NPR 360. The book that got a generation of readers in this region reading in English at all. It is sadder than the cover suggests.
- [Can Love Happen Twice](/books/can-love-happen-twice), around NPR 432, is its follow-up.
- [The Boy With A Broken Heart](/books/the-boy-with-a-broken-heart) by Durjoy Datta, around NPR 432.
- [12 Years: My Messed-up Love Story](/books/12-years-my-messed-up-love-story) by Chetan Bhagat, around NPR 576.

For Nepali-language romance, [Summer Love](/books/summer-love) by Subin Bhattarai at around NPR 338 is the one everyone has read, and [Ijoriya](/books/ijoriya) at around NPR 673 is his most recent.

## Who is the author everyone is asking for?

Colleen Hoover, and she has a guide of her own because the order matters — see [where to start with Colleen Hoover](/blog/colleen-hoover-books-nepal). If you want the short version: [It Ends With Us](/books/it-ends-with-us-a-novel) at around NPR 720, but know going in that it deals directly with domestic abuse and is not the light read the cover implies.

## What should you read for something more explicit?

- [King of Greed](/books/king-of-greed) and [If the Sun Never Sets](/books/if-the-sun-never-sets) by Ana Huang, around NPR 864 each. Ana Huang is the name currently driving most of the category.
- [A Court of Mist and Fury](/books/a-court-of-mist-and-fury) by Sarah J. Maas, around NPR 1,008 — fantasy romance, and the volume where that series properly begins for most readers.
- [Just for The Summer](/books/just-for-the-summer) by Abby Jimenez, around NPR 960.

## Which ones are actually well written?

If you want the prose as well as the plot:

- [People We Meet On Vacation](/books/people-we-meet-on-vacation) and [Book Lovers](/books/book-lovers) by Emily Henry, around NPR 864 and NPR 576. Henry writes the sharpest dialogue in contemporary romance.
- [After You](/books/after-you-the-sequel-to-me-before-you) by Jojo Moyes, around NPR 720 — read Me Before You first if you have not.
- [Cleopatra and Frankenstein](/books/cleopatra-and-frankenstein) by Coco Mellors, around NPR 720. Closer to literary fiction than romance, and the better book for it.

## Is there a classic worth owning?

[Pride and Prejudice](/books/pride-and-prejudice) by Jane Austen, around NPR 360, invented most of what the shelf still does two centuries later, and [Romeo and Juliet](/books/romeo-and-juliet) at around NPR 216 is the cheapest book on this page.

## Frequently asked questions

**Do romance novels need reading in order?**
Standalones do not. Series do — Ana Huang, Sarah J. Maas and the Colleen Hoover pair all assume the earlier book.

**Which is best for a teenager?**
None of the explicit titles above. The young adult shelf is the right place; see our [gift guide by occasion](/blog/best-books-to-gift-nepal).

${DELIVERY_FAQ}

Browse the full [romance shelf](/genre/romance), or see [everything in stock](/books).`,
    bookSlugs: [
      'icebreaker', 'the-spanish-love-deception', 'i-too-had-a-love-story', 'can-love-happen-twice',
      'the-boy-with-a-broken-heart', '12-years-my-messed-up-love-story', 'summer-love', 'ijoriya',
      'it-ends-with-us-a-novel', 'king-of-greed', 'if-the-sun-never-sets', 'a-court-of-mist-and-fury',
      'just-for-the-summer', 'people-we-meet-on-vacation', 'book-lovers',
      'after-you-the-sequel-to-me-before-you', 'cleopatra-and-frankenstein', 'pride-and-prejudice',
      'romeo-and-juliet',
    ],
  },

  // ── 2 ──────────────────────────────────────────────────────────────────
  {
    slug: 'best-fiction-books-nepal',
    title: 'Best Fiction Books to Buy in Nepal (2026)',
    metaTitle: 'Best Fiction Books to Buy in Nepal (2026)',
    excerpt:
      'The best value in fiction in Nepal is the short classic: Animal Farm at around NPR 137, The Great Gatsby at NPR 252, Notes From Underground at NPR 180. Each is complete, permanent, and finished in an evening — a better first buy than any 700-page novel.',
    metaDesc:
      'The best fiction books to buy in Nepal — short classics, modern novels and Nepali fiction — with real NPR prices and cash on delivery.',
    category: 'Buying guides',
    tags: ['fiction', 'classics', 'novels', 'nepal'],
    body: `Fiction is the largest shelf in this shop, which makes it the hardest to buy from. The useful way to narrow it is not by mood or bestseller list but by length and price: a short, cheap, permanent book is almost always the better purchase, because the cost of a novel you abandon is not the money, it is the month you stop reading afterwards.

${PRICE_NOTE}

## What is the best fiction to buy first?

A short classic. These are out of copyright, so they cost a fraction of a modern paperback while being the books modern paperbacks are measured against.

- [Animal Farm](/books/animal-farm) by George Orwell, around NPR 137. A political fable you finish in an evening.
- [The Great Gatsby](/books/the-great-gatsby) by F. Scott Fitzgerald, around NPR 252.
- [Notes From Underground](/books/notes-from-underground) by Dostoevsky, around NPR 180, and [White Nights](/books/white-nights) at around NPR 360.
- [1984](/books/1984) by Orwell, around NPR 288.
- [Pride and Prejudice](/books/pride-and-prejudice) by Jane Austen, around NPR 360.

Five of those cost less together than one new hardback.

## Which modern novels are worth the money?

- [The Kite Runner](/books/the-kite-runner) by Khaled Hosseini, around NPR 864. The most reliably loved novel on this shelf, and the safest gift for an adult reader you do not know well.
- [To Kill A Mocking Bird](/books/to-kill-a-mocking-bird) by Harper Lee, around NPR 720.
- [Norwegian Wood](/books/norwegian-wood) by Haruki Murakami, around NPR 1,008 — and if you like it, there is a [Murakami starting guide](/blog/haruki-murakami-books-nepal).
- [Brave New World](/books/brave-new-world) by Aldous Huxley, around NPR 765.
- [A Little Life](/books/a-little-life) by Hanya Yanagihara, around NPR 1,008. Extraordinary and genuinely distressing; read about it before you buy it.

## What should you read if you want something gentle?

[More Days at the Morisaki Bookshop](/books/more-days-at-the-morisaki-bookshop) by Satoshi Yagisawa, around NPR 576. Japanese quiet fiction — a woman, a second-hand bookshop, not much incident. The whole category exists for readers who want to be soothed rather than gripped.

## Which Nepali fiction belongs on the list?

- [Palpasa Café](/books/palpasa-caf) by Narayan Wagle, around NPR 432. The novel of the conflict years and probably the most widely read Nepali novel of the century.
- [Karnali Blues](/books/karnali-blues), around NPR 576.
- [Shirishko Phool](/books/shireeshko-phool) by Parijat, around NPR 270, or its English translation [Blue Mimosa](/books/blue-mimosa) at around NPR 266.

Our [beginner's guide to Nepali literature](/blog/nepali-literature-beginners-guide) covers where to start with these properly.

## Is a combo offer good value?

Only when you wanted every book in it. The [Sapiens, Rich Dad Poor Dad, To Kill A Mocking Bird and How to Win Friends combo](/books/combo-books-offer-sapiens-rich-dad-poor-dad-to-kill-a-mocking-bird-how-to-win-friends-and-influence-people) at around NPR 2,331 is a real saving if three of the four appeal, and poor value if one does. Count only the titles you would have bought anyway.

## How do you choose when nothing appeals?

Pick by length, not by blurb. Under 200 pages when you have not read in a while; under 400 when you have. The single most common reason a book goes unfinished in this country is not the writing — it is that someone bought the longest book on the table.

## Frequently asked questions

**Are the cheap classics abridged?**
Not usually, but check the page count on the book's page. An 80-page Crime and Punishment is an abridgement, not a bargain. See [how to spot a pirated book](/blog/how-to-spot-pirated-book-nepal).

**What is the cheapest good novel you sell?**
Animal Farm at around NPR 137, and it is not a compromise.

${DELIVERY_FAQ}

Browse the full [fiction shelf](/genre/fiction), or see [everything in stock](/books).`,
    bookSlugs: [
      'animal-farm', 'the-great-gatsby', 'notes-from-underground', 'white-nights', '1984',
      'pride-and-prejudice', 'the-kite-runner', 'to-kill-a-mocking-bird', 'norwegian-wood',
      'brave-new-world', 'a-little-life', 'more-days-at-the-morisaki-bookshop', 'palpasa-caf',
      'karnali-blues', 'shireeshko-phool', 'blue-mimosa',
      'combo-books-offer-sapiens-rich-dad-poor-dad-to-kill-a-mocking-bird-how-to-win-friends-and-influence-people',
    ],
  },

  // ── 3 ──────────────────────────────────────────────────────────────────
  {
    slug: 'nepali-literature-beginners-guide',
    title: "A Beginner's Guide to Reading Nepali Literature",
    metaTitle: "A Beginner's Guide to Reading Nepali Literature",
    excerpt:
      'Start with Muna Madan at around NPR 108 — it is short, it is the poem every Nepali household knows, and it costs less than a coffee. Then Palpasa Café for the conflict years, and Shirishko Phool for the novel that changed what Nepali fiction could do.',
    metaDesc:
      'Where to start with Nepali literature: Muna Madan, Palpasa Café, Shirishko Phool and more, in reading order, with real NPR prices.',
    category: 'Reading guides',
    tags: ['nepali literature', 'nepal', 'reading guide', 'classics'],
    body: `Most people in Nepal meet Nepali literature at school, in an exam, with a set text they did not choose — and never go back. This guide is for going back. It is ordered by what actually works as a way in, not by literary importance, and every book on it is short enough to finish.

${PRICE_NOTE}

## Which Nepali book should you read first?

[Muna Madan](/books/muna-madan) by Laxmi Prasad Devkota, around NPR 108. A man leaves for Lhasa to earn money; his wife waits. It is written in the jhyaure folk metre, so it carries the rhythm of songs people already know, and it is the single most loved thing written in this language. At this price there is no reason not to own it.

Read it in an evening. If nothing else on this page appeals, that one book is still worth having.

## What should you read after that?

[Palpasa Café](/books/palpasa-caf) by Narayan Wagle, around NPR 432. An artist, a journalist and the Maoist conflict, published while the war was still on. It is the novel most Nepali readers under forty have actually read, and the one that made contemporary Nepali fiction feel urgent rather than academic.

Then [Karnali Blues](/books/karnali-blues), around NPR 576 — a son remembering his father, and the most affectionate book on this list.

## Where does modern Nepali fiction really begin?

[Shirishko Phool](/books/shireeshko-phool) by Parijat, around NPR 270. A Madan Puraskar winner from 1965 that broke with everything before it: bleak, existential, narrated by a man who is not likeable. If you read Nepali comfortably, read the original. The English translation, [Blue Mimosa](/books/blue-mimosa), is around NPR 266 and is genuinely good.

## What if you want something contemporary and easy?

Subin Bhattarai is where a lot of young readers start, and there is no shame in it — his books are the reason a generation reads in Nepali at all.

- [Summer Love](/books/summer-love), around NPR 338
- [Saya](/books/saya), around NPR 315
- [Ijoriya](/books/ijoriya), around NPR 673

## Which Nepali books are worth the effort?

Once the shorter ones have landed:

- [Seto Dharti](/books/seto-dharti) by Amar Nyaupane, around NPR 585. A child widow's life, and the most admired Nepali novel of recent years.
- [Yogmaya](/books/yogmaya) by Neelam Karki Niharika, around NPR 716 — the reformer and poet who led a religious protest movement in the east.
- [Pagal Basti](/books/pagal-basti) by Sarubhakta, around NPR 540.
- [China Harayeko Manchhe](/books/china-harayeko-manchhe) by Hari Bansha Acharya, around NPR 405 — a memoir by a man the whole country feels it knows, and far sadder than expected.

## Should you read in Nepali or in translation?

In whichever language you think in. A translated Nepali novel is still the whole book, and reading Parijat in English is not a lesser act than not reading Parijat. That said, poetry loses the most in translation, so Muna Madan is the one case where the original is worth the extra effort. Our guide on [choosing between English and Nepali editions](/blog/english-or-nepali-book-edition) goes into this properly.

## What order should a beginner read them in?

Muna Madan, then Palpasa Café, then Shirishko Phool, then whichever of Seto Dharti or Karnali Blues appeals. Short to long, recent to older. Nothing here is a series and nothing assumes anything before it.

## Frequently asked questions

**Are these available in English?**
Some are — Blue Mimosa is Shirishko Phool in English. Each book's page lists its language in the specifications.

**Which is the cheapest place to start?**
Muna Madan at around NPR 108, and it is also the best place to start.

${DELIVERY_FAQ}

Browse the full [Nepali literature shelf](/genre/nepali-literature), or read our list of [10 essential Nepali literature books](/blog/essential-nepali-literature-books).`,
    bookSlugs: [
      'muna-madan', 'palpasa-caf', 'karnali-blues', 'shireeshko-phool', 'blue-mimosa',
      'summer-love', 'saya', 'ijoriya', 'seto-dharti', 'yogmaya', 'pagal-basti',
      'china-harayeko-manchhe',
    ],
  },

  // ── 4 ──────────────────────────────────────────────────────────────────
  {
    slug: 'original-book-editions-nepal',
    title: 'What Makes a Book Edition "Original" in Nepal?',
    metaTitle: 'What Makes a Book Edition "Original" in Nepal?',
    excerpt:
      'An original edition is a licensed one, not an expensive one. Most books sold in Nepal are Indian-market printings by the publisher\'s own South Asian arm — genuine, licensed, and cheaper than the UK or US edition of the same book. That is not a downgrade.',
    metaDesc:
      'What "original edition" means for books sold in Nepal: Indian-market printings, ISBNs, translations and how to check an edition before ordering.',
    category: 'Buying guides',
    tags: ['editions', 'buying guide', 'isbn', 'nepal'],
    body: `"Is it original?" is the question we are asked most often before an order, and it usually means three different things at once: is it legal, is it complete, and is it the same book my friend has. Those have different answers, and the confusion costs people money in both directions — some overpay for an import they did not need, others avoid a perfectly genuine edition.

${PRICE_NOTE}

## What does "original edition" actually mean?

Licensed. A publisher, or a publisher's regional arm, has the right to print that text and does so. That is the whole test. It has nothing to do with price, with which country it was printed in, or with how glossy the cover is.

An original edition can cost NPR 137. A pirated one can cost NPR 900.

## Why are books here cheaper than the UK or US price?

Because most of what reaches Nepal is the Indian-market printing, produced by the publisher's own South Asian arm — Penguin Random House India, HarperCollins India, Hachette India and so on. Same text, same translator, licensed for this market, priced for it. Paper stock and cover finish are often lighter than a British edition.

This is the single most common misunderstanding we see. An Indian-market edition is not a copy, not a knock-off and not abridged. It is the legitimate edition for this region, and choosing it over an import is how a book costs NPR 720 instead of NPR 2,400.

## How do you tell an original from a pirated copy?

Different question, and the important one. The short version: check for an ISBN and publisher on the copyright page, check that the ISBN matches the barcode, hold the paper up and see whether the next page shows through, and be suspicious of a recent bestseller at a third of everyone else's price. Out-of-copyright classics being cheap is normal and legal.

Our full guide on [spotting a pirated book in Nepal](/blog/how-to-spot-pirated-book-nepal) walks through each check.

## Is a translated edition still "original"?

Yes, if it is licensed. [Harry Potter Aur Paras Patthar](/books/harry-potter-aur-paras-patthar) at around NPR 720 is the licensed Hindi Philosopher's Stone — a complete, authorised translation. [Sapiens Manav Jati ka Sankshipt Itihas](/books/sapiens-manav-jati-ka-sankshipt-itihas) at around NPR 1,008 is Sapiens in Hindi. Both are genuine.

What catches people out is not legitimacy but language: these titles do not announce in English that they are not in English. Check the language field in the specifications before ordering, and see our guide to [English versus Nepali editions](/blog/english-or-nepali-book-edition).

## What about "The Originals" series you sell?

That is a publisher's series name, not a claim about authenticity. [The Originals Pride and Prejudice](/books/the-originals-pride-and-prejudice) at around NPR 425 and [The Originals The Republic](/books/the-originals-the-republic) at around NPR 425 are simply that imprint's unabridged classics line. A plain [Pride and Prejudice](/books/pride-and-prejudice) at around NPR 360 is no less original.

## What should you check before ordering?

Everything you need is in the specifications block on each book's page:

- **ISBN** — the edition's unique number. If you want a specific edition, match this.
- **Publisher** — tells you whether it is the regional or the import printing.
- **Language** — the field people most often skip.
- **Format and pages** — a page count far below the known length means an abridgement.

If something arrives that does not match what its page said, we replace it. That is what the [terms and returns](/terms) cover.

## Does the edition matter for a gift?

More than for yourself. For a gift, an import or a box set feels like an object; for reading, the regional paperback is the same words for a third of the money. Our [gift guide](/blog/best-books-to-gift-nepal) works through that by occasion.

## Frequently asked questions

**Are Indian-market editions abridged?**
No. They are the complete text, licensed for this region.

**Do you sell imported UK or US editions?**
Some titles, usually box sets and illustrated editions. The publisher on each book's page tells you which printing it is.

**Do you sell second-hand books?**
No. Every book in this shop is a new copy.

${DELIVERY_FAQ}

Browse [everything in stock](/books), or read the [terms and returns](/terms).`,
    bookSlugs: [
      'harry-potter-aur-paras-patthar', 'sapiens-manav-jati-ka-sankshipt-itihas',
      'the-originals-pride-and-prejudice', 'the-originals-the-republic', 'pride-and-prejudice',
    ],
  },
];

(async function main() {
  await connectMongo();
  try {
    for (const a of ARTICLES) {
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
    logger.info({ count: ARTICLES.length }, 'Batch 5 articles seeded');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'seed-articles-batch5 failed');
  process.exit(1);
});
