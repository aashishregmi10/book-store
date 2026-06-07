import Link from "next/link";
import { apiGet } from "@/lib/api";
import type { BookCardData } from "@/lib/types";
import { BookRail } from "@/components/books/BookRail";
import { HeroPhoto } from "@/components/home/HeroPhoto";

// Request-time render: the storefront reads live catalog data from the API.
export const dynamic = "force-dynamic";

interface Featured {
  featured: BookCardData[];
  bestsellers: BookCardData[];
  newArrivals: BookCardData[];
}

async function getFeatured(): Promise<Featured | null> {
  try {
    return await apiGet<Featured>("/books/featured/books", { tags: ["books"] });
  } catch {
    return null; // API unreachable — render the hero + a gentle notice
  }
}

export default async function HomePage() {
  const data = await getFeatured();

  return (
    <>
      {/* Asymmetric, typography-led hero — NOT centered-with-one-CTA */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-[1600px] items-center gap-8 px-6 py-8 sm:px-8 lg:px-16 xl:px-24 md:grid-cols-12 md:py-12">
          <div className="md:col-span-7">
            <p className="label-smallcaps font-data text-xs">Kathmandu · est. 2026</p>
            <h1 className="mt-3 font-display text-5xl leading-[1.05] text-text sm:text-6xl md:text-7xl">
              Books worth reading,
              <br />
              <span className="text-accent">delivered across Nepal.</span>
            </h1>
            <p className="mt-6 max-w-xl font-body text-lg leading-relaxed text-muted">
              A small, opinionated bookshop — handpicked titles, honest prices in NPR, and cash on
              delivery to all seven provinces. Same-day inside the Valley.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/books"
                className="bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white transition-colors hover:bg-accent-hover"
              >
                Browse the shelves
              </Link>
              <Link href="/genre/nepali-literature" className="font-data text-sm uppercase tracking-wide text-text underline-offset-4 hover:text-accent hover:underline">
                Nepali literature →
              </Link>
            </div>
          </div>

          {/* hero photograph (desktop) */}
          <div className="hidden md:col-span-5 md:block">
            <HeroPhoto />
          </div>
        </div>
      </section>

      {data ? (
        <>
          <BookRail title="Bestsellers" books={data.bestsellers} href="/books?sort=popular" />
          <BookRail title="New arrivals" books={data.newArrivals} href="/books?sort=newest" />
          <BookRail title="Staff favourites" books={data.featured} href="/books" />
        </>
      ) : (
        <section className="mx-auto max-w-[1600px] px-6 py-20 text-center sm:px-8 lg:px-16 xl:px-24">
          <h2 className="font-display text-2xl text-text">The shelves are being restocked.</h2>
          <p className="mt-3 font-body text-muted">
            We couldn’t reach the catalogue just now — give it a moment, or{" "}
            <Link href="/books" className="text-accent underline-offset-4 hover:underline">browse all books</Link>.
          </p>
        </section>
      )}
    </>
  );
}
