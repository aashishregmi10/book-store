import Link from "next/link";
import type { BookCardData } from "@/lib/types";
import { BookCover } from "@/components/books/BookCover";

/**
 * Real book covers in the hero — never a stock photo. Three upright covers,
 * evenly spaced (no overlap/rotation), the strongest pick slightly larger in
 * the center. Visible on every breakpoint (unlike the old desktop-only hero
 * photo) so mobile visitors — the large majority of traffic — see real
 * inventory immediately too.
 */
export function HeroCovers({ books }: { books: BookCardData[] }) {
  const items = books.filter((b) => b?.coverImage?.secureUrl).slice(0, 3);
  if (items.length === 0) return null;

  const [feature, left, right] = [items[0], items[1], items[2]];

  return (
    <div className="mx-auto flex w-full max-w-[340px] items-center justify-center gap-3 md:max-w-md md:gap-4">
      {left && <Cover book={left} className="w-[28%]" />}
      <Cover book={feature} className="w-[36%]" priority />
      {right && <Cover book={right} className="w-[28%]" />}
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
