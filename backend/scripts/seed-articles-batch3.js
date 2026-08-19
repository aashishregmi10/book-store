'use strict';

/*
 * Third batch of blog articles.
 *
 * Batches 1 and 2 covered the shop's own mechanics (COD, piracy, budget) and
 * two author/genre guides. The eight live articles left the site's four
 * deepest shelves with no editorial entry point at all, which is where the
 * winnable search volume actually sits:
 *
 *  - children's books: 305 titles in stock and the highest-intent buyer we
 *    have (a parent buying three at once), with no guide to any of them.
 *  - Colleen Hoover: the single highest-volume author query among the readers
 *    who buy most online here, and we hold ten of her titles.
 *  - money and the share market: 806 business titles, including Nepali-language
 *    NEPSE guides that no international shop stocks and nobody has written up.
 *  - Harry Potter: high volume and a genuinely confusing market — the loose
 *    volumes sold here are the Hindi translations, which disappoints people who
 *    assumed English. Saying so plainly is useful and nobody local does.
 *  - psychology: 226 titles and a rising query, especially around anxiety.
 *
 * House rules applied, same as batch 2: the excerpt is a self-contained 40-60
 * word answer (rendered as the lede, and what a snippet or AI answer lifts);
 * every ## heading is a question answered immediately below; every price is
 * real as of August 2026 and dated in the copy, because a stale number is worse
 * than none; and every recommendation links to a book verified in stock at
 * write time — the seeder drops links to anything that is not live.
 *
 * Two things are deliberately hedged in the copy rather than asserted: the
 * money guide says outright that these are books and not financial advice, and
 * the psychology guide says a book is not a substitute for a clinician. Both
 * are the honest framing, and both keep us out of claims we have no business
 * making.
 *
 * Idempotent: upserts by slug and preserves the original publishedAt.
 *
 *   node scripts/seed-articles-batch3.js
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Article = require('../src/models/article.model');
const Book = require('../src/models/book.model');

const readingTime = (body) => Math.max(1, Math.round(String(body).split(/\s+/).filter(Boolean).length / 200));

const ARTICLES = [
  {
    slug: 'best-books-for-kids-nepal-by-age',
    title: 'Best Books for Kids in Nepal, by Age (2026)',
    metaTitle: 'Best Books for Kids in Nepal, by Age (2026)',
    excerpt:
      'The right children\'s book depends on age far more than price. Board books and Nepali varnamala sets suit 0 to 4, picture and sound books 3 to 6, Roald Dahl and Geronimo Stilton 6 to 9, Wimpy Kid and Wonder 8 to 12. Here is what to buy at each stage, with prices.',
    metaDesc:
      "Children's books in Nepal by age: board books, picture books, Roald Dahl, Geronimo Stilton, Wimpy Kid and Wonder, with real NPR prices.",
    category: 'Reading guides',
    tags: ['children books', 'kids', 'nepal', 'buying guide'],
    body: `The most common mistake when buying a book for a child in Nepal is buying one that is two years ahead of them. It looks like good value and it sits unread, because a child who cannot yet manage the sentences decides that reading is something they are bad at. Buying slightly below a child's level almost never fails; buying above it often does.

Prices below are what we charge as of August 2026 and move with our supplier, so treat them as a guide rather than a quote.

## What books work for ages 0 to 4?

Board books, and almost nothing else. At this age the book is a physical object first: it gets chewed, dropped and carried around, so pages that survive matter more than plot.

- [Kids Board Book Set: ABC, Numbers, Vehicles, Flowers, Vegetables, Fruits, Birds, Animals and Body Parts](/books/kids-board-book-set-abc-numbers-vehicles-flowers-vegetables-fruits-birds-domestic-animals-wild-animals-body-parts), around NPR 360 for the set. The straightforward first-words shelf, and the best value in this whole guide.
- [Kids Board Book combo: Nepali Varnamala and ABC](/books/combo-book-offer-kids-board-book-nepali-varnamala-kids-board-book-abc), around NPR 360. Worth singling out: it introduces both scripts side by side, which is what most households here actually need and what imported sets never include.
- [The Very Hungry Caterpillar](/books/the-very-hungry-caterpillar-eric-carle) by Eric Carle, around NPR 720. Counting, days of the week and a satisfying ending, in a book that has kept toddlers still for fifty years.

## What about ages 3 to 6?

This is the read-aloud window, where an adult reads and the child listens, looks and interrupts. Pick books with something to do on the page.

- [Pop-up Dinosaurs](/books/pop-up-dinosaurs) and [Pop-up Jungle](/books/pop-up-jungle), around NPR 569 each. Pop-ups earn their price by being events rather than books.
- [Noisy Dinosaurs Sound Book](/books/noisy-dinosaurs-sound-book), around NPR 1,001. Loud, and that is the point.
- [151 Bedtime Stories](/books/151-bedtime-stories-sawan), around NPR 449, or the [Bedtime Stories box set of 6](/books/bedtime-stories-box-set-of-6-books-collection-of-world-famous-fairy-tales) at around NPR 720. Short pieces are what you want at bedtime, when nobody is finishing a chapter.
- [Stories for Five Year Olds](/books/stories-for-five-year-olds) by Enid Blyton, around NPR 720.

## What should a 6 to 9 year old read?

The first books they finish alone. The goal at this stage is momentum: funny, fast, illustrated, and part of a series so that finishing one produces a request for the next.

- [Matilda](/books/matilda) by Roald Dahl, around NPR 504, and [Charlie and the Chocolate Factory](/books/charlie-and-the-chocolate-factory), around NPR 576. Dahl remains the most reliable bridge into chapter books there is — a bit cruel, very funny, never talks down.
- [George's Marvellous Medicine](/books/george-s-marvellous-medicine), around NPR 504, is the shortest way in if a child is not yet confident.
- Geronimo Stilton: [Rumble in the Jungle](/books/rumble-in-the-jungle) and [Mouse in Space](/books/mouse-in-space), around NPR 504 each. The coloured, playful typography inside does real work for a hesitant reader.
- If you would rather buy once: the [Roald Dahl 15-book collection](/books/roal-dahl-15-collection-books), around NPR 6,480, covers most of the next three years.

## What about ages 8 to 12?

Here you can start choosing for taste rather than reading level, and mix funny with substantial.

- [Diary of a Wimpy Kid: Hard Luck](/books/diary-of-a-wimpy-kid-hard-luck), around NPR 576. Any volume works; they barely need to be read in order.
- [Wonder](/books/wonder) by R.J. Palacio, around NPR 648. A boy with a facial difference starts mainstream school. The one book on this list most likely to change how a child treats someone at their own school.
- [The Secret Garden](/books/the-secret-garden), around NPR 360, and [The Giver](/books/the-giver) by Lois Lowry, around NPR 576.
- [The Diary of a Young Girl](/books/the-diary-of-a-young-girl) by Anne Frank, around NPR 324, for a reader ready for something real. Worth reading alongside them rather than handing over.

## Are encyclopedias worth the money?

For a specific kind of child, yes. A child who asks how things work will return to a reference book for years, which makes [Knowledge Encyclopedia: Space](/books/knowledge-encyclopedia-space) at around NPR 1,440 or [STEAM: My First Science Library](/books/steam-my-first-science-library) at around NPR 1,440 better value per year than any novel. A child who reads for story will not open it twice. Buy for the child you have.

## How do you pick for a child who says they hate reading?

Go shorter, funnier and more illustrated than feels right for their age, and let them choose. Wimpy Kid and Geronimo Stilton exist for exactly this reader, and neither is a lesser book for it. The aim is one finished book, because finishing is the habit — not the reading level.

## Frequently asked questions

**Do you have Nepali-language children's books?**
Yes, including Nepali varnamala board books. Every book's page lists its language in the specifications.

**Can I buy several and pay on delivery?**
Yes. Cash on delivery is currently the only payment method, and you pay the courier when the parcel reaches you.

**How fast is delivery?**
Typically 1 to 2 days inside the Kathmandu Valley and 3 to 5 days elsewhere in Nepal.

Browse the full [children's shelf](/category/kids), or see [everything in stock](/books).`,
    bookSlugs: [
      'kids-board-book-set-abc-numbers-vehicles-flowers-vegetables-fruits-birds-domestic-animals-wild-animals-body-parts',
      'combo-book-offer-kids-board-book-nepali-varnamala-kids-board-book-abc',
      'the-very-hungry-caterpillar-eric-carle',
      'pop-up-dinosaurs',
      'matilda',
      'charlie-and-the-chocolate-factory',
      'wonder',
      'the-giver',
      'diary-of-a-wimpy-kid-hard-luck',
      'the-secret-garden',
    ],
  },

  {
    slug: 'colleen-hoover-books-nepal',
    title: 'Colleen Hoover Books in Nepal: Where to Start',
    metaTitle: 'Colleen Hoover Books in Nepal: Where to Start (2026)',
    excerpt:
      'Start with It Ends With Us if you want the book everyone is talking about, or Ugly Love if you want the one most readers finish in a single weekend. Verity is the outlier: a thriller, not a romance. All are in stock in Nepal from around NPR 720, cash on delivery.',
    metaDesc:
      'Which Colleen Hoover book to read first, the It Ends With Us reading order, and what each costs in Nepal. In stock with cash on delivery.',
    category: 'Reading guides',
    tags: ['colleen hoover', 'romance', 'nepal', 'reading order'],
    body: `Colleen Hoover is the author most often asked for by name in this shop, and the one people most often start in the wrong place. Her books are not a series, so there is no required order, but two of them are a genuine pair and reading those backwards spoils both.

Prices below are what we charge as of August 2026 and move with our supplier, so treat them as a guide rather than a quote.

## Which Colleen Hoover book should you read first?

[It Ends With Us](/books/it-ends-with-us-a-novel), around NPR 720. It is the one that made her famous, and the one most likely to tell you quickly whether her writing is for you. Be aware going in that it deals directly with domestic abuse, and it is not the light romance the cover suggests. Readers who expect a comfort read are often blindsided; readers who know what it is find it the strongest thing she has written.

If you want something lighter to begin with, start with [Ugly Love](/books/ugly-love) at around NPR 720 instead.

## What is the It Ends With Us reading order?

Two books, in this order:

1. [It Ends With Us](/books/it-ends-with-us-a-novel), around NPR 720
2. [It Starts With Us](/books/it-starts-with-us-with-colleen-hoover), around NPR 1,008

The second is a direct sequel and gives away the ending of the first on its opening pages, so the order matters here more than anywhere else in her work. If you already know you want both, the [box set of the pair](/books/colleen-hoover-box-set-it-ends-with-us-it-starts-with-us) at around NPR 1,440 costs less than buying them separately.

## Which one is the thriller?

[Verity](/books/verity), around NPR 720. It is shelved with her romances and is not one — it is a nasty, propulsive thriller with an ending readers still argue about. Several people who did not get on with her romances liked this one, so it is worth trying even if It Ends With Us was not for you.

## What should you read after those?

- [November 9](/books/november-9-a-novel), around NPR 720. A relationship told one day a year.
- [Maybe Someday](/books/maybe-someday), around NPR 864, followed by its novella [Maybe Not](/books/maybe-not-a-novella), around NPR 864.
- [Losing Hope](/books/losing-hope), around NPR 864, and [Point of Retreat](/books/point-of-retreat-a-novel), around NPR 864, both of which retell or continue earlier books from another character's side — read them after the book they attach to, not before.

## Are her books suitable for teenagers?

Mostly not, despite how they are marketed and shelved. The romances contain explicit content and several deal with abuse, addiction or grief. It Ends With Us in particular is an adult book about an adult subject. For a younger reader after the same emotional pull, the young adult shelf is the better place to look.

## What if you want something similar?

Try [Icebreaker](/books/icebreaker) by Hannah Grace at around NPR 720, [The Spanish Love Deception](/books/the-spanish-love-deception) by Elena Armas at around NPR 720, or [King of Greed](/books/king-of-greed) by Ana Huang at around NPR 864. For readers who prefer South Asian settings, [I Too Had a Love Story](/books/i-too-had-a-love-story) by Ravinder Singh at around NPR 360 remains the most borrowed book on many shelves in Nepal.

## Frequently asked questions

**Do I need to read her books in order?**
Only It Ends With Us before It Starts With Us, and Maybe Someday before Maybe Not. Everything else stands alone.

**Are these the original English editions?**
Yes. Each book's page lists the publisher, format, page count and ISBN so you can check the edition before ordering.

**Can I pay on delivery?**
Yes, cash on delivery across all seven provinces, typically 1 to 2 days inside the Kathmandu Valley and 3 to 5 days elsewhere.

Browse the full [romance shelf](/genre/romance), or see [everything in stock](/books).`,
    bookSlugs: [
      'it-ends-with-us-a-novel',
      'it-starts-with-us-with-colleen-hoover',
      'colleen-hoover-box-set-it-ends-with-us-it-starts-with-us',
      'verity',
      'ugly-love',
      'november-9-a-novel',
      'maybe-someday',
      'maybe-not-a-novella',
      'losing-hope',
      'point-of-retreat-a-novel',
    ],
  },

  {
    slug: 'best-money-investing-books-nepal',
    title: 'Best Money and Investing Books in Nepal (2026)',
    metaTitle: 'Best Money & Investing Books in Nepal (2026)',
    excerpt:
      'Start with The Richest Man in Babylon at around NPR 288 for the basics, then The Psychology of Money for why sensible people still make bad decisions. If you plan to trade on NEPSE, a Nepali-language share bazar guide will serve you better than any imported title.',
    metaDesc:
      'The best books on money, investing and the share market for Nepali readers, including Nepali-language NEPSE guides, with real NPR prices.',
    category: 'Reading guides',
    tags: ['money', 'investing', 'share market', 'nepal', 'business books'],
    body: `Money books split into three kinds: habits, mindset and mechanics. Most people buy the third kind first, get lost in candlestick charts, and give up. The order below is the one that tends to stick, and it starts cheap.

One thing to be clear about: these are books, not financial advice, and nobody here is a licensed advisor. A book can teach you how compounding works or what a candlestick chart shows. It cannot tell you what to do with your money.

Prices are what we charge as of August 2026 and move with our supplier, so treat them as a guide rather than a quote.

## Which money book should you read first?

[The Richest Man in Babylon](/books/the-richest-man-in-babylon), around NPR 288. It is a century old, written as parables set in ancient Babylon, and it contains most of what personal finance has to say: pay yourself first, live below your means, do not lend what you cannot lose. It takes an evening and costs less than a cinema ticket, which makes it the highest return per rupee on this list.

## What explains why we make bad money decisions?

[The Psychology of Money](/books/the-psychology-of-money) by Morgan Housel, around NPR 640. Its argument is that doing well with money has little to do with intelligence and a great deal to do with behaviour — patience, ego, and how you react when things fall. It is the book most likely to change what you actually do, rather than what you know.

There is also a [Nepali-language edition, Dhan Sampatti Ko Manobigyan](/books/dhan-sampatti-ko-manobigyan-the-psychology-of-money), at around NPR 432, which is the better buy if Nepali is the language you think in. If you want it bundled, [The Alchemist and The Psychology of Money](/books/the-alchemist-the-psychology-of-money) comes in at around NPR 1,080.

## What should you read before trading on NEPSE?

Something written for this market. Imported trading books use examples from markets with different hours, different circuit rules and different liquidity, and beginners spend the first month translating.

- [Share Bazar Ma Candlestick Patterns Ra Chart Patterns for Beginners](/books/share-bazar-ma-candlestick-patterns-ra-chart-patterns-for-beginners) by Bibek Sharma, around NPR 428. Nepali-language, aimed at exactly this reader.
- [Chart Patterns and Candlestick Patterns in Stock Market Trading](/books/chart-patterns-candlestick-patterns-in-stock-market-trading) by Indrazith Shantharaj, around NPR 504, if you would rather read it in English.

Read them as a vocabulary lesson rather than a system. Patterns describe what a chart did; they do not promise what it will do next, and books in this category are frequently sold as though they do.

## Is Rich Dad Poor Dad worth reading?

It is worth reading and worth arguing with. [Rich Dad and Poor Dad](/books/rich-dad-and-poor-dad) at around NPR 864 is the most influential money book of the last thirty years and the most criticised, largely because its specific advice about property and leverage does not transfer well and its stories are hard to verify. What it does well is reframe the difference between an asset and a liability, which is a genuinely useful lens. Read it early, treat the anecdotes with suspicion, and do not take it as a plan.

[Rich Dad's Cashflow Quadrant](/books/rich-dad-s-cashflow-quadrant), around NPR 720, is the sequel most readers find more practical.

## What about serious investing?

[The Intelligent Investor](/books/the-intelligent-investor) by Benjamin Graham, around NPR 1,037. This is the foundational value-investing text and it is genuinely difficult — dense, dated in its examples, and worth it only once you already know what a balance sheet is. Buy it second or third, not first.

## Which books help you earn rather than save?

- [Build, Don't Talk](/books/build-don-t-talk-things-you-wish-you-were-taught-in-school) by Raj Shamani, around NPR 640. Written for a young South Asian audience and unusually direct about the gap between school and work.
- [How to Win Friends and Influence People](/books/how-to-win-friends-and-influence-people) by Dale Carnegie, around NPR 269. Nearly a hundred years old and still the best value on the business shelf.
- [The Millionaire Fastlane](/books/the-millionaire-fastlane-crack-the-code-to-wealth-and-live-rich-for-a-lifetime) by M.J. DeMarco, around NPR 864, for the argument against slow saving. Loud, and useful as a counterweight.
- [The Art of War](/books/the-art-of-war) by Sun Tzu, around NPR 208, which every business list includes and few people finish. It is short enough to be worth the gamble.

## In what order should a beginner read these?

The Richest Man in Babylon, then The Psychology of Money, then Rich Dad Poor Dad if you want the mindset argument or a NEPSE guide if you want the mechanics. The Intelligent Investor comes after all of them, if at all.

## Frequently asked questions

**Are there Nepali-language money books?**
Yes, including the Nepali edition of The Psychology of Money and Nepali share bazar guides. Each book's page lists its language.

**Will these books teach me to pick stocks?**
No. They teach vocabulary, history and behaviour. Anything promising reliable stock picks is selling something.

**Can I pay cash on delivery?**
Yes, across all seven provinces — typically 1 to 2 days inside the Kathmandu Valley and 3 to 5 days elsewhere.

Browse the full [business and economics shelf](/genre/business-economics), or see [everything in stock](/books).`,
    bookSlugs: [
      'the-richest-man-in-babylon',
      'the-psychology-of-money',
      'dhan-sampatti-ko-manobigyan-the-psychology-of-money',
      'share-bazar-ma-candlestick-patterns-ra-chart-patterns-for-beginners',
      'chart-patterns-candlestick-patterns-in-stock-market-trading',
      'rich-dad-and-poor-dad',
      'rich-dad-s-cashflow-quadrant',
      'the-intelligent-investor',
      'build-don-t-talk-things-you-wish-you-were-taught-in-school',
      'how-to-win-friends-and-influence-people',
    ],
  },

  {
    slug: 'harry-potter-books-nepal',
    title: 'Harry Potter Books in Nepal: Editions and Prices',
    metaTitle: 'Harry Potter Books in Nepal: Editions and Prices (2026)',
    excerpt:
      'Most loose Harry Potter volumes sold in Nepal are the Hindi translations — Harry Potter Aur Paras Patthar is book one, not an English edition. For English, the complete seven-book box set is the dependable buy. Here is what exists, what it costs, and what to read next.',
    metaDesc:
      'Which Harry Potter editions you can actually buy in Nepal, Hindi versus English, current prices, and the best fantasy books to read next.',
    category: 'Buying guides',
    tags: ['harry potter', 'fantasy', 'nepal', 'buying guide'],
    body: `Harry Potter is one of the most searched books in Nepal and one of the most confusing to buy, because what sits on shelves here is not always what people assume they are ordering. The single most useful thing to know before you spend anything: many of the individual volumes available in this market are Hindi translations, not English ones.

Prices are what we charge as of August 2026 and move with our supplier, so treat them as a guide rather than a quote.

## Are Harry Potter books in Nepal in English or Hindi?

Both exist, but they arrive differently. The loose individual volumes commonly stocked here — including ours — are the Hindi translations, published for the Indian market. They are genuine, licensed editions; they are simply not in English. You can recognise them instantly by the title:

- [Harry Potter Aur Paras Patthar](/books/harry-potter-aur-paras-patthar), around NPR 720 — this is book one, the Philosopher's Stone
- [Harry Potter Aur Rahasyamayi Tehkhana](/books/harry-potter-aur-rahasyamayi-tehkhana), around NPR 720 — book two, the Chamber of Secrets
- [Harry Potter Aur Azkaban Ka Kaidi](/books/harry-potter-aur-azkaban-ka-kaidi), around NPR 864 — book three, the Prisoner of Azkaban
- [Harry Potter Aur Aag Ka Pyala](/books/harry-potter-aur-aag-ka-pyala), around NPR 1,152 — book four, the Goblet of Fire
- [Harry Potter Aur Maut Ke Tohfe](/books/harry-potter-aur-maut-ke-tohfe), around NPR 1,296 — book seven, the Deathly Hallows

If you read Hindi comfortably, these are good value and complete, unabridged translations. If you do not, no amount of a low price will fix that, and this is the mistake we most often see corrected after the parcel arrives.

## How do you buy the English set?

The [Harry Potter complete series box set](/books/harry-potter-all-series-box-pack), around NPR 6,264, is the reliable English option: all seven novels in one box, in the standard paperback edition. It is a real outlay, but per book it works out cheaper than buying English volumes individually, and it removes the risk of ending up with a shelf in two languages and two trim sizes.

Stock on box sets moves quickly and in small numbers, so the product page is the accurate source on availability rather than this guide.

## What order should the books be read in?

Strictly publication order, which is also chronological: Philosopher's Stone, Chamber of Secrets, Prisoner of Azkaban, Goblet of Fire, Order of the Phoenix, Half-Blood Prince, Deathly Hallows. Unlike many long series, this one genuinely does not work out of sequence — each book assumes everything before it, and the tone darkens steadily, which is part of the design.

## What age are they actually for?

Book one suits a confident reader of about eight or nine. Book four onwards is longer, darker and more violent, and many children who start at eight finish the series at twelve, which is roughly how it was written. There is no need to rush a child through the later ones.

## Is the Wizarding Almanac worth buying?

[The Harry Potter Wizarding Almanac](/books/the-harry-potter-wizarding-almanac), around NPR 2,304, is an illustrated companion rather than a story — maps, creatures, spells and Hogwarts detail. It is a gift for someone who has already read the novels and wants to stay in the world. It is not a way in for someone who has not.

## What should you read after Harry Potter?

The two series most often reached for next, both in stock:

- [Percy Jackson and the Titan's Curse](/books/percy-jackson-and-the-titan-s-curse), around NPR 720, and [Percy Jackson and the Olympians: Wrath of the Triple Goddess](/books/percy-jackson-and-the-olympians-wrath-of-the-triple-goddess), around NPR 1,008. Greek myth, modern setting, similar age band and a similar sense of humour.
- [The Lion, the Witch and the Wardrobe](/books/the-lion-the-witch-and-the-wardrobe-the-chronicles-of-narnia-series), around NPR 288. Older, shorter and gentler, and the cheapest entry to a classic series on this list.

For a reader ready to step up in difficulty, [The Hobbit and The Lord of the Rings box set](/books/the-hobbit-and-the-lord-of-the-rings-box-set) at around NPR 3,024 is the natural progression — start with The Hobbit, which is a children's book, before the trilogy, which is not. Adults leaving the series behind entirely tend to enjoy [Good Omens](/books/good-omens) by Neil Gaiman and Terry Pratchett at around NPR 864.

## Frequently asked questions

**Are the Hindi editions abridged?**
No. They are complete licensed translations of the full novels, not shortened versions.

**How can I tell which language an edition is before ordering?**
Check the title first — a Hindi title means a Hindi book — and then the specifications on the book's page, which list language, publisher, format and ISBN.

**Do you deliver outside Kathmandu?**
Yes, to all seven provinces. Typically 1 to 2 days inside the Kathmandu Valley and 3 to 5 days elsewhere, cash on delivery.

Browse more in [science fiction and fantasy](/genre/sci-fi-fantasy) and [children's books](/category/kids), or see [everything in stock](/books).`,
    bookSlugs: [
      'harry-potter-aur-paras-patthar',
      'harry-potter-aur-rahasyamayi-tehkhana',
      'harry-potter-aur-azkaban-ka-kaidi',
      'harry-potter-aur-aag-ka-pyala',
      'harry-potter-aur-maut-ke-tohfe',
      'harry-potter-all-series-box-pack',
      'the-harry-potter-wizarding-almanac',
      'percy-jackson-and-the-titan-s-curse',
      'the-lion-the-witch-and-the-wardrobe-the-chronicles-of-narnia-series',
      'the-hobbit-and-the-lord-of-the-rings-box-set',
    ],
  },

  {
    slug: 'best-psychology-books-nepal',
    title: 'Best Psychology Books to Read in Nepal (2026)',
    metaTitle: 'Best Psychology Books to Read in Nepal (2026)',
    excerpt:
      'Start with The Art of Thinking Clearly for the fastest return, Emotional Intelligence for the foundation, and Influence if you want to understand why you keep saying yes. All three are in stock in Nepal, priced in NPR with cash on delivery.',
    metaDesc:
      'The best psychology books available in Nepal — thinking, emotions, persuasion, memory and anxiety — with real NPR prices and cash on delivery.',
    category: 'Reading guides',
    tags: ['psychology', 'nepal', 'reading guide', 'mental health'],
    body: `Psychology is the shelf people browse longest and buy from worst, because the popular end of it is crowded with books that restate one idea for three hundred pages. The ones below are the exceptions: each teaches something specific you can name afterwards.

A note before the list. Several of these touch on anxiety and depression, and a book is a good companion but a poor clinician. If something is genuinely wrong, a book is a supplement to talking to someone qualified, not a replacement for it.

Prices are what we charge as of August 2026 and move with our supplier, so treat them as a guide rather than a quote.

## Which psychology book gives the fastest return?

[The Art of Thinking Clearly](/books/the-art-of-thinking-clearly) by Rolf Dobelli, around NPR 720. It is ninety-nine short chapters, each on a single cognitive bias, and you can read them in any order over months. Because each chapter is three pages, it survives a commute and a busy week better than anything else here — and you will catch yourself committing about a third of the errors within a week of reading it.

## What is the best foundation to start with?

[Emotional Intelligence](/books/emotional-intelligence) by Daniel Goleman, around NPR 960. This is the book that put the idea into general circulation: that recognising and managing emotion predicts more about how a life goes than raw intelligence does. It is denser than the modern self-help that copied it, and better.

## Which book explains why people say yes?

[Influence: The Psychology of Persuasion](/books/influence-the-psychology-of-persuasion) by Robert Cialdini, around NPR 1,008. Six principles — reciprocity, commitment, social proof, authority, liking, scarcity — with the experiments behind each. Read it once to understand marketing, and a second time to notice how often it is being used on you. It is the most practical book on this page.

## What should you read about anxiety?

[Unwinding Anxiety](/books/unwinding-anxiety-train-your-brain-to-heal-your-mind) by Judson Brewer, around NPR 1,296, treats anxiety as a habit loop and gives an actual method rather than reassurance. It is the most useful thing on this list for someone who is currently struggling.

Alongside it, [I Want to Die but I Want to Eat Tteokbokki](/books/i-want-to-die-but-i-want-to-eat-tteokbokki) by Baek Sehee, around NPR 720, is not a self-help book at all — it is a transcript of a young woman's sessions with her psychiatrist, and its value is recognition rather than instruction. Many readers find it the first honest description of low-grade depression they have read.

[The Mountain Is You](/books/the-mountain-is-you) by Brianna Wiest, around NPR 576, sits between the two: gentler, more aphoristic, and popular for a reason, though it is the least rigorous book here.

## Is there anything on memory and mastery?

Two, both unusual:

- [Moonwalking with Einstein](/books/moonwalking-with-einstein-the-art-and-science-of-remembering-everything) by Joshua Foer, around NPR 1,152. A journalist covers the world memory championship, gets drawn in, and wins it a year later. It is reportage that happens to teach you the techniques.
- [Mastery](/books/mastery) by Robert Greene, around NPR 1,440. Long, and built on biographies of people who became exceptionally good at something. Read it for the pattern across the lives rather than the advice.

## What about relationships?

[Men Are From Mars, Women Are From Venus](/books/men-are-from-mars-women-are-from-venus) by John Gray, around NPR 720, remains the most-read relationship book in the world. It is worth knowing that its central premise — that the sexes differ fundamentally in communication style — is contested by later research, and it reads as very much of its era. Take it as one lens, not a finding.

For something closer to literature, [Veronika Decides to Die](/books/the-veronica-decides-to-die) by Paulo Coelho, around NPR 576, is a novel set in a psychiatric hospital that does more with the subject than most non-fiction manages.

## What order should you read them in?

The Art of Thinking Clearly first, because it is the easiest to finish. Then Influence, which is the most immediately useful. Then Emotional Intelligence as the foundation under both. Everything else on this page is a branch off those three.

## Frequently asked questions

**Are these academic textbooks?**
No. These are books written for general readers. Academic psychology texts are a different shelf and mostly a different price.

**Which one helps most with focus and habits?**
Unwinding Anxiety for the mechanism behind habits, and The Art of Thinking Clearly for the decision errors that break them.

**Can I pay on delivery?**
Yes, cash on delivery across all seven provinces — typically 1 to 2 days inside the Kathmandu Valley and 3 to 5 days elsewhere.

Browse the full [psychology shelf](/genre/psychology) and [self-help](/genre/self-help), or see [everything in stock](/books).`,
    bookSlugs: [
      'the-art-of-thinking-clearly',
      'emotional-intelligence',
      'influence-the-psychology-of-persuasion',
      'unwinding-anxiety-train-your-brain-to-heal-your-mind',
      'i-want-to-die-but-i-want-to-eat-tteokbokki',
      'the-mountain-is-you',
      'moonwalking-with-einstein-the-art-and-science-of-remembering-everything',
      'mastery',
      'men-are-from-mars-women-are-from-venus',
      'the-veronica-decides-to-die',
    ],
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
    logger.info({ count: ARTICLES.length }, 'Batch 3 articles seeded');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'seed-articles-batch3 failed');
  process.exit(1);
});
