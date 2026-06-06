'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const Book = require('../src/models/book.model');
const User = require('../src/models/user.model');
const Activity = require('../src/models/activity.model');

let token;
let book;

async function authHeader() {
  const res = await request(app).post('/api/auth/register').send({ email: 'acct@test.com', password: 'supersecret', fullName: 'Account Holder' });
  return res.body.data.accessToken;
}

beforeAll(async () => {
  await db.connect();
  await Promise.all([Book.init(), User.init()]);
});
afterAll(async () => db.closeDatabase());

beforeEach(async () => {
  token = await authHeader();
  book = await Book.create({ slug: 'wl', title: 'Wish Book', author: 'A', genre: 'fiction', price: 600, stock: 5, coverImage: 'c.jpg', description: 'Long enough description.' });
});
afterEach(async () => db.clearDatabase());

describe('Wishlist', () => {
  it('adds (idempotently), checks, lists, and removes — logging one Activity', async () => {
    const add1 = await request(app).post('/api/wishlist').set('Authorization', `Bearer ${token}`).send({ bookId: book.id, source: 'book_card' });
    expect(add1.status).toBe(200);
    const add2 = await request(app).post('/api/wishlist').set('Authorization', `Bearer ${token}`).send({ bookId: book.id });
    expect(add2.status).toBe(200);

    // Activity logging is fire-and-forget — poll until it lands (deterministic under parallel runs).
    let acts = [];
    for (let i = 0; i < 40 && acts.length < 1; i += 1) {
      acts = await Activity.find({ type: 'wishlist_add' });
      if (acts.length < 1) await new Promise((r) => setTimeout(r, 25));
    }
    expect(acts).toHaveLength(1); // $addToSet means second add is a no-op → no duplicate activity

    const check = await request(app).get(`/api/wishlist/check/${book.id}`).set('Authorization', `Bearer ${token}`);
    expect(check.body.data.isWishlisted).toBe(true);

    const list = await request(app).get('/api/wishlist').set('Authorization', `Bearer ${token}`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].slug).toBe('wl');

    await request(app).delete(`/api/wishlist/${book.id}`).set('Authorization', `Bearer ${token}`);
    const after = await request(app).get(`/api/wishlist/check/${book.id}`).set('Authorization', `Bearer ${token}`);
    expect(after.body.data.isWishlisted).toBe(false);
  });

  it('returns isWishlisted:false for guests', async () => {
    const res = await request(app).get(`/api/wishlist/check/${book.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isWishlisted).toBe(false);
  });
});

describe('Addresses', () => {
  const A = { fullName: 'A One', phone: '+9779800000001', address1: 'Lalitpur', city: 'Lalitpur', province: 'Bagmati' };
  const B = { fullName: 'B Two', phone: '+9779800000002', address1: 'Pokhara', city: 'Pokhara', province: 'Gandaki' };

  it('makes the first address default, honours isDefault on the second, supports CRUD + promotion', async () => {
    const first = await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send(A);
    expect(first.status).toBe(201);
    expect(first.body.data[0].isDefault).toBe(true);

    const second = await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send({ ...B, isDefault: true });
    const addrs = second.body.data;
    expect(addrs).toHaveLength(2);
    const defaults = addrs.filter((a) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].fullName).toBe('B Two');

    // Update the first one
    const firstId = addrs.find((a) => a.fullName === 'A One')._id;
    const upd = await request(app).put(`/api/addresses/${firstId}`).set('Authorization', `Bearer ${token}`).send({ city: 'Bhaktapur' });
    expect(upd.body.data.find((a) => a._id === firstId).city).toBe('Bhaktapur');

    // Reject an invalid province
    const bad = await request(app).post('/api/addresses').set('Authorization', `Bearer ${token}`).send({ ...A, province: 'Atlantis' });
    expect(bad.status).toBe(400);

    // Delete the default (B Two) → promotes the remaining one
    const bId = addrs.find((a) => a.fullName === 'B Two')._id;
    const del = await request(app).delete(`/api/addresses/${bId}`).set('Authorization', `Bearer ${token}`);
    expect(del.body.data).toHaveLength(1);
    expect(del.body.data[0].isDefault).toBe(true);
  });

  it('requires auth', async () => {
    const res = await request(app).get('/api/addresses');
    expect(res.status).toBe(401);
  });
});
