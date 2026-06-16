// Sitemap data access — all reads go through the Express API (the frontend never
// touches Mongo; see /CLAUDE.md). The heavy lifting (filtering out drafts and
// long-dead listings, the per-section freshness aggregation, 50k paging) lives in
// the backend; here we just fetch and shape into MetadataRoute.Sitemap entries.
import { apiGet } from "./api";
import type { ArticleCard, Paged } from "./types";

// Google's hard limit is 50,000 URLs per sitemap file — must match the backend.
export const BOOKS_PER_SITEMAP = 50000;

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

/** A single 50k page of indexable books. Page is 1-based. */
export function getBookSitemapPage(page: number): Promise<BookSitemapPage> {
  return apiGet<BookSitemapPage>("/books/sitemap", {
    revalidate: CACHE.books,
    searchParams: { page, limit: BOOKS_PER_SITEMAP },
  }).catch(() => ({ total: 0, items: [] })); // resilient: empty-but-valid sitemap if the API is down
}

/** Category + genre slugs that hold ≥1 indexable book, with their freshness. */
export function getSitemapSections(): Promise<SitemapSections> {
  return apiGet<SitemapSections>("/books/sitemap/sections", { revalidate: CACHE.categories }).catch(
    () => ({ categories: [], genres: [] })
  );
}

/** Published blog articles (few enough to never need sharding). */
export function getBlogArticles(): Promise<ArticleCard[]> {
  return apiGet<Paged<ArticleCard>>("/articles", {
    revalidate: CACHE.blog,
    searchParams: { limit: 1000 },
  })
    .then((p) => p.items)
    .catch(() => []);
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
