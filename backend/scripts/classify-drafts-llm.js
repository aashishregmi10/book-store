'use strict';

/*
 * Shelve the hidden backlog with an LLM, where the keyword classifier can't.
 *
 * scripts/activate-drafts.js resolves ~4% of this backlog per pass. Its own
 * held-CSV explains why: 1,282 books scored "weak evidence" — the description
 * is real prose, but it never says "detective" or "quantum" or any of the other
 * literal terms classifyText.js matches on. These are regional and
 * Indian-market printings that Open Library and Google Books never catalogued
 * (backfill-descriptions.js fills only ~17% of them), so there is no subject
 * data to fall back on either. What is left is the blurb, and reading a blurb
 * for what a book is *about* is the thing keyword matching cannot do.
 *
 * The genre is not cosmetic — it sets the book's URL silo, breadcrumb,
 * related-books rail and JSON-LD — so this script is built to be conservative
 * in the same places activate-drafts.js is:
 *
 *   1. The model picks from the 16 live slugs or returns `uncertain`. The slug
 *      list is an `enum` in a structured-output schema, so a hallucinated or
 *      invented genre cannot come back at all — that is the failure mode
 *      CLAUDE.md calls out as having produced the original mess.
 *   2. Title and author are withheld, exactly as in activate-drafts.js: its
 *      header records that titles are the noisiest field here ("The Science of
 *      Being Great" reading as science-technology). The description alone is
 *      the evidence.
 *   3. Books whose description is our own templateDescription() placeholder are
 *      skipped before any request is made. That blurb says "Books Temple Nepal"
 *      and "ships across Nepal" on every book carrying one — it is what tricked
 *      a loosened keyword gate into proposing 36 books for nepali-literature.
 *   4. Anything below --min-confidence stays hidden and lands in the held CSV
 *      for a human. Nothing is published on a coin-flip.
 *
 * Books are batched per request (default 10) because one request per book would
 * be ~1,300 requests for a job that is mostly reading. Order is preserved by
 * echoing the slug back and matching on it, not on array position.
 *
 * Requires ANTHROPIC_API_KEY in backend/.env.
 *
 * Dry run by default.
 *   node scripts/classify-drafts-llm.js --limit 50        # sample, no writes
 *   node scripts/classify-drafts-llm.js --apply
 *   node scripts/classify-drafts-llm.js --apply --min-confidence 0.85
 *   node scripts/classify-drafts-llm.js --apply --activate # also publish them
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const logger = require('../src/config/logger');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');
const { GENRES } = require('../src/utils/genreMap');
const { isTemplateDescription } = require('../src/utils/cleanDescription');

const HOLDING = 'unclassified';
const MIN_DESC_CHARS = 200;
const DEFAULT_MIN_CONFIDENCE = 0.75;
const DEFAULT_BATCH = 10;
const MODEL = 'claude-opus-5';

function parseArgs(argv) {
  const a = {
    apply: false,
    activate: false,
    limit: Infinity,
    batch: DEFAULT_BATCH,
    minConfidence: DEFAULT_MIN_CONFIDENCE,
    model: MODEL,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--activate') a.activate = true;
    else if (argv[i] === '--limit') a.limit = Number(argv[i + 1]) || Infinity;
    else if (argv[i] === '--batch') a.batch = Math.max(1, Number(argv[i + 1]) || DEFAULT_BATCH);
    else if (argv[i] === '--min-confidence') a.minConfidence = Number(argv[i + 1]) || DEFAULT_MIN_CONFIDENCE;
    else if (argv[i] === '--model') a.model = argv[i + 1] || MODEL;
  }
  return a;
}

// `uncertain` is a first-class answer, not a failure. Without it the model has
// to name *some* genre for a blurb that genuinely doesn't indicate one, and a
// forced guess is exactly what fills a silo with books that don't belong in it.
const CHOICES = [...GENRES, 'uncertain'];

const SYSTEM = `You are shelving books for Books Temple Nepal, an online bookshop.

For each book you are given a publisher's description. Decide which single shelf
the book belongs on, choosing only from the provided list of shelf slugs.

Rules:
- Judge what the book IS, not what it mentions. A novel whose plot involves a
  scientist is fiction, not science-technology. A memoir by a politician is
  biography-memoir, not politics-society.
- "nepali-literature" means literature by Nepali authors or centrally about
  Nepal — not merely a book sold in Nepal or printed there. Every book in this
  catalogue ships from Nepal, so that fact carries no signal.
- "fiction" is the right answer for general/literary novels that do not clearly
  belong to a more specific fiction shelf (sci-fi-fantasy, mystery-thriller,
  romance, young-adult, childrens).
- Answer "uncertain" whenever the description is too vague, too generic, or too
  short to tell you what the book is about. A wrong shelf is worse than no
  shelf: it sets the book's public URL, breadcrumb and recommendations.
- confidence is your genuine probability that the shelf is correct, 0 to 1. Use
  the full range. Do not inflate it to seem decisive.
- reason is one short clause quoting or paraphrasing the part of the description
  that decided it.`;

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'The book slug, echoed back exactly as given.' },
          genre: { type: 'string', enum: CHOICES },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['slug', 'genre', 'confidence', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').trim()}"`;

/** Classify one batch. Returns a Map of slug -> {genre, confidence, reason}. */
async function classifyBatch(client, model, books) {
  const payload = books
    .map((b) => `<book slug="${b.slug}">\n${b.description.slice(0, 2000)}\n</book>`)
    .join('\n\n');

  const res = await client.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Shelve each of these ${books.length} books. Return one result per book, echoing its slug.\n\n${payload}`,
      },
    ],
  });

  // A refusal is a normal 200 on this model, with no content to read.
  if (res.stop_reason === 'refusal') {
    throw new Error(`model declined the batch (${res.stop_details?.category || 'unspecified'})`);
  }

  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = JSON.parse(text);
  const out = new Map();
  for (const r of parsed.results || []) out.set(r.slug, r);
  return { out, usage: res.usage };
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
    const liveGenres = new Set(
      (await Genre.find({ isActive: true }).select('slug').lean()).map((g) => g.slug)
    );

    const drafts = await Book.find({ isActive: false, genre: HOLDING })
      .select('slug title author description')
      .lean();

    // Same two pre-filters activate-drafts.js applies, for the same reasons.
    const eligible = drafts.filter((b) => {
      const d = (b.description || '').trim();
      return d.length >= MIN_DESC_CHARS && !isTemplateDescription(d);
    });
    const books = eligible.slice(0, args.limit);

    console.log(`${args.apply ? 'APPLYING' : 'DRY RUN'} — ${drafts.length} hidden draft(s)`);
    console.log(`eligible (real description >= ${MIN_DESC_CHARS} chars): ${eligible.length}`);
    console.log(`this run: ${books.length}, model ${args.model}, batch ${args.batch}, min-confidence ${args.minConfidence}\n`);

    const decided = [];
    const held = [];
    let inTok = 0;
    let outTok = 0;

    for (let i = 0; i < books.length; i += args.batch) {
      const slice = books.slice(i, i + args.batch);
      let result;
      try {
        result = await classifyBatch(client, args.model, slice);
      } catch (err) {
        console.log(`  batch ${i / args.batch + 1}: FAILED — ${err.message}`);
        for (const b of slice) held.push({ ...b, reason: `request failed: ${err.message}` });
        continue;
      }
      inTok += result.usage.input_tokens || 0;
      outTok += result.usage.output_tokens || 0;

      for (const b of slice) {
        const r = result.out.get(b.slug);
        if (!r) {
          held.push({ ...b, reason: 'model returned no result for this slug' });
        } else if (r.genre === 'uncertain') {
          held.push({ ...b, reason: 'model answered uncertain', evidence: r.reason });
        } else if (!liveGenres.has(r.genre) || r.genre === HOLDING) {
          held.push({ ...b, reason: `'${r.genre}' is not a live browsable genre`, proposed: r.genre });
        } else if (r.confidence < args.minConfidence) {
          held.push({ ...b, reason: `low confidence (${r.confidence.toFixed(2)})`, proposed: r.genre, evidence: r.reason });
        } else {
          decided.push({ ...b, proposed: r.genre, confidence: r.confidence, evidence: r.reason });
        }
      }
      process.stdout.write(`  ${Math.min(i + args.batch, books.length)}/${books.length}\r`);
    }

    const dist = {};
    for (const d of decided) dist[d.proposed] = (dist[d.proposed] || 0) + 1;
    console.log(`\n\nwould shelve  : ${decided.length}`);
    console.log(`stays hidden  : ${held.length}`);
    console.log(`tokens        : ${inTok.toLocaleString()} in / ${outTok.toLocaleString()} out\n`);
    console.log('proposed distribution:');
    Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([g, n]) => console.log(`  ${String(n).padStart(4)}  ${g}`));

    const reasons = {};
    for (const h of held) {
      const key = h.reason.replace(/\(.*/, '').trim();
      reasons[key] = (reasons[key] || 0) + 1;
    }
    if (held.length) {
      console.log('\nwhy the rest stay hidden:');
      Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([r, n]) => console.log(`  ${String(n).padStart(4)}  ${r}`));
    }

    const stamp = Date.now();
    const outDir = path.join(__dirname, '..');
    const decidedCsv = path.join(outDir, `llm-decided-${stamp}.csv`);
    fs.writeFileSync(
      decidedCsv,
      ['slug,title,author,proposed_genre,confidence,reason']
        .concat(decided.map((d) => [d.slug, d.title, d.author, d.proposed, d.confidence, d.evidence].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );
    const heldCsv = path.join(outDir, `llm-held-${stamp}.csv`);
    fs.writeFileSync(
      heldCsv,
      ['slug,title,author,reason,proposed_genre,evidence']
        .concat(held.map((h) => [h.slug, h.title, h.author, h.reason, h.proposed || '', h.evidence || ''].map(csvCell).join(',')))
        .join('\n'),
      'utf8'
    );
    console.log(`\ndecided CSV: ${decidedCsv}`);
    console.log(`held CSV:    ${heldCsv}`);

    if (!args.apply) {
      console.log('\nNothing was written. Review the decided CSV, then re-run with --apply.');
      return;
    }

    // Genre and visibility are separated deliberately. Shelving is reversible
    // and low-risk; publishing puts the book on a public URL. --activate is
    // opt-in so a first apply can set genres and be reviewed in the admin
    // before anything becomes crawlable.
    let updated = 0;
    for (const d of decided) {
      await Book.updateOne(
        { _id: d._id },
        { $set: { genre: d.proposed, ...(args.activate ? { isActive: true } : {}) } }
      );
      updated += 1;
    }
    logger.info({ updated, activated: args.activate, stillHidden: held.length }, 'LLM classification applied');
  } finally {
    await disconnectMongo();
  }
})().catch((err) => {
  logger.error({ err: err.message }, 'classify-drafts-llm failed');
  process.exit(1);
});
