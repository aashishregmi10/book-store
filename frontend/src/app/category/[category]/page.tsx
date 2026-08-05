import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGet } from "@/lib/api";
import type { BookCardData, Genre, Paged } from "@/lib/types";
import { itemListLd, breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { BooksFilters } from "@/components/books/BooksFilters";
import { BooksGrid } from "@/components/books/BooksGrid";

// Reads `searchParams`, so it renders per request — but its catalogue fetches
// are shared and cached. See the note in app/books/page.tsx.

// Filters relevant to a fixed section page (genre is excluded — the section IS
// the silo; author/publisher omitted to keep it focused).
const FILTER_KEYS = ["language", "format", "year", "minPrice", "maxPrice", "minRating", "sort", "page"] as const;

// The browse sections (separate from the literary genre silo). Slugs match the
// backend Book.category enum.
const SECTIONS = {
  manga: {
    name: "Manga",
    heading: "Manga in Nepal",
    blurb:
      "Browse manga delivered across Nepal — shonen, shojo, seinen and more, in English and translated editions, at NPR prices with cash on delivery to all seven provinces.",
  },
  kids: {
    name: "Kids' Books",
    heading: "Children's Books in Nepal",
    blurb:
      "Picture books, early readers, and story collections for young readers across Nepal — handpicked, NPR pricing, and cash on delivery nationwide.",
  },
  loksewa: {
    name: "Loksewa Preparation",
    heading: "Loksewa Preparation Books in Nepal",
    blurb:
      "Guides, model sets, and reference books for Nepal's Loksewa (Public Service Commission) exams — current syllabus titles delivered nationwide with cash on delivery.",
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
  const filtered = FILTER_KEYS.some((k) => sp[k]);
  return {
    title: `${s.heading} | Buy Online`,
    description: s.blurb,
    alternates: { canonical: `/category/${category}` },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
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

  // itemListLd only reads `name`; pass a minimal section object.
  const listGenre = { name: s.name, slug: category } as unknown as Genre;

  return (
    <>
      <JsonLd
        data={[
          itemListLd(listGenre, items),
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
              <p className="py-16 text-center font-body text-muted">Nothing on this shelf matches — try removing a filter.</p>
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
