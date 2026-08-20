import { SITE } from "@/lib/seo";
import {
  BOOKS_PER_SITEMAP,
  ARTICLES_PER_SITEMAP,
  getBookSitemapPage,
  getArticleSitemapPage,
  getSitemapSections,
} from "@/lib/sitemap";

// The sitemap index. robots.txt and Search Console point here; it lists the child
// sitemaps served by app/sitemap/[file]/route.ts. We hand-roll the index (and the
// children) instead of Next's metadata `sitemap.ts` convention because that
// convention reserves /sitemap.xml without serving an index there — it only emits
// /sitemap/<id>.xml children (verified against Next 16.2.6 in a prod build), which
// would leave robots.txt pointing at a 404.
// Rendered per request rather than prerendered at build. The sitemap fetchers
// no longer swallow API errors — an empty sitemap tells crawlers every URL in it
// is gone, so failing loudly is the safer default — but that makes the route
// throwable, and a throwable route that Next tries to export at build time fails
// the whole build whenever the API happens to be unreachable. Freshness and edge
// caching come from the Cache-Control header below, which is what actually
// serves crawlers anyway.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return await buildIndex();
  } catch {
    // Never a cached empty index: ask the crawler to come back instead.
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "300", "Cache-Control": "no-store" },
    });
  }
}

async function buildIndex() {
  const base = SITE.url;

  // Compute the book shard count (must match app/sitemap/[file]/route.ts).
  // One page of each. This route is force-dynamic, so it runs per request —
  // and it used to call getBlogArticles(), which walked the entire article
  // archive 100 rows at a time just to read one date and a count. Both fetches
  // now return their own `total`, which is all the shard arithmetic needs.
  const [books, articles, sections] = await Promise.all([
    getBookSitemapPage(1),
    getArticleSitemapPage(1),
    getSitemapSections(),
  ]);
  const { total } = books;
  const bookShards = Math.max(1, Math.ceil(total / BOOKS_PER_SITEMAP));
  const blogShards = Math.max(1, Math.ceil(articles.total / ARTICLES_PER_SITEMAP));

  // Real freshness per child instead of "now" on all of them. A lastmod that
  // always reads as this minute is one crawlers learn to disregard, and it is
  // the only crawl-scheduling hint Google says it actually uses — worth being
  // honest about. Books come back sorted updatedAt desc, so item 0 is the
  // high-water mark for every shard.
  const newest = (dates: (string | undefined)[]) =>
    dates.filter(Boolean).sort().at(-1) as string | undefined;
  const booksLastmod = books.items[0]?.updatedAt;
  const blogLastmod = articles.items[0]?.updatedAt || articles.items[0]?.publishedAt;
  const lastmodFor = (id: string): string | undefined => {
    if (id === "static") return newest([booksLastmod, blogLastmod]);
    if (id === "categories") return newest(sections.categories.map((c) => c.lastmod));
    if (id === "genres") return newest(sections.genres.map((g) => g.lastmod));
    if (id === "blog-0") return blogLastmod;
    // Books are sorted updatedAt desc, so only shard 0 has a lastmod we already
    // know. Establishing it for the rest would mean fetching every shard just to
    // read its first row. An omitted lastmod costs a crawl hint; a wrong one
    // costs the field's credibility everywhere, so the later shards say nothing.
    return id === "books-0" ? booksLastmod : undefined;
  };

  const ids = [
    "static",
    "categories",
    "genres",
    ...Array.from({ length: blogShards }, (_, i) => `blog-${i}`),
    ...Array.from({ length: bookShards }, (_, i) => `books-${i}`),
  ];

  // All loc values are built from constant ids + our own base URL — no user data,
  // so no XML escaping is required here.
  const entries = ids
    .map((id) => {
      const lastmod = lastmodFor(id);
      const when = lastmod ? `\n    <lastmod>${new Date(lastmod).toISOString()}</lastmod>` : "";
      return `  <sitemap>\n    <loc>${base}/sitemap/${id}.xml</loc>${when}\n  </sitemap>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;

  // Health/stats line (server-side, no PII) for log inspection in production.
  console.info(
    `[sitemap] index generated ${new Date().toISOString()} — children=${ids.length}, books=${total}, articles=${articles.total}, bookShards=${bookShards}, blogShards=${blogShards}`
  );

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
