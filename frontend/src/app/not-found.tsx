import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  // A 404 must never be indexed, even though Next already returns a 404 status.
  robots: { index: false, follow: true },
};

/**
 * Global 404. There was no not-found.tsx at all before, so every missing URL —
 * and every `notFound()` thrown by a book or genre page for a retired slug —
 * fell through to Next's unstyled default: black text on white, no header, no
 * way back into the shop. A dead end on a storefront is a lost sale.
 */
export default function NotFound() {
  return (
    <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="label-smallcaps font-data text-xs">404</p>
      <h1 className="mt-3 max-w-2xl font-display text-4xl leading-tight text-text sm:text-5xl">
        That shelf is empty.
      </h1>
      <p className="mt-4 max-w-md font-body text-lg leading-relaxed text-muted">
        The page you were after has moved or never existed. The books are all still here, though.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/books"
          className="rounded-full bg-accent px-6 py-3 font-data text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Browse the shelves
        </Link>
        <Link
          href="/"
          className="rounded-full border border-border px-6 py-3 font-data text-sm text-text transition-colors hover:border-accent hover:text-accent"
        >
          Back home
        </Link>
      </div>

      <p className="mt-8 font-body text-sm text-muted">
        Looking for something specific?{" "}
        <Link href="/contact" className="text-link underline-offset-4 hover:underline">
          Ask us and we&apos;ll track it down.
        </Link>
      </p>
    </div>
  );
}
