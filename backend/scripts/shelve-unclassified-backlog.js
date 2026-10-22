'use strict';

/*
 * Shelve, repair and (optionally) publish the `unclassified` backlog — the
 * books an admin sees at /admin/books?genre=unclassified.
 *
 * Every rule-based route through this backlog was exhausted (reclassify-genres
 * found subject data for ~4%; classify-by-author is known to misfile). What was
 * left needed judgement per title, so the inputs here are a reviewed decision
 * file plus the evidence it was made from:
 *
 *   --decisions  JSON { "<bookId>": { genre, category, author, title, isbn,
 *                conf, note } } — one reviewed entry per book. `genre: ''`
 *                means "could not decide": the book is left unshelved.
 *   --evidence   JSONL of Daraz product-page data keyed by `id` (author,
 *                isbn13, description, pages, language) from
 *                daraz-scraper/enrich-new-details.js.
 *
 * What it changes, per book, and only where the stored value is missing or
 * known-bad (a real stored value is never overwritten):
 *   genre / category  from the decision.
 *   title             the decision's corrected title (supplier typos, the
 *                     supplier's shop name, Daraz's censor asterisks, a
 *                     "By. Author" tail). Hidden books also get a slug from the
 *                     corrected title — they have never been public, so no URL
 *                     breaks. Live books keep their slug.
 *   author            replaces "Unknown" only.
 *   isbn              Daraz-sourced only (the edition the supplier ships), and
 *                     never one another book already holds — that is reported
 *                     as a probable duplicate instead.
 *   description       replaces the placeholder template or a stub only, with
 *                     the seller's real blurb cleaned by cleanDaraz().
 *
 * Publishing (--publish) is separate and gated like publish-ready-drafts.js,
 * plus three checks that script lacks: a real author, a sane price (>= Rs 100;
 * one listing is priced Rs 2), and no probable duplicate of an existing book.
 *
 *   node scripts/shelve-unclassified-backlog.js --decisions d.json --evidence e.jsonl            # dry run
 *   node scripts/shelve-unclassified-backlog.js --decisions d.json --evidence e.jsonl --apply    # shelve + repair
 *   node scripts/shelve-unclassified-backlog.js ... --apply --publish                            # and publish the ready ones
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { connectMongo, disconnectMongo } = require('../src/config/database');
const { initRedis, cacheDel, closeRedis, isAvailable } = require('../src/config/redis');
const Book = require('../src/models/book.model');
const Genre = require('../src/models/genre.model');
const { cleanDaraz, isMeaningful, isTemplateDescription } = require('../src/utils/cleanDescription');

const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? undefined : process.argv[i + 1]; };
const APPLY = process.argv.includes('--apply');
const PUBLISH = process.argv.includes('--publish');
const DECISIONS = arg('--decisions');
const EVIDENCE = arg('--evidence');
const MIN_DESC = 200;
const MIN_PRICE = 100;
const HOLDING = 'unclassified';

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const realAuthor = (a) => { const s = String(a || '').trim(); return s && !/^(unknown|various|n\/?a|anonymous)$/i.test(s) ? s : ''; };
const isIsbn13 = (s) => /^97[89]\d{10}$/.test(String(s || ''));
const surname = (a) => norm(a).split(' ').filter((w) => w.length > 1).pop() || '';
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ').trim()}"`;

// Daraz censors these words with an asterisk. Restored from an explicit list —
// a blanket "drop asterisks inside words" rule would mangle real titles such as
// "The Subtle Art of Not Giving a F*ck".
const CENSORED = { 'Se*x': 'Sex', 'se*x': 'sex', 'g*ns': 'guns', 'Ment*al': 'Mental', 'Stupi*d': 'Stupid', 'stupi*d': 'stupid', 'Sna*kes': 'Snakes', 'mi*sile': 'missile' };
const uncensor = (t) => Object.entries(CENSORED).reduce((s, [k, v]) => s.split(k).join(v), String(t || ''));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const flexible = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).map(esc).join('\\s*');

// Supplier copy pastes its spec sheet inline ("Sadhus By Patrick Levy Book
// Type: non fiction Pages: 312 Pages Product Dimension:5.1 x 1 x 7.8 inches
// Author: Patrick Levy …"). cleanDaraz() drops spec LINES; these sit inside a
// line. Only labelled fragments are removed, never free prose.
// Amazon-style spec bullets ("• Publisher : X • Language : English • …") that
// sellers paste ahead of the blurb. A bullet whose label is a spec field is
// dropped; on the LAST bullet the value runs straight into the prose, so only
// the bounded value is cut ("Dimensions : 20.3 x 25.4 x 4.7 cm Companies are…").
const SPEC_LABEL = /^\s*(publisher|publication|language|paperback|hardcover|hardback|isbn(?:-1[03])?|item weight|weight|dimensions|reading age|country of origin|pages?|format|binding|edition)\s*:/i;
const SPEC_VALUE = /^\s*(?:dimensions\s*:\s*[\d.]+\s*x\s*[\d.]+\s*x\s*[\d.]+\s*(?:cm|mm|inches)|(?:item\s+)?weight\s*:\s*[\d.]+\s*(?:g|kg|grams)|(?:paperback|hardcover|pages?)\s*:\s*\d+\s*pages|isbn(?:-1[03])?\s*:\s*[\dXx-]{10,17}|language\s*:\s*[A-Za-z]+|reading age\s*:\s*[\d\s-]+(?:years?)?)\s*/i;
function stripSpecBullets(t) {
  if (!t.includes('•')) return t;
  const segs = t.split('•');
  const head = segs.shift();
  const kept = [];
  segs.forEach((s, i) => {
    if (!SPEC_LABEL.test(s)) { kept.push(s); return; }
    if (i < segs.length - 1) return; // a whole spec bullet
    const rest = s.replace(SPEC_VALUE, '');
    if (rest !== s && rest.trim()) kept.push(rest);
  });
  return [head, ...kept].join(' ');
}

