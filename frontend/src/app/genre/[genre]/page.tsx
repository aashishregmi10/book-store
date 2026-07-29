import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGetOrNull } from "@/lib/api";
import type { Genre, BookCardData, Paged } from "@/lib/types";
import { itemListLd, breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { BooksGrid } from "@/components/books/BooksGrid";

export const dynamic = "force-dynamic";

interface GenreResponse extends Paged<BookCardData> {
  genre: Genre;
}

const getGenre = cache((slug: string, sort?: string) =>
  apiGetOrNull<GenreResponse>(`/genres/${slug}`, { tags: [`genre:${slug}`], searchParams: { sort } })
);

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ genre: string }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
}): Promise<Metadata> {
  const { genre: slug } = await params;
  const sp = await searchParams;
  const data = await getGenre(slug);
  if (!data) return { title: "Genre not found" };
  const { genre } = data;
  const filtered = !!(sp.sort || sp.page);
  return {
    title: genre.metaTitle || `Best ${genre.name} Books in Nepal`,
    description: genre.metaDesc || `Buy ${genre.name} books online in Nepal with cash on delivery.`,
    alternates: { canonical: `/genre/${genre.slug}` },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function GenrePage({
  params,
  searchParams,
}: {
  params: Promise<{ genre: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { genre: slug } = await params;
  const { sort } = await searchParams;
  const data = await getGenre(slug, sort);
  if (!data) notFound();

  const { genre, items, total, page, pages } = data;
  const apiParams: Record<string, string> = { genre: genre.slug };
  if (sort) apiParams.sort = sort;
  const urlQuery = sort ? `sort=${encodeURIComponent(sort)}` : "";

  return (
    <>
      <JsonLd
        data={[
          itemListLd(genre, items),
          breadcrumbLd([{ name: "Home", path: "/" }, { name: genre.name, path: `/genre/${genre.slug}` }]),
        ]}
      />

      <div className="mx-auto max-w-[1600px] px-6 py-10 sm:px-8 lg:px-16 xl:px-24">
        <nav aria-label="Breadcrumb" className="font-data text-xs uppercase tracking-wide text-muted">
          <Link href="/" className="hover:text-accent">Home</Link>
          <span className="px-2">/</span>
          <span className="text-text">{genre.name}</span>
        </nav>

        <h1 className="mt-4 font-display text-4xl text-text sm:text-5xl">Best {genre.name} Books in Nepal</h1>
        {/* BLUF — extractable 40–80 word definition */}
        <p className="mt-4 max-w-3xl font-body text-lg leading-relaxed text-muted">
          {genre.description ||
            `Books Temple Nepal stocks the top-rated ${genre.name.toLowerCase()} titles available across Nepal, with NPR pricing and cash on delivery to all seven provinces.`}
        </p>

        {genre.curatorNote && (
          <p className="mt-4 max-w-3xl border-l-2 border-accent pl-4 font-body italic leading-relaxed text-text">
            {genre.curatorNote}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between border-b border-border pb-3">
          <p className="font-data text-xs uppercase tracking-wide text-muted">{total} books</p>
          <SortLinks slug={genre.slug} active={sort} />
        </div>

        {items.length === 0 ? (
          <p className="py-16 text-center font-body text-muted">Nothing on this shelf yet — check back soon.</p>
        ) : (
          <BooksGrid
            key={`${genre.slug}-${urlQuery}`}
            initialItems={items}
            initialPage={page}
            pages={pages}
            total={total}
            apiParams={apiParams}
            path={`/genre/${genre.slug}`}
            urlQuery={urlQuery}
          />
        )}
      </div>
    </>
  );
}

function SortLinks({ slug, active }: { slug: string; active?: string }) {
  const opts = [
    ["popular", "Popular"],
    ["newest", "Newest"],
    ["price-low", "Price ↑"],
    ["price-high", "Price ↓"],
  ];
  return (
    <div className="flex gap-3">
      {opts.map(([value, label]) => (
        <Link
          key={value}
          href={`/genre/${slug}?sort=${value}`}
          className={`font-data text-xs uppercase tracking-wide ${active === value ? "text-accent" : "text-muted hover:text-accent"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
