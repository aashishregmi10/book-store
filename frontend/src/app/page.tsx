import Link from "next/link";
import { apiGet, CACHE_TTL, RAILS_TAG } from "@/lib/api";
import { itemListLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import type { BookCardData } from "@/lib/types";
import { BookShelf } from "@/components/books/BookShelf";
import { HeroCarousel } from "@/components/home/HeroCarousel";

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
      tags: ["books", RAILS_TAG],
      revalidate: CACHE_TTL.catalogue,
    });
  } catch {
    return null; // API unreachable — render a gentle notice rather than failing
  }
}

// The genre circles row ("Find your next read") was removed at the owner's
// request: every genre is one hover away in the header's category bar, whose
// links are server-rendered on every page, so the genre silo keeps its
// homepage links.
export default async function HomePage() {
  const data = await getFeatured();

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
      {/* Opening banner, after the reference layout the owner chose. It took over
          from the welcome strip and keeps its two SEO jobs: the homepage <h1>
          ("Buy books online in Nepal", the first slide's kicker) and the
          extractable sentence that says what the shop is, where, and how it
          sells. Every claim is one the shop keeps: no delivery-price promise,
          because the courier sets and collects that (services/pricing.js). */}
      <section className="shell pt-5 sm:pt-7">
        <HeroCarousel
          slides={[
            {
              key: "welcome",
              tone: "coffee",
              kicker: "Buy books online in Nepal",
              kickerIsH1: true,
              title: "Books worth reading, delivered across Nepal",
              text: (
                <>
                  Books Temple Nepal is an online bookstore delivering to all seven provinces. Prices in NPR, cash on
                  delivery, 1&ndash;2 days inside the{" "}
                  <Link href="/kathmandu" className="underline underline-offset-4 hover:text-espresso">
                    Kathmandu Valley
                  </Link>{" "}
                  and 3&ndash;5 days elsewhere.
                </>
              ),
              cta: { label: "Browse 5,000+ books", href: "/books" },
              books: data?.bestsellers ?? [],
            },
            {
              key: "new",
              tone: "brand",
              kicker: "Just arrived",
              title: "New on our shelves",
              text: "Genuine new copies, sourced in Kathmandu and added to the shop as they come in.",
              cta: { label: "See new arrivals", href: "/books?sort=newest" },
              books: data?.newArrivals ?? [],
            },
            {
              key: "cod",
              tone: "tint",
              kicker: "Cash on delivery · Tracked parcels",
              title: "Pay when your books arrive",
              text: "Order online and pay the rider in cash. Your parcel travels with Nepal Can Move, and you can follow it all the way to your door.",
              cta: { label: "Track your order", href: "/track" },
              books: data?.featured ?? [],
            },
          ]}
        />
      </section>

      {data && (data.bestsellers.length || data.newArrivals.length || data.featured.length) ? (
        <>
          <BookShelf title="Bestsellers" books={data.bestsellers} href="/books?sort=popular" />
          {/* Alternating tinted band — Palm Mind alternates white and pale-blue
              sections rather than tinting the whole page. */}
          <div className="border-y border-border bg-tint">
            <BookShelf title="New arrivals" books={data.newArrivals} href="/books?sort=newest" />
          </div>
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
