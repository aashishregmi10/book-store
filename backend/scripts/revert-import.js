'use strict';

/*
 * Undo the Daraz title-matched import: deletes the draft books it created
 * (matched by the exact slugs from that run), removes them from any wishlists,
 * and deletes their uploaded Cloudinary covers.
 *
 * Safe by design: only deletes books that are still DRAFTS (isActive:false), so
 * it can never remove a published title even if a slug collides.
 *
 *   node scripts/revert-import.js          # delete
 *   node scripts/revert-import.js --dry    # list what would be deleted, change nothing
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const User = require('../src/models/user.model');
const { deleteImage } = require('../src/config/storage');

// The slugs created by the import run (from its log).
const SLUGS = [
  'english-grammar-in-use',
  'bhagavad-gita-as-it-is',
  'capital-the-communist-manifesto-and-other-writings',
  'thinking-like-a-lawyer',
  'the-official-cambridge-guide-to-ielts-student-s-book-with-answers-with-dvd-rom',
  'my-inventions-the-autobiography-of-nikola-tesla',
  'dostoyevsky-notes-from-underground-white-nights-the-dream-of-a-ridiculous-man-selections-from-the-house-of-the-dead',
  'frankenstein-or-the-modern-prometheus',
  'man-s-search-for-meaning-adapted-for-young-adults-adaptation',
  'autobiography-of-a-yogi',
  'tuesdays-with-morrie',
  'letters-from-a-stoic',
  'poor-economics',
  'no-longer-human',
  'the-republic-of-plato-books-i-v',
  'ijoriya',
  'animal-farm',
  'ikigai',
  'the-art-of-war',
  'the-concept-of-law',
  'mein-kampf',
  'ghosts-of-the-silent-hills',
  'a-room-of-one-s-own',
  'bobby-fischer-teaches-chess',
];

const dryRun = process.argv.includes('--dry');

(async function main() {
  await connectMongo();
  try {
    // Only ever touch drafts — never a published book.
    const books = await Book.find({ slug: { $in: SLUGS }, isActive: false }).select('slug title coverImage').lean();
    logger.info({ matched: books.length, dryRun }, books.length ? 'Books to remove' : 'Nothing to remove');
    for (const b of books) logger.info({ slug: b.slug, title: b.title }, '  •');

    if (dryRun || books.length === 0) return;

    const ids = books.map((b) => b._id);
    await Book.deleteMany({ _id: { $in: ids } });
    await User.updateMany({ wishlist: { $in: ids } }, { $pull: { wishlist: { $in: ids } } });

    // Best-effort Cloudinary cleanup so we don't orphan the uploaded covers.
    let removedCovers = 0;
    for (const b of books) {
      if (!b.coverImage?.publicId) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await deleteImage(b.coverImage.publicId);
        removedCovers += 1;
      } catch (err) {
        logger.warn({ slug: b.slug, err: err.message }, 'cover delete failed (left in Cloudinary)');
      }
    }
    logger.info({ deleted: books.length, removedCovers }, 'Revert complete');
  } finally {
    await disconnectMongo();
  }
  process.exit(0);
})().catch((err) => {
  logger.error({ err: err.message }, 'Revert failed');
  process.exit(1);
});
