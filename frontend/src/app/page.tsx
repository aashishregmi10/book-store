import Link from "next/link";
import { Search, Truck, RotateCcw, Banknote } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { BookCardData, Genre } from "@/lib/types";
import { BookRail } from "@/components/books/BookRail";
import { HeroPhoto } from "@/components/home/HeroPhoto";

const SECTION_PILLS = [
  { name: "Manga", href: "/category/manga" },
  { name: "Kids", href: "/category/kids" },
  { name: "Loksewa", href: "/category/loksewa" },
];

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
  const [data, genres] = await Promise.all([
    getFeatured(),
    apiGet<Genre[]>("/genres", { tags: ["genres"] }).catch(() => [] as Genre[]),
  ]);

  const pills = [...SECTION_PILLS, ...genres.slice(0, 8).map((g) => ({ name: g.name, href: `/genre/${g.slug}` }))];

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
              A small, opinionated bookshop - handpicked titles, honest prices in NPR, and cash on
              delivery to all seven provinces. Same-day inside the Valley.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/books"
                className="bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white transition-colors hover:bg-accent-hover"
              >
                Browse the shelves
              </Link>
  
            </div>
          </div>

          {/* hero photograph (desktop) */}
          <div className="hidden md:col-span-5 md:block">
            <HeroPhoto />
          </div>
        </div>
      </section>

      {/* Prominent search (the header search is hidden on mobile) + category pills */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1600px] px-6 py-5 sm:px-8 lg:px-16 xl:px-24">
          <form action="/books" className="mx-auto flex max-w-2xl items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input
                name="q"
                type="search"
                aria-label="Search books"
                placeholder="Search by title, author, or ISBN"
                className="w-full rounded-l-full border border-border bg-bg py-3 pl-11 pr-4 font-body text-text outline-none placeholder:text-muted focus:border-accent"
              />
            </div>
            <button type="submit" className="rounded-r-full bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">
              Search
            </button>
          </form>

          {pills.length > 0 && (
            <div className="mx-auto mt-4 flex max-w-3xl gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:justify-center sm:overflow-visible">
              {pills.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className="shrink-0 whitespace-nowrap rounded-full border border-border px-4 py-1.5 font-data text-xs uppercase tracking-wide text-text transition-colors hover:border-accent hover:text-accent"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-3 px-6 py-4 sm:grid-cols-3 sm:px-8 lg:px-16 xl:px-24">
          <Trust icon={Banknote} title="Cash on Delivery" sub="Pay when it arrives — all 7 provinces" />
          <Trust icon={Truck} title="Free delivery over NPR 1,500" sub="Same-day inside the Valley" />
          <Trust icon={RotateCcw} title="7-day returns" sub="On unread books, no fuss" />
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

function Trust({ icon: Icon, title, sub }: { icon: typeof Truck; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-5 shrink-0 text-accent" />
      <div>
        <p className="font-data text-sm font-medium text-text">{title}</p>
        <p className="font-body text-xs text-muted">{sub}</p>
      </div>
    </div>
  );
}
