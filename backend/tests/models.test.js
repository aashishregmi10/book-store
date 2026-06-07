'use strict';

const db = require('./db');
const User = require('../src/models/user.model');
const Book = require('../src/models/book.model');
const Order = require('../src/models/order.model');

beforeAll(async () => db.connect());
afterEach(async () => db.clearDatabase());
afterAll(async () => db.closeDatabase());

describe('User model', () => {
  it('hashes the password, auto-generates a referral code, and compares correctly', async () => {
    const user = await User.create({ email: 'A@Test.com', password: 'secret123', fullName: 'Ada Lovelace' });
    expect(user.password).not.toBe('secret123'); // hashed
    expect(user.email).toBe('a@test.com'); // lowercased
    expect(user.referralCode).toMatch(/^ADAL[A-Z0-9]{4}$/);
    expect(user.points).toBe(65);
    expect(user.tier).toBe('Bronze');
    await expect(user.comparePassword('secret123')).resolves.toBe(true);
    await expect(user.comparePassword('wrong')).resolves.toBe(false);
  });

  it('derives tier from points and strips secrets from JSON', async () => {
    const user = await User.create({ email: 'b@test.com', password: 'secret123', fullName: 'Grace Hopper', points: 1600 });
    expect(user.tier).toBe('Gold');
    const json = user.toJSON();
    expect(json.password).toBeUndefined();
    expect(json.resetPasswordToken).toBeUndefined();
  });

  it('rejects an invalid province on an address', async () => {
    await expect(
      User.create({
        email: 'c@test.com', password: 'secret123', fullName: 'Test',
        addresses: [{ fullName: 'T', phone: '+977', address1: 'X', city: 'KTM', province: 'Atlantis' }],
      })
    ).rejects.toThrow();
  });
});

describe('Book model', () => {
  const base = { title: 'Atomic Habits', author: 'James Clear', genre: 'self-help', price: 899, coverImage: { publicId: 'seed/x.jpg', secureUrl: 'x.jpg', name: '' }, description: 'A book about habits and systems.' };

  it.each([
    [0, 'out-of-stock'],
    [2, 'low-stock'],
    [50, 'in-stock'],
  ])('derives stockStatus for stock=%i → %s', async (stock, expected) => {
    const book = await Book.create({ ...base, slug: `b-${stock}`, isbn: `isbn-${stock}`, stock });
    expect(book.stockStatus).toBe(expected);
  });

  it('preserves a discontinued status regardless of stock', async () => {
    const book = await Book.create({ ...base, slug: 'disc', stock: 100, stockStatus: 'discontinued' });
    expect(book.stockStatus).toBe('discontinued');
  });

  it('keeps costPrice out of default queries (admin-only)', async () => {
    await Book.create({ ...base, slug: 'margin', stock: 5, costPrice: 400 });
    const fetched = await Book.findOne({ slug: 'margin' });
    expect(fetched.costPrice).toBeUndefined();
    const withCost = await Book.findOne({ slug: 'margin' }).select('+costPrice');
    expect(withCost.costPrice).toBe(400);
  });
});

describe('Order model', () => {
  const orderData = {
    items: [{ book: undefined, title: 'X', author: 'Y', price: 500, quantity: 2 }],
    subtotal: 1000, total: 1000,
    deliveryAddress: { fullName: 'A', phone: '+977', address1: 'St', city: 'KTM', province: 'Bagmati' },
  };

  it('auto-generates sequential PT-YYYYMMDD-XXXXX order numbers', async () => {
    const mongoose = require('mongoose');
    const bookId = new mongoose.Types.ObjectId();
    const o1 = await Order.create({ ...orderData, items: [{ ...orderData.items[0], book: bookId }] });
    const o2 = await Order.create({ ...orderData, items: [{ ...orderData.items[0], book: bookId }] });
    expect(o1.orderNumber).toMatch(/^PT-\d{8}-\d{5}$/);
    const seq1 = Number(o1.orderNumber.split('-')[2]);
    const seq2 = Number(o2.orderNumber.split('-')[2]);
    expect(seq2).toBe(seq1 + 1);
  });

  it('defaults to COD and pending payment', async () => {
    const mongoose = require('mongoose');
    const o = await Order.create({ ...orderData, items: [{ ...orderData.items[0], book: new mongoose.Types.ObjectId() }] });
    expect(o.paymentMethod).toBe('cod');
    expect(o.paymentStatus).toBe('pending');
    expect(o.status).toBe('placed');
  });
});
