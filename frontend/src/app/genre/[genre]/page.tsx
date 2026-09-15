import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGet, apiGetOrNull, CACHE_TTL } from "@/lib/api";
import type { Genre, BookCardData, Paged, ArticleCard } from "@/lib/types";
import { itemListLd, breadcrumbLd, listingIndexing } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { BooksFilters } from "@/components/books/BooksFilters";
import { BooksToolbar } from "@/components/books/BooksToolbar";
import { BooksGrid } from "@/components/books/BooksGrid";
import { GuideLinks } from "@/components/blog/GuideLinks";

// Reads `searchParams`, so it renders per request — but its catalogue fetches
// are shared and cached. See the note in app/books/page.tsx.

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
  const page = Math.max(1, Number(sp.page) || 1);
  const base = genre.metaTitle || `Best ${genre.name} Books in Nepal`;
  return {
    title: page > 1 ? `${base} — page ${page}` : base,
    description: genre.metaDesc || `Buy ${genre.name} books online in Nepal with cash on delivery.`,
    ...listingIndexing(`/genre/${genre.slug}`, sp, FILTER_PARAMS),
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
  const [data, genres, guides, facets] = await Promise.all([
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
    apiGet<Genre[]>("/genres", { tags: ["genres"], revalidate: CACHE_TTL.genres }).catch(() => [] as Genre[]),
    // Guides relevant to this shelf, matched server-side through the books each
    // one recommends. This is the only inbound link most articles have other
    // than the blog index, and it gives the genre page the one thing a
    // catalogue listing otherwise lacks: writing of our own.
    apiGet<Paged<ArticleCard>>("/articles", {
      tags: ["articles", `genre:${genre.slug}`],
      revalidate: CACHE_TTL.articles,
      searchParams: { genre: genre.slug, limit: 3 },
    }).catch(() => null),
    apiGet<{ authors: string[]; publishers: string[] }>("/books/filters/metadata", { tags: ["books"], revalidate: CACHE_TTL.genres }).catch(() => ({
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

  // Only show an intro when there is genuinely one to show. `description` is
  // admin-editable and has historically held placeholders ("Test for fiction")
  // and empty strings; a length floor is a cheap way to keep those off a public
  // page without needing a separate "is this real" flag.
  const hasIntro = (genre.description ?? "").trim().length >= 60;

  return (
    <>
      <JsonLd
        data={[
          itemListLd(`Best ${genre.name} Books in Nepal`, items),
          breadcrumbLd([{ name: "Home", path: "/" }, { name: genre.name, path: `/genre/${genre.slug}` }]),
        ]}
      />

      <div className="shell py-10">
        <nav aria-label="Breadcrumb" className="font-data text-xs uppercase tracking-wide text-muted">
          <Link href="/" className="hover:text-accent">Home</Link>
          <span className="px-2">/</span>
          <span className="text-text">{genre.name}</span>
        </nav>

        {/* Genre masthead. The H1 carries "Books in Nepal" — the phrase the page
            is actually competing for, and the same wording the taxonomy already
            uses for metaTitle. "Best <Genre> Books in Nepal" would read as
            keyword stuffing at display size; this doesn't.

            The intro is back, but on a condition: the old blurb was dropped
            because it was one sentence with a word swapped on every genre, and
            because the field then filled up with placeholders ("Test for
            fiction"). It renders only when there is real copy behind it, so a
            half-written genre shows nothing rather than something embarrassing.
            Without it these pages were an H1 and a product grid — thin, on the
            exact URLs meant to rank for "{genre} books in nepal". */}
        <header className="mt-4 border-l-2 border-accent bg-surface py-7 pl-6 pr-6 sm:py-9 sm:pl-9">
          {/* No count here — the toolbar directly below already reports how many
              books are showing, and it tracks the active filters. */}
          <h1 className="max-w-4xl font-display text-4xl leading-[1.12] text-text sm:text-5xl lg:text-[3.25rem]">
            {genre.name} Books in Nepal
          </h1>

          {hasIntro && (
            <p className="mt-5 max-w-3xl font-body leading-relaxed text-text">{genre.description}</p>
          )}

          {/* Kept: unlike the generic blurb, a curator note is written per genre
              and only renders where someone actually wrote one. */}
          {genre.curatorNote && (
            <p className="mt-5 max-w-3xl font-body italic leading-relaxed text-text">
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
                We couldn&apos;t reach the catalogue. Make sure the API is running, then refresh.
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

            {/* Below the grid on purpose. The shelf is what the visitor came
                for; the guides are what they read next, and what gives this URL
                something to say that a product listing cannot. Only renders on
                the unfiltered first page — a narrowed slice is a different
                intent, and these links would just be noise under it. */}
            {!urlQuery && (
              <GuideLinks
                className="mt-14"
                heading={`Reading guides for ${genre.name.toLowerCase()}`}
                intro="Written by us, not scraped — what to read first, which edition to buy, and what it costs in Nepal."
                articles={guides?.items ?? []}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
