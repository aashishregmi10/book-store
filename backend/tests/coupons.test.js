'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const User = require('../src/models/user.model');
const Book = require('../src/models/book.model');
const Coupon = require('../src/models/coupon.model');

const ADDR = { fullName: 'Bookworm Buyer', phone: '+9779800000000', address1: 'Thamel Marg', city: 'Kathmandu', province: 'Bagmati' };

let adminToken;
let book; // 1000, stock 10

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.data.accessToken;
}

async function makeUser(email = 'buyer@test.com') {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'supersecret', fullName: 'Bookworm Buyer' });
  return res.body.data.accessToken;
}

const LAUNCH = { code: 'launch10', type: 'percentage', value: 10, description: 'Launch promo' };

beforeAll(async () => {
  await db.connect();
  await Promise.all([User.init(), Book.init(), Coupon.init()]);
});
afterAll(async () => db.closeDatabase());

beforeEach(async () => {
  await User.create({ email: 'admin@test.com', password: 'supersecret', fullName: 'Admin', isAdmin: true });
  adminToken = await login('admin@test.com', 'supersecret');
  book = await Book.create({
    slug: 'c', title: 'Book C', author: 'Auth', genre: 'fiction', price: 1000, stock: 10,
    coverImage: { publicId: 'seed/c.jpg', secureUrl: 'c.jpg', name: '' }, description: 'Long enough description.',
  });
});
afterEach(async () => db.clearDatabase());

describe('Admin coupons CRUD', () => {
  it('creates, lists, reads, updates and deletes a coupon', async () => {
    const create = await request(app).post('/api/admin/coupons').set(auth(adminToken)).send(LAUNCH);
    expect(create.status).toBe(201);
    expect(create.body.data.code).toBe('LAUNCH10'); // normalised to uppercase
    const id = create.body.data._id;

    const list = await request(app).get('/api/admin/coupons').set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].usedBy).toBeUndefined(); // ledger stays out of the list

    const read = await request(app).get(`/api/admin/coupons/${id}`).set(auth(adminToken));
    expect(read.status).toBe(200);
    expect(read.body.data.value).toBe(10);

    const update = await request(app).put(`/api/admin/coupons/${id}`).set(auth(adminToken)).send({ ...LAUNCH, value: 15, isActive: false });
    expect(update.status).toBe(200);
    expect(update.body.data.value).toBe(15);
    expect(update.body.data.isActive).toBe(false);

    const del = await request(app).delete(`/api/admin/coupons/${id}`).set(auth(adminToken));
    expect(del.status).toBe(200);
    expect(await Coupon.countDocuments()).toBe(0);
  });

  it('rejects a percentage over 100 and a duplicate code', async () => {
    const tooBig = await request(app).post('/api/admin/coupons').set(auth(adminToken)).send({ code: 'HALFOFF', type: 'percentage', value: 150 });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.errors.map((e) => e.field)).toContain('value');

    await request(app).post('/api/admin/coupons').set(auth(adminToken)).send(LAUNCH);
    const dupe = await request(app).post('/api/admin/coupons').set(auth(adminToken)).send({ ...LAUNCH, description: 'again' });
    expect(dupe.status).toBe(409);
    expect(dupe.body.errors[0].code).toBe('DUPLICATE');
  });

  it('accepts blank optional number/date fields the way an empty form field sends them', async () => {
    const res = await request(app)
      .post('/api/admin/coupons')
      .set(auth(adminToken))
      .send({ ...LAUNCH, maxDiscount: '', usageLimit: '', startDate: '', endDate: '' });
    expect(res.status).toBe(201);
    expect(res.body.data.maxDiscount).toBeUndefined();
    expect(res.body.data.endDate).toBeUndefined();
  });

  it('never lets a form payload rewrite the redemption ledger', async () => {
    const create = await request(app).post('/api/admin/coupons').set(auth(adminToken)).send(LAUNCH);
    const id = create.body.data._id;
    await Coupon.updateOne({ _id: id }, { usageCount: 7 });

    const res = await request(app).put(`/api/admin/coupons/${id}`).set(auth(adminToken)).send({ ...LAUNCH, usageCount: 0, usedBy: [] });
    expect(res.status).toBe(200);
    expect((await Coupon.findById(id)).usageCount).toBe(7);
  });

  it('blocks non-admins', async () => {
    const userToken = await makeUser('nosy@test.com');
    expect((await request(app).get('/api/admin/coupons').set(auth(userToken))).status).toBe(403);
    expect((await request(app).get('/api/admin/coupons')).status).toBe(401);
  });
});

