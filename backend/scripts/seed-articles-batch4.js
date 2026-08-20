'use strict';

/*
 * Fourth batch of blog articles — ten guides.
 *
 * Eight of the ten topics are the ones that were asked for. Two could not be
 * written as briefed, and the substitutions are deliberate rather than quiet:
 *
 *  - "Best Books for Loksewa Preparation" has no stock behind it. The catalogue
 *    holds zero books in the `loksewa` section (0 documents, not 0 live ones),
 *    and the only civil-service title in the shop is an Indian UPSC guide. An
 *    article recommending Loksewa books we cannot sell would fail the rule the
 *    earlier batches set — every recommendation links to a book in the
 *    catalogue — and would land readers on an empty /category/loksewa. It is
 *    replaced by IELTS and English exam prep, which serves the same student
 *    audience, carries higher commercial intent, and has 20+ live titles.
 *
 *  - "Best Nepali Poetry Books to Own" is thin on stock: exactly one
 *    Nepali-language book sits in the poetry genre. The poetry shelf overall
 *    has 52 live titles, so the guide is written as poetry-in-Nepal, opening
 *    with the four genuine Nepali and Nepali-adjacent collections we do hold
 *    rather than padding a Nepali-only list with books that are not on it.
 *
 * House rules, unchanged from batches 2 and 3: the excerpt is a self-contained
 * 40-60 word answer (rendered as the lede, and what a snippet or an AI answer
 * lifts); every ## heading is a question answered immediately below; prices are
 * real as of August 2026 and dated in the copy; and every slug was verified
 * live before seeding — the seeder drops any link whose book is not active.
 *
 * Idempotent: upserts by slug and preserves the original publishedAt.
 *
 *   node scripts/seed-articles-batch4.js
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
    slug: 'haruki-murakami-books-nepal',
    title: 'Haruki Murakami Books in Nepal: Where to Start',
    metaTitle: 'Haruki Murakami Books in Nepal: Where to Start (2026)',
    excerpt:
      'Start with Norwegian Wood if you want the one that made him famous, or Kafka on the Shore if you want the strangeness he is actually known for. Both are in stock in Nepal from around NPR 864. Skip 1Q84 until you know you like him.',
    metaDesc:
      'Which Haruki Murakami novel to read first, what each costs in Nepal, and the order that works. In stock with cash on delivery.',
    category: 'Reading guides',
    tags: ['haruki murakami', 'japanese literature', 'fiction', 'nepal'],
    body: `Murakami is the most borrowed and least finished author on a lot of shelves in Kathmandu. The reason is almost always the same: someone starts with the 1,000-page one, or with a book where a man talks to a cat for forty pages, and decides the problem is them. It usually isn't. It is the starting point.

${PRICE_NOTE}

## Which Murakami book should you read first?

[Norwegian Wood](/books/norwegian-wood), around NPR 1,008. It is the least strange thing he has written and the book that made him famous in Japan, to his own discomfort. A student in 1960s Tokyo, two women, grief that never quite resolves. No talking cats, no parallel worlds. If you want to know whether you like his sentences before you commit to his weirdness, this is the honest test.

If you already know you want the strangeness, start with [Kafka on the Shore](/books/kafka-on-the-shore) at around NPR 864 instead. A teenage runaway, an old man who can speak to cats, and two storylines that never quite explain themselves. It is the book most people mean when they say they love Murakami.

## What if you only want to try a few pages?

Read the short stories. [Men Without Women](/books/men-without-women), around NPR 864, is seven stories about men who have lost women, and it is the fastest way to find out whether his voice works on you. Twenty minutes tells you what 400 pages would.

[The Elephant Vanishes](/books/the-elephant-vanishes) at around NPR 864 is the other collection worth having, and it contains some of the strangest short work he has done. [First Person Singular](/books/first-person-singular), around NPR 1,152, is his most recent collection and the most openly autobiographical.

## When should you attempt 1Q84?

After two other books, not before. [1Q84: Books 1 and 2](/books/1q84-books-1-and-2) at around NPR 864 is his most ambitious novel and his most demanding: two moons, a cult, a parallel Tokyo, and a plot that takes its time. Readers who love it tend to have already learned to trust him. Readers who start here often stop.

[Killing Commendatore](/books/killing-commendatore), around NPR 1,008, sits in similar territory and is a little kinder about it.

## What about the early novels?

[A Wild Sheep Chase](/books/a-wild-sheep-chase), around NPR 864, is where his voice first arrives fully formed, and it is shorter and funnier than his reputation suggests. It works as a first book for readers who like detective stories, because it is shaped like one, right up until it isn't.

## Is there a reading order?

Nothing is a series, so no order is required. A path that works for most readers: Men Without Women, then Norwegian Wood, then Kafka on the Shore, then 1Q84 if the first three landed. Move from short to long and from realistic to strange, rather than the other way round.

## What should you know before starting?

Three things, and they save a lot of frustration. His endings often do not resolve, and that is deliberate rather than a translation problem. The same motifs recur across books, so wells, cats, jazz and cooking will start to feel like old furniture. And the translations vary between Jay Rubin, Philip Gabriel and Alfred Birnbaum, which is worth checking on the copyright page if you end up caring.

## Frequently asked questions

**Which Murakami book is shortest?**
Men Without Women, as a story collection you can read in pieces. Among the novels, A Wild Sheep Chase.

**Are these the English translations?**
Yes. Each book's page lists publisher, format, page count and ISBN so you can check the edition before ordering.

${DELIVERY_FAQ}

Browse more in [fiction](/genre/fiction), or see [everything in stock](/books).`,
    bookSlugs: [
      'norwegian-wood', 'kafka-on-the-shore', 'men-without-women', 'the-elephant-vanishes',
      'first-person-singular', '1q84-books-1-and-2', 'killing-commendatore', 'a-wild-sheep-chase',
    ],
  },

  // ── 2 ──────────────────────────────────────────────────────────────────
  {
    slug: 'best-fantasy-books-nepal',
    title: 'Best Fantasy Books in Nepal (2026)',
    metaTitle: 'Best Fantasy Books in Nepal (2026)',
    excerpt:
      'For a first fantasy novel in Nepal, start with A Wizard of Earthsea at around NPR 640 or Good Omens at around NPR 864 — both short, both complete in one book. Save Tolkien and the big series until you know the genre suits you.',
    metaDesc:
      'The best fantasy and science fiction books available in Nepal, from one-volume starters to full box sets, with real NPR prices.',
    category: 'Reading guides',
    tags: ['fantasy', 'science fiction', 'nepal', 'reading guide'],
    body: `Fantasy is the genre people most often buy wrong, because the famous titles are the longest ones. Someone buys a 1,200-page box set as their first try, reads eighty pages, and concludes the genre is not for them. The fix is to start with a book that ends.

${PRICE_NOTE}

## What is the best fantasy book to start with?

[A Wizard of Earthsea](/books/a-wizard-of-earthsea) by Ursula K. Le Guin, around NPR 640. A boy goes to a school for wizards, is arrogant, and unleashes something he then has to face. It was doing that decades before Hogwarts, in about 200 pages, and Le Guin writes better sentences than almost anyone in the genre. It is complete in itself.

[Good Omens](/books/good-omens) by Neil Gaiman and Terry Pratchett, around NPR 864, is the other good entry point: an angel and a demon try to stop the apocalypse because they have grown fond of England. It is funny, self-contained, and the least intimidating fantasy novel on this shelf.

## What if you want the classic epic?

[The Hobbit and The Lord of the Rings box set](/books/the-hobbit-and-the-lord-of-the-rings-box-set), around NPR 3,024, is the full journey in one purchase, and the right way to buy it: The Hobbit is a children's adventure and a genuinely easy read, and it prepares you for a trilogy that is neither. Start there, not at Fellowship.

If you want the trilogy alone, [The Lord of the Rings boxed set](/books/the-lord-of-the-rings-boxed-set) is around NPR 2,592.

## Which series are worth committing to?

- [Heroes of Olympus Complete Collection](/books/heroes-of-olympus-complete-collection) by Rick Riordan, around NPR 3,599. Greek and Roman myth, modern setting, fast and funny — the most reliable series for a reader aged roughly 10 to 15, and plenty of adults.
- [Divergent Series Box Set](/books/divergent-series-box-set) by Veronica Roth, around NPR 2,736, for dystopian young adult.
- [House of Flame and Shadow](/books/house-of-flame-and-shadow) by Sarah J. Maas, around NPR 1,296, and [Iron Flame](/books/iron-flame) by Rebecca Yarros, around NPR 2,302, are the two names driving most fantasy conversation right now. Both are later volumes in their series, so check you have the earlier ones first.

## What about science fiction?

The shelf is strong here and the books are shorter.

- [Project Hail Mary](/books/project-hail-mary) by Andy Weir, around NPR 864. A man wakes on a spacecraft with no memory and has to save Earth using physics. The most purely enjoyable science fiction novel of recent years.
- [The Dark Forest](/books/the-dark-forest) by Cixin Liu, around NPR 864, for readers who want ideas at scale and do not mind cold characters.
- [God Emperor of Dune](/books/god-emperor-of-dune) by Frank Herbert, around NPR 1,079 — a later Dune, so start the series properly if you have not.
- [The War of the Worlds](/books/the-war-of-the-worlds) by H.G. Wells, around NPR 288. The original alien invasion, still short and still frightening, and the cheapest book on this page.

## Is there anything gentler?

[The Graveyard Book](/books/the-graveyard-book) by Neil Gaiman, around NPR 576 — a boy raised by ghosts in a cemetery, written for children and read happily by adults. Nothing else on this list is as easy to hand to someone else when you finish it.

## Frequently asked questions

**Do I need to read fantasy series in order?**
For the series above, yes. Standalone novels like Project Hail Mary, Good Omens and A Wizard of Earthsea need nothing before them.

**Is Harry Potter available in Nepal?**
Yes, though the loose volumes commonly sold here are the Hindi translations. See our guide to [Harry Potter editions in Nepal](/blog/harry-potter-books-nepal) before ordering.

${DELIVERY_FAQ}

Browse the full [science fiction and fantasy shelf](/genre/sci-fi-fantasy), or see [everything in stock](/books).`,
    bookSlugs: [
      'a-wizard-of-earthsea', 'good-omens', 'the-hobbit-and-the-lord-of-the-rings-box-set',
      'the-lord-of-the-rings-boxed-set', 'heroes-of-olympus-complete-collection',
      'divergent-series-box-set', 'house-of-flame-and-shadow', 'iron-flame',
      'project-hail-mary', 'the-dark-forest', 'god-emperor-of-dune', 'the-war-of-the-worlds',
      'the-graveyard-book',
    ],
  },

  // ── 3 ──────────────────────────────────────────────────────────────────
  {
    slug: 'best-thriller-mystery-books-nepal',
    title: 'Best Thriller and Mystery Books in Nepal (2026)',
    metaTitle: 'Best Thriller & Mystery Books in Nepal (2026)',
    excerpt:
      'For a thriller you will finish in a weekend, start with The Housemaid or Gone Girl, both around NPR 720 to 792. For classic detection, Agatha Christie is the shelf, and Murder on the Orient Express at around NPR 576 is the way in.',
    metaDesc:
      'The best thriller and mystery books available in Nepal — Freida McFadden, Agatha Christie, Gillian Flynn and more, with real NPR prices.',
    category: 'Reading guides',
    tags: ['thriller', 'mystery', 'crime', 'nepal'],
    body: `The thriller shelf is where most people go to start reading again after a long gap, and it is the right instinct: a good thriller does the work of pulling you through. The trick is matching the kind of tension you actually enjoy, because "thriller" covers three quite different experiences.

${PRICE_NOTE}

## Which thriller should you read first?

[The Housemaid](/books/the-housemaid) by Freida McFadden, around NPR 792. Short chapters, a twist most readers do not see, and a pace that makes a hundred pages disappear. It is the book people mean when they say they read a thriller in one sitting. Its follow-ups, [The Inmate](/books/the-inmate) and [The Locked Door](/books/the-locked-door), are both around NPR 792 and work the same way.

If you want something with more craft behind the shock, [Gone Girl](/books/gone-girl) by Gillian Flynn at around NPR 720 is the better book: a wife disappears, a husband is suspected, and the middle of the novel does something to the reader that thrillers had not really done before. [Sharp Objects](/books/sharp-objects), around NPR 720, is her nastier and shorter one.

## What is the best classic detective novel?

[Murder on the Orient Express](/books/murder-on-the-orient-express) by Agatha Christie, around NPR 576. A train stuck in snow, twelve suspects, and the most famous solution in detective fiction. It is fair-play mystery at its best: every clue is on the page, and you can genuinely solve it.

[And Then There Were None](/books/and-then-there-were-none-the-world-s-favourite-agatha-christie-book) at around NPR 648 is her masterpiece and the best-selling mystery ever written — ten strangers on an island, dying one by one. [Death on the Nile](/books/death-on-the-nile), around NPR 648, is the other one worth owning. If you would rather buy three at once, [The World's Favourite: three Christie novels](/books/the-world-s-favourite-and-then-there-were-none-murder-on-the-orient-express-the-murder-of-roger-ackroyd) is around NPR 1,762.

## What should a younger reader start with?

[A Good Girl's Guide to Murder](/books/a-good-girl-s-guide-to-murder) by Holly Jackson, around NPR 720. A school student reopens a closed murder case for a project. It is a proper mystery with real clues, written for teenagers and read by everyone, and the [three-book boxed set](/books/a-good-girl-s-guide-to-murder-series-3-books-boxed-set) at around NPR 2,304 covers the whole story.

## Which ones are pure page-turners?

- [Then She Was Gone](/books/then-she-was-gone) by Lisa Jewell, around NPR 864.
- [The Guest List](/books/the-guest-list) by Lucy Foley, around NPR 720. A wedding on a remote island, a body, and everyone with a reason.
- [Rock Paper Scissors](/books/rock-paper-scissors) by Alice Feeney, around NPR 720.
- [Angels and Demons](/books/angels-and-demons) by Dan Brown, around NPR 864, and [Origin](/books/origin) at around NPR 720, if you like your thrillers with symbology and short chapters.

## What if you want horror rather than crime?

Stephen King, and the three to start with are [The Shining](/books/the-shining) at around NPR 864, [Misery](/books/misery) at around NPR 960, and [Pet Sematary](/books/pet-sematary) at around NPR 1,152. Misery is the one to read first: two characters, one room, and no supernatural element at all.

## Is there anything set closer to home?

[The Girl in Room 105](/books/the-girl-in-room-105) by Chetan Bhagat, around NPR 360, is the cheapest thriller here and set in Delhi, which is a good deal nearer than Maine.

## Frequently asked questions

**Do Agatha Christie novels need reading in order?**
No. Each mystery stands alone, even within the Poirot books.

**Which is the shortest thriller here?**
The Girl in Room 105 at around NPR 360, and The Housemaid reads fastest despite being longer.

${DELIVERY_FAQ}

Browse the full [mystery and thriller shelf](/genre/mystery-thriller), or see [everything in stock](/books).`,
    bookSlugs: [
      'the-housemaid', 'the-inmate', 'the-locked-door', 'gone-girl', 'sharp-objects',
      'murder-on-the-orient-express', 'and-then-there-were-none-the-world-s-favourite-agatha-christie-book',
      'death-on-the-nile', 'a-good-girl-s-guide-to-murder', 'then-she-was-gone',
      'the-guest-list', 'rock-paper-scissors', 'angels-and-demons', 'the-shining',
      'misery', 'the-girl-in-room-105',
    ],
  },

  // ── 4 (substitute for Loksewa — see header) ───────────────────────────
  {
    slug: 'best-ielts-english-exam-books-nepal',
    title: 'Best IELTS and English Exam Books in Nepal (2026)',
    metaTitle: 'Best IELTS & English Exam Books in Nepal (2026)',
    excerpt:
      'For IELTS in Nepal, the only practice tests worth trusting are the official Cambridge ones, around NPR 936 a book. Pair one with a grammar reference and Word Power Made Easy at around NPR 288, and that is a complete preparation stack.',
    metaDesc:
      'The IELTS and English preparation books actually worth buying in Nepal: official Cambridge practice tests, grammar references and vocabulary, with prices.',
    category: 'Buying guides',
    tags: ['ielts', 'english', 'exam preparation', 'students', 'nepal'],
    body: `Every year a large number of students in Nepal sit IELTS for study or work abroad, and the preparation shelf they buy from is full of books that do not help. The single most useful thing to know: for practice tests, only the official Cambridge papers reflect the real exam, because they are made by the people who set it.

${PRICE_NOTE}

## Which IELTS book should you buy first?

An official Cambridge practice test book, and the most recent one you can get. These contain real past papers with audio and answers.

- [IELTS 19 Academic: Authentic Practice Tests](/books/ielts-19-academic-authentic-practice-tests-with-audio-answers), around NPR 936
- [IELTS 18 Academic Student's Book with Answers](/books/ielts-18-academic-student-s-book-with-answers), around NPR 936
- [Cambridge IELTS 17 Academic](/books/cambridge-ielts-17-academic-student-s-book-with-answers-audio-resource-bank), around NPR 936

Buy Academic if you are applying to a university, and General Training if you are applying for migration or work. They are different exams in Reading and Writing, and buying the wrong one is the most common and most expensive mistake here. The General Training equivalent is [IELTS 17 General Training](/books/ielts-17-general-training-student-s-book-with-answers-with-audio-with-resource-bank), around NPR 936.

## Do you need more than one practice book?

Two is the right number, three is usually a waste. Each contains four full tests, so two books give you eight — enough to sit one under timed conditions every week for two months. What improves your band is analysing the tests you have already done, not collecting more of them.

## Which book explains the exam rather than testing you?

[The Official Cambridge Guide to IELTS](/books/the-official-cambridge-guide-to-ielts-student-s-book-with-answers-with-dvd-rom), around NPR 1,456. This is the teaching book: strategy for each section, worked examples, and what examiners actually reward. Buy it alongside a practice book, not instead of one.

For grammar aimed specifically at the exam, [IELTS Grammar for Bands 6.5 and Above](/books/ielts-grammar-for-bands-6-5-and-above) is around NPR 1,008.

## What if your English needs work before IELTS?

Then fix that first, because no amount of test practice raises a band you do not have.

- [English Grammar in Use](/books/english-grammar-in-use) by Raymond Murphy, around NPR 1,440. The standard self-study grammar book worldwide, and the one most teachers name first.
- [Word Power Made Easy](/books/word-power-made-easy) by Norman Lewis, around NPR 288. The best value on this page by a distance: vocabulary built from roots, so you learn families of words rather than lists.
- [High School English Grammar and Composition](/books/high-school-english-grammar-composition-wren-martin-regular-edition), the Wren and Martin most Nepali students already recognise, around NPR 936.
- [Advanced English Grammar](/books/advanced-english-grammar) by Martin Hewings, around NPR 720, once the basics are secure.

## Is there anything in Nepali for beginners?

Yes. [Rapidex English Speaking Course in Nepali](/books/rapidex-english-speaking-course-nepali-with-tutorial-audio-on-youtube), around NPR 504, teaches spoken English through Nepali, which is the right starting point if English instruction itself is the barrier.

## What about aptitude and reasoning?

[A Modern Approach to Verbal and Non-Verbal Reasoning](/books/a-modern-approach-to-verbal-non-verbal-reasoning) by R.S. Aggarwal, around NPR 1,296, is the standard book for reasoning sections in competitive and entrance exams.

## What does a complete stack cost?

Two official practice books, one grammar reference and Word Power Made Easy comes to roughly NPR 3,600. That is the whole preparation shelf, and it is less than most single coaching-class instalments.

## Frequently asked questions

**Are these the official Cambridge editions?**
The Cambridge titles listed are the official IELTS publications. Each book's page lists publisher, format and ISBN so you can check before ordering.

**Academic or General Training — how do I know?**
University admission almost always requires Academic. Work visas and migration usually require General Training. Confirm with the institution you are applying to before buying.

${DELIVERY_FAQ}

Browse [science and technology](/genre/science-technology), where reference and exam titles are shelved, or see [everything in stock](/books).`,
    bookSlugs: [
      'ielts-19-academic-authentic-practice-tests-with-audio-answers',
      'ielts-18-academic-student-s-book-with-answers',
      'cambridge-ielts-17-academic-student-s-book-with-answers-audio-resource-bank',
      'ielts-17-general-training-student-s-book-with-answers-with-audio-with-resource-bank',
      'the-official-cambridge-guide-to-ielts-student-s-book-with-answers-with-dvd-rom',
      'ielts-grammar-for-bands-6-5-and-above', 'english-grammar-in-use', 'word-power-made-easy',
      'high-school-english-grammar-composition-wren-martin-regular-edition',
      'advanced-english-grammar', 'rapidex-english-speaking-course-nepali-with-tutorial-audio-on-youtube',
      'a-modern-approach-to-verbal-non-verbal-reasoning',
    ],
  },

  // ── 5 (adapted — see header) ──────────────────────────────────────────
  {
    slug: 'best-poetry-books-nepal',
    title: 'Best Poetry Books to Own in Nepal (2026)',
    metaTitle: 'Best Poetry Books to Own in Nepal (2026)',
    excerpt:
      'Every Nepali shelf should start with Muna Madan at around NPR 108 — Devkota in the folk metre, and the cheapest great book in the country. From there the poetry shelf runs through Ghalib and Gulzar in Urdu and Hindi to Rumi and the English canon.',
    metaDesc:
      'The poetry worth owning in Nepal: Muna Madan, Nepali and Urdu collections, Rumi, Gibran and the English classics, with real NPR prices.',
    category: 'Reading guides',
    tags: ['poetry', 'nepali literature', 'nepal', 'reading guide'],
    body: `Poetry is the cheapest shelf in any bookshop and the one people are most nervous about buying from. It should be the opposite way round: a poetry collection costs less than a novel, you can read it in fragments, and nothing is lost by not finishing it.

${PRICE_NOTE}

## Which poetry book should every Nepali shelf have?

[Muna Madan](/books/muna-madan) by Laxmi Prasad Devkota, around NPR 108. It is the most loved poem in the Nepali language, written in the jhyaure folk metre, about a man who leaves for Lhasa to earn money and a wife who waits. It is short, it is devastating, and at this price there is no argument against owning it. If you buy one book from this page, buy this one.

## What other Nepali poetry can you buy here?

The Nepali poetry shelf in this shop is genuinely small, so this is a short and honest list rather than a padded one:

- [Lahana Ra Teer](/books/lahana-ra-teer) by Abhaya Shrestha, around NPR 360 — a contemporary Nepali-language collection.
- [Salaha](/books/salaha-by-shrawan-mukarung) by Shrawan Mukarung, around NPR 896. Mukarung is one of the most significant living Nepali poets.
- [Galli Sansar](/books/galli-sansar) by Roshan Sherchan, around NPR 630.

If you want Nepali writing more broadly rather than verse specifically, [Shirishko Phool](/books/shireeshko-phool) by Parijat at around NPR 270 is the novel to own, and our guide to [essential Nepali literature](/blog/essential-nepali-literature-books) covers the rest.

## What about Urdu and Hindi poetry?

This is where the shelf is strongest, and where a lot of readers in Nepal actually live.

- [Ghalib](/books/ghalib), around NPR 252. The greatest Urdu poet, and the cheapest way into him.
- [Koi Deewana Kahta Hai](/books/koi-deewana-kahta-hai) by Kumar Vishwas, around NPR 288 — contemporary Hindi verse that fills auditoriums.
- [Mausam](/books/mausam) by Gulzar, around NPR 288. Gulzar writes the lyrics people already know by heart; the poems are quieter and better.

## Which translated poets are worth owning?

[Rumi: A New Translation](/books/rumi-a-new-translation), around NPR 576. Thirteenth-century Persian mysticism that reads as though it were written last week, which is why he outsells almost every living poet.

## Where should you start with English poetry?

[The Poetry of William Wordsworth](/books/the-poetry-of-william-wordsworth), around NPR 576. Wordsworth wrote about landscape and memory in plain language, which makes him the least intimidating of the English romantics — and the mountains help, if you are reading him in Nepal.

## How do you actually read poetry?

Not like a novel. Three things that help more than any advice about interpretation: read it aloud, even quietly, because the rhythm is half the meaning. Read one poem, not twenty. And reread the ones that land instead of pressing on — a collection you have read four poems from properly is doing more for you than one you finished.

## Frequently asked questions

**Is Muna Madan in Nepali or English?**
The edition listed is a translated edition; check the language field in the specifications on the book's page before ordering.

**Do you have more Nepali-language poetry coming?**
The Nepali verse shelf is small at the moment and we are adding to it. [Ask us](/contact) for a specific poet and we will tell you honestly whether we can get it.

${DELIVERY_FAQ}

Browse the full [poetry shelf](/genre/poetry) and [Nepali literature](/genre/nepali-literature), or see [everything in stock](/books).`,
    bookSlugs: [
      'muna-madan', 'lahana-ra-teer', 'salaha-by-shrawan-mukarung', 'galli-sansar',
      'shireeshko-phool', 'ghalib', 'koi-deewana-kahta-hai', 'mausam',
      'rumi-a-new-translation', 'the-poetry-of-william-wordsworth',
    ],
  },

  // ── 6 ──────────────────────────────────────────────────────────────────
  {
    slug: 'book-delivery-outside-kathmandu',
    title: 'Book Delivery Outside Kathmandu Valley: What to Expect',
    metaTitle: 'Book Delivery Outside Kathmandu Valley: What to Expect',
    excerpt:
      'Outside the Kathmandu Valley, books typically reach you in 3 to 5 days after dispatch, against 1 to 2 days inside it. You pay the courier in cash on handover: the book total from checkout, plus the courier fee for your area, which the courier sets.',
    metaDesc:
      'How long book delivery takes outside Kathmandu Valley, what the courier charges, and how cash on delivery works across all seven provinces.',
    category: 'Buying guides',
    tags: ['delivery', 'cash on delivery', 'nepal', 'shipping'],
    body: `Most questions we get from outside the Valley are the same three: how long will it take, what will I pay at the door, and what happens if I am not there. Here are the honest answers, including the parts other shops tend to leave vague.

## How long does delivery take outside Kathmandu Valley?

Typically 3 to 5 days from dispatch, against 1 to 2 days inside the Valley. Dispatch itself is usually within a day of the order, so most orders outside the Valley arrive within about a week of being placed.

Those are typical times, not guarantees, and the reason is worth stating plainly: we hand the parcel to a courier, and the courier runs the final leg. District headquarters and larger towns are quicker; remote wards add a day or two. Festival weeks and monsoon road conditions add more.

## Which parts of Nepal do you deliver to?

All seven provinces — Koshi, Madhesh, Bagmati, Gandaki, Lumbini, Karnali and Sudurpashchim — and all 77 districts. There is no part of the country we will not send books to.

## What will you actually pay at the door?

Two separate amounts, and only one of them is ours:

1. **The book total** you saw at checkout, in NPR. That is the whole of what this shop charges.
2. **The courier's delivery fee**, set by the courier based on where the parcel is going, and collected by them on handover.

We do not set, collect or take a share of the second one, which is why there is no shipping line at checkout. Quoting a flat figure would mean quoting a price we do not control, and quoting zero would be false. A shop that shows you one confident number for delivery to every district is usually averaging it into the book price.

## Why is delivery cost not shown at checkout?

Because we would be guessing. Courier rates vary by destination and by parcel weight, and the rate to a hill district is not the rate to Birgunj. Rather than pad every book price to cover the worst case, we keep the book price honest and let the courier bill its own rate.

## What happens if you are not home?

The courier will normally call the number on the order before attempting delivery, which is why a working mobile number matters more than a precise address in much of Nepal. If the first attempt fails they usually try again or hold the parcel at their local point for collection. Keep the phone reachable for the two days after dispatch.

## How do you track an order?

Every order gets a number in the format PT-YYYYMMDD-XXXXX in the confirmation email. Enter it on the [order tracking page](/track) at any time. If something looks stuck, [contact us](/contact) with that number and a person will chase it.

## Can you cancel if it is taking too long?

You can cancel free of charge any time before dispatch, from your account's order page. Once the parcel is with the courier it cannot be cancelled — at that point the practical route is to refuse it at the door, and to tell us so we can sort it out.

## Does anything speed it up?

Ordering earlier in the week helps, because a parcel dispatched on a Friday often sits over the weekend. Beyond that, no: we do not offer an express tier, because it would be the courier's service to promise and not ours.

## Frequently asked questions

**Is cash on delivery available everywhere?**
Yes, across all 77 districts, and it is currently the only payment method. Nothing leaves your account before the books are in your hands.

**Do you deliver inside the Kathmandu Valley faster?**
Yes, typically 1 to 2 days. See our [Kathmandu delivery page](/kathmandu) for the detail.

**Is delivery free anywhere?**
No, and any shop telling you it is has put the cost in the book price.

Browse [everything in stock](/books), or read the full [terms and returns](/terms).`,
    bookSlugs: [],
  },

  // ── 7 ──────────────────────────────────────────────────────────────────
  {
    slug: 'english-or-nepali-book-edition',
    title: 'English or Nepali Edition: Which Should You Buy?',
    metaTitle: 'English or Nepali Edition: Which Book Should You Buy?',
    excerpt:
      'Buy the edition in the language you think in, not the one you want to be seen reading. A Nepali edition is often cheaper too: Ikigai is around NPR 629 in Nepali against NPR 899 in English, and Hawking is NPR 248 against NPR 720.',
    metaDesc:
      'English or Nepali edition? How translations compare, which books are cheaper in Nepali, and how to check an edition before you order.',
    category: 'Buying guides',
    tags: ['translation', 'nepali', 'editions', 'buying guide'],
    body: `This is the most common question we are asked before an order, and the honest answer is shorter than people expect: read in the language you think in. Reading in a second language to improve it is a real strategy, but it is a study exercise, not the same as reading for pleasure, and confusing the two is why a lot of books get abandoned at page forty.

${PRICE_NOTE}

## Is the Nepali edition cheaper?

Usually, and sometimes dramatically. Translated editions are printed for a local market at local price points, while English editions are frequently imports.

- Ikigai: [Nepali](/books/ikigai-nepali) around NPR 629, against [English](/books/ikigai-the-japanese-secret-to-a-long-and-happy-life) at around NPR 899.
- A Brief History of Time: [Nepali](/books/samaya-ko-sanchipta-itihas-stephen-hawking-a-brief-history-of-time) around NPR 248, against [English](/books/a-brief-history-of-time) at around NPR 720.
- The Psychology of Money: [Nepali](/books/dhan-sampatti-ko-manobigyan-the-psychology-of-money) around NPR 432, against [English](/books/the-psychology-of-money) at around NPR 640.

For a non-fiction book whose value is its argument, the Nepali edition at two thirds of the price is straightforwardly the better buy if Nepali is your stronger language.

## When does the original language genuinely matter?

When the writing is the point. Non-fiction survives translation well, because the ideas carry. Literary fiction and poetry lose more, because rhythm, register and wordplay are what the translator has to rebuild.

The clearest example on our shelves runs the other way, from Nepali into English: Parijat's [Shirishko Phool](/books/shireeshko-phool), around NPR 270, is the Nepali original, and [Blue Mimosa](/books/blue-mimosa) at around NPR 266 is its English translation. Both are excellent. If you read Nepali comfortably, the original is the better experience, and it is the same price.

## Are translated editions abridged?

Licensed translations are not abridged — they are the complete book in another language. What you do need to watch for is a cheap "adapted" or "retold" edition, which is a different thing entirely. Check the page count against the original: if a 300-page book is being sold at 90 pages, it has been cut.

## What about Hindi editions?

They are common in this market and worth knowing about, because titles do not always announce themselves. [Harry Potter Aur Paras Patthar](/books/harry-potter-aur-paras-patthar), around NPR 720, is the Philosopher's Stone in Hindi, and [Sapiens Manav Jati ka Sankshipt Itihas](/books/sapiens-manav-jati-ka-sankshipt-itihas) at around NPR 1,008 is Sapiens in Hindi. Both are genuine licensed editions; they are simply not in English, and people do order them expecting English. See our [Harry Potter editions guide](/blog/harry-potter-books-nepal) for the full picture on that series.

## How do you check the language before ordering?

Every book's page lists a specifications block with language, format, publisher, page count and ISBN. That is the authoritative answer, and it takes five seconds to check. Two secondary signals help: a title in Devanagari is a local-language edition, and a romanised Hindi or Nepali title almost always is too.

## Should you read in English to improve your English?

If that is your actual goal, yes, but choose accordingly. Pick a book below your comfort level rather than at it, prefer contemporary prose over classics, and accept that you will read more slowly. Our [IELTS and English preparation guide](/blog/best-ielts-english-exam-books-nepal) covers the books built for that purpose, which will do more for your English than struggling through a novel.

## Frequently asked questions

**Do you stock Nepali translations of most bestsellers?**
Of some, not most. The Nepali translation market is selective. Search the title and check the specifications, or [ask us](/contact).

**Is the Nepali edition the same content?**
For licensed translations, yes — the complete text, translated.

${DELIVERY_FAQ}

Browse [Nepali literature](/genre/nepali-literature), or see [everything in stock](/books).`,
    bookSlugs: [
      'ikigai-nepali', 'ikigai-the-japanese-secret-to-a-long-and-happy-life',
      'samaya-ko-sanchipta-itihas-stephen-hawking-a-brief-history-of-time', 'a-brief-history-of-time',
      'dhan-sampatti-ko-manobigyan-the-psychology-of-money', 'the-psychology-of-money',
      'shireeshko-phool', 'blue-mimosa', 'harry-potter-aur-paras-patthar',
      'sapiens-manav-jati-ka-sankshipt-itihas',
    ],
  },

  // ── 8 ──────────────────────────────────────────────────────────────────
  {
    slug: 'best-books-to-gift-nepal',
    title: 'Best Books to Gift in Nepal, by Occasion',
    metaTitle: 'Best Books to Gift in Nepal, by Occasion (2026)',
    excerpt:
      'The safest book gift is a beautiful edition of something the person already loves, not a book you want them to read. For a child, a box set at around NPR 720 always lands. For an adult you barely know, poetry or a classic beats a bestseller.',
    metaDesc:
      'What book to give in Nepal for birthdays, weddings, Dashain, graduations and children — with real NPR prices and cash on delivery.',
    category: 'Buying guides',
    tags: ['gifts', 'nepal', 'buying guide', 'dashain'],
    body: `A book is the easiest thoughtful gift and the easiest thoughtless one, and the difference is usually a single decision: are you giving something the person will enjoy, or something you think they should read. The second is a lecture with a cover on it.

${PRICE_NOTE}

## What is the safest book to give someone you do not know well?

Something short, beautiful and hard to dislike. [Muna Madan](/books/muna-madan) at around NPR 108 is the most quietly perfect gift in this shop for a Nepali reader — everyone recognises it, few people own a copy. [Rumi: A New Translation](/books/rumi-a-new-translation) at around NPR 576 works across almost any belief and any age.

What to avoid: self-help, unless they asked. Giving someone a book about fixing their habits says something you probably did not mean.

## What should you gift a child?

A box set, every time. The volume is the gift, and a series creates the next six months of reading rather than one afternoon.

- [Bedtime Stories Box Set of 6](/books/bedtime-stories-box-set-of-6-books-collection-of-world-famous-fairy-tales) or [Moral Stories Box Set of 6](/books/moral-stories-box-set-of-6-books-collection-of-world-famous-fairy-tales), around NPR 720 each, for younger children.
- [My First Book of Gods and Goddesses, 12 board books](/books/my-first-book-of-gods-and-goddesses-box-set-set-of-12-books-illustrated-board-books-on-hindu-mythology-vaishno-devi-krishna-shiva-ganesha-hanuman-lakshmi), around NPR 864 — mythology in a form a two-year-old can handle, and a common Dashain gift.
- [The Roald Dahl combo: Matilda, Charlie and the Chocolate Factory and more](/books/combo-books-offer-matilda-charlie-and-the-chocolate-factory-james-and-the-giant-peach-the-little-prince), around NPR 1,872, for ages roughly 7 to 11.
- [Wonder](/books/wonder) by R.J. Palacio, around NPR 648, for a slightly older child — the one most likely to change how they treat someone.

Our [children's books by age guide](/blog/best-books-for-kids-nepal-by-age) has the full breakdown.

## What is a good graduation or new-job gift?

Something with weight that is not a lecture. [The Kite Runner](/books/the-kite-runner) by Khaled Hosseini at around NPR 864 is the most reliably loved novel on this shelf, and the [three-book Hosseini combo](/books/combo-books-offer-the-kite-runner-and-the-mountains-echoed-a-thousand-splendid-suns) at around NPR 2,448 is a proper occasion gift.

If they are heading into work or business, [The Richest Man in Babylon](/books/the-richest-man-in-babylon) at around NPR 288 is short, kind and genuinely useful — and it is advice-shaped without being a self-help book.

## What should you give a serious reader?

A box set they would not buy themselves.

- [The Hobbit and The Lord of the Rings box set](/books/the-hobbit-and-the-lord-of-the-rings-box-set), around NPR 3,024.
- [Heroes of Olympus Complete Collection](/books/heroes-of-olympus-complete-collection), around NPR 3,599, for a younger enthusiast.
- [Collection of Shakespeare's Greatest Stories](/books/collection-of-shakespeare-s-greatest-stories), around NPR 1,872.
- [Alice Oseman Four-Book Collection](/books/alice-oseman-four-book-collection-box-set-solitaire-radio-silence-i-was-born-for-this-loveless), around NPR 2,880, for a teenager.

## What works as a Dashain or Tihar gift?

Something for the whole house rather than one person. A children's box set covers the cousins; a Nepali novel covers the adults. Our [Dashain and Tihar reading guide](/blog/best-books-dashain-tihar-break) has specific picks, and mythology board books are the traditional safe answer for the youngest.

## How much should you spend?

Between NPR 300 and NPR 900 covers almost every occasion without looking either cheap or strange. Above NPR 2,000 you are giving a box set, which reads as a proper present. Below NPR 200 is fine for a small, well-chosen classic and awkward for anything else.

## Frequently asked questions

**Do you gift wrap?**
Not currently. Books are packed carefully for transit rather than for presentation.

**Can I send a book directly to someone else?**
Yes — enter their name, address and a working mobile number as the delivery address. Note that cash on delivery means the recipient would be asked to pay, so for a gift, arrange payment with them or have it delivered to yourself first.

${DELIVERY_FAQ}

Browse [everything in stock](/books), or start with [children's books](/category/kids).`,
    bookSlugs: [
      'muna-madan', 'rumi-a-new-translation',
      'bedtime-stories-box-set-of-6-books-collection-of-world-famous-fairy-tales',
      'moral-stories-box-set-of-6-books-collection-of-world-famous-fairy-tales',
      'my-first-book-of-gods-and-goddesses-box-set-set-of-12-books-illustrated-board-books-on-hindu-mythology-vaishno-devi-krishna-shiva-ganesha-hanuman-lakshmi',
      'combo-books-offer-matilda-charlie-and-the-chocolate-factory-james-and-the-giant-peach-the-little-prince',
      'wonder', 'the-kite-runner',
      'combo-books-offer-the-kite-runner-and-the-mountains-echoed-a-thousand-splendid-suns',
      'the-richest-man-in-babylon', 'the-hobbit-and-the-lord-of-the-rings-box-set',
      'heroes-of-olympus-complete-collection', 'collection-of-shakespeare-s-greatest-stories',
      'alice-oseman-four-book-collection-box-set-solitaire-radio-silence-i-was-born-for-this-loveless',
    ],
  },

  // ── 9 ──────────────────────────────────────────────────────────────────
  {
    slug: 'home-library-student-budget-nepal',
    title: 'How to Build a Home Library on a Student Budget in Nepal',
    metaTitle: 'Build a Home Library on a Student Budget in Nepal',
    excerpt:
      'A shelf of thirty real books is achievable on a student budget in Nepal for under NPR 9,000, spread across a year. The method is simple: buy out-of-copyright classics, buy short, and buy one book a month rather than five in a burst.',
    metaDesc:
      'How to build a home library in Nepal on a student budget: which books to buy first, what to skip, and a 12-month plan with real NPR prices.',
    category: 'Reading guides',
    tags: ['students', 'budget', 'home library', 'nepal'],
    body: `A personal library is built the way savings are: small amounts, regularly, over a long time. The students who end up with a real shelf are almost never the ones who spent a lot at once. They are the ones who bought one book a month for three years and never stopped.

${PRICE_NOTE}

## How much does a real home library actually cost?

Less than most people assume, because the best books for a first shelf are the cheapest ones. Out-of-copyright classics can be printed by anyone, so a complete Orwell or Kafka costs less than a plate of momo. Thirty such books, bought at roughly NPR 250 each over a year, is about NPR 7,500 — and that is a genuinely serious shelf.

Our guide to the [best books under NPR 500](/blog/best-books-under-500-nepal) covers the specific bargains; this one is about the method.

## Which books should you buy first?

The short, permanent ones. Ten books to anchor a shelf, all under NPR 350:

- [Animal Farm](/books/animal-farm) by George Orwell, around NPR 137
- [1984](/books/1984), around NPR 288
- [Notes From Underground](/books/notes-from-underground) by Dostoevsky, around NPR 180
- [Metamorphosis](/books/metamorphosis) by Kafka, around NPR 216
- [Meditations](/books/meditations) by Marcus Aurelius, around NPR 288
- [The Prince](/books/the-prince) by Machiavelli, around NPR 288
- [The Republic](/books/the-republic) by Plato, around NPR 324
- [The Communist Manifesto](/books/the-communist-manifesto), around NPR 180
- [Muna Madan](/books/muna-madan) by Devkota, around NPR 108
- [The Richest Man in Babylon](/books/the-richest-man-in-babylon), around NPR 288

That is ten books for roughly NPR 2,300, and there is not a weak one among them.

## What is the cheapest way to add useful non-fiction?

Reference and skills books earn their price by being used repeatedly rather than read once. [Word Power Made Easy](/books/word-power-made-easy) at around NPR 288 is the standout: it will do more for your writing and your exam results than anything else at this price. [The Power of Your Subconscious Mind](/books/the-power-of-your-subconscious-mind) at around NPR 359 and [As A Man Thinketh](/books/as-a-man-thinketh) at around NPR 252 are the short, durable end of the self-help shelf.

## Are combo offers good value?

Sometimes, and the test is simple: count only the books you actually wanted. A [six-title classic self-help combo](/books/combo-books-offer-how-to-stop-worrying-and-start-living-how-to-win-friends-and-influence-people-think-and-grow-rich-the-power-of-positive-thinking-the-power-of-your-subconscious-mind-the-richest-man-in-babylone) at around NPR 629 is excellent value if four of the six appeal, and poor value if one does. A combo that is cheap per book but full of titles you will not open is not a saving.

## What should a student not buy?

Three things, in order of how much money they waste:

1. **Hardbacks.** You are paying for binding, not words. The paperback is the same book.
2. **Books you have not finished the last one of.** An unread stack is the most common way a book budget disappears.
3. **The 900-page one, early.** Buy it when you have finished five short books, not as book two.

## What does a twelve-month plan look like?

One book a month, roughly NPR 300 each, is NPR 3,600 a year — about NPR 10 a day. A workable order: three short classics, then two non-fiction, then something Nepali, then a novel you actually want, and repeat. Alternate cheap and slightly more expensive so a NPR 800 book you badly want does not break the month.

## How do you make the books last?

Keep them out of direct sun and off the floor, especially through monsoon. Do not break the spine flat. And write your name in the front, because the fastest way to lose a home library is lending generously and remembering nothing.

## Frequently asked questions

**Is it cheaper to buy in a bundle?**
Only when you wanted every title in it. Otherwise buying singly is cheaper in practice.

**Are cheap classics abridged?**
Not usually, but check the page count. An 80-page Crime and Punishment is an abridgement, not a bargain. Our guide on [spotting a pirated book](/blog/how-to-spot-pirated-book-nepal) covers the other checks.

${DELIVERY_FAQ}

Browse [fiction](/genre/fiction) and [philosophy](/genre/philosophy), or see [everything in stock](/books).`,
    bookSlugs: [
      'animal-farm', '1984', 'notes-from-underground', 'metamorphosis', 'meditations',
      'the-prince', 'the-republic', 'the-communist-manifesto', 'muna-madan',
      'the-richest-man-in-babylon', 'word-power-made-easy', 'the-power-of-your-subconscious-mind',
      'as-a-man-thinketh',
      'combo-books-offer-how-to-stop-worrying-and-start-living-how-to-win-friends-and-influence-people-think-and-grow-rich-the-power-of-positive-thinking-the-power-of-your-subconscious-mind-the-richest-man-in-babylone',
    ],
  },

  // ── 10 ─────────────────────────────────────────────────────────────────
  {
    slug: 'best-books-dashain-tihar-break',
    title: 'Best Books to Read Over the Dashain and Tihar Break',
    metaTitle: 'Best Books to Read Over the Dashain & Tihar Break',
    excerpt:
      'The Dashain and Tihar break is the longest uninterrupted reading window most people in Nepal get all year. Use it on the long Nepali novel you keep postponing, something for the children who are also off school, and one book that is pure entertainment.',
    metaDesc:
      'What to read over the Dashain and Tihar holidays in Nepal: long Nepali novels, family reading and children’s books, with real NPR prices.',
    category: 'Reading guides',
    tags: ['dashain', 'tihar', 'festival', 'nepali literature', 'nepal'],
    body: `The festival break is the only stretch of the year when most households in Nepal have several unstructured days in a row. It is also the period when people most reliably plan to read and then do not, because the plan is usually one ambitious book and no thought about the other fourteen hours.

A break that actually includes reading tends to have three books in it: one long one you have been postponing, one for whoever else is in the house, and one you can read badly, in a hammock, half asleep.

${PRICE_NOTE}

Order in the week before the holidays. Courier services slow noticeably during the festival period, and dispatch across the country is affected — see [delivery outside the Valley](/blog/book-delivery-outside-kathmandu) for the usual timings.

## Which long Nepali novel should you finally read?

- [Seto Dharti](/books/seto-dharti) by Amar Nyaupane, around NPR 585. A young widow's life in a society that has no place for her. The most admired Nepali novel of the last fifteen years, and the one people most often say they mean to read.
- [Yogmaya](/books/yogmaya) by Neelam Karki Niharika, around NPR 716. The story of the reformer and poet who led a religious protest movement in eastern Nepal, and a Madan Puraskar winner.
- [Pagal Basti](/books/pagal-basti) by Sarubhakta, around NPR 540, a modern classic.
- [Himalpariko Huri](/books/himalpariko-huri) by Sudheer Sharma, around NPR 629, if you would rather read politics than fiction.

If you want something shorter and perfect instead, [Shirishko Phool](/books/shireeshko-phool) by Parijat at around NPR 270 can be finished in a single afternoon of the break.

## What if you want something lighter?

[Ijoriya](/books/ijoriya) by Subin Bhattarai, around NPR 673, or his earlier [Summer Love](/books/summer-love) at around NPR 338 and [Saya](/books/saya) at around NPR 315 — the books that got a whole generation of Nepali readers reading in Nepali.

[China Harayeko Manchhe](/books/china-harayeko-manchhe) by Hari Bansha Acharya at around NPR 405 is the memoir of a man the whole country already feels it knows, and it is warmer and sadder than people expect.

## What should the children read while they are off school?

Something they choose, and something with volume — a week is long. A [box set of bedtime stories](/books/bedtime-stories-box-set-of-6-books-collection-of-world-famous-fairy-tales) at around NPR 720, or the [Roald Dahl combo](/books/combo-books-offer-matilda-charlie-and-the-chocolate-factory-james-and-the-giant-peach-the-little-prince) at around NPR 1,872 for ages 7 to 11, will outlast the holiday. [Diary of a Wimpy Kid](/books/diary-of-a-wimpy-kid-hard-luck) at around NPR 576 is the reliable answer for a child who says they do not like reading.

For the youngest, [My First Book of Gods and Goddesses](/books/my-first-book-of-gods-and-goddesses-box-set-set-of-12-books-illustrated-board-books-on-hindu-mythology-vaishno-devi-krishna-shiva-ganesha-hanuman-lakshmi) at around NPR 864 fits the season and is a common Dashain gift. Our [children's books by age](/blog/best-books-for-kids-nepal-by-age) guide has more.

## What is worth reading purely for pleasure?

The break is the right time for a thriller you will finish in two sittings — [The Housemaid](/books/the-housemaid) at around NPR 792 or [Gone Girl](/books/gone-girl) at around NPR 720 — or for the one long fantasy you never have time for, like [The Hobbit and The Lord of the Rings box set](/books/the-hobbit-and-the-lord-of-the-rings-box-set) at around NPR 3,024.

## What should you read if the holidays are hard?

They are, for a lot of people: forced gatherings, absent family, questions about your life from relatives who see you once a year. [Ikigai in Nepali](/books/ikigai-nepali) at around NPR 629 is gentle, short and about finding a reason to get up. [Phoolko Aankhaama](/books/phoolko-aankhaama) by Ani Choying Drolma at around NPR 446 is a memoir of a difficult childhood and what came after it, and it is the better book.

## How do you actually get reading done during a festival?

Lower the target. One book across ten days is a realistic aim in a full house, not four. Read early, before the day starts making demands, or in the gap after lunch when everyone else is asleep. And keep the book physically in the room you sit in — a book upstairs is a book you will not open.

## Frequently asked questions

**Will orders arrive before the holidays?**
Order a week ahead to be safe. Delivery is typically 1 to 2 days in the Kathmandu Valley and 3 to 5 days elsewhere, and courier services slow during the festival period.

**Do you have Nepali-language books?**
Yes, a large shelf of them. Each book's page lists its language in the specifications.

${DELIVERY_FAQ}

Browse [Nepali literature](/genre/nepali-literature) and [children's books](/category/kids), or see [everything in stock](/books).`,
    bookSlugs: [
      'seto-dharti', 'yogmaya', 'pagal-basti', 'himalpariko-huri', 'shireeshko-phool',
      'ijoriya', 'summer-love', 'saya', 'china-harayeko-manchhe',
      'bedtime-stories-box-set-of-6-books-collection-of-world-famous-fairy-tales',
      'combo-books-offer-matilda-charlie-and-the-chocolate-factory-james-and-the-giant-peach-the-little-prince',
      'diary-of-a-wimpy-kid-hard-luck',
      'my-first-book-of-gods-and-goddesses-box-set-set-of-12-books-illustrated-board-books-on-hindu-mythology-vaishno-devi-krishna-shiva-ganesha-hanuman-lakshmi',
      'the-housemaid', 'gone-girl', 'the-hobbit-and-the-lord-of-the-rings-box-set',
      'ikigai-nepali', 'phoolko-aankhaama',
    ],
  },
];

(async function main() {
  await connectMongo();
  try {
    for (const a of ARTICLES) {
      // Only link books that genuinely exist and are live, so a guide never
      // recommends something a reader cannot buy.
      const books = a.bookSlugs.length
        ? await Book.find({ slug: { $in: a.bookSlugs }, isActive: true }).select('_id slug').lean()
        : [];
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
    logger.info({ count: ARTICLES.length }, 'Batch 4 articles seeded');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'seed-articles-batch4 failed');
  process.exit(1);
});
