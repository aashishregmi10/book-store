import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGetOrNull } from "@/lib/api";
import type { Genre, BookCardData, Paged } from "@/lib/types";
import { itemListLd, breadcrumbLd, faqLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { BookCard } from "@/components/books/BookCard";

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

  const { genre, items, total } = data;

  const faqs = [
    {
      q: `How long does delivery take for ${genre.name.toLowerCase()} books in Nepal?`,
      a: "We deliver within Kathmandu Valley in 1–2 days and to the rest of Nepal in 3–5 business days, with cash on delivery available everywhere.",
    },
    {
      q: `Can I pay cash on delivery for ${genre.name.toLowerCase()} books?`,
      a: "Yes. Cash on delivery is available across all seven provinces — you pay when your order arrives.",
    },
  ];

  return (
    <>
      <JsonLd
        data={[
          itemListLd(genre, items),
          breadcrumbLd([{ name: "Home", path: "/" }, { name: genre.name, path: `/genre/${genre.slug}` }]),
          faqLd(faqs),
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
            `PageTurn Nepal stocks the top-rated ${genre.name.toLowerCase()} titles available across Nepal, with NPR pricing and cash on delivery to all seven provinces.`}
        </p>

        <div className="mt-6 flex items-center justify-between border-b border-border pb-3">
          <p className="font-data text-xs uppercase tracking-wide text-muted">{total} books</p>
          <SortLinks slug={genre.slug} active={sort} />
        </div>

        {items.length === 0 ? (
          <p className="py-16 text-center font-body text-muted">Nothing on this shelf yet — check back soon.</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((b) => (
              <BookCard key={b.slug} book={b} />
            ))}
          </div>
        )}

        {/* Visible FAQ mirrors the FAQPage schema */}
        <section className="mt-16 max-w-3xl">
          <h2 className="font-display text-2xl text-text">Frequently asked</h2>
          <dl className="mt-4 space-y-5">
            {faqs.map((f) => (
              <div key={f.q}>
                <dt className="font-display text-lg text-text">{f.q}</dt>
                <dd className="mt-1 font-body text-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
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
