import { SITE } from "@/lib/seo";
import { BOOKS_PER_SITEMAP, getBookSitemapPage } from "@/lib/sitemap";

// The sitemap index. robots.txt and Search Console point here; it lists the child
// sitemaps served by app/sitemap/[file]/route.ts. We hand-roll the index (and the
// children) instead of Next's metadata `sitemap.ts` convention because that
// convention reserves /sitemap.xml without serving an index there — it only emits
// /sitemap/<id>.xml children (verified against Next 16.2.6 in a prod build), which
// would leave robots.txt pointing at a 404.
export const revalidate = 21_600; // 6h, matches the books cadence

export async function GET() {
  const base = SITE.url;

  // Compute the book shard count (must match app/sitemap/[file]/route.ts).
  const { total } = await getBookSitemapPage(1);
  const bookShards = Math.max(1, Math.ceil(total / BOOKS_PER_SITEMAP));
  const ids = [
    "static",
    "categories",
    "genres",
    "blog",
    ...Array.from({ length: bookShards }, (_, i) => `books-${i}`),
  ];

  const now = new Date().toISOString();
  // All loc values are built from constant ids + our own base URL — no user data,
  // so no XML escaping is required here.
  const entries = ids
    .map((id) => `  <sitemap>\n    <loc>${base}/sitemap/${id}.xml</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;

  // Health/stats line (server-side, no PII) for log inspection in production.
  console.info(`[sitemap] index generated ${now} — children=${ids.length}, books=${total}, bookShards=${bookShards}`);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
