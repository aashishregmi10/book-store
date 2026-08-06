import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BookCardData } from "@/lib/types";
import { BookCard } from "./BookCard";

/** Books per homepage section — two full rows at the 7-column desktop width. */
const SHELF_SIZE = 14;

/**
 * A titled homepage shelf: a plain responsive grid, not a carousel.
 *
 * This replaced a drag-to-scroll rail. A rail hides most of its stock off the
 * right edge behind an interaction people have to discover, and it cost a
 * "use client" boundary plus pointer handlers on the busiest page we have.
 * The grid wraps, so every book on the shelf is visible and the whole section
 * renders on the server.
 */
export function BookShelf({
  title,
  books,
  href,
}: {
  title: string;
  books: BookCardData[];
  href?: string;
}) {
  if (!books?.length) return null;
  const items = books.slice(0, SHELF_SIZE);

  return (
    <section className="shell py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl text-text sm:text-3xl">{title}</h2>
        {href && (
          <Link
            href={href}
            className="group inline-flex shrink-0 items-center gap-1 font-data text-xs uppercase tracking-wide text-link hover:underline"
          >
            See all titles
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>

      {/* Seven across on desktop — more columns than the catalogue grid, since
          a homepage shelf is a taster rather than something to browse in depth,
          and the tighter cards let two full rows sit above less scroll. The
          count steps up with the breakpoint so a row is always full: at 7 wide
          a 5-column layout would leave two gaps on the second row. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {items.map((b) => (
          <BookCard key={b.slug} book={b} />
        ))}
      </div>
    </section>
  );
}
