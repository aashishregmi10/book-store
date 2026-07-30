import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGet, apiGetOrNull } from "@/lib/api";
import type { Genre, BookCardData, Paged } from "@/lib/types";
import { itemListLd, breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { BooksFilters } from "@/components/books/BooksFilters";
import { BooksToolbar } from "@/components/books/BooksToolbar";
import { BooksGrid } from "@/components/books/BooksGrid";

export const dynamic = "force-dynamic";

interface GenreResponse extends Paged<BookCardData> {
  genre: Genre;
}

const DEFAULT_SORT = "popular";

// Every filter the sidebar can set. Presence of any of them makes the view a
// narrowed slice of the silo rather than the silo itself.
const FILTER_PARAMS = [
  "language", "format", "year", "page", "sort",
  "minPrice", "maxPrice", "minRating", "author", "publisher",
];

// The silo header (name, BLUF copy, curator note, meta) comes from the genre
// record; only page 1 of its books is needed, so keep the payload small.
const getGenre = cache((slug: string) =>
  apiGetOrNull<GenreResponse>(`/genres/${slug}`, { tags: [`genre:${slug}`], searchParams: { limit: "1" } })
);

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ genre: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const { genre: slug } = await params;
  const sp = await searchParams;
  const data = await getGenre(slug);
  if (!data) return { title: "Genre not found" };
  const { genre } = data;
  const filtered = FILTER_PARAMS.some((k) => sp[k]);
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
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { genre: slug } = await params;
  const sp = await searchParams;
  const sort = sp.sort || DEFAULT_SORT;

  const meta = await getGenre(slug);
  if (!meta) notFound();
  const { genre } = meta;

  // Books come from /books rather than /genres/:slug because that endpoint
  // already implements every facet the sidebar offers — and it is the same
  // endpoint BooksGrid pages against, so "load more" can't drift from page 1.
  const [data, genres, facets] = await Promise.all([
    apiGet<Paged<BookCardData>>("/books", {
      tags: ["books", `genre:${genre.slug}`],
      searchParams: {
        genre: genre.slug,
        sort,
        language: sp.language,
        format: sp.format,
        year: sp.year,
        minPrice: sp.minPrice,
        maxPrice: sp.maxPrice,
        minRating: sp.minRating,
        author: sp.author,
        publisher: sp.publisher,
        page: sp.page,
      },
    }).catch(() => null),
    apiGet<Genre[]>("/genres", { tags: ["genres"] }).catch(() => [] as Genre[]),
    apiGet<{ authors: string[]; publishers: string[] }>("/books/filters/metadata", { tags: ["books"] }).catch(() => ({
      authors: [],
      publishers: [],
    })),
  ]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const apiParams: Record<string, string> = { genre: genre.slug, sort };
  for (const [k, v] of Object.entries({
    language: sp.language, format: sp.format, year: sp.year,
    minPrice: sp.minPrice, maxPrice: sp.maxPrice, minRating: sp.minRating,
    author: sp.author, publisher: sp.publisher,
  })) if (v) apiParams[k] = v;

  const urlQuery = Object.entries(sp)
    .filter(([k, v]) => v && k !== "page")
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");

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

        {/* Genre masthead. The H1 has to stay literally "Best <Genre> Books in
            Nepal" for search, which is a mouthful to lead a page with — so it
            sits inside a proper header band with the shelf name as an eyebrow
            and the count beside it, rather than as a bare line of text. */}
        <header className="mt-4 border-l-2 border-accent bg-surface py-7 pl-6 pr-6 sm:py-9 sm:pl-9">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-data text-xs uppercase tracking-[0.22em] text-accent">
            {genre.name}
            <span aria-hidden className="text-border">|</span>
            {/* The shelf's own size, not the filtered result count — the toolbar
                below already reports that, and repeating it here would print the
                same number twice. */}
            <span className="text-muted">{genre.bookCount ?? total} on this shelf</span>
          </p>

          <h1 className="mt-3 max-w-4xl font-display text-4xl leading-[1.12] text-text sm:text-5xl lg:text-[3.25rem]">
            Best {genre.name} Books in Nepal
          </h1>

          {/* BLUF — extractable 40–80 word definition */}
          <p className="mt-5 max-w-3xl font-body text-lg leading-relaxed text-muted">
            {genre.description ||
              `Books Temple Nepal stocks the top-rated ${genre.name.toLowerCase()} titles available across Nepal, with NPR pricing and cash on delivery to all seven provinces.`}
          </p>

          {genre.curatorNote && (
            <p className="mt-5 max-w-3xl border-t border-border pt-5 font-body italic leading-relaxed text-text">
              {genre.curatorNote}
            </p>
          )}
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
          <BooksFilters
            genres={genres.map((g) => ({ slug: g.slug, name: g.name }))}
            authors={facets.authors}
            publishers={facets.publishers}
            currentGenre={genre.slug}
          />

          <div className="min-w-0">
            <BooksToolbar genres={genres.map((g) => ({ slug: g.slug, name: g.name }))} total={total} />

            {!data ? (
              <p className="py-20 text-center font-body text-muted">
                We couldn&apos;t reach the catalogue — make sure the API is running, then refresh.
              </p>
            ) : items.length === 0 ? (
              <div className="py-20 text-center">
                <p className="font-display text-2xl text-text">Nothing on this shelf matches.</p>
                <p className="mt-2 font-body text-muted">Try removing a filter, or browse the whole genre.</p>
                <Link
                  href={`/genre/${genre.slug}`}
                  className="mt-5 inline-block rounded-full bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover"
                >
                  Reset filters
                </Link>
              </div>
            ) : (
              <BooksGrid
                key={`${genre.slug}-${urlQuery}`}
                initialItems={items}
                initialPage={data.page}
                pages={data.pages}
                total={total}
                apiParams={apiParams}
                path={`/genre/${genre.slug}`}
                urlQuery={urlQuery}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
