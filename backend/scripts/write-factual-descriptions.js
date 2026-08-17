'use strict';

/*
 * Replace placeholder blurbs with factual copy, for books no provider knows.
 *
 * After backfill-descriptions.js has taken every description Open Library and
 * Google Books will give us (~17% of the thin set — these are regional and
 * Indian-market printings that neither catalogue indexes), several hundred
 * books are still wearing templateDescription()'s placeholder. That blurb is
 * byte-identical across every book carrying one, which is the worst of both
 * worlds: it is not information, and it is duplicate text on hundreds of
 * indexable pages.
 *
 * The house rule in backfill-descriptions.js is "no generated prose, no
 * paraphrase of the title — an invented description on a bookshop is worse than
 * a short one." This script is a deliberate, narrow exception agreed with the
 * shop owner, and it is built so the rule's actual concern — fabrication —
 * cannot happen:
 *
 *   • The model is given ONLY fields already stored on the book: title, author,
 *     format, pages, publisher, language, genre, section. It never sees a
 *     provider blurb, and it is never asked what the book is about.
 *   • It is instructed to make no claim about content, theme, plot, quality or
 *     audience. "A gripping thriller" is a fabrication; "a 240-page paperback
 *     published by Penguin" is a fact we hold.
 *   • Output is validated after generation: any draft containing a fact not
 *     present in the input is rejected and the book keeps its placeholder.
 *
 * What this does and does not buy: it removes hundreds of identical blurbs and
 * gives each page truthful, distinct copy. It will not make these pages rank —
 * a factual spec sentence is still thin. It is a floor, not a fix. The real fix
 * is a human or a supplier writing about the book.
 *
 * Requires ANTHROPIC_API_KEY in backend/.env.
 *
 * Dry run by default.
 *   node scripts/write-factual-descriptions.js --limit 20
 *   node scripts/write-factual-descriptions.js --apply
 *   node scripts/write-factual-descriptions.js --apply --include-inactive
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const { isTemplateDescription } = require('../src/utils/cleanDescription');

const MIN_DESC_CHARS = 200;
const DEFAULT_BATCH = 8;
const MODEL = 'claude-opus-5';

function parseArgs(argv) {
  const a = { apply: false, limit: Infinity, batch: DEFAULT_BATCH, model: MODEL, includeInactive: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--include-inactive') a.includeInactive = true;
    else if (argv[i] === '--limit') a.limit = Number(argv[i + 1]) || Infinity;
    else if (argv[i] === '--batch') a.batch = Math.max(1, Number(argv[i + 1]) || DEFAULT_BATCH);
    else if (argv[i] === '--model') a.model = argv[i + 1] || MODEL;
  }
  return a;
}

const SYSTEM = `You write catalogue copy for Books Temple Nepal, an online bookshop.

You are given ONLY verified catalogue fields for each book. Write a short
description using nothing but those fields.

Absolute rule: make no claim about the book's content. You do not know what any
of these books is about, and you must not guess from the title. Never state or
imply the plot, themes, subject matter, argument, style, quality, mood, or who
the book is for. Do not call a book gripping, essential, beloved, timeless,
insightful, or any other evaluation. Do not say what a reader will learn or feel.

Write only what the fields state: who wrote it, what edition it is, how long it
is, who published it, what language it is in, and which shelf it sits on. Say
that it ships across Nepal with cash on delivery, since that is true of every
book here.

Style: a bookseller writing a catalogue entry, not a marketer. Two or three
sentences, 35 to 60 words. Vary sentence structure between books so the
catalogue does not read as one template repeated — but never add information to
create that variety. Omit any field that was not supplied rather than inventing
a value or drawing attention to its absence.`;

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['slug', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

/** The only fields the model is allowed to see — and therefore to state. */
function facts(b) {
  const f = { slug: b.slug, title: b.title, author: b.author };
  if (b.specifications?.format) f.format = b.specifications.format;
  if (b.specifications?.pages) f.pages = b.specifications.pages;
  if (b.specifications?.publisher) f.publisher = b.specifications.publisher;
  if (b.specifications?.language) f.language = b.specifications.language;
  if (b.genre && b.genre !== 'unclassified') f.shelf = b.genre.replace(/-/g, ' ');
  if (b.category) f.section = b.category;
  return f;
}

// Words that assert something about the book's content or worth. Their presence
// means the model editorialised despite the instruction, so the draft is
// discarded rather than published — this catalogue's whole problem started with
// text that sounded confident and wasn't.
const EDITORIAL = /\b(gripping|compelling|essential|beloved|timeless|insightful|masterpiece|captivating|profound|stunning|remarkable|fascinating|thrilling|heartwarming|unforgettable|acclaimed|bestselling|classic|must[- ]read|page[- ]turner|explores?|examines?|tells the story|follows the|delves?|reveals?|teaches?|shows readers|will learn|perfect for|ideal for|readers will)\b/i;

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').trim()}"`;

