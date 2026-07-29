import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Our Story",
  description:
    "Books Temple Nepal is a small, opinionated bookshop in Kathmandu - handpicked titles, honest NPR prices, and cash on delivery to all seven provinces.",
  alternates: { canonical: "/about" },
};

const PRINCIPLES: [string, string][] = [
  ["Handpicked, not algorithm-fed", "Every title on the shelf is one a real bookseller would press into your hands - no endless filler, no pay-to-rank."],
  ["Honest prices, in rupees", "Clear NPR pricing with no surprises at checkout. What you see is what you pay at your door."],
  ["The whole country is our catchment", "Kathmandu in a day or two, the rest of Nepal in three to five - careful packaging to all 77 districts."],
  ["Pay when it arrives", "Cash on delivery, because trust is earned at the doorstep, not demanded at the form."],
];

const STATS: [string, string][] = [
  ["3,000+", "Titles in English & Nepali"],
  ["77 / 77", "Districts we deliver to"],
  ["1–2 days", "Inside the Kathmandu Valley"],
  ["4.8★", "Average reader rating"],
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-6 py-12 sm:px-8 lg:px-16 xl:px-24">
      {/* Hero */}
      <section className="grid items-center gap-10 md:grid-cols-12">
        <div className="md:col-span-7">
          <p className="label-smallcaps font-data text-xs">Our story · Kathmandu, est. 2026</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.05] text-text sm:text-6xl">
            A small bookshop
            <br />
            <span className="text-accent">with a long memory.</span>
          </h1>
          <p className="mt-6 max-w-xl font-body text-lg leading-relaxed text-muted">
            Books Temple Nepal started with a simple frustration: it was too hard to buy a good book, at a fair price,
            delivered to your door — wherever in Nepal that door happens to be. So we built the shop we wanted to buy
            from.
          </p>
        </div>
        <div className="md:col-span-5">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/5">
            <Image src="/hero-books.jpg" alt="A stack of well-read books" fill sizes="(max-width: 768px) 90vw, 500px" className="object-cover" />
          </div>
        </div>
      </section>

      {/* Narrative */}
      <section className="mt-16 grid gap-10 border-t border-border pt-12 md:grid-cols-[1fr_1.4fr]">
        <h2 className="font-display text-3xl text-text">Why we exist</h2>
        <div className="max-w-2xl space-y-4 font-body text-lg leading-relaxed text-text">
          <p>
            For years, finding a specific title in Nepal meant trekking between shops, settling for whatever was on the
            table, or paying eye-watering import mark-ups online. Readers outside the Valley had it worse — many simply
            stopped looking.
          </p>
          <p>
            We think a country of readers deserves better. Books Temple is our answer: a tightly curated catalogue of fiction,
            Nepali literature, business, and the books people actually ask for — priced honestly in rupees and carried to
            every province by people who care whether the corners arrive bent.
          </p>
          <p>
            We&apos;re small on purpose. It lets us read what we sell, recommend without an agenda, and answer the phone
            when you call.
          </p>
        </div>
      </section>

      {/* Principles */}
      <section className="mt-16 border-t border-border pt-12">
        <h2 className="font-display text-3xl text-text">What we believe</h2>
        <dl className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {PRINCIPLES.map(([title, body], i) => (
            <div key={title} className="flex gap-4">
              <span className="font-display text-2xl text-accent">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <dt className="font-display text-xl text-text">{title}</dt>
                <dd className="mt-1 max-w-md font-body leading-relaxed text-muted">{body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      {/* Stats */}
      <section className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
        {STATS.map(([value, label]) => (
          <div key={label} className="bg-surface p-6 text-center">
            <p className="font-display text-3xl font-semibold text-accent sm:text-4xl">{value}</p>
            <p className="mt-1 font-body text-sm text-muted">{label}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="mt-16 rounded-3xl bg-text px-6 py-12 text-center sm:px-12">
        <h2 className="font-display text-3xl text-bg sm:text-4xl">Come find your next read.</h2>
        <p className="mx-auto mt-3 max-w-xl font-body text-bg/70">
          Browse the shelves, or tell us what you&apos;re after and we&apos;ll track it down.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
          <Link href="/books" className="rounded-full bg-accent px-6 py-3 font-data text-sm font-medium text-white hover:bg-accent-hover">
            Browse the shelves
          </Link>
          <Link href="/contact" className="font-data text-sm uppercase tracking-wide text-bg underline-offset-4 hover:underline">
            Get in touch →
          </Link>
        </div>
      </section>
    </div>
  );
}
