'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');
const Review = require('../src/models/review.model');
const User = require('../src/models/user.model');

const book = (over) => ({
  slug: over.slug,
  title: over.title,
  author: over.author || 'Some Author',
  genre: over.genre,
  price: over.price,
  stock: over.stock ?? 10,
  coverImage: 'cover.jpg',
  description: 'A sufficiently long description for validation purposes.',
  ...over,
});

beforeAll(async () => {
  await db.connect();
  // Ensure text + unique indexes exist before $text queries run.
  await Promise.all([Book.init(), Genre.init(), Review.init(), User.init()]);
});
afterAll(async () => db.closeDatabase());

beforeEach(async () => {
  await Genre.create([
    { slug: 'self-help', name: 'Self Help', metaTitle: 'Best Self-Help Books in Nepal' },
    { slug: 'fiction', name: 'Fiction' },
  ]);
  await Book.create([
    book({ slug: 'atomic-habits', title: 'Atomic Habits', author: 'James Clear', genre: 'self-help', price: 899, soldCount: 100, isBestseller: true, isFeatured: true }),
    book({ slug: 'deep-work', title: 'Deep Work', author: 'Cal Newport', genre: 'self-help', price: 750, isNewArrival: true }),
    book({ slug: 'power-of-habit', title: 'The Power of Habit', author: 'Charles Duhigg', genre: 'self-help', price: 650 }),
    book({ slug: 'the-alchemist', title: 'The Alchemist', author: 'Paulo Coelho', genre: 'fiction', price: 500, isBestseller: true }),
  ]);
});
afterEach(async () => db.clearDatabase());

describe('GET /api/books', () => {
  it('lists active books with pagination metadata', async () => {
    const res = await request(app).get('/api/books');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(4);
    expect(res.body.data.items).toHaveLength(4);
    expect(res.body.data.items[0]).toHaveProperty('slug');
    expect(res.body.data.items[0].description).toBeUndefined(); // list projection excludes heavy fields
  });

  it('filters by genre', async () => {
    const res = await request(app).get('/api/books').query({ genre: 'self-help' });
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.items.every((b) => b.genre === 'self-help')).toBe(true);
  });

  it('filters by price range and sorts price-low', async () => {
    const res = await request(app).get('/api/books').query({ minPrice: 600, maxPrice: 800, sort: 'price-low' });
    const prices = res.body.data.items.map((b) => b.price);
    expect(prices).toEqual([650, 750]);
  });

  it('full-text searches title/author', async () => {
    const res = await request(app).get('/api/books').query({ search: 'habit' });
    const slugs = res.body.data.items.map((b) => b.slug).sort();
    expect(slugs).toEqual(['atomic-habits', 'power-of-habit']);
  });

  it('rejects an out-of-range limit (400)', async () => {
    const res = await request(app).get('/api/books').query({ limit: 999 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/books/:slug', () => {
  it('returns the book with same-silo related and approved reviews, and bumps viewCount', async () => {
    const target = await Book.findOne({ slug: 'atomic-habits' });
    const user = await User.create({ email: 'r@test.com', password: 'supersecret', fullName: 'Reviewer' });
    await Review.create({ book: target._id, user: user._id, rating: 5, body: 'Life-changing read.', isApproved: true });
    await Review.create({ book: target._id, user: (await User.create({ email: 's@test.com', password: 'supersecret', fullName: 'Hidden' }))._id, rating: 1, body: 'Pending review.', isApproved: false });

    const res = await request(app).get('/api/books/atomic-habits');
    expect(res.status).toBe(200);
    expect(res.body.data.book.slug).toBe('atomic-habits');
    expect(res.body.data.related.every((b) => b.genre === 'self-help' && b.slug !== 'atomic-habits')).toBe(true);
    expect(res.body.data.reviews).toHaveLength(1); // only approved
    expect(res.body.data.reviews[0].user.fullName).toBe('Reviewer');

    // viewCount increment is fire-and-forget; poll briefly.
    await new Promise((r) => setTimeout(r, 50));
    const after = await Book.findById(target._id);
    expect(after.viewCount).toBe(1);
  });

  it('404s for an unknown slug', async () => {
    const res = await request(app).get('/api/books/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('Auxiliary book endpoints', () => {
  it('search-suggestions returns books, genres, authors', async () => {
    const res = await request(app).get('/api/books/search-suggestions').query({ q: 'cal' });
    expect(res.status).toBe(200);
    expect(res.body.data.authors.map((a) => a.name)).toContain('Cal Newport');
  });

  it('filters/metadata returns genres and price range', async () => {
    const res = await request(app).get('/api/books/filters/metadata');
    expect(res.body.data.priceRange).toEqual({ min: 500, max: 899 });
    expect(res.body.data.genres.length).toBe(2);
  });

  it('featured/books returns the three rails', async () => {
    const res = await request(app).get('/api/books/featured/books');
    expect(res.body.data.featured.map((b) => b.slug)).toContain('atomic-habits');
    expect(res.body.data.bestsellers.length).toBe(2);
    expect(res.body.data.newArrivals.map((b) => b.slug)).toContain('deep-work');
  });
});

describe('Genres API', () => {
  it('lists genres', async () => {
    const res = await request(app).get('/api/genres');
    expect(res.body.data.map((g) => g.slug).sort()).toEqual(['fiction', 'self-help']);
  });

  it('returns a silo page with genre meta + its books', async () => {
    const res = await request(app).get('/api/genres/self-help');
    expect(res.status).toBe(200);
    expect(res.body.data.genre.metaTitle).toBe('Best Self-Help Books in Nepal');
    expect(res.body.data.total).toBe(3);
  });

  it('404s for an unknown genre', async () => {
    const res = await request(app).get('/api/genres/cooking');
    expect(res.status).toBe(404);
  });
});
