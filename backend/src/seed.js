'use strict';

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('./config/database');
const logger = require('./config/logger');
const User = require('./models/user.model');
const Genre = require('./models/genre.model');
const Book = require('./models/book.model');
const Coupon = require('./models/coupon.model');

const cover = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

const GENRES = [
  { slug: 'self-help', name: 'Self-Help', color: '#2D5A3D',
    description: 'PageTurn Nepal stocks the top-rated self-help and personal-development titles available across Nepal — from habit-building to deep focus — with NPR pricing and Kathmandu delivery in 1–2 days.',
    metaTitle: 'Best Self-Help Books in Nepal', metaDesc: 'Buy bestselling self-help books online in Nepal. Fast delivery, NPR prices, cash on delivery.' },
  { slug: 'fiction', name: 'Fiction', color: '#7A3B2E',
    description: 'A handpicked shelf of literary and contemporary fiction — modern classics and timeless novels — delivered anywhere in Nepal with cash on delivery.',
    metaTitle: 'Fiction Books & Novels in Nepal', metaDesc: 'Buy fiction novels online in Nepal. Modern classics and bestsellers with fast Kathmandu delivery.' },
  { slug: 'nepali-literature', name: 'Nepali Literature', color: '#8C6A2B',
    description: 'Celebrated works of Nepali literature — novels and prose by the country’s finest writers — available for delivery to all seven provinces.',
    metaTitle: 'Nepali Literature & Novels Online', metaDesc: 'Buy Nepali literature and novels online in Nepal. Works by leading Nepali authors, delivered nationwide.' },
  { slug: 'business', name: 'Business', color: '#2F4A5A',
    description: 'Sharp, practical business and economics reading — strategy, money, and big ideas — curated for Nepali readers and entrepreneurs.',
    metaTitle: 'Business Books in Nepal', metaDesc: 'Buy business and economics books online in Nepal. Strategy, finance and entrepreneurship titles.' },
];

const BOOKS = [
  { slug: 'atomic-habits', title: 'Atomic Habits', author: 'James Clear', isbn: '9781847941831', genre: 'self-help', price: 899, comparePrice: 1100, stock: 40, isBestseller: true, isFeatured: true, soldCount: 320, avgRating: 4.8, reviewCount: 0, specifications: { format: 'Paperback', pages: 320, publisher: 'Random House' } },
  { slug: 'deep-work', title: 'Deep Work', author: 'Cal Newport', isbn: '9780349411903', genre: 'self-help', price: 750, stock: 25, isNewArrival: true, soldCount: 120, avgRating: 4.6, specifications: { format: 'Paperback', pages: 304 } },
  { slug: 'the-power-of-habit', title: 'The Power of Habit', author: 'Charles Duhigg', isbn: '9781847946249', genre: 'self-help', price: 650, stock: 18, soldCount: 90, avgRating: 4.5, specifications: { format: 'Paperback', pages: 416 } },
  { slug: 'the-alchemist', title: 'The Alchemist', author: 'Paulo Coelho', isbn: '9780061122415', genre: 'fiction', price: 560, comparePrice: 700, stock: 50, isBestseller: true, isFeatured: true, soldCount: 410, avgRating: 4.7, specifications: { format: 'Paperback', pages: 197 } },
  { slug: '1984', title: '1984', author: 'George Orwell', isbn: '9780451524935', genre: 'fiction', price: 499, stock: 30, soldCount: 200, avgRating: 4.7, isNewArrival: true, specifications: { format: 'Paperback', pages: 328 } },
  { slug: 'sapiens', title: 'Sapiens: A Brief History of Humankind', author: 'Yuval Noah Harari', isbn: '9780099590088', genre: 'business', price: 1190, comparePrice: 1400, stock: 22, isBestseller: true, soldCount: 260, avgRating: 4.6, isStaffPick: true, staffPickNote: 'The one history book we recommend to everyone.', specifications: { format: 'Paperback', pages: 512 } },
  { slug: 'thinking-fast-and-slow', title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', isbn: '9780141033570', genre: 'business', price: 980, stock: 14, soldCount: 75, avgRating: 4.4, specifications: { format: 'Paperback', pages: 499 } },
  { slug: 'palpasa-cafe', title: 'Palpasa Café', author: 'Narayan Wagle', isbn: '9789937905258', genre: 'nepali-literature', price: 450, stock: 35, isFeatured: true, soldCount: 180, avgRating: 4.5, specifications: { format: 'Paperback', language: 'Nepali' } },
];

async function seed() {
  // Wipe catalog collections (idempotent dev seed); upsert users.
  await Promise.all([Book.deleteMany({}), Genre.deleteMany({}), Coupon.deleteMany({})]);

  await Genre.insertMany(GENRES.map((g) => ({ ...g, isActive: true })));
  await Book.create(
    BOOKS.map((b) => ({
      ...b,
      // Seed covers come from Open Library (no Cloudinary asset) — synthesise a
      // publicId so the required image subdocument validates.
      coverImage: { publicId: `seed/${b.isbn}`, secureUrl: cover(b.isbn), name: b.title },
      condition: 'new',
      description: `${b.title} by ${b.author}. ${GENRES.find((g) => g.slug === b.genre)?.name} — in stock now at PageTurn Nepal with cash-on-delivery across all seven provinces.`,
      isActive: true,
    }))
  );
  // Refresh each genre's bookCount.
  for (const g of GENRES) {
    await Genre.updateOne({ slug: g.slug }, { bookCount: await Book.countDocuments({ genre: g.slug, isActive: true }) });
  }

  // Admin (upsert by email; never delete users).
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@pageturn.com.np';
  const adminPass = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = new User({ email: adminEmail, password: adminPass, fullName: 'PageTurn Admin', isAdmin: true, isEmailVerified: true });
    await admin.save();
  } else {
    admin.isAdmin = true;
    await admin.save();
  }

  // Demo customer.
  if (!(await User.findOne({ email: 'reader@pageturn.com.np' }))) {
    await User.create({ email: 'reader@pageturn.com.np', password: 'reader123', fullName: 'Sita Reader', isEmailVerified: true });
  }

  // Welcome coupon.
  await Coupon.create({ code: 'WELCOME10', description: '10% off your first order', type: 'percentage', value: 10, minOrderAmount: 500, maxDiscount: 300, isActive: true, newUserOnly: true });

  return {
    genres: await Genre.countDocuments(),
    books: await Book.countDocuments(),
    coupons: await Coupon.countDocuments(),
    adminEmail,
  };
}

// Run directly: `npm run seed`
if (require.main === module) {
  (async () => {
    try {
      await connectMongo();
      const summary = await seed();
      logger.info(summary, 'Seed complete');
      logger.info('Admin login → email: %s  password: %s (change before production!)', summary.adminEmail, process.env.SEED_ADMIN_PASSWORD || 'admin123');
      await disconnectMongo();
      process.exit(0);
    } catch (err) {
      logger.error({ err: err.message }, 'Seed failed');
      process.exit(1);
    }
  })();
}

module.exports = { seed };
