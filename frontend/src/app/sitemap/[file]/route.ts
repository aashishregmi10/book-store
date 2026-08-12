import { SITE } from "@/lib/seo";
import { cloudinaryAuto } from "@/lib/images";
import {
  BOOKS_PER_SITEMAP,
  CACHE,
  renderUrlset,
  xmlResponse,
  getBookSitemapPage,
  getSitemapSections,
  getBlogArticles,
  type SitemapUrl,
} from "@/lib/sitemap";

// Child sitemaps, referenced by the index at /sitemap.xml. One handler serves
// every child via the `file` segment: /sitemap/static.xml, /sitemap/books-0.xml…
// Each branch fetches through the Express API (never Mongo) and renders a urlset.

const base = SITE.url;

// Hand-maintained: bump when the copy on these pages actually changes. A
// generated timestamp here would be a lie — they change on edit, not on deploy.
const EVERGREEN_LASTMOD = "2026-08-12";

/**
 * `lastmod` has to be earned, not stamped. Previously every entry carried
 * `new Date()`, so the whole sitemap claimed to have changed on every
 * regeneration — and a field that always says "just now" is one crawlers learn
 * to ignore, which costs us the only crawl-scheduling hint Google says it uses.
 *
 * So: the home and catalogue pages inherit the newest book's `updatedAt` (the
 * API returns books sorted `updatedAt` desc, so item 0 is the real high-water
 * mark), the blog index inherits the newest article, and the truly static pages
 * carry a date maintained by hand.
 */
function staticUrls(newestBook?: string, newestArticle?: string): SitemapUrl[] {
  return [
    { loc: base, lastmod: newestBook, changefreq: "daily", priority: 1 },
    // /books is the canonical catalogue; filtered/sorted/paged variants carry
    // query params, are noindex'd, and are deliberately excluded here.
    { loc: `${base}/books`, lastmod: newestBook, changefreq: "daily", priority: 0.9 },
    // /faq answers the questions people search before buying, so it earns a
    // higher priority than the other evergreen pages.
    { loc: `${base}/faq`, lastmod: EVERGREEN_LASTMOD, changefreq: "monthly", priority: 0.7 },
    { loc: `${base}/about`, lastmod: EVERGREEN_LASTMOD, changefreq: "monthly", priority: 0.5 },
    { loc: `${base}/contact`, lastmod: EVERGREEN_LASTMOD, changefreq: "monthly", priority: 0.4 },
    { loc: `${base}/blog`, lastmod: newestArticle, changefreq: "weekly", priority: 0.6 },
  ];
}

/** An API failure must not render as "these URLs no longer exist". */
function unavailable() {
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: { "Retry-After": "300", "Cache-Control": "no-store" },
  });
}

async function renderChild(id: string): Promise<Response> {
  if (id === "static") {
    const [books, articles] = await Promise.all([getBookSitemapPage(1), getBlogArticles()]);
    return xmlResponse(
      renderUrlset(staticUrls(books.items[0]?.updatedAt, articles[0]?.publishedAt)),
      CACHE.static
    );
  }

  if (id === "categories") {
    const { categories } = await getSitemapSections();
    return xmlResponse(
      renderUrlset(
        categories.map((c) => ({
          loc: `${base}/category/${c.slug}`,
          lastmod: c.lastmod,
          changefreq: "weekly",
          priority: 0.8,
        }))
      ),
      CACHE.categories
    );
  }

  if (id === "genres") {
    const { genres } = await getSitemapSections();
    return xmlResponse(
      renderUrlset(
        genres.map((g) => ({
          loc: `${base}/genre/${g.slug}`,
          lastmod: g.lastmod,
          changefreq: "weekly",
          priority: 0.8,
        }))
      ),
      CACHE.genres
    );
  }

  if (id === "blog") {
    const articles = await getBlogArticles();
    return xmlResponse(
      renderUrlset(
        articles.map((a) => ({
          loc: `${base}/blog/${a.slug}`,
          lastmod: a.publishedAt,
          changefreq: "monthly",
          priority: 0.6,
        }))
      ),
      CACHE.blog
    );
  }

  // Book shards: books-0, books-1, … (0-based shard → 1-based API page).
  const shardMatch = /^books-(\d+)$/.exec(id);
  if (shardMatch) {
    const shard = Number(shardMatch[1]);
    const { items, total } = await getBookSitemapPage(shard + 1);
    // 404 shards past the real count so stray URLs don't return empty 200s.
    const shardCount = Math.max(1, Math.ceil(total / BOOKS_PER_SITEMAP));
    if (shard >= shardCount) return new Response("Sitemap not found", { status: 404 });
    return xmlResponse(
      renderUrlset(
        items
          .filter((b) => b.slug) // slug is required in the model; defensive only
          .map((b) => {
            const img = cloudinaryAuto(b.image);
            return {
              loc: `${base}/books/${b.slug}`,
              lastmod: b.updatedAt,
              changefreq: "weekly" as const,
              priority: 0.6,
              // Cover image for Google Images, inline on the book's own URL entry
              // (Google's recommended pattern; image:title/caption are unused).
              ...(img ? { images: [img] } : {}),
            };
          })
      ),
      CACHE.books
    );
  }

  return new Response("Sitemap not found", { status: 404 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  try {
    return await renderChild(file.replace(/\.xml$/, ""));
  } catch {
    return unavailable();
  }
}
