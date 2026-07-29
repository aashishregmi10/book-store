"use client";

import { useState } from "react";
import { AddToCartButton } from "./AddToCartButton";
import type { BookDetail } from "@/lib/types";
import { npr } from "@/lib/format";

/**
 * Format chooser for a multi-edition book (e.g. Hardcover vs Paperback). Shows
 * each variant with its own price; the selected variant drives the displayed
 * price + the Add to cart action (price, stock and variantId).
 */
export function FormatPicker({ book }: { book: BookDetail }) {
  const variants = book.variants ?? [];
  // Default to the first in-stock variant, else the first.
  const initial = Math.max(0, variants.findIndex((v) => v.stock > 0));
  const [idx, setIdx] = useState(initial === -1 ? 0 : initial);
  const v = variants[idx];
  if (!v) return null;

  const soldOut = v.stock <= 0;

  return (
    <div>
      {/* Price for the selected format */}
      <div className="mt-5 flex items-baseline gap-3">
        <span className="font-data text-3xl font-semibold text-text">{npr(v.price)}</span>
        {v.comparePrice && v.comparePrice > v.price && (
          <span className="font-data text-lg text-muted line-through">{npr(v.comparePrice)}</span>
        )}
      </div>

      {/* Format options */}
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Format">
        {variants.map((variant, i) => {
          const active = i === idx;
          const out = variant.stock <= 0;
          return (
            <button
              key={variant._id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setIdx(i)}
              className={`flex flex-col items-start rounded-lg border px-4 py-2 text-left transition-colors ${
                active ? "border-accent bg-accent/5" : "border-border hover:border-accent"
              }`}
            >
              <span className="font-data text-sm font-medium text-text">{variant.format}</span>
              <span className="font-data text-xs text-muted">
                {npr(variant.price)}
                {out ? " · out of stock" : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* No low-stock tier — see the note on the book detail page: with a fixed
          2 copies per title it would apply to everything. */}
      <p className="mt-3 font-data text-sm">
        {soldOut ? (
          <span className="text-sale">This format is out of stock</span>
        ) : (
          <span className="text-accent">In stock · ships today from Kathmandu</span>
        )}
      </p>

      <div className="mt-6">
        <AddToCartButton
          book={{
            bookId: book._id,
            variantId: v._id,
            format: v.format,
            slug: book.slug,
            title: book.title,
            author: book.author,
            coverImage: book.coverImage.secureUrl,
            price: v.price,
            stock: v.stock,
          }}
          disabled={soldOut}
        />
      </div>
    </div>
  );
}
