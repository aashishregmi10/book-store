import Link from "next/link";
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
import { apiGet, CACHE_TTL } from "@/lib/api";
import { itemListLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import type { BookCardData, Genre } from "@/lib/types";
import { BookShelf } from "@/components/books/BookShelf";
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

/**
 * ISR: the homepage is the same for everyone, so it is prerendered and served
 * from cache, then refreshed in the background every 5 minutes. It used to be
 * `force-dynamic`, which re-ran every API call on every visit — including on a
 * plain logo click back from a genre page — and made the skeleton the first
 * thing anyone saw.
 */
export const revalidate = 300;

interface Featured {
  featured: BookCardData[];
  bestsellers: BookCardData[];
  newArrivals: BookCardData[];
}

async function getFeatured(): Promise<Featured | null> {
  try {
    return await apiGet<Featured>("/books/featured/books", {
      tags: ["books"],
      revalidate: CACHE_TTL.catalogue,
    });
  } catch {
    return null; // API unreachable — render a gentle notice rather than failing
  }
}

// Every genre gets a circle (not just a hand-picked few), so new genres show
// up here automatically instead of needing this page edited each time. The row
// is genres only — the fixed Manga/Kids/Loksewa sections still have their own
// /category pages, they just don't take the first three slots here any more.
//
// One request, total. This used to fire an extra /books?limit=1 per genre to
// pull a cover for each circle — 16 more round trips to Express and 16 more
// Mongo queries on every homepage render — but the circles are icon-led now,
// so there is nothing left to look up.
async function getQuickBrowse() {
  const genres = await apiGet<Genre[]>("/genres", {
    tags: ["genres"],
    revalidate: CACHE_TTL.genres,
  }).catch(() => [] as Genre[]);

  return genres.map((g) => ({
    name: g.name,
    href: `/genre/${g.slug}`,
    icon: GENRE_ICONS[g.slug] ?? BookOpen,
  }));
}

export default async function HomePage() {
  const [data, quickBrowse] = await Promise.all([getFeatured(), getQuickBrowse()]);

  // The three shelves are the only concrete products on the homepage, and the
  // homepage is where the domain's authority concentrates — worth telling
  // crawlers which titles they are rather than leaving them as anonymous cards.
  // Organization/WebSite already come from ChromeGate on every page.
  const shelves = [
    { name: "Bestsellers in Nepal", books: data?.bestsellers ?? [] },
    { name: "New arrivals", books: data?.newArrivals ?? [] },
    { name: "Staff favourites", books: data?.featured ?? [] },
  ].filter((s) => s.books.length);

  return (
    <>
      {shelves.length > 0 && <JsonLd data={shelves.map((s) => itemListLd(s.name, s.books))} />}
      {/* Welcome strip. Takes the place the hero used to occupy, at a fraction
          of its height: the hero was a full-bleed shelf photo carrying one
          headline and one CTA, and it pushed every actual book below the fold.
          Deliberately just a greeting — no delivery promise. We don't set or
          collect the courier's charge (see the note in services/pricing.js),
          so a banner claiming anything about delivery cost would be writing a
          cheque the checkout can't cash. */}
      <section className="border-b border-promo-border bg-promo">
        <div className="shell py-5">
          {/* This is the homepage <h1>, not a decorative line. Removing the old
              hero took the only h1 on the site's most important page with it,
              leaving the document outline starting at h2. Styled to sit quietly
              in the strip — heading level and type scale are separate calls.

              It says what the shop is, because after <title> this is the
              strongest relevance signal on the page the domain's authority
              concentrates on, and "Welcome in. Pull up a chair" said nothing a
              search for "buy books online in nepal" could match. The warmth
              didn't have to be sacrificed for that — it moved one line down.

              The sentence beneath is deliberately extractable: entity, then
              category, then geography, then three concrete facts. That is the
              shape an answer engine can lift whole and attribute, and it is
              doing double duty as the page's opening line. */}
          <h1 className="font-display text-lg font-semibold text-text sm:text-xl">
            Buy books online in Nepal
          </h1>
          <p className="mt-1 font-body text-sm text-muted">
            Books Temple Nepal is an online bookstore delivering to all seven provinces — prices in
            NPR, cash on delivery, 1&ndash;2 days inside the Kathmandu Valley and 3&ndash;5 days
            elsewhere. Pull up a chair and have a browse.
          </p>
        </div>
      </section>

      {/* Quick browse — one tinted circle per genre. Browsing is the point of
          the homepage, so it leads. */}
      <section className="border-b border-border bg-surface">
        <div className="shell py-7">
          <div className="mb-1 flex items-start justify-between gap-4">
            <h2 className="font-display text-2xl text-text sm:text-3xl">Find your next read</h2>
            <Link
              href="/books"
              className="shrink-0 pt-1 font-data text-sm text-link hover:underline"
            >
              Explore all genres →
            </Link>
          </div>
          <p className="mb-5 font-body text-sm text-muted">
            Browse by genre, mood, or what&apos;s trending in Nepal
          </p>
          <CategoryCircles items={quickBrowse} />
        </div>
      </section>

      {data && (data.bestsellers.length || data.newArrivals.length || data.featured.length) ? (
        <>
          <BookShelf title="Bestsellers" books={data.bestsellers} href="/books?sort=popular" />
          <BookShelf title="New arrivals" books={data.newArrivals} href="/books?sort=newest" />
          <BookShelf title="Staff favourites" books={data.featured} href="/books" />
        </>
      ) : (
        <section className="shell py-20 text-center">
          <h2 className="font-display text-2xl text-text">The shelves are being restocked.</h2>
          <p className="mt-3 font-body text-muted">
            Nothing to show here just yet, give it a moment, or{" "}
            <Link href="/books" className="text-accent underline-offset-4 hover:underline">browse all books</Link>.
          </p>
        </section>
      )}
    </>
  );
}
