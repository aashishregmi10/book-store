import Link from "next/link";
import type { BookCardData } from "@/lib/types";
import { BookCover } from "@/components/books/BookCover";

/**
 * Real book covers in the hero — never a stock photo. Features the strongest
 * pick front-and-center with up to two more flanking it, rotated slightly, for
 * an editorial "stack" feel rather than a uniform product grid. Visible on
 * every breakpoint (unlike the old desktop-only hero photo) so mobile visitors
 * — the large majority of traffic — see real inventory immediately too.
 */
export function HeroCovers({ books }: { books: BookCardData[] }) {
  const items = books.filter((b) => b?.coverImage?.secureUrl).slice(0, 3);
  if (items.length === 0) return null;

  const [feature, left, right] = [items[0], items[1], items[2]];

  return (
    <div className="mx-auto flex w-full max-w-[300px] items-center justify-center md:max-w-md">
      {left && <Cover book={left} className="-mr-3 w-[26%] rotate-[-6deg] md:w-[24%]" />}
      <Cover book={feature} className="z-10 w-[46%] md:w-[42%]" priority />
      {right && <Cover book={right} className="-ml-3 w-[26%] rotate-[6deg] md:w-[24%]" />}
    </div>
  );
}

function Cover({ book, className, priority }: { book: BookCardData; className: string; priority?: boolean }) {
  return (
    <Link
      href={`/books/${book.slug}`}
      title={book.title}
      className={`relative aspect-[2/3] shrink-0 overflow-hidden rounded-md border border-border bg-bg transition-transform hover:-translate-y-1 ${className}`}
    >
      <BookCover
        src={book.coverImage.secureUrl}
        alt={`${book.title} by ${book.author} — book cover`}
        title={book.title}
        sizes="(max-width: 768px) 35vw, 200px"
        priority={priority}
      />
    </Link>
  );
}
