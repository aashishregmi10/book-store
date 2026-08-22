"use strict";

require("dotenv").config({ quiet: true });

const { connectMongo, disconnectMongo } = require("./config/database");
const logger = require("./config/logger");
const User = require("./models/user.model");
const Genre = require("./models/genre.model");
const Book = require("./models/book.model");
const Coupon = require("./models/coupon.model");

const cover = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

const GENRES = [
  {
    slug: "self-help",
    name: "Self-Help",
    color: "#1D76BC",
    description:
      "Books Temple Nepal stocks the top-rated self-help and personal-development titles available across Nepal, from habit-building to deep focus, with NPR pricing and Kathmandu delivery in 1–2 days.",
    metaTitle: "Best Self-Help Books in Nepal",
    metaDesc:
      "Buy bestselling self-help books online in Nepal. Fast delivery, NPR prices, cash on delivery.",
  },
  {
    slug: "fiction",
    name: "Fiction",
    color: "#7A3B2E",
    description:
      "A handpicked shelf of literary and contemporary fiction, modern classics and timeless novels, delivered anywhere in Nepal with cash on delivery.",
    metaTitle: "Fiction Books & Novels in Nepal",
    metaDesc:
      "Buy fiction novels online in Nepal. Modern classics and bestsellers with fast Kathmandu delivery.",
  },
  {
    slug: "nepali-literature",
    name: "Nepali Literature",
    color: "#8C6A2B",
    description:
      "Celebrated works of Nepali literature, novels and prose by the country’s finest writers, available for delivery to all seven provinces.",
    metaTitle: "Nepali Literature & Novels Online",
    metaDesc:
      "Buy Nepali literature and novels online in Nepal. Works by leading Nepali authors, delivered nationwide.",
  },
  {
    slug: "business-economics",
    name: "Business & Economics",
    color: "#2F4A5A",
    description:
      "Sharp, practical business and economics reading: strategy, money, and big ideas, curated for Nepali readers and entrepreneurs.",
    metaTitle: "Business & Economics Books in Nepal",
    metaDesc:
      "Buy business and economics books online in Nepal. Strategy, finance and entrepreneurship titles.",
  },
];

const BOOKS = [
  {
    slug: "atomic-habits",
    title: "Atomic Habits",
    author: "James Clear",
    isbn: "9781847941831",
    genre: "self-help",
    price: 899,
    comparePrice: 1100,
    stock: 40,
    isBestseller: true,
    isFeatured: true,
    soldCount: 320,
    avgRating: 4.8,
    reviewCount: 0,
    specifications: {
      format: "Paperback",
      pages: 320,
      publisher: "Random House",
    },
  },
  {
    slug: "deep-work",
    title: "Deep Work",
    author: "Cal Newport",
    isbn: "9780349411903",
    genre: "self-help",
    price: 750,
    stock: 25,
    isNewArrival: true,
    soldCount: 120,
    avgRating: 4.6,
    specifications: { format: "Paperback", pages: 304 },
  },
  {
    slug: "the-power-of-habit",
    title: "The Power of Habit",
    author: "Charles Duhigg",
    isbn: "9781847946249",
    genre: "self-help",
    price: 650,
    stock: 18,
    soldCount: 90,
    avgRating: 4.5,
    specifications: { format: "Paperback", pages: 416 },
  },
  {
    slug: "the-alchemist",
    title: "The Alchemist",
    author: "Paulo Coelho",
    isbn: "9780061122415",
    genre: "fiction",
    price: 560,
    comparePrice: 700,
    stock: 50,
    isBestseller: true,
    isFeatured: true,
    soldCount: 410,
    avgRating: 4.7,
    specifications: { format: "Paperback", pages: 197 },
  },
  {
    slug: "1984",
    title: "1984",
    author: "George Orwell",
    isbn: "9780451524935",
    genre: "fiction",
    price: 499,
    stock: 30,
    soldCount: 200,
    avgRating: 4.7,
    isNewArrival: true,
    specifications: { format: "Paperback", pages: 328 },
  },
  {
    slug: "sapiens",
    title: "Sapiens: A Brief History of Humankind",
    author: "Yuval Noah Harari",
    isbn: "9780099590088",
    genre: "business-economics",
    price: 1190,
    comparePrice: 1400,
    stock: 22,
    isBestseller: true,
    soldCount: 260,
    avgRating: 4.6,
    isStaffPick: true,
    staffPickNote: "The one history book we recommend to everyone.",
    specifications: { format: "Paperback", pages: 512 },
  },
  {
    slug: "thinking-fast-and-slow",
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    isbn: "9780141033570",
    genre: "business-economics",
    price: 980,
    stock: 14,
    soldCount: 75,
    avgRating: 4.4,
    specifications: { format: "Paperback", pages: 499 },
  },
  {
    slug: "palpasa-cafe",
    title: "Palpasa Café",
    author: "Narayan Wagle",
    isbn: "9789937905258",
    genre: "nepali-literature",
    price: 450,
    stock: 35,
    isFeatured: true,
    soldCount: 180,
    avgRating: 4.5,
    specifications: { format: "Paperback", language: "Nepali" },
  },
];