describe('Coupon redemption at checkout', () => {
  it('discounts the cart when the code matches and reports why when it does not', async () => {
    await request(app).post('/api/admin/coupons').set(auth(adminToken)).send(LAUNCH);

    const priced = await request(app).post('/api/cart/validate').send({ items: [{ bookId: book.id, quantity: 1 }], couponCode: 'launch10' });
    expect(priced.status).toBe(200);
    expect(priced.body.data.subtotal).toBe(1000);
    expect(priced.body.data.couponCode).toBe('LAUNCH10');
    expect(priced.body.data.couponDiscount).toBe(100);
    expect(priced.body.data.total).toBe(900); // 1000 subtotal - 100 discount; delivery is never priced by us

    const bogus = await request(app).post('/api/cart/validate').send({ items: [{ bookId: book.id, quantity: 1 }], couponCode: 'NOPE' });
    expect(bogus.body.data.couponDiscount).toBe(0);
    expect(bogus.body.data.couponError).toBe('Invalid coupon');
  });

  it('carries the discount onto the order and counts the redemption', async () => {
    await request(app).post('/api/admin/coupons').set(auth(adminToken)).send(LAUNCH);
    const token = await makeUser();

    const res = await request(app)
      .post('/api/orders')
      .set(auth(token))
      .send({ items: [{ bookId: book.id, quantity: 2 }], deliveryAddress: ADDR, couponCode: 'LAUNCH10' });

    expect(res.status).toBe(201);
    const { order } = res.body.data;
    expect(order.subtotal).toBe(2000);
    expect(order.couponCode).toBe('LAUNCH10');
    expect(order.couponDiscount).toBe(200);
    expect(order.total).toBe(1800); // 2000 subtotal - 200 coupon discount; no delivery fee

    const coupon = await Coupon.findOne({ code: 'LAUNCH10' });
    expect(coupon.usageCount).toBe(1);
  });

  it('refuses an inactive coupon', async () => {
    await request(app).post('/api/admin/coupons').set(auth(adminToken)).send({ ...LAUNCH, isActive: false });
    const priced = await request(app).post('/api/cart/validate').send({ items: [{ bookId: book.id, quantity: 1 }], couponCode: 'LAUNCH10' });
    expect(priced.body.data.couponDiscount).toBe(0);
    expect(priced.body.data.couponError).toBe('Invalid coupon');
  });

  it('enforces the minimum order amount', async () => {
    await request(app).post('/api/admin/coupons').set(auth(adminToken)).send({ ...LAUNCH, minOrderAmount: 5000 });
    const priced = await request(app).post('/api/cart/validate').send({ items: [{ bookId: book.id, quantity: 1 }], couponCode: 'LAUNCH10' });
    expect(priced.body.data.couponDiscount).toBe(0);
    expect(priced.body.data.couponError).toMatch(/Minimum order/);
  });

  it('honours the max-discount cap on a percentage coupon', async () => {
    await request(app).post('/api/admin/coupons').set(auth(adminToken)).send({ ...LAUNCH, value: 50, maxDiscount: 300 });
    const priced = await request(app).post('/api/cart/validate').send({ items: [{ bookId: book.id, quantity: 4 }], couponCode: 'LAUNCH10' });
    expect(priced.body.data.subtotal).toBe(4000);
    expect(priced.body.data.couponDiscount).toBe(300); // 50% would be 2000
  });
});