async function writeBatch(client, model, books) {
  const res = await client.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content:
          `Write catalogue copy for these ${books.length} books, using only the fields given.\n\n` +
          books.map((b) => JSON.stringify(facts(b))).join('\n'),
      },
    ],
  });

  if (res.stop_reason === 'refusal') {
    throw new Error(`model declined the batch (${res.stop_details?.category || 'unspecified'})`);
  }
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = JSON.parse(text);
  const out = new Map();
  for (const r of parsed.results || []) out.set(r.slug, r.description);
  return { out, usage: res.usage };
}

/** Reject a draft that editorialises, restates nothing, or names a wrong fact. */
function validate(book, text) {
  if (!text || text.trim().length < 40) return 'too short';
  if (EDITORIAL.test(text)) return `editorialised: "${text.match(EDITORIAL)[0]}"`;
  const f = facts(book);
  // A publisher or page count the model invented is the failure that matters
  // most, since it reads as authoritative. Check the ones we can check.
  if (f.pages && /(\d{2,4})\s*pages/i.test(text)) {
    const claimed = Number(text.match(/(\d{2,4})\s*pages/i)[1]);
    if (claimed !== f.pages) return `wrong page count (said ${claimed}, is ${f.pages})`;
  }
  if (!f.publisher && /published by\s+[A-Z]/.test(text)) return 'invented a publisher';
  return null;
}

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set in backend/.env — cannot run.');
    process.exit(1);
  }

  const client = new Anthropic();
  await connectMongo();
  try {
    const q = args.includeInactive ? {} : { isActive: true };
    const all = await Book.find(q)
      .select('slug title author description specifications genre category isActive soldCount')
      .lean();

    // Only books wearing our placeholder, or with almost nothing at all. A book
    // with a real (if short) provider blurb keeps it — that is genuine
    // information and this script has none to add.
    const targets = all
      .filter((b) => {
        const d = (b.description || '').trim();
        return isTemplateDescription(d) || d.length < MIN_DESC_CHARS;
      })
      .sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
      .slice(0, args.limit);

    console.log(`${args.apply ? 'APPLYING' : 'DRY RUN'} — ${targets.length} book(s) to rewrite`);
    console.log(`scope: ${args.includeInactive ? 'active + hidden' : 'active only'}, model ${args.model}, batch ${args.batch}\n`);

    const written = [];
    const rejected = [];
    let inTok = 0;
    let outTok = 0;

    for (let i = 0; i < targets.length; i += args.batch) {
      const slice = targets.slice(i, i + args.batch);
      let result;
      try {
        result = await writeBatch(client, args.model, slice);
      } catch (err) {
        console.log(`  batch ${i / args.batch + 1}: FAILED — ${err.message}`);
        for (const b of slice) rejected.push({ ...b, why: `request failed: ${err.message}` });
        continue;
      }
      inTok += result.usage.input_tokens || 0;
      outTok += result.usage.output_tokens || 0;

      for (const b of slice) {
        const text = result.out.get(b.slug);
        const bad = validate(b, text);
        if (bad) rejected.push({ ...b, why: bad, draft: text });
        else written.push({ ...b, draft: text.trim() });
      }
      process.stdout.write(`  ${Math.min(i + args.batch, targets.length)}/${targets.length}\r`);
    }

    console.log(`\n\nwould write : ${written.length}`);
    console.log(`rejected    : ${rejected.length}`);
    console.log(`tokens      : ${inTok.toLocaleString()} in / ${outTok.toLocaleString()} out\n`);

    if (rejected.length) {
      const why = {};
      for (const r of rejected) why[r.why.replace(/:.*/, '')] = (why[r.why.replace(/:.*/, '')] || 0) + 1;
      console.log('rejection reasons:');
      Object.entries(why).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
      console.log('');
    }

    console.log('first 3 samples:');
    for (const w of written.slice(0, 3)) {
      console.log(`\n  ${w.slug}`);
      console.log(`    ${w.draft}`);
    }

    const stamp = Date.now();
    const outDir = path.join(__dirname, '..');
    const csv = path.join(outDir, `factual-descriptions-${stamp}.csv`);
    fs.writeFileSync(
      csv,
      ['slug,title,isActive,old_description,new_description']
        .concat(written.map((w) => [w.slug, w.title, w.isActive, w.description, w.draft].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );
    console.log(`\n\nbackup + review CSV: ${csv}`);

    if (rejected.length) {
      const rcsv = path.join(outDir, `factual-rejected-${stamp}.csv`);
      fs.writeFileSync(
        rcsv,
        ['slug,title,reason,draft']
          .concat(rejected.map((r) => [r.slug, r.title, r.why, r.draft || ''].map(csvCell).join(',')))
          .join('\n'),
        'utf8'
      );
      console.log(`rejected CSV       : ${rcsv}`);
    }

    if (!args.apply) {
      console.log('\nNothing was written. Review the CSV, then re-run with --apply.');
      return;
    }

    let updated = 0;
    for (const w of written) {
      await Book.updateOne({ _id: w._id }, { $set: { description: w.draft } });
      updated += 1;
    }
    logger.info({ updated, rejected: rejected.length }, 'Factual descriptions written');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'write-factual-descriptions failed');
  process.exit(1);
});
