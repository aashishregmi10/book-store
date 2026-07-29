"use client";

import { useState } from "react";
import { ShoppingBag, Check } from "lucide-react";
import { useCart, type CartItem } from "@/lib/stores/cart";
import { RestockRequestButton } from "./RestockRequestButton";

/**
 * `disabled` means sold out — it is the only thing any caller passes it for.
 * Rather than render a dead button, the sold-out state swaps in the restock
 * request, so every surface that shows Add to cart (grid card, detail page,
 * format picker, mobile buy bar) gets the fallback without repeating it.
 */
export function AddToCartButton({
  book,
  disabled,
  full,
  size = "md",
  className = "",
}: {
  book: Omit<CartItem, "quantity">;
  disabled?: boolean;
  full?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);

  function handleAdd() {
    add(book, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  }

  const sizes = size === "sm" ? "px-3 py-2 text-xs" : "px-5 py-3 text-sm";
  const base = `inline-flex items-center justify-center gap-2 rounded-md font-data uppercase tracking-wide transition-colors ${sizes} ${
    full ? "w-full" : ""
  } ${className}`;

  if (disabled) {
    return <RestockRequestButton slug={book.slug} full={full} size={size} className={className} />;
  }

  return (
    <button onClick={handleAdd} className={`${base} bg-accent text-white hover:bg-accent-hover`}>
      {added ? <Check className="size-4" /> : <ShoppingBag className="size-4" />}
      {added ? "Added" : "Add to cart"}
    </button>
  );
}
