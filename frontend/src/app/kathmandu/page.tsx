import type { Metadata } from "next";
import Link from "next/link";

import { apiGet, CACHE_TTL } from "@/lib/api";
import { breadcrumbLd, itemListLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { BookShelf } from "@/components/books/BookShelf";
import type { BookCardData } from "@/lib/types";

// The Valley is where most orders — and most "buy books online kathmandu"
// searches — come from, and no page on the site spoke to that intent
// directly. This one does, with the delivery specifics a Kathmandu reader
// actually wants to check before ordering. It is a real reference page, not
// a doorway: everything on it is true of how the shop operates.
export const metadata: Metadata = {
  title: "Buy Books Online in Kathmandu",
  description:
    "Order books online in Kathmandu — 1–2 day delivery across the Valley (Kathmandu, Lalitpur, Bhaktapur). 5,000+ English and Nepali titles, cash on delivery.",
  alternates: { canonical: "/kathmandu" },
};

export const revalidate = 3600;

interface Featured {
  featured: BookCardData[];
  bestsellers: BookCardData[];
  newArrivals: BookCardData[];
}

// Same endpoint the homepage shelves use; only the bestsellers matter here.
async function getBestsellers(): Promise<BookCardData[]> {
  try {
    const data = await apiGet<Featured>("/books/featured/books", {
      tags: ["books"],
      revalidate: CACHE_TTL.catalogue,
    });
    return data.bestsellers;
  } catch {
    return []; // API unreachable — the page still stands without the shelf
  }
}

// Visible copy only — no FAQPage JSON-LD here. /faq owns that markup for the
// whole site (see the note in lib/seo.ts); marking questions up in two places
// asks Google to pick a winner and it tends to pick neither.
const ANSWERS = [
  {
    q: "How fast is book delivery in Kathmandu?",
    a: "Typically 1–2 days anywhere in the Kathmandu Valley once your order is dispatched. The courier runs the final leg, so those are typical times rather than guarantees — but inside the Valley the parcel usually arrives the next day.",
  },
  {
    q: "What does delivery cost in Kathmandu?",
    a: "Your order total covers the books only. The courier charges its own delivery fee when it hands the parcel over, set by where it is going — Books Temple Nepal does not set or collect it, which is why there is no shipping line at checkout.",
  },
  {
    q: "Can I pay when the books arrive?",
    a: "Yes — cash on delivery is currently the only way to pay. You order online and hand the courier cash at your door, so nothing leaves your account before the books are in your hands.",
  },
  {
    q: "Do you deliver outside the Kathmandu Valley too?",
    a: "Yes. The same shelves reach all seven provinces and all 77 districts, typically in 3–5 days outside the Valley.",
  },
];

const SHELVES = [
  { name: "Nepali literature", href: "/genre/nepali-literature" },
  { name: "Fiction", href: "/genre/fiction" },
  { name: "Self-help", href: "/genre/self-help" },
  { name: "Business & economics", href: "/genre/business-economics" },
  { name: "Romance", href: "/genre/romance" },
  { name: "Mystery & thriller", href: "/genre/mystery-thriller" },
  { name: "Children's books", href: "/category/kids" },
  { name: "The full catalogue", href: "/books" },
];

export default async function KathmanduPage() {
  const bestsellers = await getBestsellers();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Kathmandu", path: "/kathmandu" },
          ]),
          ...(bestsellers.length ? [itemListLd("Bestsellers this week", bestsellers)] : []),
        ]}
      />

      <div className="shell max-w-3xl pt-10">
        <nav aria-label="Breadcrumb" className="font-data text-xs uppercase tracking-wide text-muted">
          <Link href="/" className="hover:text-accent">Home</Link>
          <span className="px-2">/</span>
          <span className="text-text">Kathmandu</span>
        </nav>

        <h1 className="mt-3 font-display text-4xl leading-tight text-text sm:text-5xl">
          Buy books online in Kathmandu
        </h1>

        {/* BLUF: the extractable answer to "can I order books online in
            Kathmandu, and how does it work" — before any detail. */}
        <p className="mt-5 border-l-2 border-accent pl-5 font-body text-lg leading-relaxed text-text">
          Books Temple Nepal is an online bookstore delivering across the Kathmandu Valley —
          Kathmandu, Lalitpur and Bhaktapur — typically within 1&ndash;2 days of dispatch. Browse
          over 5,000 English and Nepali titles, pay in NPR by cash on delivery, and the same
          shelves reach every district in Nepal. No online payment needed: order, then pay when
          the books are in your hands.
        </p>

        <h2 className="mt-12 font-display text-2xl text-text sm:text-3xl">
          How delivery works in the Valley
        </h2>
        <div className="mt-4 space-y-4 font-body leading-relaxed text-muted">
          <p>
            Order before the day ends and your books are usually handed to the courier within a
            day. Inside the Valley&apos;s three districts — Kathmandu, Lalitpur and Bhaktapur —
            the parcel then typically reaches you in 1&ndash;2 days. You pay the courier in cash
            on handover: the book total you saw at checkout, plus the courier&apos;s own delivery
            fee for your area, which the courier sets and collects.
          </p>
          <p>
            Every order gets a number that looks like PT-YYYYMMDD-XXXXX in your confirmation
            email — drop it into{" "}
            <Link href="/track" className="text-accent underline-offset-4 hover:underline">
              order tracking
            </Link>{" "}
            any time. Change your mind before dispatch and you can cancel free of charge from
            your account; once the parcel is with the courier, it&apos;s on its way.
          </p>
        </div>
      </div>

      <BookShelf title="Bestsellers this week" books={bestsellers} href="/books?sort=popular" />

      <div className="shell max-w-3xl pb-10">
        <h2 className="font-display text-2xl text-text sm:text-3xl">Browse the shelves</h2>
        <p className="mt-2 font-body text-sm text-muted">
          Everything below delivers anywhere in the Valley at the same 1&ndash;2 day pace.
        </p>
        <ul className="mt-5 flex flex-wrap gap-3">
          {SHELVES.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="inline-block rounded-full border border-border px-4 py-2 font-body text-sm text-text transition-colors hover:border-accent hover:text-accent"
              >
                {s.name}
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="mt-12 font-display text-2xl text-text sm:text-3xl">
          Quick answers for Kathmandu readers
        </h2>
        <dl className="mt-6 space-y-8">
          {ANSWERS.map((f) => (
            <div key={f.q} className="border-b border-border pb-8 last:border-0">
              <dt className="font-display text-xl leading-snug text-text">{f.q}</dt>
              <dd className="mt-3 font-body leading-relaxed text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 font-body text-sm text-muted">
          The full detail on couriers, cancellations and replacements lives in{" "}
          <Link href="/faq" className="text-accent underline underline-offset-4">
            questions
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-accent underline underline-offset-4">
            terms &amp; returns
          </Link>
          . After a title we don&apos;t stock?{" "}
          <Link href="/contact" className="text-accent underline underline-offset-4">
            Talk to a bookseller
          </Link>
          .
        </p>
      </div>
    </>
  );
}
