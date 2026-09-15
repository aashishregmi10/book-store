import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGet } from "@/lib/api";
import type { BookCardData, Paged } from "@/lib/types";
import { itemListLd, breadcrumbLd, listingIndexing } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { BooksFilters } from "@/components/books/BooksFilters";
import { BooksGrid } from "@/components/books/BooksGrid";

// Reads `searchParams`, so it renders per request — but its catalogue fetches
// are shared and cached. See the note in app/books/page.tsx.

// Filters relevant to a fixed section page (genre is excluded — the section IS
// the silo; author/publisher omitted to keep it focused).
// Kept in step with the sibling lists in /books and /genre. This one used to be
// narrower, so an `?author=` on a section URL was neither applied as a filter
// nor kept out of the index — a crawlable, near-duplicate view of the section.
const FILTER_KEYS = [
  "language", "format", "year", "minPrice", "maxPrice", "minRating", "sort", "page",
  "author", "publisher", "q",
] as const;

// The browse sections (separate from the literary genre silo). Slugs match the
// backend Book.category enum.
const SECTIONS = {
  manga: {
    name: "Manga",
    heading: "Manga in Nepal",
    blurb:
      "Browse manga delivered across Nepal: shonen, shojo, seinen and more, in English and translated editions, at NPR prices with cash on delivery to all seven provinces.",
  },
  kids: {
    name: "Kids' Books",
    heading: "Children's Books in Nepal",
    blurb:
      "Picture books, early readers, and story collections for young readers across Nepal, handpicked, with NPR pricing and cash on delivery nationwide.",
  },
  loksewa: {
    name: "Loksewa Preparation",
    heading: "Loksewa Preparation Books in Nepal",
    blurb:
      "Guides, model sets, and reference books for Nepal's Loksewa (Public Service Commission) exams: current syllabus titles delivered nationwide with cash on delivery.",
  },
} as const;

type Slug = keyof typeof SECTIONS;
const isSection = (s: string): s is Slug => s in SECTIONS;

type SP = Record<string, string | undefined>;

// Most-sold-first by default (real Daraz demand data backs soldCount), not
// "newest" — a category shelf should lead with what actually sells.
const DEFAULT_SORT = "popular";

async function getBooks(slug: Slug, sp: SP) {
  return apiGet<Paged<BookCardData>>("/books", {
    tags: ["books"],
    searchParams: {
      category: slug,
      sort: sp.sort || DEFAULT_SORT,
      page: sp.page,
      language: sp.language,
      format: sp.format,
      year: sp.year,
      minPrice: sp.minPrice,
      maxPrice: sp.maxPrice,
      minRating: sp.minRating,
      limit: 25,
    },
  }).catch(() => null);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const { category } = await params;
  if (!isSection(category)) return { title: "Section not found" };
  const sp = await searchParams;
  const s = SECTIONS[category];
  const page = Math.max(1, Number(sp.page) || 1);
  const indexing = listingIndexing(`/category/${category}`, sp, FILTER_KEYS);

  // A section with nothing on it is a soft 404: the page answers 200 with a
  // heading, a blurb and no books, which is exactly what Google treats as a
  // thin or empty result. /category/loksewa sat like that for weeks while being
  // linked from the footer of every page on the site.
  //
  // Checked live rather than hardcoded, because a section empties out on its own
  // — the last Manga title selling through would do it — and nobody would think
  // to come back and edit this file.
  const stocked = await getBooks(category, { ...sp, page: undefined });
  if ((stocked?.total ?? 0) === 0) {
    return {
      title: `${s.heading} | Buy Online`,
      description: s.blurb,
      ...indexing,
      robots: { index: false, follow: true },
    };
  }

  return {
    title: page > 1 ? `${s.heading} — page ${page} | Buy Online` : `${s.heading} | Buy Online`,
    description: s.blurb,
    ...indexing,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<SP>;
}) {
  const { category } = await params;
  if (!isSection(category)) notFound();
  const sp = await searchParams;
  const sort = sp.sort || DEFAULT_SORT;
  const page = Number(sp.page) || 1;

  const data = await getBooks(category, sp);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const s = SECTIONS[category];

  // Params the client re-sends to GET /books when loading more (no page) —
  // include the resolved default sort so page 2+ stays in the same order as
  // page 1 instead of silently reverting to the API's own default.
  const apiParams: Record<string, string> = { category, sort };
  for (const [k, v] of Object.entries({
    language: sp.language, format: sp.format, year: sp.year,
    minPrice: sp.minPrice, maxPrice: sp.maxPrice, minRating: sp.minRating,
  })) if (v) apiParams[k] = v;
  // Address-bar query (for the crawlable "load more" href), minus page.
  const urlQuery = Object.entries(sp)
    .filter(([k, v]) => v && k !== "page")
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");

  return (
    <>
      <JsonLd
        data={[
          itemListLd(`Best ${s.name} Books in Nepal`, items),
          breadcrumbLd([{ name: "Home", path: "/" }, { name: s.name, path: `/category/${category}` }]),
        ]}
      />

      <div className="shell py-10">
        <nav aria-label="Breadcrumb" className="font-data text-xs uppercase tracking-wide text-muted">
          <Link href="/" className="hover:text-accent">Home</Link>
          <span className="px-2">/</span>
          <span className="text-text">{s.name}</span>
        </nav>

        <h1 className="mt-4 font-display text-4xl text-text sm:text-5xl">{s.heading}</h1>
        {/* BLUF — extractable definition */}
        <p className="mt-4 max-w-3xl font-body text-lg leading-relaxed text-muted">{s.blurb}</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_1fr]">
          {/* Section-relevant filters (no Genre — the section is the silo) */}
          <BooksFilters genres={[]} hideGenre />

          <div className="min-w-0">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <p className="font-data text-xs uppercase tracking-wide text-muted">{total} books</p>
              <SortLinks slug={category} active={sort} sp={sp} />
            </div>

            {items.length === 0 ? (
              <p className="py-16 text-center font-body text-muted">Nothing on this shelf matches. Try removing a filter.</p>
            ) : (
              <BooksGrid
                key={`${category}-${urlQuery}`}
                initialItems={items}
                initialPage={page}
                pages={pages}
                total={total}
                apiParams={apiParams}
                path={`/category/${category}`}
                urlQuery={urlQuery}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SortLinks({ slug, active, sp }: { slug: string; active?: string; sp: SP }) {
  const opts = [
    ["popular", "Popular"],
    ["newest", "Newest"],
    ["price-low", "Price ↑"],
    ["price-high", "Price ↓"],
  ];
  const hrefFor = (value: string) => {
    const qp = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "sort" && k !== "page") qp.set(k, v);
    qp.set("sort", value);
    return `/category/${slug}?${qp.toString()}`;
  };
  return (
    <div className="flex gap-3">
      {opts.map(([value, label]) => (
        <Link
          key={value}
          href={hrefFor(value)}
          className={`font-data text-xs uppercase tracking-wide ${active === value ? "text-accent" : "text-muted hover:text-accent"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
