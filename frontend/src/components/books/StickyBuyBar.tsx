"use client";

import type { CartItem } from "@/lib/stores/cart";
import { npr } from "@/lib/format";
import { AddToCartButton } from "./AddToCartButton";

/**
 * Mobile sticky buy bar on the book detail page — keeps price + Add to cart in
 * view while scrolling the description/reviews. Sits above the bottom nav.
 * Rendered only for single-format books (variants are chosen inline on the page).
 */
export function StickyBuyBar({ book, soldOut }: { book: Omit<CartItem, "quantity">; soldOut?: boolean }) {
  return (
    <div className="fixed inset-x-0 bottom-[3.5rem] z-40 flex items-center gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur md:hidden">
      <span className="shrink-0 font-data text-lg font-semibold text-text">{npr(book.price)}</span>
      <AddToCartButton book={book} disabled={soldOut} full className="flex-1" />
    </div>
  );
}
