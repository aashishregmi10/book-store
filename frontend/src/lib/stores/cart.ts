"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { renameStorageKey } from "./renameStorageKey";

// Carry any pre-rebrand cart across before persist reads storage below,
// so the rename doesn't silently empty saved carts.
renameStorageKey("pageturn-cart", "bookstemple-cart");

export interface CartItem {
  bookId: string;
  variantId?: string; // which format edition, when the title has variants
  format?: string; // snapshot of the variant format label (e.g. "Hardcover")
  slug: string;
  title: string;
  author: string;
  coverImage: string;
  price: number;
  quantity: number;
  // Max purchasable units (server stock for this book/variant). undefined until
  // known; filled in by reconcile() when the cart is opened.
  stock?: number;
}

// A line is unique per book + chosen variant, so Hardcover and Paperback of the
// same title are two separate lines.
export const lineKey = (i: { bookId: string; variantId?: string }) =>
  i.variantId ? `${i.bookId}:${i.variantId}` : i.bookId;

// Fresh server state for reconcile: one entry per still-active book, with
// per-variant stock and the book's current cover URL.
export interface StockInfo {
  bookId: string;
  stock: number;
  // Current cover. A line's stored coverImage is a snapshot taken when the book
  // was added, so it outlives the cover moving hosts — which is how every saved
  // cart ended up pointing at a 401 when Cloudinary was deactivated. Absent
  // when the book has no cover, in which case the snapshot is left alone.
  cover?: string;
  variants?: { variantId: string; stock: number }[];
}

interface CartState {
  items: CartItem[];
  hydrated: boolean;
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  // Refresh stock + drop items whose book/variant is no longer purchasable.
  reconcile: (books: StockInfo[]) => void;
  clear: () => void;
}

// Clamp a desired quantity to [0, stock]; when stock is unknown, leave it alone.
const cap = (qty: number, stock?: number) => (stock === undefined ? qty : Math.min(qty, stock));

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hydrated: false,
      add: (item, qty = 1) =>
        set((state) => {
          const key = lineKey(item);
          const existing = state.items.find((i) => lineKey(i) === key);
          const stock = item.stock ?? existing?.stock;
          if (existing) {
            const quantity = Math.max(1, cap(existing.quantity + qty, stock));
            return { items: state.items.map((i) => (lineKey(i) === key ? { ...i, stock, quantity } : i)) };
          }
          const quantity = cap(qty, stock);
          if (quantity <= 0) return state; // out of stock — nothing to add
          return { items: [...state.items, { ...item, quantity }] };
        }),
      setQty: (key, qty) =>
        set((state) => ({
          items:
            qty <= 0
              ? state.items.filter((i) => lineKey(i) !== key)
              : state.items.map((i) => (lineKey(i) === key ? { ...i, quantity: cap(qty, i.stock) } : i)),
        })),
      remove: (key) => set((state) => ({ items: state.items.filter((i) => lineKey(i) !== key) })),
      reconcile: (books) =>
        set((state) => {
          const byId = new Map(books.map((b) => [b.bookId, b]));
          const next: CartItem[] = [];
          for (const i of state.items) {
            const b = byId.get(i.bookId);
            if (!b) continue; // book deleted/deactivated → drop
            let stock = b.stock;
            if (i.variantId) {
              const v = b.variants?.find((x) => x.variantId === i.variantId);
              if (!v) continue; // variant gone → drop
              stock = v.stock;
            }
            // Clamp down to fresh stock, but keep a sold-out line visible so the
            // user can see and remove it.
            const quantity = stock > 0 ? Math.min(i.quantity, stock) : i.quantity;
            next.push({ ...i, stock, quantity, coverImage: b.cover ?? i.coverImage });
          }
          return { items: next };
        }),
      clear: () => set({ items: [] }),
    }),
    {
      name: "bookstemple-cart",
      partialize: (s) => ({ items: s.items }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);

// Derived selectors (call with useCart(selector)).
export const selectCount = (s: CartState) => s.items.reduce((n, i) => n + i.quantity, 0);
export const selectSubtotal = (s: CartState) => s.items.reduce((n, i) => n + i.price * i.quantity, 0);
