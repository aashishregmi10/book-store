import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGet } from "@/lib/api";
import type { BookCardData, Genre, Paged } from "@/lib/types";
import { itemListLd, breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { BookCard } from "@/components/books/BookCard";

export const dynamic = "force-dynamic";

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

async function getBooks(slug: Slug, sort?: string) {
  return apiGet<Paged<BookCardData>>("/books", {
    tags: ["books"],
    searchParams: { category: slug, sort, limit: 24 },
  }).catch(() => null);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  if (!isSection(category)) return { title: "Section not found" };
  const sp = await searchParams;
  const s = SECTIONS[category];
  const filtered = !!(sp.sort || sp.page);
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
  searchParams: Promise<{ sort?: string }>;
}) {
  const { category } = await params;
  if (!isSection(category)) notFound();
  const { sort } = await searchParams;

  const data = await getBooks(category, sort);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const s = SECTIONS[category];

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

      <div className="mx-auto max-w-[1600px] px-6 py-10 sm:px-8 lg:px-16 xl:px-24">
        <nav aria-label="Breadcrumb" className="font-data text-xs uppercase tracking-wide text-muted">
          <Link href="/" className="hover:text-accent">Home</Link>
          <span className="px-2">/</span>
          <span className="text-text">{s.name}</span>
        </nav>

        <h1 className="mt-4 font-display text-4xl text-text sm:text-5xl">{s.heading}</h1>
        {/* BLUF — extractable definition */}
        <p className="mt-4 max-w-3xl font-body text-lg leading-relaxed text-muted">{s.blurb}</p>

        <div className="mt-6 flex items-center justify-between border-b border-border pb-3">
          <p className="font-data text-xs uppercase tracking-wide text-muted">{total} books</p>
          <SortLinks slug={category} active={sort} />
        </div>

        {items.length === 0 ? (
          <p className="py-16 text-center font-body text-muted">Nothing on this shelf yet — check back soon.</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((b) => (
              <BookCard key={b.slug} book={b} />
            ))}
          </div>
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
          href={`/category/${slug}?sort=${value}`}
          className={`font-data text-xs uppercase tracking-wide ${active === value ? "text-accent" : "text-muted hover:text-accent"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
