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

function staticUrls(): SitemapUrl[] {
  const lastmod = new Date().toISOString(); // static pages change on deploy
  return [
    { loc: base, lastmod, changefreq: "daily", priority: 1 },
    // /books is the canonical catalogue; filtered/sorted/paged variants carry
    // query params, are noindex'd, and are deliberately excluded here.
    { loc: `${base}/books`, lastmod, changefreq: "daily", priority: 0.9 },
    { loc: `${base}/about`, lastmod, changefreq: "monthly", priority: 0.5 },
    { loc: `${base}/contact`, lastmod, changefreq: "monthly", priority: 0.4 },
    { loc: `${base}/faq`, lastmod, changefreq: "monthly", priority: 0.5 },
    { loc: `${base}/blog`, lastmod, changefreq: "weekly", priority: 0.6 },
  ];
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = file.replace(/\.xml$/, "");

  if (id === "static") {
    return xmlResponse(renderUrlset(staticUrls()), CACHE.static);
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
