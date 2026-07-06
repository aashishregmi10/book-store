import Link from "next/link";
import { Truck, Banknote, Package, Sparkles, Baby, Landmark, UserRound, TrendingUp, Ghost, Scale } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { BookCardData, Genre } from "@/lib/types";
import { BookRail } from "@/components/books/BookRail";
import { HeroCovers } from "@/components/home/HeroCovers";
import { CategoryCircles } from "@/components/home/CategoryCircles";

// Fixed browse sections (separate from the genre silo).
const SECTION_PILLS = [
  { name: "Manga", href: "/category/manga" },
  { name: "Kids", href: "/category/kids" },
  { name: "Loksewa", href: "/category/loksewa" },
];

// A curated quick-browse row above the exhaustive text pills — warm, editorial
// tints (never the generic blue/purple SaaS palette), icon colored a darker
// shade of the same hue as its circle for contrast.
const QUICK_BROWSE = [
  { name: "Manga", href: "/category/manga", icon: Sparkles, bg: "#F3DDD3", fg: "#B14B2C" },
  { name: "Kids", href: "/category/kids", icon: Baby, bg: "#F2E3C6", fg: "#93691B" },
  { name: "Loksewa", href: "/category/loksewa", icon: Landmark, bg: "#E1E6D6", fg: "#55672E" },
  { name: "Biography", href: "/genre/biography", icon: UserRound, bg: "#EDDCE0", fg: "#8B2E44" },
  { name: "Business", href: "/genre/business", icon: TrendingUp, bg: "#DCE8DE", fg: "#2D5A3D" },
  { name: "Horror", href: "/genre/horror", icon: Ghost, bg: "#1C1C1C", fg: "#FAF7F2" },
  { name: "Law", href: "/genre/law", icon: Scale, bg: "#E8DFD3", fg: "#6B5136" },
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

  const pills = [...SECTION_PILLS, ...genres.slice(0, 10).map((g) => ({ name: g.name, href: `/genre/${g.slug}` }))];

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
              <Link
                href="/genre/nepali-literature"
                className="border border-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-accent transition-colors hover:bg-accent hover:text-white"
              >
                Nepali Literature
              </Link>
            </div>
          </div>

          {/* Real covers from the catalogue, not a stock photo — shown on every
              breakpoint (mobile stacks below the text; md+ sits beside it). */}
          <div className="mt-8 md:col-span-5 md:mt-0">
            <HeroCovers books={data?.bestsellers ?? []} />
          </div>
        </div>
      </section>

      {/* Trust strip — a single compact row at every breakpoint (was 3 stacked
          rows on mobile), so it doesn't eat scroll distance before the books. */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1600px] px-6 py-3 sm:px-8 lg:px-16 xl:px-24">
          <div className="flex gap-5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible [&::-webkit-scrollbar]:hidden">
            <Trust icon={Banknote} title="Cash on Delivery" sub="Pay when it arrives — all 7 provinces" />
            <Trust icon={Truck} title="Free delivery over NPR 1,500" sub="Same-day inside the Valley" />
            <Trust icon={Package} title="Carefully packed & delivered" sub="Wrapped well and shipped safely" />
          </div>
        </div>
      </section>

      {/* Explore popular categories — icon-forward quick browse, above the
          exhaustive text pills row (kept unchanged below for the long tail). */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1600px] px-6 py-6 sm:px-8 lg:px-16 xl:px-24">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="font-display text-2xl text-text">Explore popular categories</h2>
            <Link
              href="/books"
              className="font-data text-xs uppercase tracking-wide text-accent hover:underline"
            >
              See all →
            </Link>
          </div>
          <CategoryCircles items={QUICK_BROWSE} />
        </div>
      </section>

      {/* Genre pills — quick browse by section/genre */}
      {pills.length > 0 && (
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-[1600px] px-6 py-4 sm:px-8 lg:px-16 xl:px-24">
            <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:justify-center sm:overflow-visible">
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
          </div>
        </section>
      )}

      {data && (data.bestsellers.length || data.newArrivals.length || data.featured.length) ? (
        <>
          <BookRail title="Bestsellers" books={data.bestsellers} href="/books?sort=popular" />
          <BookRail title="New arrivals" books={data.newArrivals} href="/books?sort=newest" />
          <BookRail title="Staff favourites" books={data.featured} href="/books" />
        </>
      ) : (
        <section className="mx-auto max-w-[1600px] px-6 py-20 text-center sm:px-8 lg:px-16 xl:px-24">
          <h2 className="font-display text-2xl text-text">The shelves are being restocked.</h2>
          <p className="mt-3 font-body text-muted">
            Nothing to show here just yet — give it a moment, or{" "}
            <Link href="/books" className="text-accent underline-offset-4 hover:underline">browse all books</Link>.
          </p>
        </section>
      )}
    </>
  );
}

function Trust({ icon: Icon, title, sub }: { icon: typeof Truck; title: string; sub: string }) {
  return (
    <div className="flex shrink-0 items-center gap-3 whitespace-nowrap sm:whitespace-normal">
      <Icon className="size-5 shrink-0 text-accent" />
      <div>
        <p className="font-data text-sm font-medium text-text">{title}</p>
        <p className="font-body text-xs text-muted">{sub}</p>
      </div>
    </div>
  );
}
