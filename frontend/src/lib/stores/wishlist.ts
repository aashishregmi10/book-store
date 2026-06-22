"use client";

import { create } from "zustand";
import { clientApi } from "@/lib/client-api";
import { getToken } from "@/lib/stores/auth";
import type { BookCardData } from "@/lib/types";

/**
 * Shared wishlist state. Every heart, the header count badge, and the wishlist
 * drawer read from here, so an add/remove anywhere updates the whole UI
 * instantly (optimistically) instead of each component tracking its own copy.
 *
 * `ids` is the source of truth for "is this book saved" (cheap Set lookups);
 * `items` holds the full book data for the drawer / wishlist page.
 */
interface WishlistState {
  ids: Set<string>;
  items: BookCardData[] | null;
  hydrated: boolean;
  hydrate: (force?: boolean) => Promise<void>;
  toggle: (bookId: string) => Promise<boolean>; // resolves to the new saved state
  remove: (bookId: string) => Promise<void>;
  clear: () => void;
}

export const useWishlist = create<WishlistState>((set, get) => ({
  ids: new Set(),
  items: null,
  hydrated: false,

  hydrate: async (force = false) => {
    if (!getToken()) return;
    if (get().hydrated && !force) return;
    try {
      const items = await clientApi.get<BookCardData[]>("/wishlist");
      set({ items: [...items].reverse(), ids: new Set(items.map((b) => b._id)), hydrated: true });
    } catch {
      /* keep whatever we had */
    }
  },

  toggle: async (bookId) => {
    const has = get().ids.has(bookId);
    // Optimistic flip so the heart + count react immediately.
    const ids = new Set(get().ids);
    if (has) {
      ids.delete(bookId);
      set({ ids, items: get().items?.filter((b) => b._id !== bookId) ?? null });
    } else {
      ids.add(bookId);
      set({ ids });
    }
    try {
      if (has) {
        await clientApi.del(`/wishlist/${bookId}`);
      } else {
        await clientApi.post(`/wishlist`, { bookId, source: "book_card" });
        await get().hydrate(true); // pull full book data so the drawer shows it
      }
    } catch {
      // Revert on failure, then resync from the server.
      const revert = new Set(get().ids);
      if (has) revert.add(bookId);
      else revert.delete(bookId);
      set({ ids: revert });
      await get().hydrate(true);
    }
    return !has;
  },

  remove: async (bookId) => {
    const ids = new Set(get().ids);
    ids.delete(bookId);
    set({ ids, items: get().items?.filter((b) => b._id !== bookId) ?? null });
    try {
      await clientApi.del(`/wishlist/${bookId}`);
    } catch {
      await get().hydrate(true);
    }
  },

  clear: () => set({ ids: new Set(), items: null, hydrated: false }),
}));
