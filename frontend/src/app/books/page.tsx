import Link from "next/link";
import type { Metadata } from "next";
import { apiGet } from "@/lib/api";
import type { BookCardData, Genre, Paged } from "@/lib/types";
import { BooksFilters } from "@/components/books/BooksFilters";
import { BooksToolbar } from "@/components/books/BooksToolbar";
import { BooksGrid } from "@/components/books/BooksGrid";
import { CategoryChips } from "@/components/books/CategoryChips";

export const dynamic = "force-dynamic";

// Most-sold-first by default (real Daraz demand data backs soldCount), not
// "newest" — matches the category pages' default.
const DEFAULT_SORT = "popular";

const FILTER_PARAMS = [
  "q", "genre", "language", "format", "year", "page", "sort",
  "minPrice", "maxPrice", "minRating", "condition", "author", "publisher",
];

// Filtered/sorted/paged catalogue views are consolidated to the clean /books
// canonical and kept out of the index (links stay followable) to avoid thin,
// near-duplicate pages eating crawl budget.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = FILTER_PARAMS.some((k) => sp[k]);
  return {
    title: sp.q ? `Search: ${sp.q}` : "All Books",
    description: "Browse every title at PageTurn Nepal — NPR prices, cash on delivery across all seven provinces.",
    alternates: { canonical: "/books" },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const sort = sp.sort || DEFAULT_SORT;
  const [data, genres, meta] = await Promise.all([
    apiGet<Paged<BookCardData>>("/books", {
      tags: ["books"],
      searchParams: {
        q: sp.q,
        search: sp.q,
        sort,
        genre: sp.genre,
        language: sp.language,
        format: sp.format,
        year: sp.year,
        minPrice: sp.minPrice,
        maxPrice: sp.maxPrice,
        minRating: sp.minRating,
        condition: sp.condition,
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

  const page = data?.page ?? 1;
  const pages = data?.pages ?? 1;

  // Params the client re-sends to GET /books when loading more (no page) —
  // include the resolved default sort so page 2+ stays in the same order as
  // page 1 instead of silently reverting to the API's own default.
  const apiParams: Record<string, string> = { sort };
  for (const [k, v] of Object.entries({
    search: sp.q, genre: sp.genre, language: sp.language, format: sp.format,
    year: sp.year, minPrice: sp.minPrice, maxPrice: sp.maxPrice, minRating: sp.minRating,
    condition: sp.condition, author: sp.author, publisher: sp.publisher,
  })) if (v) apiParams[k] = v;
  // Address-bar query (for the crawlable "load more" href), minus page.
  const urlQuery = Object.entries(sp)
    .filter(([k, v]) => v && k !== "page")
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-10 sm:px-8 lg:px-16 xl:px-24">
      {/* Quick genre chips — mobile-first browse without opening the filter panel */}
      <CategoryChips genres={genres.map((g) => ({ slug: g.slug, name: g.name }))} className="mb-5 lg:hidden" />

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <BooksFilters
          genres={genres.map((g) => ({ slug: g.slug, name: g.name }))}
          authors={meta.authors}
          publishers={meta.publishers}
        />

        <div className="min-w-0">
          <BooksToolbar genres={genres.map((g) => ({ slug: g.slug, name: g.name }))} total={data?.total ?? 0} />

          {!data ? (
            <p className="py-20 text-center font-body text-muted">
              We couldn&apos;t reach the catalogue — make sure the API is running, then refresh.
            </p>
          ) : data.items.length === 0 ? (
            <div className="py-20 text-center">
              <p className="font-display text-2xl text-text">No matches on this shelf.</p>
              <p className="mt-2 font-body text-muted">Try removing a filter or searching for something else.</p>
              <Link href="/books" className="mt-5 inline-block rounded-full bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">
                Reset filters
              </Link>
            </div>
          ) : (
            <BooksGrid
              key={urlQuery}
              initialItems={data.items}
              initialPage={page}
              pages={pages}
              total={data.total}
              apiParams={apiParams}
              path="/books"
              urlQuery={urlQuery}
            />
          )}
        </div>
      </div>
    </div>
  );
}

