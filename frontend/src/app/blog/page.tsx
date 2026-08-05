import type { Metadata } from "next";
import Link from "next/link";
import { apiGet, CACHE_TTL } from "@/lib/api";
import { ArticleCover } from "@/components/blog/ArticleCover";
import type { ArticleCard, Paged } from "@/lib/types";

// ISR — see app/blog/[slug]/page.tsx.
export const revalidate = 900;

export const metadata: Metadata = {
  title: "Reading Guides & Articles",
  description:
    "Book recommendations, reading guides, and buying advice for readers in Nepal — from the booksellers at Books Temple Nepal.",
  alternates: { canonical: "/blog" },
};

export default async function BlogPage() {
  const data = await apiGet<Paged<ArticleCard>>("/articles", { tags: ["articles"], revalidate: CACHE_TTL.articles }).catch(() => null);
  const articles = data?.items ?? [];

  return (
    <div className="shell py-12">
      <header className="max-w-3xl">
        <p className="label-smallcaps font-data text-xs">The reading room</p>
        <h1 className="mt-2 font-display text-4xl text-text sm:text-5xl">Reading guides &amp; articles</h1>
        <p className="mt-3 font-body text-lg leading-relaxed text-muted">
          Recommendations, reading lists, and honest buying advice for readers across Nepal — written by the booksellers
          who pick what we stock.
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="py-20 text-center font-body text-muted">No articles yet — check back soon.</p>
      ) : (
        <div className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <article key={a._id} className="group flex flex-col">
              <Link href={`/blog/${a.slug}`} className="block">
                <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border bg-bg">
                  <ArticleCover
                    src={a.coverImage?.secureUrl}
                    alt={a.title}
                    title={a.title}
                    category={a.category}
                    sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
                  />
                </div>
              </Link>
              <div className="mt-3 flex flex-1 flex-col">
                {a.category && <p className="font-data text-xs uppercase tracking-wide text-accent">{a.category}</p>}
                <Link href={`/blog/${a.slug}`}>
                  <h2 className="mt-1 font-display text-xl leading-snug text-text transition-colors group-hover:text-accent">
                    {a.title}
                  </h2>
                </Link>
                {a.excerpt && <p className="mt-2 font-body text-sm leading-relaxed text-muted">{a.excerpt}</p>}
                <p className="mt-3 font-data text-xs text-muted">
                  {a.author || "Books Temple Editors"}
                  {a.readingTime ? ` · ${a.readingTime} min read` : ""}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
