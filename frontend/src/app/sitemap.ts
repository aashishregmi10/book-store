import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";
import { apiGet } from "@/lib/api";
import type { Genre } from "@/lib/types";

// Regenerate hourly; resilient if the API is briefly unreachable.
export const revalidate = 3600;

interface BookSitemapEntry {
  slug: string;
  updatedAt?: string;
  image?: string;
  genre: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url;
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/books`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.4 },
  ];

  const [genres, books] = await Promise.all([
    apiGet<Genre[]>("/genres", { revalidate: 3600 }).catch(() => [] as Genre[]),
    apiGet<BookSitemapEntry[]>("/books/sitemap", { revalidate: 3600 }).catch(() => [] as BookSitemapEntry[]),
  ]);

  const genreRoutes: MetadataRoute.Sitemap = genres.map((g) => ({
    url: `${base}/genre/${g.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const bookRoutes: MetadataRoute.Sitemap = books.map((b) => ({
    url: `${base}/books/${b.slug}`,
    lastModified: b.updatedAt ? new Date(b.updatedAt) : undefined,
    changeFrequency: "weekly",
    priority: 0.7,
    ...(b.image ? { images: [b.image] } : {}),
  }));

  return [...staticRoutes, ...genreRoutes, ...bookRoutes];
}
