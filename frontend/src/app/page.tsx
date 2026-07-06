import Link from "next/link";
import {
  Sparkles,
  Baby,
  Landmark,
  UserRound,
  TrendingUp,
  Ghost,
  Scale,
  GraduationCap,
  BookOpen,
  Gamepad2,
  LayoutGrid,
  Feather,
  Brain,
  PenTool,
  Megaphone,
  Compass,
  Flower2,
  Target,
  type LucideIcon,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import type { BookCardData, Genre, Paged } from "@/lib/types";
import { BookRail } from "@/components/books/BookRail";
import { HeroCovers } from "@/components/home/HeroCovers";
import { CategoryCircles } from "@/components/home/CategoryCircles";

// Fixed browse sections (separate from the genre silo).
const FIXED_CATEGORIES = [
  { name: "Manga", href: "/category/manga", filter: { category: "manga" }, icon: Sparkles },
  { name: "Kids", href: "/category/kids", filter: { category: "kids" }, icon: Baby },
  { name: "Loksewa", href: "/category/loksewa", filter: { category: "loksewa" }, icon: Landmark },
];

// Icon per genre slug — BookOpen is the fallback for any genre added later
// without a dedicated icon here.
const GENRE_ICONS: Record<string, LucideIcon> = {
  biography: UserRound,
  business: TrendingUp,
  educational: GraduationCap,
  fiction: BookOpen,
  games: Gamepad2,
  general: LayoutGrid,
  horror: Ghost,
  law: Scale,
  "nepali-literature": Feather,
  philosophy: Brain,
  poetry: PenTool,
  politics: Megaphone,
  "self-help": Compass,
  spirituality: Flower2,
  strategy: Target,
};

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

// Every genre gets a circle too (not just a hand-picked few), so new genres
// show up here automatically instead of needing this page edited each time.
async function getQuickBrowseCovers() {
  const genres = await apiGet<Genre[]>("/genres", { tags: ["genres"] }).catch(() => [] as Genre[]);

  const items = [
    ...FIXED_CATEGORIES,
    ...genres.map((g) => ({
      name: g.name,
      href: `/genre/${g.slug}`,
      filter: { genre: g.slug },
      icon: GENRE_ICONS[g.slug] ?? BookOpen,
    })),
  ].map((item) => ({ ...item, bg: "color-mix(in srgb, var(--color-accent) 12%, white)", fg: "var(--color-accent)" }));

  const results = await Promise.all(
    items.map((item) =>
      apiGet<Paged<BookCardData>>("/books", {
        tags: ["books"],
        searchParams: { ...item.filter, sort: "popular", limit: 1 },
      }).catch(() => null)
    )
  );
  return items.map((item, i) => ({ ...item, cover: results[i]?.items[0]?.coverImage?.secureUrl }));
}

export default async function HomePage() {
  const [data, quickBrowse] = await Promise.all([getFeatured(), getQuickBrowseCovers()]);

  return (
    <>
      {/* Asymmetric, typography-led hero — NOT centered-with-one-CTA */}
      <section className="rounded-b-3xl bg-bg">
        <div className="mx-auto grid max-w-[1600px] items-center gap-8 px-6 py-10 sm:px-8 lg:px-16 xl:px-24 md:grid-cols-12 md:py-14">
          <div className="md:col-span-7">
            <h1 className="font-display text-4xl leading-[1.1] text-text sm:text-5xl md:text-6xl">
              Books worth reading,
              <br />
              delivered across Nepal.
            </h1>
            <p className="mt-4 max-w-md font-body text-base leading-relaxed text-muted">
              Handpicked titles, honest prices, cash on delivery to all seven provinces.
            </p>
            <div className="mt-7">
              <Link
                href="/books"
                className="inline-flex items-center gap-2 bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white transition-colors hover:bg-accent-hover"
              >
                Shop now →
              </Link>
            </div>
          </div>

          {/* Real covers from the catalogue, not a stock photo — shown on every
              breakpoint (mobile stacks below the text; md+ sits beside it). */}
          <div className="mt-2 md:col-span-5 md:mt-0">
            <HeroCovers books={data?.bestsellers ?? []} />
          </div>
        </div>
      </section>

      {/* Explore popular categories — photo-forward quick browse (real covers,
          icon fallback), one circle per genre plus the 3 fixed categories. */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1600px] px-6 py-5 sm:px-8 lg:px-16 xl:px-24">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-2xl text-text">Explore popular categories</h2>
            <Link
              href="/books"
              className="font-data text-xs uppercase tracking-wide text-accent hover:underline"
            >
              See all →
            </Link>
          </div>
          <CategoryCircles items={quickBrowse} />
        </div>
      </section>

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
