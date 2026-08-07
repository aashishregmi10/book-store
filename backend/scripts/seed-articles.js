'use strict';

/*
 * Seed/refresh 5 SEO-rich "Reading guides & articles" for the blog.
 * Idempotent: upserts by slug, preserves the original publishedAt.
 *
 *   node scripts/seed-articles.js
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Article = require('../src/models/article.model');

const readingTime = (body) => Math.max(1, Math.round(String(body).split(/\s+/).filter(Boolean).length / 200));

const ARTICLES = [
  {
    slug: 'best-loksewa-preparation-books-nepal',
    title: 'Best Loksewa Preparation Books in Nepal (2026 Guide)',
    category: 'Reading guides',
    tags: ['loksewa', 'exam preparation', 'nepal'],
    metaTitle: 'Best Loksewa Preparation Books in Nepal (2026)',
    metaDesc: 'A practical 2026 guide to the best Loksewa (Public Service Commission) preparation books in Nepal: syllabus coverage, model sets, and COD delivery.',
    excerpt: 'The Loksewa books that actually move the needle: current syllabus titles, model question sets, and how to build a study stack that works.',
    body: `Preparing for the Nepal Public Service Commission (Loksewa) exam is mostly about two things: covering the official syllabus and practising with real question patterns. The right books make both far easier. This guide lists the categories of Loksewa preparation books worth buying in 2026 and how to combine them.

## Start with the syllabus, not a random guidebook
Before buying anything, download the current PSC syllabus for your post (Kharidar, Nayab Subba, Section Officer, etc.). Then pick a **core guidebook** that maps to that syllabus chapter by chapter. A single, up-to-date guide beats three outdated ones.

## Build a three-layer study stack
1. **A core syllabus guide**, for concepts and theory.
2. **Model question sets & past papers**, to learn the exam's question style and time pressure.
3. **General knowledge / IQ / current affairs**, updated for the latest year.

Browse the full range in our [Loksewa section](/category/loksewa), and pair it with general references from the [catalogue](/books).

## Practice like it's exam day
Don't just read: solve full model sets under a timer. Most candidates lose marks to time management, not knowledge. Keep a notebook of every question you get wrong and revisit it weekly.

## Buying tips for Nepal
- Prices are in **NPR**, and we deliver across all seven provinces with **cash on delivery**: pay when your books arrive.
- Buy the **latest edition**; syllabus and current-affairs content change yearly.
- Order early in your prep cycle so you're not waiting on delivery during crunch time.

Ready to start? Explore [Loksewa preparation books](/category/loksewa) and add the core guide + a model-set book to begin.`,
  },
  {
    slug: 'essential-nepali-literature-books',
    title: '10 Essential Nepali Literature Books Every Reader Should Own',
    category: 'Reading guides',
    tags: ['nepali literature', 'fiction', 'nepal'],
    metaTitle: '10 Essential Nepali Literature Books to Own',
    metaDesc: 'From Muna Madan to modern Nepali novels: a reader’s starter shelf of essential Nepali literature, with NPR pricing and delivery across Nepal.',
    excerpt: 'A starter shelf of Nepali literature: the classics and modern voices worth reading first, and where they fit in your collection.',
    body: `Nepali literature is rich, varied, and deeply tied to the country's history and landscape. Whether you're rediscovering your roots or reading translated editions, this is a great place to begin a Nepali literature collection.

## Why start with Nepali literature?
Reading in or about your own culture hits differently: the places, names, and struggles feel close. It's also a wonderful way for students and young professionals to reconnect with the language beyond textbooks.

## What belongs on a starter shelf
A balanced Nepali literature shelf mixes:
- **Classic poetry and epics** that shaped the language.
- **Modern novels** capturing contemporary Nepali life.
- **Short-story collections** for shorter reading sessions.

You'll find a curated selection in our [Nepali literature](/genre/nepali-literature) collection.

## Reading Nepali classics today
Many classics are available in clean modern editions and, increasingly, in translation. If you find the older language dense, start with a contemporary novel and work backwards toward the classics.

## Build the habit
Keep one Nepali title in your current rotation at all times. Alternating between Nepali and English reading keeps both muscles strong.

## Order across Nepal
Everything is priced in **NPR** with **cash on delivery** nationwide, same-day inside the Kathmandu Valley and 3–5 days elsewhere. Browse the [Nepali literature](/genre/nepali-literature) shelf and start your collection today.`,
  },
  {
    slug: 'buy-books-online-nepal-cod-guide',
    title: 'How to Buy Books Online in Nepal with Cash on Delivery',
    category: 'Buying guides',
    tags: ['cash on delivery', 'buying guide', 'nepal'],
    metaTitle: 'Buy Books Online in Nepal (Cash on Delivery)',
    metaDesc: 'A simple guide to buying books online in Nepal with cash on delivery: delivery times, charges, and tips for a smooth order across all 7 provinces.',
    excerpt: 'Everything you need to order books online in Nepal: COD, delivery times, charges, and how to get the right edition the first time.',
    body: `Buying books online in Nepal has never been easier. With cash on delivery, you don't need a card or digital wallet. You simply pay when your order arrives. Here's how to do it smoothly.

## Why cash on delivery works for Nepal
COD removes the biggest barrier to online shopping: trust. You only pay once the book is in your hands. It's available across all seven provinces, so readers outside Kathmandu can shop with the same confidence.

## Delivery times and charges
- **Kathmandu Valley:** typically 1–2 days, often same-day.
- **Rest of Nepal:** usually 3–5 business days.
- **Free delivery** on orders over **NPR 1,500**; below that, a small flat fee applies.

## Get the right book the first time
- Check the **author and edition**, especially for textbooks and exam guides where editions change yearly.
- Use the **ISBN** when you know it; searching by ISBN finds the exact edition.
- Read the **specifications** (pages, language, format) on each product page.

Start at the [catalogue](/books), filter by genre or language, and use the search bar to look up a title, author, or ISBN.

## A smooth order, every time
- Add everything to your cart first to cross the free-delivery threshold.
- Double-check your **phone number and address** at checkout so delivery isn't delayed.
- Every order is **carefully packed and shipped safely**: if anything arrives damaged, contact us and we'll make it right.

Ready to order? Head to the [catalogue](/books) and fill your cart.`,
  },
  {
    slug: 'best-self-help-books-nepal',
    title: 'Best Self-Help Books to Start Reading in Nepal',
    category: 'Reading guides',
    tags: ['self-help', 'personal development', 'nepal'],
    metaTitle: 'Best Self-Help Books to Start Reading in Nepal',
    metaDesc: 'A beginner-friendly list of the best self-help and personal development books to start with in Nepal, with NPR pricing and cash on delivery.',
    excerpt: 'New to self-help? Start with these accessible, genuinely useful titles, and a simple plan to actually finish them.',
    body: `Self-help is one of the most popular reading categories for young professionals and students in Nepal, and for good reason. The right book at the right time can reshape how you work, save, and think. Here's how to start without getting overwhelmed.

## Start with one habit, one book
The mistake most readers make is buying ten self-help books at once and finishing none. Pick **one** book aligned with a goal you care about right now (focus, money, confidence, or habits) and read it to the end before buying the next.

## Categories worth exploring
- **Habits & productivity**, for building routines that stick.
- **Money & mindset**, practical personal-finance thinking.
- **Focus & calm**, for managing distraction and stress.

Browse the full range in our [self-help](/genre/self-help) collection.

## Read actively
Self-help only works if you apply it. Keep a pen handy, underline one actionable idea per chapter, and try it for a week before moving on. A book you act on beats ten you merely finish.

## Affordable and delivered
All titles are in **NPR** with **cash on delivery** across Nepal. Browse [self-help books](/genre/self-help), pick one goal, and start this week.`,
  },
  {
    slug: 'daily-reading-habit-guide',
    title: 'Building a Daily Reading Habit: A Beginner’s Guide',
    category: 'Reading guides',
    tags: ['reading habit', 'beginners', 'productivity'],
    metaTitle: 'Building a Daily Reading Habit: A Beginner’s Guide',
    metaDesc: 'A simple, realistic guide to building a daily reading habit: how to choose books, find time, and stay consistent, even with a busy schedule.',
    excerpt: 'Want to read more but never find the time? This realistic, no-pressure guide helps you build a daily reading habit that lasts.',
    body: `Almost everyone wants to read more, and almost everyone struggles to start. The good news: a daily reading habit is built from tiny, repeatable steps, not heroic willpower. Here's a realistic plan.

## Start absurdly small
Commit to **10 pages a day** (or even 10 minutes). It feels too easy: that's the point. A habit you never skip beats an ambitious one you abandon in a week.

## Anchor reading to something you already do
Attach reading to an existing routine: with your morning tea, on your commute, or right before sleep. The anchor removes the daily "should I read now?" decision.

## Choose books you'll actually enjoy
Don't start with the hardest classic on your list. Pick something gripping: a novel, a page-turning biography, or an accessible self-help book. Momentum matters more than prestige. Browse the [catalogue](/books) or the [fiction](/genre/fiction) shelf for something fun.

## Keep the next book ready
Finishing a book and having nothing lined up kills momentum. Keep your **next read** on the shelf before you finish the current one. Building a small to-read pile is one of the best things you can do for the habit.

## Track it lightly
Mark an X on a calendar for each day you read. The growing chain becomes its own motivation, and missing one day is fine; just don't miss two.

## Start today
Pick one book, set a 10-page goal, and begin tonight. Browse the [catalogue](/books) and grab your first read, delivered across Nepal with cash on delivery.`,
  },
];

(async function main() {
  await connectMongo();
  try {
    for (const a of ARTICLES) {
      await Article.updateOne(
        { slug: a.slug },
        {
          $set: {
            title: a.title,
            excerpt: a.excerpt,
            body: a.body,
            category: a.category,
            tags: a.tags,
            metaTitle: a.metaTitle,
            metaDesc: a.metaDesc,
            status: 'published',
            readingTime: readingTime(a.body),
          },
          $setOnInsert: { slug: a.slug, publishedAt: new Date() },
        },
        { upsert: true }
      );
      logger.info({ slug: a.slug }, 'seeded article');
    }
    logger.info({ count: ARTICLES.length }, 'Articles seeded/updated (published)');
  } finally {
    await disconnectMongo();
  }
  process.exit(0);
})().catch((err) => {
  logger.error({ err: err.message }, 'seed-articles failed');
  process.exit(1);
});