/**
 * Create or update the admin account. Safe to run against any database — it
 * touches exactly one user document and deletes nothing.
 *
 * Credentials come from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. They are read
 * from the environment rather than hardcoded so a real production password
 * never lands in git history.
 */
async function seedAdmin() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPass = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPass) {
    throw new Error(
      'Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before seeding an admin.'
    );
  }

  let admin = await User.findOne({ email: adminEmail.toLowerCase() }).select('+password');
  let created;
  if (admin) {
    // Previously this branch only flipped isAdmin and left the password alone,
    // so re-running the seed with a new password silently did nothing. Assign
    // it — the model's pre-save hook hashes it.
    admin.password = adminPass;
    admin.isAdmin = true;
    admin.isEmailVerified = true;
    created = false;
  } else {
    admin = new User({
      email: adminEmail,
      password: adminPass,
      fullName: 'Books Temple Admin',
      isAdmin: true,
      isEmailVerified: true,
    });
    created = true;
  }
  await admin.save();
  return { adminEmail: admin.email, created };
}

/**
 * Full development seed. DESTRUCTIVE: it empties the catalogue collections
 * before inserting its handful of demo rows.
 *
 * The guard exists because this file's only safeguard used to be the operator
 * remembering which database their .env pointed at — and here that is the live
 * Atlas cluster. Running `npm run seed` out of habit would have deleted the
 * whole catalogue. It now refuses when it finds a populated catalogue unless
 * SEED_ALLOW_WIPE=true says the destruction is intentional.
 */
async function seed() {
  const existingBooks = await Book.countDocuments();
  if (existingBooks > BOOKS.length && process.env.SEED_ALLOW_WIPE !== 'true') {
    throw new Error(
      `Refusing to seed: this database already holds ${existingBooks} books, and seeding deletes every ` +
        'book, genre and coupon first. If you really mean to wipe it, re-run with SEED_ALLOW_WIPE=true. ' +
        'To only create/update the admin account, run: npm run seed:admin'
    );
  }

  // Wipe catalog collections (idempotent dev seed); upsert users.
  await Promise.all([
    Book.deleteMany({}),
    Genre.deleteMany({}),
    Coupon.deleteMany({}),
  ]);

  await Genre.insertMany(GENRES.map((g) => ({ ...g, isActive: true })));
  await Book.create(
    BOOKS.map((b) => ({
      ...b,
      // Seed covers come from Open Library (no Cloudinary asset) — synthesise a
      // publicId so the required image subdocument validates.
      coverImage: {
        publicId: `seed/${b.isbn}`,
        secureUrl: cover(b.isbn),
        name: b.title,
      },
      description: `${b.title} by ${b.author}. ${GENRES.find((g) => g.slug === b.genre)?.name}, in stock now at Books Temple Nepal with cash-on-delivery across all seven provinces.`,
      isActive: true,
    })),
  );
  // Refresh each genre's bookCount ..
  for (const g of GENRES) {
    await Genre.updateOne(
      { slug: g.slug },
      {
        bookCount: await Book.countDocuments({ genre: g.slug, isActive: true }),
      },
    );
  }

  // Admin (upsert by email; never delete users).
  const { adminEmail } = await seedAdmin();

  // Demo customer.
  if (!(await User.findOne({ email: "reader@bookstemplenepal.com" }))) {
    await User.create({
      email: "reader@bookstemplenepal.com",
      password: "reader123",
      fullName: "Sita Reader",
      isEmailVerified: true,
    });
  }

  // Welcome coupon.
  await Coupon.create({
    code: "WELCOME10",
    description: "10% off your first order",
    type: "percentage",
    value: 10,
    minOrderAmount: 500,
    maxDiscount: 300,
    isActive: true,
    newUserOnly: true,
  });

  return {
    genres: await Genre.countDocuments(),
    books: await Book.countDocuments(),
    coupons: await Coupon.countDocuments(),
    adminEmail,
  };
}

// Run directly:
//   npm run seed         → full demo seed (DESTRUCTIVE, guarded — see seed())
//   npm run seed:admin   → create/update the admin account only (safe)
if (require.main === module) {
  const adminOnly = process.argv.includes("--admin-only");
  (async () => {
    try {
      await connectMongo();
      if (adminOnly) {
        const { adminEmail, created } = await seedAdmin();
        // The password is never logged — it is in the environment, and the
        // person who set it already knows it.
        logger.info(
          { adminEmail, action: created ? "created" : "updated" },
          "Admin account ready"
        );
      } else {
        const summary = await seed();
        logger.info(summary, "Seed complete");
        logger.info("Admin login → email: %s (password as set in SEED_ADMIN_PASSWORD)", summary.adminEmail);
      }
      await disconnectMongo();
      process.exit(0);
    } catch (err) {
      logger.error({ err: err.message }, "Seed failed");
      process.exit(1);
    }
  })();
}

module.exports = { seed, seedAdmin };
