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
}

interface CartState {
  items: CartItem[];
  hydrated: boolean;
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQty: (bookId: string, qty: number) => void;
  remove: (bookId: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hydrated: false,
      add: (item, qty = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.bookId === item.bookId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.bookId === item.bookId ? { ...i, quantity: i.quantity + qty } : i
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: qty }] };
        }),
      setQty: (bookId, qty) =>
        set((state) => ({
          items:
            qty <= 0
              ? state.items.filter((i) => i.bookId !== bookId)
              : state.items.map((i) => (i.bookId === bookId ? { ...i, quantity: qty } : i)),
        })),
      remove: (bookId) => set((state) => ({ items: state.items.filter((i) => i.bookId !== bookId) })),
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
