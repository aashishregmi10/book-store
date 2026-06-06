'use strict';

const db = require('./db');
const { seed } = require('../src/seed');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');
const User = require('../src/models/user.model');
const Coupon = require('../src/models/coupon.model');

beforeAll(async () => {
  await db.connect();
  await Promise.all([Book.init(), Genre.init(), User.init(), Coupon.init()]);
});
afterAll(async () => db.closeDatabase());
afterEach(async () => db.clearDatabase());

describe('seed()', () => {
  it('populates genres, books, an admin, a customer, and a coupon — idempotently', async () => {
    const first = await seed();
    expect(first.genres).toBe(4);
    expect(first.books).toBe(8);
    expect(first.coupons).toBe(1);

    const admin = await User.findOne({ email: first.adminEmail }).select('+password');
    expect(admin.isAdmin).toBe(true);
    await expect(admin.comparePassword('admin123')).resolves.toBe(true);

    // Genre bookCount is populated.
    const selfHelp = await Genre.findOne({ slug: 'self-help' });
    expect(selfHelp.bookCount).toBe(3);

    // Re-running doesn't duplicate catalog or users.
    const second = await seed();
    expect(second.books).toBe(8);
    expect(await User.countDocuments()).toBe(2); // admin + demo customer, not doubled
  });
});
