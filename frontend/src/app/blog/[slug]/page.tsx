import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { apiGetOrNull } from "@/lib/api";
import type { ArticleDetail } from "@/lib/types";
import { articleLd, breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { MarkdownLite } from "@/components/MarkdownLite";
import { BookCard } from "@/components/books/BookCard";

export const dynamic = "force-dynamic";

const getArticle = cache((slug: string) =>
  apiGetOrNull<ArticleDetail>(`/articles/${slug}`, { tags: [`article:${slug}`] })
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

      <article className="mx-auto max-w-3xl px-6 py-12 sm:px-8">
        <Link href="/blog" className="inline-flex items-center gap-1 font-body text-sm text-accent hover:underline">
          <ChevronLeft className="size-4" /> All articles
        </Link>

        {a.category && <p className="mt-6 font-data text-xs uppercase tracking-wide text-accent">{a.category}</p>}
        <h1 className="mt-2 font-display text-4xl leading-tight text-text sm:text-5xl">{a.title}</h1>
        <p className="mt-3 font-data text-sm text-muted">
          By {a.author || "PageTurn Editors"}
          {a.publishedAt ? ` · ${new Date(a.publishedAt).toLocaleDateString()}` : ""}
          {a.readingTime ? ` · ${a.readingTime} min read` : ""}
        </p>

        {a.coverImage?.secureUrl && (
          <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl border border-border bg-bg">
            <Image src={a.coverImage.secureUrl} alt={a.title} fill priority sizes="(max-width: 768px) 90vw, 768px" className="object-cover" />
          </div>
        )}

        {/* BLUF — the excerpt leads as an extractable summary */}
        {a.excerpt && <p className="mt-8 border-l-2 border-accent pl-4 font-body text-xl leading-relaxed text-text">{a.excerpt}</p>}

        <div className="mt-8">
          <MarkdownLite content={a.body} />
        </div>

        {a.tags && a.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {a.tags.map((t) => (
              <span key={t} className="rounded-full bg-bg px-3 py-1 font-data text-xs text-muted">#{t}</span>
            ))}
          </div>
        )}
      </article>

      {/* Related books — internal links into the catalogue (GEO funnel) */}
      {a.relatedBooks && a.relatedBooks.length > 0 && (
        <section className="mx-auto max-w-[1600px] px-6 pb-16 sm:px-8 lg:px-16 xl:px-24">
          <h2 className="font-display text-2xl text-text">Books from this guide</h2>
          <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {a.relatedBooks.map((b) => (
              <BookCard key={b.slug} book={b} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
