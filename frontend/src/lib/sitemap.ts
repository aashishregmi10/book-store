// Sitemap data access — all reads go through the Express API (the frontend never
// touches Mongo; see /CLAUDE.md). The heavy lifting (filtering out drafts and
// long-dead listings, the per-section freshness aggregation, 50k paging) lives in
// the backend; here we just fetch and shape into MetadataRoute.Sitemap entries.
import { apiGet } from "./api";

// Google's hard limit is 50,000 URLs per file, but the useful limit is much
// lower: Search Console reports indexed-vs-submitted *per sitemap file*, so one
// file holding the whole catalogue yields a single number that says nothing
// about which pages are struggling. At 1,000 the shards are ordered by
// updatedAt, so a shard is a cohort — and "shard 3 is indexing at 20% while
// shard 0 is at 90%" is a finding you can act on.
export const BOOKS_PER_SITEMAP = 1000;

// Same reasoning for articles. The blog was a single <urlset> built by paging
// the full article list 100 rows at a time and keeping every field — excerpts,
// cover images — to read a slug and a date. That is ~100 sequential API calls
// at 10,000 articles, on a route the sitemap index re-runs per request.
export const ARTICLES_PER_SITEMAP = 1000;

export interface BookSitemapItem {
  slug: string;
  title: string;
  updatedAt?: string;
  image?: string; // raw Cloudinary URL; transform with cloudinaryAuto()
}
export interface BookSitemapPage {
  total: number;
  items: BookSitemapItem[];
}
export interface SitemapSection {
  slug: string;
  lastmod?: string;
}
export interface SitemapSections {
  categories: SitemapSection[];
  genres: SitemapSection[];
}

// Per-type fetch-cache windows (seconds). The sitemap route itself regenerates at
// the tightest cadence (books, 6h); these keep the slower-moving sub-sitemaps from
// re-hitting the API every time the route revalidates.
const DAY = 86_400;
export const CACHE = {
  static: DAY, // 24h
  categories: DAY / 2, // 12h
  genres: DAY / 2, // 12h
  books: DAY / 4, // 6h
  blog: DAY / 2, // 12h
} as const;

// These deliberately do NOT swallow errors. Returning an empty list on failure
// renders a valid-but-empty <urlset>, which tells crawlers every URL in it is
// gone — far worse than serving nothing. The route turns a throw into a 503 so
// Google retries and keeps the last good copy it has.

/** A single 50k page of indexable books. Page is 1-based. */
export function getBookSitemapPage(page: number): Promise<BookSitemapPage> {
  return apiGet<BookSitemapPage>("/books/sitemap", {
    revalidate: CACHE.books,
    searchParams: { page, limit: BOOKS_PER_SITEMAP },
  });
}

/** Category + genre slugs that hold ≥1 indexable book, with their freshness. */
export function getSitemapSections(): Promise<SitemapSections> {
  return apiGet<SitemapSections>("/books/sitemap/sections", { revalidate: CACHE.categories });
}

export interface ArticleSitemapItem {
  slug: string;
  publishedAt?: string;
  updatedAt?: string;
}
export interface ArticleSitemapPage {
  total: number;
  items: ArticleSitemapItem[];
}

/**
 * One shard of published articles — slug and dates only.
 *
 * This replaces a loop that pulled the entire article list, with excerpts and
 * cover images attached, purely to emit a <loc> and a <lastmod>. At a dozen
 * guides that was merely wasteful; at a few thousand it is ~100 sequential API
 * calls on a route the sitemap index re-runs on every request. The dedicated
 * endpoint returns the two fields an entry needs plus a total, so the index can
 * compute its shard count from a single call instead of walking the archive.
 */
export function getArticleSitemapPage(page: number): Promise<ArticleSitemapPage> {
  return apiGet<ArticleSitemapPage>("/articles/sitemap", {
    revalidate: CACHE.blog,
    searchParams: { page, limit: ARTICLES_PER_SITEMAP },
  });
}

// ── XML rendering ────────────────────────────────────────
// We hand-roll the XML (rather than use Next's metadata sitemap convention)
// because that convention reserves /sitemap.xml without serving an index there —
// see app/sitemap.xml/route.ts. We emit no free text (no titles/captions), only
// URLs and dates, but still escape <loc> values defensively.

export interface SitemapUrl {
  loc: string;
  lastmod?: string; // ISO 8601
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
  images?: string[]; // absolute image URLs → <image:loc>
}

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Render a <urlset>, adding the image namespace only when an entry has images. */
export function renderUrlset(urls: SitemapUrl[]): string {
  const hasImages = urls.some((u) => u.images?.length);
  const ns =
    `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"` +
    (hasImages ? ` xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"` : "");

  const body = urls
    .map((u) => {
      const parts = [`  <url>`, `    <loc>${xmlEscape(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (u.priority != null) parts.push(`    <priority>${u.priority}</priority>`);
      for (const img of u.images ?? []) {
        parts.push(`    <image:image><image:loc>${xmlEscape(img)}</image:loc></image:image>`);
      }
      parts.push(`  </url>`);
      return parts.join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${ns}>\n${body}\n</urlset>\n`;
}

/** Standard XML response with CDN caching for any sitemap document. */
export function xmlResponse(xml: string, sMaxAgeSeconds: number) {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, s-maxage=${sMaxAgeSeconds}, stale-while-revalidate=86400`,
    },
  });
}
