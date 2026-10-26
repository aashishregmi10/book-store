'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const User = require('../src/models/user.model');
const Book = require('../src/models/book.model');
const Setting = require('../src/models/setting.model');
const { shuffleBySeed } = require('../src/services/homepageRails');

let adminToken;
let userToken;

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const slugs = (list) => list.map((b) => b.slug);

function makeBook(i, flags) {
  return {
    slug: `book-${i}`, title: `Book ${i}`, author: 'Author', genre: 'fiction', price: 500, stock: 5,
    soldCount: 300 - i, coverImage: { publicId: 'c', secureUrl: 'c.jpg', name: '' },
    description: 'A sufficiently long description for validation purposes.', ...flags,
  };
}

beforeAll(async () => {
  await db.connect();
  await Promise.all([User.init(), Book.init(), Setting.init()]);
});
afterAll(async () => db.closeDatabase());

beforeEach(async () => {
  await User.create({ email: 'admin@test.com', password: 'supersecret', fullName: 'Rail Admin', isAdmin: true });
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'supersecret' })).body.data.accessToken;
  userToken = (await request(app).post('/api/auth/register').send({ email: 'u@test.com', password: 'supersecret', fullName: 'User' })).body.data.accessToken;
  // 25 bestsellers (more than the rail's 20), 8 new arrivals, 8 featured.
  await Book.create([
    ...Array.from({ length: 25 }, (_, i) => makeBook(i, { isBestseller: true })),
    ...Array.from({ length: 8 }, (_, i) => makeBook(100 + i, { isNewArrival: true })),
    ...Array.from({ length: 8 }, (_, i) => makeBook(200 + i, { isFeatured: true })),
  ]);
});
afterEach(async () => db.clearDatabase());

describe('Homepage rail shuffle — access', () => {
  it('requires a token and an admin', async () => {
    expect((await request(app).post('/api/admin/merchandising/shuffle')).status).toBe(401);
    expect((await request(app).post('/api/admin/merchandising/shuffle').set(auth(userToken))).status).toBe(403);
    expect((await request(app).get('/api/admin/merchandising').set(auth(userToken))).status).toBe(403);
  });
});

describe('Homepage rail shuffle — behaviour', () => {
  it('keeps the same order until someone shuffles', async () => {
    const a = await request(app).get('/api/admin/merchandising').set(auth(adminToken));
    const b = await request(app).get('/api/admin/merchandising').set(auth(adminToken));
    expect(a.status).toBe(200);
    expect(a.body.data.shuffledAt).toBeNull();
    expect(slugs(a.body.data.rails.bestsellers)).toEqual(slugs(b.body.data.rails.bestsellers));
  });

  it('re-rolls the order, records who shuffled, and the storefront serves the new order', async () => {
    const before = await request(app).get('/api/admin/merchandising').set(auth(adminToken));
    const res = await request(app).post('/api/admin/merchandising/shuffle').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.shuffledBy).toBe('Rail Admin');
    expect(new Date(res.body.data.shuffledAt).getTime()).toBeGreaterThan(Date.now() - 60000);

    const after = res.body.data.rails;
    // 25 flagged bestsellers, 20 slots: same pool, new order (a repeat of the
    // previous order is a ~1-in-10^18 event).
    expect(after.bestsellers).toHaveLength(20);
    expect(slugs(after.bestsellers)).not.toEqual(slugs(before.body.data.rails.bestsellers));
    expect(slugs(after.bestsellers).every((s) => /^book-\d+$/.test(s) && Number(s.split('-')[1]) < 25)).toBe(true);

    // The public homepage endpoint uses the same seed.
    const pub = await request(app).get('/api/books/featured/books');
    expect(slugs(pub.body.data.bestsellers)).toEqual(slugs(after.bestsellers));
    expect(slugs(pub.body.data.newArrivals)).toEqual(slugs(after.newArrivals));
    expect(slugs(pub.body.data.featured)).toEqual(slugs(after.featured));
  });

  it('still tops up a rail that has too few flagged books', async () => {
    await Book.updateMany({ isFeatured: true, slug: { $nin: ['book-200', 'book-201'] } }, { $set: { isFeatured: false } });
    const res = await request(app).post('/api/admin/merchandising/shuffle').set(auth(adminToken));
    const featured = slugs(res.body.data.rails.featured);
    expect(featured.slice(0, 2).sort()).toEqual(['book-200', 'book-201']); // curated first
    expect(featured.length).toBeGreaterThan(2); // then the fallback
  });
});

describe('shuffleBySeed', () => {
  const books = Array.from({ length: 12 }, (_, i) => ({ _id: `id${i}` }));
  it('is deterministic for a seed and differs between seeds', () => {
    expect(shuffleBySeed(books, 'a')).toEqual(shuffleBySeed(books, 'a'));
    expect(shuffleBySeed(books, 'a')).not.toEqual(shuffleBySeed(books, 'b'));
    expect(shuffleBySeed(books, 'a')).toHaveLength(12);
  });
});
