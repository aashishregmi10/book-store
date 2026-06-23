"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { X, Star } from "lucide-react";
import { useQuickView } from "@/lib/stores/quickView";
import { clientApi } from "@/lib/client-api";
import type { BookDetail } from "@/lib/types";
import { npr, discountPct } from "@/lib/format";
import { AddToCartButton } from "./AddToCartButton";
import { WishlistButton } from "./WishlistButton";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Quick-view: a bottom sheet (mobile) / centred modal (desktop) that previews a
 * book — cover, price, short description, Add to cart + full-details link —
 * without a full page navigation. Opened from the card's quick-view button.
 */
export function QuickViewSheet() {
  const slug = useQuickView((s) => s.slug);
  const close = useQuickView((s) => s.close);
  // key={slug} remounts QuickViewContent per book → fresh loading state, no
  // setState-in-effect reset needed.
  if (!slug) return null;
  return <QuickViewContent key={slug} slug={slug} close={close} />;
}

function QuickViewContent({ slug, close }: { slug: string; close: () => void }) {
  const [book, setBook] = useState<BookDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    clientApi
      .get<{ book: BookDetail }>(`/books/${slug}`)
      .then((d) => active && setBook(d.book))
      .catch(() => {})
      .finally(() => active && setLoading(false));

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      active = false;
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [slug, close]);

  const soldOut = book && (book.stockStatus === "out-of-stock" || book.stockStatus === "discontinued");
  const multiFormat = (book?.variants?.length ?? 0) > 1;
  const off = book ? discountPct(book.price, book.comparePrice) : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Quick view">
      <div className="animate-overlay-in absolute inset-0 bg-text/40 backdrop-blur-sm" onClick={close} />
      <div className="animate-panel-in relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl">
        <button onClick={close} aria-label="Close" className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text">
          <X className="size-5" />
        </button>

        {loading || !book ? (
          <div className="flex gap-4">
            <Skeleton className="h-44 w-28 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-3 pt-1">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-4">
              <Link href={`/books/${book.slug}`} onClick={close} className="relative h-44 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-bg">
                <Image src={book.coverImage.secureUrl} alt={`${book.title} cover`} fill sizes="112px" className="object-cover" />
                {off > 0 && <span className="absolute left-0 top-0 bg-sale px-1.5 py-0.5 font-data text-[10px] text-white">-{off}%</span>}
              </Link>
              <div className="min-w-0 flex-1 pr-6">
                <Link href={`/books/${book.slug}`} onClick={close}>
                  <h2 className="font-display text-xl leading-snug text-text">{book.title}</h2>
                </Link>
                <p className="label-smallcaps mt-0.5 text-sm">{book.author}</p>
                {book.reviewCount > 0 && (
                  <span className="mt-1 inline-flex items-center gap-1 font-data text-xs text-muted">
                    <Star className="size-3 fill-star text-star" /> {book.avgRating.toFixed(1)} ({book.reviewCount})
                  </span>
                )}
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-data text-2xl font-semibold text-accent">{npr(book.price)}</span>
                  {off > 0 && book.comparePrice && <span className="font-data text-sm text-muted line-through">{npr(book.comparePrice)}</span>}
                </div>
                {book.description && (
                  <p className="mt-2 line-clamp-4 font-body text-sm leading-relaxed text-muted">
                    {book.shortDescription || book.description}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2">
              {multiFormat ? (
                <Link
                  href={`/books/${book.slug}`}
                  onClick={close}
                  className="flex-1 rounded-md bg-accent px-5 py-3 text-center font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover"
                >
                  Choose a format
                </Link>
              ) : (
                <AddToCartButton
                  book={{ bookId: book._id, slug: book.slug, title: book.title, author: book.author, coverImage: book.coverImage.secureUrl, price: book.price }}
                  disabled={!!soldOut}
                  full
                  className="flex-1"
                />
              )}
              <WishlistButton bookId={book._id} className="size-11" variant="bordered" />
              <Link
                href={`/books/${book.slug}`}
                onClick={close}
                className="rounded-md border border-border px-4 py-3 font-data text-sm uppercase tracking-wide text-text transition-colors hover:border-accent hover:text-accent"
              >
                Details
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
