'use strict';

const db = require('./db');
const { seed, seedAdmin } = require('../src/seed');
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
    await expect(admin.comparePassword(process.env.SEED_ADMIN_PASSWORD)).resolves.toBe(true);

    // Genre bookCount is populated.
    const selfHelp = await Genre.findOne({ slug: 'self-help' });
    expect(selfHelp.bookCount).toBe(3);

    // Re-running doesn't duplicate catalog or users.
    const second = await seed();
    expect(second.books).toBe(8);
    expect(await User.countDocuments()).toBe(2); // admin + demo customer, not doubled
  });

  // The seed opens by deleting every book, genre and coupon. The only thing
  // standing between `npm run seed` and a wiped production catalogue used to be
  // the operator remembering which database .env pointed at.
  it('refuses to wipe a populated catalogue without an explicit override', async () => {
    await Book.create(
      Array.from({ length: 20 }, (_, i) => ({
        slug: `filler-${i}`,
        title: `Filler ${i}`,
        author: 'A',
        genre: 'fiction',
        price: 100,
        stock: 1,
        coverImage: { publicId: 'p', secureUrl: 's', name: '' },
        description: 'Long enough description.',
      }))
    );

    await expect(seed()).rejects.toThrow(/Refusing to seed/);
    expect(await Book.countDocuments()).toBe(20); // nothing deleted

    // The override is the documented escape hatch.
    process.env.SEED_ALLOW_WIPE = 'true';
    try {
      const summary = await seed();
      expect(summary.books).toBe(8);
    } finally {
      delete process.env.SEED_ALLOW_WIPE;
    }
  });
});

describe('seedAdmin()', () => {
  it('creates the admin, then updates the password on a re-run', async () => {
    const first = await seedAdmin();
    expect(first.created).toBe(true);

    // Regression: the old code only re-flipped isAdmin on an existing user, so
    // changing SEED_ADMIN_PASSWORD and re-seeding silently did nothing.
    process.env.SEED_ADMIN_PASSWORD = 'a-different-password';
    const second = await seedAdmin();
    expect(second.created).toBe(false);

    const admin = await User.findOne({ email: first.adminEmail }).select('+password');
    await expect(admin.comparePassword('a-different-password')).resolves.toBe(true);
    expect(admin.isAdmin).toBe(true);
  });

  it('touches nothing but the one user, and refuses without credentials', async () => {
    await Book.create({
      slug: 'keep-me', title: 'Keep Me', author: 'A', genre: 'fiction', price: 100, stock: 1,
      coverImage: { publicId: 'p', secureUrl: 's', name: '' }, description: 'Long enough description.',
    });

    await seedAdmin();
    expect(await Book.countDocuments()).toBe(1); // catalogue untouched

    const email = process.env.SEED_ADMIN_EMAIL;
    delete process.env.SEED_ADMIN_EMAIL;
    try {
      await expect(seedAdmin()).rejects.toThrow(/SEED_ADMIN_EMAIL/);
    } finally {
      process.env.SEED_ADMIN_EMAIL = email;
    }
  });
});
