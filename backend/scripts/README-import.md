# Bulk book import

Import a large catalogue (e.g. a Daraz seller's listings) into PageTurn Nepal. Every book is created
as a **draft** (`isActive:false`) — hidden from the storefront until an admin reviews and publishes it.

The pipeline has two stages:

1. **Harvest** `title + price (+ ISBN, image)` from the source into a CSV — done in *your own browser*
   (Daraz is a JS-rendered, bot-protected SPA that a server can't fetch, and scraping it is your
   responsibility under Daraz's ToS).
2. **Enrich + create** — `scripts/import-books.js` looks each row up on Google Books / Open Library to
   fill ISBN, author, publisher, pages, language, description, genre, and a cover, then creates drafts.

> ⚠️ This is a large, multi-hour, review-heavy job. **Capture ISBNs whenever possible** — title-only
> matching is error-prone at scale. Set `GOOGLE_BOOKS_API_KEY` to avoid rate-limit (429) throttling.

---

## CSV format

A header row plus one book per line. Only `query` is required.

```
query,price,image,genre
9789389717136,650,https://static-01.daraz.com.np/p/abc.jpg,self-help
The Alchemist,499,https://static-01.daraz.com.np/p/def.jpg,fiction
Muna Madan,300,,nepali-literature
```

| Column   | Required | Meaning |
|----------|----------|---------|
| `query`  | ✅ | ISBN-10/13 (preferred) **or** the book title |
| `price`  | recommended | Selling price in NPR (integer). Missing → 0, fix in review |
| `author` | optional | Sharpens title matching when there's no ISBN, and is used as the book's author |
| `image`  | optional | Fallback cover URL (the Daraz product image) used only if Google/OL has no cover |
| `genre`  | optional | Forces a genre slug. Blank → auto-derived from provider categories → `--genre` fallback |

Titles containing commas are fine if quoted: `"Sapiens: A Brief History, Illustrated",1200,,`.

---

## Step 1 — Harvest from Daraz (run in your browser)

Open the seller page (e.g. `https://www.daraz.com.np/new-book-house/?q=All-Products`), open DevTools
(F12) → **Console**, paste the snippet below, and press Enter. It scrolls, collects every product on
the page, then **downloads `daraz-page.csv`**. Repeat for each of the 102 pages (change the page in the
URL), or use the auto-paginate note at the end.

```js
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Lazy images load on scroll — walk down the page first.
  for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await sleep(120); }
  const isbnRe = /(97[89][\d-]{10,})/;
  const rows = [];
  document.querySelectorAll('[data-qa-locator="product-item"]').forEach(card => {
    const title = card.querySelector('img')?.alt?.trim()
      || card.querySelector('a[title]')?.getAttribute('title')?.trim() || '';
    if (!title) return;
    const priceTxt = (card.querySelector('[class*="price"]')?.textContent || '').replace(/[^\d]/g, '');
    const img = card.querySelector('img')?.src || '';
    const href = card.querySelector('a')?.href || '';
    const isbn = (title.match(isbnRe) || href.match(isbnRe) || [])[1]?.replace(/-/g, '');
    const esc = s => `"${String(s).replace(/"/g, '""')}"`;
    rows.push([esc(isbn || title), priceTxt || '', esc(img), ''].join(','));
  });
  const csv = 'query,price,image,genre\n' + rows.join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'daraz-page.csv';
  a.click();
  console.log(`Collected ${rows.length} books`);
})();
```

> Daraz markup changes over time — if `data-qa-locator="product-item"` stops matching, inspect a
> product card and update that selector (and the price selector). Merge the per-page CSVs into one
> `daraz-books.csv` (keep a single header row) before Step 2.

**Improve match quality:** Daraz titles are messy ("New Book | Atomic Habits English Paperback…").
Where you can, replace the `query` cell with the real ISBN — matching by ISBN is far more reliable
than by title.

---

## Step 2 — Enrich + create drafts

From `backend/` with `.env` containing `MONGODB_URI`, `CLOUDINARY_*`, and `GOOGLE_BOOKS_API_KEY`:

```bash
# Always dry-run a small slice first
npm run import-books daraz-books.csv --genre general --limit 5

# Full run
npm run import-books daraz-books.csv --genre general --stock 10 --concurrency 2
```

| Flag | Default | Meaning |
|------|---------|---------|
| `<csv>` | — | Path to the CSV (positional) |
| `--genre` | `general` | Fallback genre slug when nothing maps and no per-row genre is given |
| `--stock` | `0` | Stock assigned to every imported book |
| `--concurrency` | `2` | Parallel lookups (keep low to respect Google/OL rate limits) |
| `--limit` | all | Only process the first N rows (use for dry-runs) |

The run is **idempotent**: existing ISBNs/slugs are skipped, so you can safely re-run. Failures are
written to `daraz-books.failures.csv` (`query,reason`) — fix or re-run just that file.

---

## Step 3 — Review & publish

In the admin (`/admin/books`), the imported drafts are hidden from the store. For each: correct any
wrong title match, rewrite the (publisher-blurb) description into the PageTurn bookseller voice, confirm
the genre/section, set stock, then toggle **Active** to publish. Books flagged with the fallback genre
in the import log should be triaged first.
