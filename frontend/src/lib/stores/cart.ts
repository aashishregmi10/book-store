"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  bookId: string;
  slug: string;
  title: string;
  author: string;
  coverImage: string;
  price: number;
  quantity: number;
  // Max purchasable units (server stock). undefined until known (e.g. added
  // from a book card); filled in by reconcile() when the cart is opened.
  stock?: number;
}

interface CartState {
  items: CartItem[];
  hydrated: boolean;
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQty: (bookId: string, qty: number) => void;
  remove: (bookId: string) => void;
  // Refresh stock + drop items whose book is no longer purchasable. Pass the
  // current { bookId, stock } for every still-active book; missing ids are removed.
  reconcile: (books: { bookId: string; stock: number }[]) => void;
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
          const existing = state.items.find((i) => i.bookId === item.bookId);
          // Prefer a freshly-supplied stock, else keep what we already knew.
          const stock = item.stock ?? existing?.stock;
          if (existing) {
            const quantity = Math.max(1, cap(existing.quantity + qty, stock));
            return {
              items: state.items.map((i) =>
                i.bookId === item.bookId ? { ...i, stock, quantity } : i
              ),
            };
          }
          const quantity = cap(qty, stock);
          if (quantity <= 0) return state; // out of stock — nothing to add
          return { items: [...state.items, { ...item, quantity }] };
        }),
      setQty: (bookId, qty) =>
        set((state) => ({
          items:
            qty <= 0
              ? state.items.filter((i) => i.bookId !== bookId)
              : state.items.map((i) =>
                  i.bookId === bookId ? { ...i, quantity: cap(qty, i.stock) } : i
                ),
        })),
      remove: (bookId) => set((state) => ({ items: state.items.filter((i) => i.bookId !== bookId) })),
      reconcile: (books) =>
        set((state) => {
          const stockById = new Map(books.map((b) => [b.bookId, b.stock]));
          const next = state.items
            .filter((i) => stockById.has(i.bookId))
            .map((i) => {
              const stock = stockById.get(i.bookId);
              // Clamp down to fresh stock, but only when there is some — a
              // sold-out item keeps its quantity so the user can see and remove it.
              const quantity = stock && stock > 0 ? Math.min(i.quantity, stock) : i.quantity;
              return { ...i, stock, quantity };
            });
          return { items: next };
        }),
      clear: () => set({ items: [] }),
    }),
    {
      name: "pageturn-cart",
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
