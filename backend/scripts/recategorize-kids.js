'use strict';

/*
 * Detect children's books among the imported catalogue and move them into the
 * Kids section (category = 'kids'). Matching is keyword-based over the title and
 * description, so ALWAYS preview with --dry first and eyeball the list.
 *
 *   node scripts/recategorize-kids.js --dry     # list matches, change nothing
 *   node scripts/recategorize-kids.js --apply   # set category='kids' on matches
 *
 * Only touches books with no section yet (won't override manga/loksewa).
 */

require('dotenv').config({ quiet: true });

const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');

// Strong children's-book signals. Kept fairly specific to limit false positives
// (e.g. plain "children" can appear in adult titles like "The Children Act").
const KID_PATTERNS = [
  /\bchildren['’]s\b/i, /\bchildrens\b/i, /\bfor (kids|children)\b/i, /\bkids?['’]?\b/i,
  /\bjuvenile\b/i, /\btoddlers?\b/i, /\bpre-?school\b/i, /\bkindergarten\b/i,
  /\bnursery\s+rhymes?\b/i, /\bpicture\s+book\b/i, /\bbedtime\s+stor/i,
  /\bfairy[\s-]?tales?\b/i, /\bearly\s+readers?\b/i, /\bbeginner\s+readers?\b/i,
  /\bcolou?ring\s+book\b/i, /\bages?\s*[2-9]\b/i, /\bstory\s*book\b/i,
  /\bchapter\s+book\b/i, /\billustrated\s+(stories|tales)\b/i,
];

const isKid = (text) => !!text && KID_PATTERNS.some((re) => re.test(text));

const dry = process.argv.includes('--dry') || !process.argv.includes('--apply');

(async function main() {
  await connectMongo();
  try {
    // Candidates: books not already in a section.
    const books = await Book.find({ $or: [{ category: null }, { category: { $exists: false } }] })
      .select('title description category')
      .lean();

    const matches = books.filter((b) => isKid(b.title) || isKid(b.description));
    logger.info({ scanned: books.length, matched: matches.length, mode: dry ? 'DRY (no writes)' : 'APPLY' }, 'Kids recategorization');
    for (const b of matches) logger.info({ title: b.title }, '  • kids');

    if (!dry && matches.length) {
      const ids = matches.map((b) => b._id);
      const res = await Book.updateMany({ _id: { $in: ids } }, { $set: { category: 'kids' } });
      logger.info({ updated: res.modifiedCount }, 'Set category=kids');
    } else if (dry) {
      logger.info('Dry run — re-run with --apply to set category=kids on the matches above.');
    }
  } finally {
    await disconnectMongo();
  }
  process.exit(0);
})().catch((err) => {
  logger.error({ err: err.message }, 'recategorize-kids crashed');
  process.exit(1);
});
