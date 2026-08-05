import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { apiGetOrNull, CACHE_TTL } from "@/lib/api";
import { npr } from "@/lib/format";
import type { ArticleDetail } from "@/lib/types";
import { articleLd, breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { MarkdownLite } from "@/components/MarkdownLite";
import { BookCard } from "@/components/books/BookCard";
import { ArticleCover } from "@/components/blog/ArticleCover";

// ISR — articles are published once and rarely edited afterwards.
export const revalidate = 900;

const getArticle = cache((slug: string) =>
  apiGetOrNull<ArticleDetail>(`/articles/${slug}`, { tags: [`article:${slug}`], revalidate: CACHE_TTL.articles })
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = await getArticle(slug);
  if (!a) return { title: "Article not found" };
  return {
    title: a.metaTitle || a.title,
    description: a.metaDesc || a.excerpt,
    alternates: { canonical: `/blog/${a.slug}` },
    openGraph: {
      type: "article",
      title: a.title,
      description: a.excerpt,
      // og:image is provided by the dynamic opengraph-image.tsx in this segment.
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await getArticle(slug);
  if (!a) notFound();

  return (
    <>
      <JsonLd
        data={[
          articleLd({
            title: a.title,
            slug: a.slug,
            excerpt: a.excerpt,
            coverImage: a.coverImage?.secureUrl,
            author: a.author,
            publishedAt: a.publishedAt,
            updatedAt: a.updatedAt,
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Articles", path: "/blog" },
            { name: a.title, path: `/blog/${a.slug}` },
          ]),
        ]}
      />

      {/* Editorial layout. The prose column stays at a readable measure (~68
          characters), but the page around it is full width and the masthead,
          cover and aside use that room — previously a bare 768px column sat
          centred in a 1600px page with empty gutters either side, which read as
          a broken layout rather than as generous margins. */}
      <div className="mx-auto max-w-[1400px] px-6 py-10 sm:px-8 lg:px-12">
        <Link href="/blog" className="inline-flex items-center gap-1 font-body text-sm text-accent hover:underline">
          <ChevronLeft className="size-4" /> All articles
        </Link>

        <header className="mt-6 max-w-4xl">
          {a.category && <p className="font-data text-xs uppercase tracking-[0.18em] text-accent">{a.category}</p>}
          <h1 className="mt-2 font-display text-4xl leading-[1.12] text-text sm:text-5xl lg:text-[3.4rem]">
            {a.title}
          </h1>
          <p className="mt-4 font-data text-sm text-muted">
            By {a.author || "Books Temple Editors"}
            {a.publishedAt ? ` · ${new Date(a.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}
            {a.readingTime ? ` · ${a.readingTime} min read` : ""}
          </p>
        </header>

        {/* Wider, shallower crop than the old 16/9 box — a hero band rather than
            a picture sitting inside the text column. */}
        <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-2xl border border-border bg-bg sm:aspect-[21/9]">
          <ArticleCover
            src={a.coverImage?.secureUrl}
            alt={a.title}
            title={a.title}
            category={a.category}
            priority
            sizes="(max-width: 1400px) 100vw, 1400px"
            className="object-cover"
          />
        </div>

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16">
          <article className="min-w-0 max-w-[68ch]">
            {/* BLUF — the excerpt leads as an extractable summary */}
            {a.excerpt && (
              <p className="border-l-2 border-accent pl-5 font-body text-xl leading-relaxed text-text">{a.excerpt}</p>
            )}

            <div className="mt-8">
              <MarkdownLite content={a.body} />
            </div>

            {a.tags && a.tags.length > 0 && (
              <div className="mt-10 flex flex-wrap gap-2 border-t border-border pt-6">
                {a.tags.map((t) => (
                  <span key={t} className="rounded-full border border-border px-3 py-1 font-data text-xs text-muted">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </article>

          {/* Sticky rail — fills the space the old layout wasted, and keeps the
              catalogue links in view while reading. Desktop only: on mobile the
              same books appear in the section below. */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-8">
              <div className="border border-border bg-surface p-5">
                <p className="label-smallcaps text-xs">Written by</p>
                <p className="mt-1 font-display text-lg text-text">{a.author || "Books Temple Editors"}</p>
                <p className="mt-2 font-body text-sm leading-relaxed text-muted">
                  Booksellers in Kathmandu, writing about what we actually stock and read.
                </p>
              </div>

              {a.relatedBooks && a.relatedBooks.length > 0 && (
                <div>
                  <p className="label-smallcaps text-xs">In this guide</p>
                  <ul className="mt-3 space-y-3">
                    {a.relatedBooks.slice(0, 4).map((b) => (
                      <li key={b.slug}>
                        <Link href={`/books/${b.slug}`} className="group flex gap-3">
                          <span className="relative h-16 w-11 shrink-0 overflow-hidden border border-border bg-bg">
                            <Image
                              src={b.coverImage.secureUrl}
                              alt={`${b.title} cover`}
                              fill
                              sizes="44px"
                              className="object-cover"
                            />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-body text-sm text-text group-hover:text-accent">
                              {b.title}
                            </span>
                            <span className="block truncate font-body text-xs text-muted">{b.author}</span>
                            <span className="mt-0.5 block font-data text-xs text-text">{npr(b.price)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Link
                href="/books"
                className="inline-flex w-full items-center justify-center border border-accent px-4 py-2.5 font-data text-xs uppercase tracking-wide text-accent transition-colors hover:bg-accent hover:text-white"
              >
                Browse the catalogue
              </Link>
            </div>
          </aside>
        </div>

        {/* Related books — internal links into the catalogue (GEO funnel) */}
        {a.relatedBooks && a.relatedBooks.length > 0 && (
          <section className="mt-16 border-t border-border pt-10">
            <h2 className="font-display text-2xl text-text">Books from this guide</h2>
            <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {a.relatedBooks.map((b) => (
                <BookCard key={b.slug} book={b} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
