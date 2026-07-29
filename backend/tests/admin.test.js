'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const User = require('../src/models/user.model');
const Book = require('../src/models/book.model');
const Order = require('../src/models/order.model');
const Review = require('../src/models/review.model');

let adminToken;
let userToken;
let normalUser;
let book;

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.data.accessToken;
}

beforeAll(async () => {
  await db.connect();
  await Promise.all([User.init(), Book.init(), Order.init(), Review.init()]);
});
afterAll(async () => db.closeDatabase());

beforeEach(async () => {
  await User.create({ email: 'admin@test.com', password: 'supersecret', fullName: 'Admin', isAdmin: true });
  adminToken = await login('admin@test.com', 'supersecret');
  const reg = await request(app).post('/api/auth/register').send({ email: 'user@test.com', password: 'supersecret', fullName: 'Normal User' });
  userToken = reg.body.data.accessToken;
  normalUser = await User.findOne({ email: 'user@test.com' });
  book = await Book.create({ slug: 'admin-book', title: 'Admin Book', author: 'A', genre: 'fiction', price: 500, stock: 10, coverImage: { publicId: 'seed/c.jpg', secureUrl: 'c.jpg', name: '' }, description: 'Long enough description.' });
});
afterEach(async () => db.clearDatabase());

const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Admin access control', () => {
  it('blocks non-admins (403 ADMIN_REQUIRED)', async () => {
    const res = await request(app).get('/api/admin/overview').set(auth(userToken));
    expect(res.status).toBe(403);
    expect(res.body.errors[0].code).toBe('ADMIN_REQUIRED');
  });
  it('blocks anonymous (401)', async () => {
    const res = await request(app).get('/api/admin/overview');
    expect(res.status).toBe(401);
  });
  it('allows admins', async () => {
    const res = await request(app).get('/api/admin/overview').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.kpis).toHaveProperty('books', 1);
  });
});

describe('Admin books CRUD', () => {
  it('creates, updates (recomputing stockStatus), and deletes a book', async () => {
    const create = await request(app).post('/api/admin/books').set(auth(adminToken)).send({
      title: 'Deep Work', author: 'Cal Newport', genre: 'Self Help', price: 750, stock: 4, coverImage: { publicId: 'seed/x.jpg', secureUrl: 'x.jpg', name: '' }, description: 'A book about focus and concentration.',
    });
    expect(create.status).toBe(201);
    expect(create.body.data.slug).toBe('deep-work');
    expect(create.body.data.genre).toBe('self-help'); // slugified

    const slug = create.body.data.slug;
    // 1 copy, not 2 — 2 is the shop's standing stock level and reads as
    // in-stock (LOW_STOCK_AT in book.model.js).
    const upd = await request(app).put(`/api/admin/books/${slug}`).set(auth(adminToken)).send({ stock: 1 });
    expect(upd.body.data.stockStatus).toBe('low-stock');

    const del = await request(app).delete(`/api/admin/books/${create.body.data._id}`).set(auth(adminToken));
    expect(del.status).toBe(200);
    expect(await Book.findOne({ slug })).toBeNull();
  });
});

describe('Admin orders', () => {
  async function makeOrder() {
    return Order.create({
      user: normalUser._id,
      items: [{ book: book._id, title: book.title, author: book.author, price: 500, quantity: 2 }],
      subtotal: 1000, total: 1000, pointsEarned: 50,
      deliveryAddress: { fullName: 'U', phone: '+977', address1: 'St', city: 'KTM', province: 'Bagmati' },
      status: 'placed',
    });
  }

  it('advances status and records history', async () => {
    const order = await makeOrder();
    const res = await request(app).put(`/api/admin/orders/${order._id}/status`).set(auth(adminToken)).send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('confirmed');
    expect(res.body.data.statusHistory.at(-1).status).toBe('confirmed');
  });

  it('cancels an order, restoring stock and reversing earned points', async () => {
    await Book.updateOne({ _id: book._id }, { stock: 8 }); // simulate the 2 sold
    const order = await makeOrder();
    const before = (await User.findById(normalUser._id)).points;

    const res = await request(app).put(`/api/admin/orders/${order._id}/cancel`).set(auth(adminToken)).send({ reason: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect((await Book.findById(book._id)).stock).toBe(10); // restored
    expect((await User.findById(normalUser._id)).points).toBe(before - 50); // earned reversed
  });
});

describe('Admin users', () => {
  it('bans and unbans a user but refuses to ban an admin', async () => {
    const ban = await request(app).put(`/api/admin/users/${normalUser._id}/ban`).set(auth(adminToken)).send({ reason: 'spam' });
    expect(ban.status).toBe(200);
    expect((await User.findById(normalUser._id)).isBanned).toBe(true);

    // banned user can no longer log in
    const blocked = await request(app).post('/api/auth/login').send({ email: 'user@test.com', password: 'supersecret' });
    expect(blocked.status).toBe(403);

    await request(app).put(`/api/admin/users/${normalUser._id}/unban`).set(auth(adminToken));
    expect((await User.findById(normalUser._id)).isBanned).toBe(false);

    const admin = await User.findOne({ email: 'admin@test.com' });
    const refuse = await request(app).put(`/api/admin/users/${admin._id}/ban`).set(auth(adminToken));
    expect(refuse.status).toBe(400);
  });
});

describe('Admin reviews', () => {
  it('approves a review and recalculates the book rating', async () => {
    const review = await Review.create({ book: book._id, user: normalUser._id, rating: 4, body: 'Good read overall.', isApproved: false });

    const list = await request(app).get('/api/admin/reviews?status=pending').set(auth(adminToken));
    expect(list.body.data).toHaveLength(1);

    const approve = await request(app).put(`/api/admin/reviews/${review._id}/approve`).set(auth(adminToken));
    expect(approve.status).toBe(200);
    const updated = await Book.findById(book._id);
    expect(updated.reviewCount).toBe(1);
    expect(updated.avgRating).toBe(4);
  });
});

describe('Admin analytics + export', () => {
  it('returns wishlist counts', async () => {
    await User.updateOne({ _id: normalUser._id }, { $addToSet: { wishlist: book._id } });
    const res = await request(app).get('/api/admin/analytics/wishlist-counts').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ count: 1 });
  });

  it('exports books as CSV', async () => {
    const res = await request(app).get('/api/admin/export/books').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/csv/);
    expect(res.text).toMatch(/title,author,isbn/);
    expect(res.text).toMatch(/Admin Book/);
  });
});
