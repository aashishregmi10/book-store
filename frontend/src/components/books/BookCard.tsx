import Link from "next/link";
import { Star } from "lucide-react";
import type { BookCardData } from "@/lib/types";
import { npr, discountPct } from "@/lib/format";
import { WishlistButton } from "./WishlistButton";
import { AddToCartButton } from "./AddToCartButton";
import { BookCover } from "./BookCover";

/**
 * Simple, cover-forward book card: cover + title + author + price, with a
 * wishlist heart (overlay) and an Add to cart button. Hovering shows the
 * full title via the native tooltip.
 */
export function BookCard({ book }: { book: BookCardData }) {
  const off = discountPct(book.price, book.comparePrice);
  const soldOut = book.stockStatus === "out-of-stock" || book.stockStatus === "discontinued";
  const multiFormat = (book.variants?.length ?? 0) > 1;

  // A single cover badge keeps the top corners balanced against the wishlist
  // heart. Priority: discount → bestseller → new arrival.
  const badge = off > 0 ? (
    <Badge tone="sale">-{off}%</Badge>
  ) : book.isBestseller ? (
    <Badge>Bestseller</Badge>
  ) : book.isNewArrival ? (
    <Badge>New</Badge>
  ) : null;

  return (
    <article className="group flex flex-col" title={book.title}>
      <div className="relative">
        <Link href={`/books/${book.slug}`} title={book.title} className="block">
          <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-bg">
            <BookCover
              src={book.coverImage.secureUrl}
              alt={`${book.title} by ${book.author}, book cover`}
              title={book.title}
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 200px"
              className="object-cover transition duration-500 group-hover:scale-[1.03]"
            />
            {/* No "only N left" badge: the shop stocks a fixed 2 copies of
                every title, so a scarcity badge would sit on the entire
                catalogue and mean nothing. Only genuine sold-out is shown. */}
            {soldOut && (
              <span className="absolute inset-x-0 bottom-0 bg-text/80 px-2 py-1 text-center font-data text-[11px] text-white">
                Out of stock
              </span>
            )}
          </div>
        </Link>

        {badge && <div className="absolute left-2 top-2">{badge}</div>}

        <div className="absolute right-2 top-2">
          <WishlistButton bookId={book._id} />
        </div>
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <Link href={`/books/${book.slug}`} title={book.title}>
          {/* Reserve two lines so cards with 1- vs 2-line titles stay aligned. */}
          <h3 className="line-clamp-2 min-h-[2.6rem] font-display text-base leading-snug text-text transition-colors group-hover:text-accent">
            {book.title}
          </h3>
        </Link>
        <p className="mt-0.5 line-clamp-1 font-body text-sm text-muted">{book.author}</p>

        {book.reviewCount > 0 && (
          <div className="mt-1 inline-flex items-center gap-1 font-data text-xs text-muted">
            <Star className="size-3 fill-current text-accent" />
            {book.avgRating.toFixed(1)} <span className="text-muted">({book.reviewCount})</span>
          </div>
        )}

        <div className="mt-1.5 flex items-baseline gap-2">
          {multiFormat && <span className="font-data text-xs text-muted">From</span>}
          <span className="font-data text-[15px] font-semibold text-accent">{npr(book.price)}</span>
          {!multiFormat && off > 0 && book.comparePrice && (
            <span className="font-data text-xs text-muted line-through">{npr(book.comparePrice)}</span>
          )}
        </div>

        {multiFormat ? (
          // Format must be chosen on the detail page — link instead of inline add.
          <Link
            href={`/books/${book.slug}`}
            className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-2 font-data text-xs uppercase tracking-wide text-text transition-colors hover:border-accent hover:text-accent"
          >
            View options
          </Link>
        ) : (
          <AddToCartButton
            book={{
              bookId: book._id,
              slug: book.slug,
              title: book.title,
              author: book.author,
              coverImage: book.coverImage.secureUrl,
              price: book.price,
            }}
            disabled={soldOut}
            full
            size="sm"
            className="mt-3"
          />
        )}
      </div>
    </article>
  );
}

function Badge({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "sale" }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-wide text-white ${
        tone === "sale" ? "bg-sale" : "bg-accent"
      }`}
    >
      {children}
    </span>
  );
}
