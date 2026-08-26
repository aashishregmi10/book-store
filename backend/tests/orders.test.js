'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const Book = require('../src/models/book.model');
const Order = require('../src/models/order.model');
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
    expect(order.deliveryFee).toBe(0); // never priced by us — the courier bills separately
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

  // Guest checkout was removed: an order has to belong to an account so the
  // buyer can find it, earn points on it, and be emailed about it. The
  // storefront hides the checkout form from signed-out visitors, but this is
  // the check that actually holds - a request straight at the API is refused.
  it('refuses to place an order without a session', async () => {
    const res = await request(app).post('/api/orders').send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: ADDR });
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('NO_TOKEN');
  });

  // The delivery phone was validated as "any non-empty string". On a COD shop
  // the courier rings it to arrange handover, so a junk number is a parcel that
  // cannot be delivered and an order that cannot be salvaged.
  it.each([['1'], ['asdf'], ['98012345'], ['8801234567']])(
    'rejects an unusable delivery phone (%s)',
    async (badPhone) => {
      const { token } = await makeUser(`p${badPhone.replace(/\W/g, '')}@test.com`);
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: { ...ADDR, phone: badPhone } });

      expect(res.status).toBe(400);
      expect(res.body.errors.some((e) => e.field === 'deliveryAddress.phone')).toBe(true);
      // Nothing was reserved for an order that never became one.
      expect((await Book.findById(bookA.id)).stock).toBe(10);
    }
  );

  it.each([['9801234567'], ['+977 9841234567'], ['01-4123456']])(
    'accepts a real Nepali number (%s)',
    async (goodPhone) => {
      const { token } = await makeUser(`g${goodPhone.replace(/\W/g, '')}@test.com`);
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: { ...ADDR, phone: goodPhone } });

      expect(res.status).toBe(201);
    }
  );

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

  // Redemption is paused (POINTS_REDEMPTION_ENABLED in services/pricing.js) while
  // the launch discount runs. This test deliberately sends `pointsUsed` anyway:
  // the checkout UI hides the control, so the only thing standing between a
  // hand-made request and free margin is the server-side gate. That gate is what
  // is under test here — not arithmetic.
  //
  // When redemption is switched back on, this test SHOULD fail. Restore the
  // spending assertions then (pointsUsed 100, total 899-100, balance
  // 500-100+earned) rather than deleting it.
  it('refuses to spend points while redemption is paused; delivery is never charged by us', async () => {
    const { token, userId } = await makeUser();
    await User.updateOne({ _id: userId }, { points: 500 });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: ADDR, pointsUsed: 100 });

    expect(res.status).toBe(201);
    const { order } = res.body.data;
    expect(order.deliveryFee).toBe(0); // courier bills the customer directly, not us
    expect(order.pointsUsed).toBe(0);
    expect(order.total).toBe(899); // nothing came off the total
    const user = await User.findById(userId);
    // Earning stays on, so the balance still grows — the pause only stops
    // points being spent, it never confiscates what a customer has accrued.
    expect(user.points).toBe(500 + earned(899));
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

  // Same pause, from the referred friend's side. The invite advertises an NPR 50
  // credit, so this is the case where the pause is most visible to a customer:
  // the credit is banked and keeps its value, but cannot be spent yet.
  //
  // When redemption is switched back on, restore the spending assertions
  // (pointsUsed 50, total 899-50) rather than deleting this test.
  it('banks the friend\'s referral credit but will not spend it while redemption is paused', async () => {
    jest.spyOn(emailService, 'sendReferralBonus').mockResolvedValue(undefined);
    const ref = await User.create({ email: 'ref2@test.com', password: 'supersecret', fullName: 'Ref Errer' });
    const reg = await request(app).post('/api/auth/register').send({ email: 'friend2@test.com', password: 'supersecret', fullName: 'New Friend', referralCode: ref.referralCode });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`)
      .send({ items: [{ bookId: bookA.id, quantity: 1 }], deliveryAddress: ADDR, pointsUsed: 50 });

    expect(res.status).toBe(201);
    expect(res.body.data.order.pointsUsed).toBe(0);
    expect(res.body.data.order.total).toBe(899); // the credit did not come off

    // The 115 they signed up with is untouched, and the order still earns on top.
    const friend = await User.findOne({ email: 'friend2@test.com' });
    expect(friend.points).toBe(115 + earned(899));
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
    expect(order.total).toBe(899 - Math.floor(899 * 0.1));
    const coupon = await Coupon.findOne({ code: 'SAVE10' });
    expect(coupon.usageCount).toBe(1);
  });
});

// /orders/lookup serves orders placed before sign-in was required. Those carry
// no user, so every other read on this router rejects them - there is no
// session to match against. The API cannot mint one any more, so the fixture
// writes the row directly, which is exactly the shape those orders still have.
describe('POST /api/orders/lookup (guest tracking)', () => {
  const GUEST_ADDR = { ...ADDR, phone: '9801234567' };

  async function placeGuestOrder() {
    const order = await Order.create({
      isGuest: true,
      items: [{ book: bookA.id, title: bookA.title, author: bookA.author, price: bookA.price, quantity: 1 }],
      subtotal: bookA.price,
      deliveryFee: 0,
      total: bookA.price,
      deliveryAddress: GUEST_ADDR,
      paymentMethod: 'cod',
      status: 'placed',
    });
    return order.orderNumber;
  }

  it('returns the order for the right number + phone', async () => {
    const orderNumber = await placeGuestOrder();
    const res = await request(app).post('/api/orders/lookup').send({ orderNumber, phone: '9801234567' });

    expect(res.status).toBe(200);
    expect(res.body.data.orderNumber).toBe(orderNumber);
    expect(res.body.data.isGuest).toBe(true);
  });

  it('matches regardless of how the phone was typed', async () => {
    const orderNumber = await placeGuestOrder();
    for (const phone of ['+977 9801234567', '980-123-4567', '09801234567']) {
      const res = await request(app).post('/api/orders/lookup').send({ orderNumber, phone });
      expect(res.status).toBe(200);
    }
  });

  it('refuses the order number alone, and says nothing about which half was wrong', async () => {
    const orderNumber = await placeGuestOrder();

    const wrongPhone = await request(app).post('/api/orders/lookup').send({ orderNumber, phone: '9800000000' });
    const noSuchOrder = await request(app)
      .post('/api/orders/lookup')
      .send({ orderNumber: 'PT-20990101-99999', phone: '9801234567' });

    expect(wrongPhone.status).toBe(404);
    expect(noSuchOrder.status).toBe(404);
    // Identical responses: otherwise this endpoint tells an attacker which
    // sequential order numbers exist.
    expect(wrongPhone.body.message).toBe(noSuchOrder.body.message);
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

  // Regression: every cancel test above sends `{ reason }`, so nothing covered
  // the request the UI actually makes — a POST with no body at all. Express 5
  // leaves req.body undefined there (Express 4 gave an empty object), so
  // `req.body.reason` threw and cancelling always answered 500.
  it('cancels when the request carries no body, defaulting the reason', async () => {
    const { token } = await makeUser();
    const place = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ bookId: bookA.id, quantity: 2 }], deliveryAddress: ADDR });
    const { orderNumber } = place.body.data.order;

    const cancel = await request(app)
      .post(`/api/orders/${orderNumber}/cancel`)
      .set('Authorization', `Bearer ${token}`); // deliberately no .send()

    expect(cancel.status).toBe(200);
    expect(cancel.body.data.order.status).toBe('cancelled');
    expect(cancel.body.data.order.cancellationReason).toBe('Cancelled by customer');
    expect((await Book.findById(bookA.id)).stock).toBe(10); // restored
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

  // Regression: cancelling used to call restoreStock() without the variantId,
  // which credited the DERIVED top-level `stock` instead of the variant that
  // was actually sold. The book then read as having more copies than the
  // variants add up to — and stayed that way, since every later recompute
  // re-derives `stock` from the variants and silently discards the phantom.
  it('cancelling a variant order returns the copies to that same variant', async () => {
    const { token } = await makeUser();
    const hc = multi.variants.find((v) => v.format === 'Hardcover');
    const placed = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ bookId: multi.id, variantId: hc.id, quantity: 2 }], deliveryAddress: ADDR });
    expect(placed.status).toBe(201);

    const cancelled = await request(app)
      .post(`/api/orders/${placed.body.data.order.orderNumber}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancelled.status).toBe(200);

    const after = await Book.findById(multi.id);
    expect(after.variants.find((v) => v.format === 'Hardcover').stock).toBe(3); // fully restored
    expect(after.variants.find((v) => v.format === 'Paperback').stock).toBe(5); // never touched
    // The invariant that actually caught the bug: the total must equal the sum
    // of the variants, not the sum plus a stray credit.
    expect(after.stock).toBe(8);
    expect(after.stock).toBe(after.variants.reduce((n, v) => n + v.stock, 0));
    expect(after.soldCount).toBe(0);
  });
});
