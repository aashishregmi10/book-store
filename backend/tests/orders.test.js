'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const Book = require('../src/models/book.model');
const User = require('../src/models/user.model');
const Coupon = require('../src/models/coupon.model');
const Activity = require('../src/models/activity.model');

const ADDR = { fullName: 'Bookworm Buyer', phone: '+9779800000000', address1: 'Thamel Marg', city: 'Kathmandu', province: 'Bagmati' };

let bookA; // 899, stock 10
let bookB; // 500, stock 1

async function makeUser(email = 'buyer@test.com') {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'supersecret', fullName: 'Bookworm Buyer' });
  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
}

beforeAll(async () => {
  await db.connect();
  await Promise.all([Book.init(), User.init(), Coupon.init()]);
});
afterAll(async () => db.closeDatabase());

beforeEach(async () => {
  bookA = await Book.create({ slug: 'a', title: 'Book A', author: 'Auth', genre: 'fiction', price: 899, stock: 10, coverImage: 'a.jpg', description: 'Long enough description.' });
  bookB = await Book.create({ slug: 'b', title: 'Book B', author: 'Auth', genre: 'fiction', price: 500, stock: 1, coverImage: 'b.jpg', description: 'Long enough description.' });
});
afterEach(async () => db.clearDatabase());

describe('POST /api/orders (COD)', () => {
  it('places a COD order: decrements stock, snapshots items, earns points, formats order number', async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ bookId: bookA.id, quantity: 2 }, { bookId: bookB.id, quantity: 1 }], deliveryAddress: ADDR });

    expect(res.status).toBe(201);
    const { order } = res.body.data;
    expect(order.orderNumber).toMatch(/^PT-\d{8}-\d{5}$/);
    expect(order.subtotal).toBe(2298);
    expect(order.deliveryFee).toBe(0); // free over NPR 2000
    expect(order.total).toBe(2298);
    expect(order.pointsEarned).toBe(Math.floor(2298 * 0.05));
    expect(order.paymentMethod).toBe('cod');

    const a = await Book.findById(bookA.id);
    const b = await Book.findById(bookB.id);
    expect(a.stock).toBe(8);
    expect(b.stock).toBe(0);
    expect(b.stockStatus).toBe('out-of-stock'); // recomputed atomically

    const user = await User.findById((await User.findOne({ email: 'buyer@test.com' }))._id);
    expect(user.points).toBe(65 + Math.floor(2298 * 0.05));

    const activities = await Activity.find({ type: 'purchase' });
    expect(activities).toHaveLength(2);
  });

  it('rejects a non-COD payment method (422 COD_ONLY)', async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: ADDR, paymentMethod: 'esewa' });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].code).toBe('COD_ONLY');
  });

  it('supports guest checkout (no auth, no points)', async () => {
    const res = await request(app).post('/api/orders').send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: ADDR });
    expect(res.status).toBe(201);
    expect(res.body.data.order.isGuest).toBe(true);
    expect(res.body.data.order.pointsEarned).toBe(0);
  });

  it('rejects when stock is insufficient (409)', async () => {
    const { token } = await makeUser();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ bookId: bookB.id, quantity: 5 }], deliveryAddress: ADDR });
    expect(res.status).toBe(409);
    expect(res.body.errors[0].code).toBe('INSUFFICIENT_STOCK');
    const b = await Book.findById(bookB.id);
    expect(b.stock).toBe(1); // untouched
  });

  it('redeems points and charges delivery under the free threshold', async () => {
    const { token, userId } = await makeUser();
    await User.updateOne({ _id: userId }, { points: 500 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: ADDR, pointsUsed: 100 });

    expect(res.status).toBe(201);
    const { order } = res.body.data;
    expect(order.deliveryFee).toBe(150); // 899 < 2000
    expect(order.pointsUsed).toBe(100);
    expect(order.total).toBe(899 + 150 - 100);
    const user = await User.findById(userId);
    expect(user.points).toBe(500 - 100 + Math.floor(899 * 0.05));
  });

  it('applies a percentage coupon', async () => {
    const { token } = await makeUser();
    await Coupon.create({ code: 'save10', type: 'percentage', value: 10, isActive: true });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: ADDR, couponCode: 'SAVE10' });

    expect(res.status).toBe(201);
    const { order } = res.body.data;
    expect(order.couponCode).toBe('SAVE10');
    expect(order.couponDiscount).toBe(Math.floor(899 * 0.1));
    expect(order.total).toBe(899 + 150 - Math.floor(899 * 0.1));
    const coupon = await Coupon.findOne({ code: 'SAVE10' });
    expect(coupon.usageCount).toBe(1);
  });
});

describe('Order lifecycle', () => {
  it('lists my orders and cancels one (restoring stock + points)', async () => {
    const { token, userId } = await makeUser();
    const place = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ bookId: bookA.id, quantity: 2 }], deliveryAddress: ADDR });
    const { orderNumber } = place.body.data.order;

    const list = await request(app).get('/api/orders/my-orders').set('Authorization', `Bearer ${token}`);
    expect(list.body.data).toHaveLength(1);

    const pointsAfterOrder = (await User.findById(userId)).points;

    const cancel = await request(app).post(`/api/orders/${orderNumber}/cancel`).set('Authorization', `Bearer ${token}`).send({ reason: 'changed mind' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.order.status).toBe('cancelled');

    const a = await Book.findById(bookA.id);
    expect(a.stock).toBe(10); // restored
    const user = await User.findById(userId);
    expect(user.points).toBe(pointsAfterOrder - (await earnedFor(orderNumber, place))); // earned reversed
  });
});

// helper: points earned recorded on the placed order
async function earnedFor(_orderNumber, placeRes) {
  return placeRes.body.data.order.pointsEarned;
}

describe('POST /api/cart/validate', () => {
  it('prices a cart and surfaces stock issues', async () => {
    const good = await request(app).post('/api/cart/validate').send({ items: [{ bookId: bookA.id, quantity: 2 }] });
    expect(good.body.data.subtotal).toBe(1798);
    expect(good.body.data.issues).toHaveLength(0);

    const bad = await request(app).post('/api/cart/validate').send({ items: [{ bookId: bookB.id, quantity: 9 }] });
    expect(bad.body.data.issues[0].code).toBe('INSUFFICIENT_STOCK');
  });
});
