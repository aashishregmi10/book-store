import type { Metadata } from "next";
import Link from "next/link";
import { Search, X } from "lucide-react";

import { apiGet, CACHE_TTL } from "@/lib/api";
import { breadcrumbLd, listingIndexing } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { Pagination } from "@/components/books/Pagination";
import type { ArticleCard, Paged } from "@/lib/types";

// ISR — see app/blog/[slug]/page.tsx.
export const revalidate = 900;

const PER_PAGE = 20;
const FILTER_KEYS = ["category", "q"] as const;

interface ArticleMeta {
  total: number;
  categories: { name: string; count: number }[];
}

type SP = Record<string, string | undefined>;

/**
 * The archive index.
 *
 * Rebuilt from a three-column card grid into a typographic list, for two
 * reasons that both came from the same place — this shelf is meant to grow into
 * the thousands.
 *
 * 1. It no longer depends on images. Guides are written without cover art (the
 *    house rule bans stock photos, and there is rarely a real book cover that
 *    represents a list of twelve books), so every card fell back to a generated
 *    placeholder. Twenty near-identical decorative boxes is noise pretending to
 *    be design. A contents-page list is what a literary archive actually looks
 *    like, and it carries more information per screen.
 *
 * 2. It is navigable at scale. The previous version fetched the API's default
 *    first page and rendered it with no pagination at all, so only the twelve
 *    most recent guides existed as far as a reader — or a crawler following
 *    internal links — was concerned. Everything older was orphaned.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const category = sp.category?.trim();

  // A filtered or searched view is a narrowed slice of the same archive, so it
  // consolidates onto /blog and stays out of the index; a clean page N indexes
  // itself. listingIndexing owns that rule for every listing on the site.
  const base = listingIndexing("/blog", sp, FILTER_KEYS);

  const title = category
    ? `${category} — Reading Guides & Articles`
    : page > 1
      ? `Reading Guides & Articles — Page ${page}`
      : "Reading Guides & Articles";

  return {
    ...base,
    title,
    description:
      "Book recommendations, reading guides, and buying advice for readers in Nepal, from the booksellers at Books Temple Nepal.",
  };
}

export default async function BlogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const category = sp.category?.trim() || "";
  const q = sp.q?.trim() || "";

  const [data, meta] = await Promise.all([
    apiGet<Paged<ArticleCard>>("/articles", {
      tags: ["articles"],
      revalidate: CACHE_TTL.articles,
      searchParams: {
        page,
        limit: PER_PAGE,
        ...(category ? { category } : {}),
        ...(q ? { search: q } : {}),
      },
    }).catch(() => null),
    // The category bar cannot be derived from the current page — page 40 knows
    // nothing about the categories on page 1 — so it comes from its own
    // aggregate. A failure here costs the filter bar, not the archive.
    apiGet<ArticleMeta>("/articles/meta", {
      tags: ["articles"],
      revalidate: CACHE_TTL.articles,
    }).catch(() => null),
  ]);

  const articles = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const filtered = Boolean(category || q);

  // Preserve the active filters when moving between pages.
  const hrefForPage = (n: number) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `/blog?${qs}` : "/blog";
  };

  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Reading guides", path: "/blog" },
        ])}
      />

      <div className="shell py-12">
        <header className="max-w-3xl">
          <p className="label-smallcaps font-data text-xs">The reading room</p>
          <h1 className="mt-2 font-display text-4xl text-text sm:text-5xl">Reading guides &amp; articles</h1>
          <p className="mt-3 font-body text-lg leading-relaxed text-muted">
            Recommendations, reading lists, and honest buying advice for readers across Nepal, written by the
            booksellers who pick what we stock.
          </p>
        </header>

        {/* ── Filter bar ────────────────────────────────────────────────
            Categories are links, not buttons: they are real, crawlable URLs,
            which is how the archive stays reachable as it grows. */}
        <div className="mt-8 border-y border-border py-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <nav aria-label="Filter by category" className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <FilterLink href="/blog" active={!category && !q}>
                All{meta ? ` (${meta.total})` : ""}
              </FilterLink>
              {meta?.categories.map((c) => (
                <FilterLink
                  key={c.name}
                  href={`/blog?category=${encodeURIComponent(c.name)}`}
                  active={category === c.name}
                >
                  {c.name} ({c.count})
                </FilterLink>
              ))}
            </nav>

            {/* A plain GET form — works without JavaScript, and the result is a
                shareable URL rather than transient client state. */}
            <form action="/blog" method="get" className="ml-auto flex items-center gap-2">
              {category && <input type="hidden" name="category" value={category} />}
              <label htmlFor="blog-search" className="sr-only">
                Search articles
              </label>
              <div className="flex items-center border border-border bg-surface focus-within:border-accent">
                <Search className="ml-2.5 size-4 shrink-0 text-muted" aria-hidden />
                <input
                  id="blog-search"
                  name="q"
                  defaultValue={q}
                  placeholder="Search guides…"
                  className="w-44 bg-transparent px-2 py-1.5 font-body text-sm text-text outline-none placeholder:text-muted"
                />
              </div>
              <button
                type="submit"
                className="border border-border px-3 py-1.5 font-data text-xs uppercase tracking-wide text-text hover:border-accent hover:text-accent"
              >
                Go
              </button>
            </form>
          </div>
        </div>

        {/* Result summary — states what you are looking at, and offers the way out. */}
        {filtered && (
          <p className="mt-5 flex flex-wrap items-center gap-3 font-body text-sm text-muted">
            <span>
              {total} {total === 1 ? "article" : "articles"}
              {category ? ` in ${category}` : ""}
              {q ? ` matching “${q}”` : ""}
            </span>
            <Link
              href="/blog"
              className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-accent hover:underline"
            >
              <X className="size-3.5" /> Clear
            </Link>
          </p>
        )}

        {articles.length === 0 ? (
          <p className="py-20 text-center font-body text-muted">
            {filtered
              ? "Nothing matches that yet — try another word, or browse everything."
              : "No articles yet, check back soon."}
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-border border-b border-border">
            {articles.map((a) => (
              <li key={a._id}>
                <Link href={`/blog/${a.slug}`} className="group block py-7 sm:py-8">
                  <div className="grid gap-x-8 gap-y-2 sm:grid-cols-[8.5rem_1fr]">
                    {/* Date rail. On a long archive the date is the thing you
                        scan by, so it gets its own column rather than being
                        buried under the excerpt. */}
                    <div className="font-data text-xs text-muted sm:pt-1.5">
                      {a.publishedAt && (
                        <time dateTime={a.publishedAt} className="block tabular-nums">
                          {new Date(a.publishedAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </time>
                      )}
                      {a.category && (
                        <span className="mt-1 block uppercase tracking-[0.14em] text-accent">{a.category}</span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h2 className="font-display text-xl leading-snug text-text transition-colors group-hover:text-accent sm:text-2xl">
                        {a.title}
                      </h2>
                      {a.excerpt && (
                        <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-muted">{a.excerpt}</p>
                      )}
                      <p className="mt-3 font-data text-xs text-muted">
                        {a.author || "Books Temple Editors"}
                        {a.readingTime ? ` · ${a.readingTime} min read` : ""}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}

        {pages > 1 && (
          <>
            <Pagination page={page} pages={pages} hrefFor={hrefForPage} />
            <p className="mt-3 text-center font-data text-xs text-muted">
              Page {page} of {pages} · {total} articles
            </p>
          </>
        )}
      </div>
    </>
  );
}

/** A category chip. Small-caps mono, underline for the active one — no pills. */
function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`font-data text-xs uppercase tracking-[0.12em] transition-colors ${
        active
          ? "text-accent underline decoration-accent underline-offset-[6px]"
          : "text-muted hover:text-text"
      }`}
    >
      {children}
    </Link>
  );
}
