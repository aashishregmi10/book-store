"use client";

import { usePathname } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { useCart, selectCount, selectSubtotal } from "@/lib/stores/cart";
import { useDrawer } from "@/lib/stores/uiDrawer";
import { npr } from "@/lib/format";

/**
 * Mobile sticky cart summary — shows item count + running total and opens the
 * cart drawer. Sits just above the bottom nav. Hidden when the cart is empty,
 * the drawer is open, or on pages where it'd be redundant (cart/checkout, the
 * book detail page which has its own sticky buy bar).
 */
export function CartBar() {
  const pathname = usePathname() || "/";
  const count = useCart(selectCount);
  const subtotal = useCart(selectSubtotal);
  const hydrated = useCart((s) => s.hydrated);
  const drawerOpen = useDrawer((s) => s.open);
  const openCart = useDrawer((s) => s.openCart);

  const hidden =
    pathname.startsWith("/cart") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/admin") ||
    /^\/books\/[^/]+$/.test(pathname); // single book detail page

  if (!hydrated || count === 0 || drawerOpen || hidden) return null;

  return (
    <button
      onClick={openCart}
      className="fixed inset-x-3 bottom-[4.25rem] z-40 flex items-center justify-between rounded-full bg-accent px-5 py-3 text-white shadow-[0_8px_24px_-8px_rgba(29,118,188,0.5)] md:hidden"
    >
      <span className="inline-flex items-center gap-2 font-data text-sm">
        <ShoppingCart className="size-4" /> {count} {count === 1 ? "item" : "items"}
      </span>
      <span className="font-data text-sm font-semibold">View cart · {npr(subtotal)}</span>
    </button>
  );
}