function tidyBlurb(text, { title, author }) {
  let t = uncensor(text);
  t = stripSpecBullets(t);
  t = t.replace(/\b(importer|packer|marketed by|manufacturer)\s*:\s*[^\n]*?(\d[\d\s-]{6,}\d)/gi, ' ');
  t = t.replace(/Product Dimension\s*:?\s*[\d.]+\s*x\s*[\d.]+\s*x\s*[\d.]+\s*(?:inches|inch|cm)?/gi, ' ');
  // Value is one to three words up to the next capitalised word ("non fiction",
  // "Fiction", "encylopedia of sports").
  t = t.replace(/Book Type\s*:\s*[A-Za-z][A-Za-z -]{0,30}?(?=\s+[A-Z0-9]|\s*$)/g, ' ');
  t = t.replace(/\bPages\s*:\s*\d+\s*Pages?\b/gi, ' ');
  t = t.replace(/\bPrint length\s*:\s*\d+\s*pages?\b/gi, ' ');
  t = t.replace(/Reading age\s*:\s*[\d\s-]+(?:years?)?(?:\s*(?:and up|and above|\+|or older))?/gi, ' ');
  // Lower-case value only, e.g. "Publisher: omk book" — a capitalised value
  // can't be told apart from the sentence that follows it.
  t = t.replace(/\bPublisher\s*:\s*[a-z][a-z ]{0,30}?(?=\s+[A-Z])/g, ' ');
  t = t.replace(/\bLangua\w*\s*:\s*(?:English|Nepali|Hindi)\b/gi, ' ');
  t = t.replace(/\bISBN(?:-1[03])?\s*:?\s*97[89][\d-]{10,14}/gi, ' ');
  if (title) t = t.replace(new RegExp(`^\\s*Title\\s*:\\s*${flexible(title)}`, 'i'), ' ');
  if (realAuthor(author)) t = t.replace(new RegExp(`\\bAuthors?\\s*:\\s*${flexible(author)}`, 'gi'), ' ');
  // A leading echo of the product name: "<Title> [(Hindi)] [Hardcover] [by
  // <Author>]". Removed only when it stands alone as a header — if what follows
  // starts lower-case ("… by X is a self-help book that …") the echo is the
  // subject of a real sentence and stays.
  // Tried with the full title, then with just the main title before a subtitle
  // ("Endgame by Omid Scobie …" under "Endgame : Inside The Royal Family …") —
  // the short form only when a "by <author>" follows, so a common word that
  // merely starts the blurb is never taken for a header.
  if (title) {
    const by = `(?:by|BY|By)\\.?\\s*${realAuthor(author) ? flexible(author) : '\\S+(?:\\s\\S+)?'}`;
    const tail = `\\s*(?:\\([^)]{1,60}\\))?\\s*(?:hardcover|paperback|hardback)?l?\\s*`;
    const main = String(title).split(/\s*[:–—]\s*|\s+-\s+/)[0];
    const variants = [new RegExp(`^\\s*${flexible(title)}${tail}(?:${by})?\\s*`, 'i')];
    if (main.length >= 6 && main !== title) variants.push(new RegExp(`^\\s*${flexible(main)}${tail}${by}\\s*`, 'i'));
    // Two passes: some pastes echo the title twice ("X by Y Author : Y X - …").
    for (let pass = 0; pass < 2; pass += 1) {
      let stripped = false;
      for (const lead of variants) {
        const m = t.match(lead);
        // The second pass needs a longer echo: a one-word title ("Sadhus.") can
        // be the antecedent of the next sentence ("… recounts their lives").
        if (!m || m[0].trim().length < (pass ? 10 : 6)) continue;
        const restRaw = t.slice(m[0].length);
        if (/^\s*:/.test(restRaw)) continue; // "Title: Subtitle is …" — the subtitle is the subject
        const rest = restRaw.replace(/^[\s;,.-]+/, '');
        // The remainder must say something beyond the title itself — one paste
        // is just title, author, title.
        if (rest.length >= 60 && /^[A-Z0-9"'‘“(ऀ-ॿ]/.test(rest) && isMeaningful(rest, title)) { t = rest; stripped = true; break; }
      }
      if (!stripped) break;
    }
  }
  t = t.replace(/^\s*et rid of\b/, 'Get rid of'); // a supplier paste that lost its first letter
  return t.replace(/[ \t]{2,}/g, ' ').replace(/^[\s:;,.•-]+/, '').trim();
}

function bestBlurb(ev, ctx) {
  const c = tidyBlurb(cleanDaraz(ev && ev.description), ctx);
  return c && !isTemplateDescription(c) && isMeaningful(c, ctx.title) && c.length >= MIN_DESC ? c : '';
}

// Title tidy applied when the decision gives no explicit title.
const tidyTitle = (t) => uncensor(t)
  .replace(/^New International Books Center\s+/i, '')
  .replace(/\s+-\s+Books\s*\|?\s*$/i, '')
  .replace(/\s*:\s*/g, ': ')
  .replace(/\s{2,}/g, ' ')
  .replace(/[\s:|,-]+$/, '')
  .trim();

// Supplier-made bundles have no ISBN of their own; the supplier pastes one
// component's ISBN onto the listing, so neither assign it nor treat a clash with
// one as a duplicate.
const SUPPLIER_COMBO = /\bcombo\b|\bbuy\s*1\s*get\s*1\b|\s\+\s/i;

async function main() {
  if (!DECISIONS) { console.error('--decisions <file> is required'); process.exit(1); }
  const decisions = JSON.parse(fs.readFileSync(DECISIONS, 'utf8'));
  const evidence = new Map();
  if (EVIDENCE && fs.existsSync(EVIDENCE)) {
    for (const l of fs.readFileSync(EVIDENCE, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); evidence.set(r.id, r); }
  }

  await connectMongo();
  try {
    const liveGenres = new Set((await Genre.find({ isActive: true }).select('slug').lean()).map((g) => g.slug));
    const ids = Object.keys(decisions);
    const books = await Book.find({ _id: { $in: ids } })
      .select('slug title author isbn genre category description coverImage price stockStatus isActive specifications')
      .lean();

    // Everything else in the catalogue, for duplicate detection.
    const others = await Book.find({ _id: { $nin: ids } }).select('slug title author isbn isActive').lean();
    const isbnOwner = new Map(others.filter((b) => b.isbn).map((b) => [b.isbn, b]));
    const titleOwner = new Map();
    for (const b of others) { const k = norm(b.title); if (!titleOwner.has(k)) titleOwner.set(k, []); titleOwner.get(k).push(b); }
    // Every slug in use, including the backlog's own — a regenerated slug must not
    // land on another backlog book's current one either (unique index).
    const takenSlugs = new Set([...others.map((b) => b.slug), ...books.map((b) => b.slug)]);

    const plan = []; const tally = {}; const bump = (k) => { tally[k] = (tally[k] || 0) + 1; };
    const isbnClaimed = new Map(); // isbn -> id, within this batch

    for (const b of books) {
      const d = decisions[String(b._id)];
      const ev = evidence.get(String(b._id)) || {};
      if (b.genre !== HOLDING) { bump('skipped: no longer unclassified'); continue; }

      const set = {}; const unset = {}; const notes = [];
      // genre / section. Manga is a section with no genre (the live convention),
      // so `unclassified` is removed rather than replaced.
      if (d.category) set.category = d.category;
      if (d.genre) {
        if (!liveGenres.has(d.genre)) { bump(`skipped: unknown genre ${d.genre}`); continue; }
        set.genre = d.genre;
      } else if (d.category === 'manga') {
        unset.genre = '';
      } else if (d.category === 'kids') {
        set.genre = 'childrens';
      }

      // title (+ slug for never-public books)
      const newTitle = (d.title || '').trim() || tidyTitle(b.title);
      if (newTitle && newTitle !== b.title) {
        set.title = newTitle;
        if (!b.isActive) {
          let s = slugify(newTitle); const base = s; let n = 2;
          if (s && s !== b.slug) {
            while (takenSlugs.has(s)) s = `${base}-${n++}`;
            if (s !== b.slug) { set.slug = s; takenSlugs.add(s); }
          }
        }
      }
      const titleNow = set.title || b.title;

      // author: only replaces "Unknown"
      if (!realAuthor(b.author)) {
        const a = realAuthor(d.author) || realAuthor(ev.author);
        if (a) set.author = a;
      } else if (d.author && realAuthor(d.author) && d.author !== b.author && d.authorFix) {
        set.author = d.author; // explicit correction of a malformed stored name
      }
      const authorNow = set.author || b.author;

      // ISBN: Daraz-sourced, unique, and never for a supplier-made bundle.
      const isBundle = d.multi || SUPPLIER_COMBO.test(b.title) || SUPPLIER_COMBO.test(titleNow);
      if (!isIsbn13(b.isbn) && !isBundle) {
        const cand = [d.isbn, ev.isbn13].find(isIsbn13);
        if (cand) {
          const owner = isbnOwner.get(cand);
          if (owner && SUPPLIER_COMBO.test(owner.title)) notes.push(`isbn ${cand} skipped: a supplier combo (${owner.slug}) holds it`);
          else if (owner) notes.push(`duplicate: ISBN ${cand} already on ${owner.isActive ? 'live' : 'hidden'} book ${owner.slug}`);
          else if (isbnClaimed.has(cand)) notes.push(`duplicate: ISBN ${cand} also recovered for another backlog book`);
          else { set.isbn = cand; isbnClaimed.set(cand, String(b._id)); }
        }
      }

      // Probable duplicate by title + author surname (different printing, no ISBN to compare).
      const sameTitle = (titleOwner.get(norm(titleNow)) || []).filter((o) => realAuthor(authorNow) && surname(o.author) === surname(authorNow));
      if (sameTitle.length) notes.push(`duplicate: same title+author as ${sameTitle.map((o) => `${o.slug}${o.isActive ? '' : ' (hidden)'}`).join(', ')}`);

      // description: replace the placeholder/stub with the seller's blurb; tidy a
      // real one in place (spec fragments, censor asterisks) without rewriting it.
      const ctx = { title: b.title, author: authorNow };
      const cur = String(b.description || '').trim();
      const curOk = cur.length >= MIN_DESC && !isTemplateDescription(cur);
      if (!curOk) {
        const blurb = bestBlurb(ev, ctx);
        if (blurb) set.description = blurb;
      } else {
        const tidy = tidyBlurb(cur, ctx);
        // A live page is better served by a short honest blurb than by one padded
        // with its own title; a hidden one still has to clear the publish gate.
        if (tidy !== cur && tidy.length >= (b.isActive ? 80 : MIN_DESC)) { set.description = tidy; notes.push('description tidied'); }
      }
      const descNow = String(set.description || b.description || '').trim();

      // specifications: fill blanks only
      const spec = b.specifications || {};
      if (!spec.pages && Number(ev.pages) > 0) set['specifications.pages'] = Number(ev.pages);
      if (ev.language && (!spec.language || spec.language === 'English') && !/^english$/i.test(ev.language)) set['specifications.language'] = ev.language;

      // publish gate (hidden books only)
      const blockers = [];
      const genreNow = set.genre || (b.genre !== HOLDING ? b.genre : '');
      if (!genreNow && !(set.category || b.category)) blockers.push('no shelf');
      if (descNow.length < MIN_DESC || isTemplateDescription(descNow)) blockers.push('no real description');
      if (!realAuthor(authorNow)) blockers.push('no author');
      if (!b.coverImage || !b.coverImage.secureUrl) blockers.push('no cover');
      if (!b.price || b.price < MIN_PRICE) blockers.push(`price Rs ${b.price}`);
      if (b.stockStatus === 'out-of-stock' || b.stockStatus === 'discontinued') blockers.push('not in stock');
      if (notes.some((n) => n.startsWith('duplicate'))) blockers.push('probable duplicate');
      if (d.hold) blockers.push(`review: ${d.hold}`);
      const publishable = !b.isActive && blockers.length === 0;
      if (PUBLISH && publishable) set.isActive = true;

      const shelved = Boolean(genreNow || set.category || b.category);
      bump(`${b.isActive ? 'live' : 'hidden'}: ${shelved ? 'shelved' : 'left unshelved'}`);
      if (!b.isActive) bump(publishable ? 'hidden: READY to publish' : `hidden: held (${blockers[0]})`);
      for (const k of ['title', 'author', 'isbn', 'description']) if (set[k] !== undefined) bump(`fixed: ${k}`);
      plan.push({ b, set, unset, notes, blockers, publishable });
    }

    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}${PUBLISH ? ' + PUBLISH' : ''} — ${books.length} backlog book(s) with a decision\n`);
    for (const [k, n] of Object.entries(tally).sort()) console.log(`  ${String(n).padStart(4)}  ${k}`);

    const dist = {};
    for (const p of plan) { const g = p.set.genre || p.set.category || '(unshelved)'; dist[g] = (dist[g] || 0) + 1; }
    console.log('\nshelf distribution:');
    for (const [g, n] of Object.entries(dist).sort((a, c) => c[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${g}`);

    if (!APPLY) {
      const all = plan.filter((p) => p.notes.includes('description tidied'));
      const tidied = process.argv.includes('--show-tidy') ? all : all.slice(0, 6);
      if (tidied.length) console.log(`\ndescription tidy — before / after (${tidied.length} of ${all.length}):`);
      for (const p of tidied) {
        console.log(`\n  ${p.b.title}`);
        console.log(`   before: ${String(p.b.description).replace(/\s+/g, ' ').slice(0, 150)}`);
        console.log(`   after : ${String(p.set.description).replace(/\s+/g, ' ').slice(0, 150)}`);
      }
    }

    const stamp = Date.now();
    const out = path.join(__dirname, '..', `backlog-plan-${stamp}.csv`);
    const rows = ['id,slug,live,old_title,new_title,old_author,new_author,new_isbn,genre,category,desc_source,publishable,blockers,notes,old_slug,new_slug'];
    for (const p of plan) {
      rows.push([String(p.b._id), p.b.slug, p.b.isActive, p.b.title, p.set.title || '', p.b.author, p.set.author || '', p.set.isbn || '',
        p.set.genre || '', p.set.category || '', p.set.description ? 'daraz blurb' : '', p.publishable, p.blockers.join('; '), p.notes.join('; '),
        p.b.slug, p.set.slug || ''].map(csvCell).join(','));
    }
    fs.writeFileSync(out, rows.join('\n'), 'utf8');
    console.log(`\nplan CSV: ${out}`);

    if (!APPLY) { console.log('\nNothing written. Re-run with --apply (and --publish to release the ready ones).'); return; }

    // Backup of every field we are about to touch.
    const backup = path.join(__dirname, '..', `backlog-backup-${stamp}.json`);
    fs.writeFileSync(backup, JSON.stringify(plan.filter((p) => Object.keys(p.set).length).map((p) => ({
      _id: String(p.b._id), before: { slug: p.b.slug, title: p.b.title, author: p.b.author, isbn: p.b.isbn || null, genre: p.b.genre,
        category: p.b.category || null, description: p.b.description, specifications: p.b.specifications || {}, isActive: p.b.isActive },
      set: p.set,
    })), null, 1), 'utf8');
    console.log(`backup: ${backup}`);

    let written = 0; let failed = 0;
    for (const p of plan) {
      if (!Object.keys(p.set).length && !Object.keys(p.unset).length) continue;
      const update = { $set: p.set };
      if (Object.keys(p.unset).length) update.$unset = p.unset;
      // Update validators run with `this` = the query, so genre's "required
      // unless a section is set" rule can't see the category set in the same
      // update, and would reject a manga book losing its holding genre. Those
      // updates set the section and drop the genre together, which is valid.
      const opts = { runValidators: !update.$unset };
      try { await Book.updateOne({ _id: p.b._id, genre: HOLDING }, update, opts); written += 1; }
      catch (e) { failed += 1; console.error(`  FAILED ${p.b.slug}: ${e.message}`); }
    }

    // cacheDel is a silent no-op until initRedis() has connected — scripts that
    // skip this "clear" the cache without touching it.
    initRedis();
    for (let i = 0; i < 25 && !isAvailable(); i += 1) await new Promise((r) => setTimeout(r, 200));
    if (isAvailable()) {
      for (const k of ['books_list:*', 'book:*', 'featured_books', 'filters_metadata', 'genre:*', 'genres_list', 'books_sitemap:*', 'books_sitemap_sections', 'product_feed']) await cacheDel(k);
      console.log('\nAPI caches cleared.');
    } else console.log('\nRedis unreachable — API caches will expire on their own (lists within 5 min, counts and sitemaps within an hour).');
    await closeRedis();
    console.log(`written: ${written}, failed: ${failed}. Storefront pages are ISR and refresh within ~2 minutes.`);
  } finally {
    await disconnectMongo();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('shelve-unclassified-backlog failed:', e.message); process.exit(1); });
}

module.exports = { tidyBlurb, tidyTitle, uncensor, stripSpecBullets };
