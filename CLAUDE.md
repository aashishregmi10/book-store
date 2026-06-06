# PageTurn Nepal — Project Guide

Nepal's online bookstore. **MERN**: Express 5 + Mongoose 9 API (`/backend`), Next.js 16 + React 19 + Tailwind 4 storefront (`/frontend`), and a static admin app (`/static-app`, later phase).

> The full build plan lives in the approved plan file. This document is the **always-on design system + house rules** — read before writing any UI.

---

## Architecture (locked)

- **Frontend → Express API for everything** (reads + mutations). The frontend never touches MongoDB directly. Express owns Mongoose.
- Performance via **Next 16 `fetch` cache tags** (`books`, `book:<slug>`, `genres`, `genre:<slug>`, `reviews:<bookId>`). Admin mutations call `revalidateTag(...)`.
- **COD-only now**, but the order `paymentMethod` enum already includes `esewa|khalti|fonepay|connectips|card` for a clean v2. A service-layer guard rejects non-COD until then.
- **Next 16 is NOT the Next.js you know** — read `frontend/node_modules/next/dist/docs/` before touching App Router, metadata, image, or caching APIs (see `frontend/AGENTS.md`).

---

## Design system — editorial / literary bookshop, NOT a tech startup

### Colors (CSS variables — use these, never raw hexes inline)
```
--bg:      #FAF7F2   /* warm off-white page background */
--text:    #1C1C1C   /* near-black body + headings */
--accent:  #2D5A3D   /* deep forest green — CTAs, links, active states */
--muted:   #8C7B6B   /* warm brown-grey — captions, placeholders */
--border:  #E7E0D4   /* hairline dividers, card edges */
```
Dominant warm neutrals with sharp forest-green accents. Commit to the palette — no timid, evenly-distributed greys.

### Typography (load via `next/font/google`, never inline `<link>`)
- **Headings**: Cormorant Garamond (literary display serif)
- **Body**: Source Serif 4
- **Prices / ISBN / data / monospace**: JetBrains Mono
- **Inter / Roboto / Arial are BANNED.** They make a bookstore look like a SaaS dashboard.

### Hard prohibitions (these scream "AI default")
- ❌ NO purple or blue gradients (especially on white)
- ❌ NO generic rounded card shadows; use 1px `--border` strokes for separation instead
- ❌ NO uniform `rounded-2xl` on everything — vary radii intentionally
- ❌ NO centered-hero-with-one-CTA layout — the home hero is **asymmetric**, typography-led
- ❌ NO stock photos — real book covers only
- ❌ NO three-equal-cards-with-icons feature row

### Components
- **Book cards** feel like book jackets, not product tiles: cover-forward, serif title, author in small-caps/muted, price in JetBrains Mono.
- **Cart** reads like a librarian's checkout slip — minimal, monospace prices.
- **Buttons**: solid `--accent` fill or ghost; restrained radii; no pill gradients.
- Every book card carries a wishlist heart (top-right), on every surface (home, genre, search, related, account).

### Voice
Write like a passionate bookseller, not a marketer.
- Headlines are **specific**: "Books worth reading, delivered across Nepal" — not "Discover your next great read."
- Empty/error states sound human: "Nothing here yet — let's fix that." Never "No items found."

---

## SEO is cross-cutting, not a final phase

Every page ships with its metadata + JSON-LD + a BLUF intro. Non-negotiables:
- `metadataBase` + title template `'%s | PageTurn Nepal'` in the root layout.
- **Server-render everything that matters for SEO** — no client-side fetch for primary content. Server Components query the API; the HTML must contain the content.
- JSON-LD per page type (`lib/seo.ts` builders): Book, AggregateRating, Offer (`priceCurrency: 'NPR'`), BreadcrumbList, ItemList (genre), FAQPage, Organization (Nepal signals: `areaServed: 'NP'`, `addressCountry: 'NP'`, Kathmandu), WebSite+SearchAction.
- **BLUF**: lead each genre/book/blog page with a 40–80 word extractable definition.
- Book specs go in a `<dl>` (definition list) — far more AI-citable than prose.
- Self-referencing canonical on every page. `next/image` with width/height everywhere (ESLint enforces; `<img>` is an error).
- Genre silo: book pages link only within their own genre. Slugs are `lower-kebab` and must match across URL, breadcrumb, and DB.
- Out-of-stock books stay 200 with crawlable alternatives + temporary noindex — never a hard 404/redirect.

---

## Nepal specifics

- Currency **NPR** everywhere, format `₹X,XXX` (or `NPR X,XXX`), stored as integers.
- All 7 provinces in address dropdowns: Koshi, Madhesh, Bagmati, Gandaki, Lumbini, Karnali, Sudurpashchim.
- Phone `+977` prefix; timezone Asia/Kathmandu (UTC+5:45).
- Mobile-first: 72.94% of users are on phones. 44×44dp min touch targets, LCP <2.5s on 3G.

---

## Conventions

- API responses: `{ data, message }` on success, `{ message, errors }` on failure.
- Order numbers `PT-YYYYMMDD-XXXXX`.
- Backend is CommonJS; one concern per file; never log PII (log ids).
- Secrets only in `.env` (gitignored). `.env.example` is the committed template.
