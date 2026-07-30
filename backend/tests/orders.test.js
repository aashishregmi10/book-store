'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const Book = require('../src/models/book.model');
const User = require('../src/models/user.model');
const Coupon = require('../src/models/coupon.model');
const Activity = require('../src/models/activity.model');
// Read the rate rather than restating it — these assertions silently encoded
// 0.05 and would have kept passing against a changed rate only by coincidence.
const { POINTS_EARN_RATE } = require('../src/services/pricing');
const emailService = require('../src/utils/emailService');

const ADDR = { fullName: 'Bookworm Buyer', phone: '+9779800000000', address1: 'Thamel Marg', city: 'Kathmandu', province: 'Bagmati' };
const earned = (subtotal) => Math.floor(subtotal * POINTS_EARN_RATE);

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
  bookA = await Book.create({ slug: 'a', title: 'Book A', author: 'Auth', genre: 'fiction', price: 899, stock: 10, coverImage: { publicId: 'seed/a.jpg', secureUrl: 'a.jpg', name: '' }, description: 'Long enough description.' });
  bookB = await Book.create({ slug: 'b', title: 'Book B', author: 'Auth', genre: 'fiction', price: 500, stock: 1, coverImage: { publicId: 'seed/b.jpg', secureUrl: 'b.jpg', name: '' }, description: 'Long enough description.' });
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
    expect(order.deliveryFee).toBe(0); // free over NPR 1500
    expect(order.total).toBe(2298);
    expect(order.pointsEarned).toBe(earned(2298));
    expect(order.paymentMethod).toBe('cod');

    const a = await Book.findById(bookA.id);
    const b = await Book.findById(bookB.id);
    expect(a.stock).toBe(8);
    expect(b.stock).toBe(0);
    expect(b.stockStatus).toBe('out-of-stock'); // recomputed atomically

    const user = await User.findById((await User.findOne({ email: 'buyer@test.com' }))._id);
    expect(user.points).toBe(65 + earned(2298));

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
    expect(order.deliveryFee).toBe(120); // 899 < 1500
    expect(order.pointsUsed).toBe(100);
    expect(order.total).toBe(899 + 120 - 100);
    const user = await User.findById(userId);
    expect(user.points).toBe(500 - 100 + earned(899));
  });

  it('pays the referrer 100 points on the referred friend\'s first purchase, once only', async () => {
    const notify = jest.spyOn(emailService, 'sendReferralBonus').mockResolvedValue(undefined);
    const ref = await User.create({ email: 'ref@test.com', password: 'supersecret', fullName: 'Ref Errer' });
    const reg = await request(app).post('/api/auth/register').send({ email: 'friend@test.com', password: 'supersecret', fullName: 'New Friend', referralCode: ref.referralCode });
    const token = reg.body.data.accessToken;

    // The friend's NPR 50 welcome credit lands at signup, on top of the 65.
    expect((await User.findOne({ email: 'friend@test.com' })).points).toBe(115);

    // No payout yet at signup.
    expect((await User.findById(ref._id)).points).toBe(65);

    // First purchase → referrer gets +100, and is actually told about it.
    await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: ADDR });
    expect((await User.findById(ref._id)).points).toBe(165);
    expect((await User.findOne({ email: 'friend@test.com' })).referralRewarded).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toBe(100);

    // Second purchase → no further payout, and no second email.
    await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: ADDR });
    expect((await User.findById(ref._id)).points).toBe(165);
    expect(notify).toHaveBeenCalledTimes(1);
    notify.mockRestore();
  });

  it('lets the friend spend their referral credit on that first order', async () => {
    jest.spyOn(emailService, 'sendReferralBonus').mockResolvedValue(undefined);
    const ref = await User.create({ email: 'ref2@test.com', password: 'supersecret', fullName: 'Ref Errer' });
    const reg = await request(app).post('/api/auth/register').send({ email: 'friend2@test.com', password: 'supersecret', fullName: 'New Friend', referralCode: ref.referralCode });

    // 115 points on hand, but only the 50 promised by the referral is what the
    // invite advertises — spending them has to actually come off the total.
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`)
      .send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: ADDR, pointsUsed: 50 });

    expect(res.status).toBe(201);
    expect(res.body.data.order.pointsUsed).toBe(50);
    expect(res.body.data.order.total).toBe(899 + 120 - 50);
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
    expect(order.total).toBe(899 + 120 - Math.floor(899 * 0.1));
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

describe('Format variants', () => {
  let multi; // Hardcover 1200/stock 3, Paperback 800/stock 5
  beforeEach(async () => {
    multi = await Book.create({
      slug: 'multi', title: 'Multi Format', author: 'Auth', genre: 'fiction',
      coverImage: { publicId: 'seed/m.jpg', secureUrl: 'm.jpg', name: '' }, description: 'Long enough description.',
      variants: [
        { format: 'Hardcover', price: 1200, stock: 3 },
        { format: 'Paperback', price: 800, stock: 5 },
      ],
    });
  });

  it('derives top-level price (cheapest) and stock (summed) from variants', () => {
    expect(multi.price).toBe(800);
    expect(multi.stock).toBe(8);
  });

  it('cart/validate prices the chosen variant', async () => {
    const hc = multi.variants.find((v) => v.format === 'Hardcover');
    const res = await request(app).post('/api/cart/validate').send({ items: [{ bookId: multi.id, variantId: hc.id, quantity: 1 }] });
    expect(res.body.data.subtotal).toBe(1200);
    expect(res.body.data.issues).toHaveLength(0);
  });

  it('requires a format when the book has variants (FORMAT_REQUIRED)', async () => {
    const res = await request(app).post('/api/cart/validate').send({ items: [{ bookId: multi.id, quantity: 1 }] });
    expect(res.body.data.issues[0].code).toBe('FORMAT_REQUIRED');
  });

  it('orders a variant: decrements only that variant + snapshots its format', async () => {
    const { token } = await makeUser();
    const hc = multi.variants.find((v) => v.format === 'Hardcover');
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ bookId: multi.id, variantId: hc.id, quantity: 2 }], deliveryAddress: ADDR });

    expect(res.status).toBe(201);
    const { order } = res.body.data;
    expect(order.subtotal).toBe(2400);
    expect(order.items[0].format).toBe('Hardcover');

    const after = await Book.findById(multi.id);
    expect(after.variants.find((v) => v.format === 'Hardcover').stock).toBe(1); // 3 - 2
    expect(after.variants.find((v) => v.format === 'Paperback').stock).toBe(5); // untouched
    expect(after.stock).toBe(6); // summed
  });
});
