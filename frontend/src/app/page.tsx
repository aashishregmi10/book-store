import Link from "next/link";
import Image from "next/image";
import {
  UserRound,
  TrendingUp,
  Ghost,
  GraduationCap,
  BookOpen,
  Feather,
  Brain,
  PenTool,
  Megaphone,
  Compass,
  Flower2,
  Baby,
  Heart,
  Sparkles,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import type { BookCardData, Genre, Paged } from "@/lib/types";
import { BookRail } from "@/components/books/BookRail";
import { CategoryCircles } from "@/components/home/CategoryCircles";

// Icon per genre slug — BookOpen is the fallback for any genre added later
// without a dedicated icon here.
const GENRE_ICONS: Record<string, LucideIcon> = {
  "biography-memoir": UserRound,
  "business-economics": TrendingUp,
  childrens: Baby,
  fiction: BookOpen,
  "mystery-thriller": Ghost,
  "nepali-literature": Feather,
  philosophy: Brain,
  poetry: PenTool,
  "politics-society": Megaphone,
  psychology: Brain,
  romance: Heart,
  "sci-fi-fantasy": Sparkles,
  "science-technology": FlaskConical,
  "self-help": Compass,
  "spirituality-religion": Flower2,
  "young-adult": GraduationCap,
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

// Every genre gets a circle (not just a hand-picked few), so new genres show
// up here automatically instead of needing this page edited each time. The row
// is genres only — the fixed Manga/Kids/Loksewa sections still have their own
// /category pages, they just don't take the first three slots here any more.
async function getQuickBrowseCovers() {
  const genres = await apiGet<Genre[]>("/genres", { tags: ["genres"] }).catch(() => [] as Genre[]);

  const items = genres
    .map((g) => ({
      name: g.name,
      href: `/genre/${g.slug}`,
      filter: { genre: g.slug },
      icon: GENRE_ICONS[g.slug] ?? BookOpen,
    }))
    .map((item) => ({ ...item, bg: "color-mix(in srgb, var(--color-accent) 12%, white)", fg: "var(--color-accent)" }));

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
      {/* Asymmetric, typography-led hero — NOT centered-with-one-CTA.
          Full-bleed bookshelf photo with a scrim for text contrast, rather
          than the flat --bg fill + floating cover cards this replaced. */}
      <section className="relative overflow-hidden">
        <Image
          src="/hero-books.jpg"
          alt="Rows of books on a library shelf"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        {/* Mobile gets a flat dark scrim: the headline runs the full width on a
            narrow screen, so a left-to-right fade would leave its right half
            sitting on the pale end of the gradient and unreadable. From md up
            the text is confined to the left column, so the directional fade is
            safe and keeps the shelf visible. */}
        <div className="absolute inset-0 bg-text/75 md:bg-gradient-to-r md:from-text/85 md:via-text/60 md:to-text/25" />

        <div className="relative mx-auto max-w-[1600px] px-6 py-16 sm:px-8 lg:px-16 xl:px-24 md:py-24">
          <div className="max-w-xl">
            <h1 className="font-display text-4xl leading-[1.1] text-white sm:text-5xl md:text-6xl">
              Books worth reading,
              <br />
              delivered across Nepal.
            </h1>
            <p className="mt-4 max-w-md font-body text-base leading-relaxed text-white/80">
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
