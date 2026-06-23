"use client";

import { create } from "zustand";

/** Which book (by slug) is showing in the quick-view sheet, or null. */
interface QuickViewState {
  slug: string | null;
  open: (slug: string) => void;
  close: () => void;
}

export const useQuickView = create<QuickViewState>((set) => ({
  slug: null,
  open: (slug) => set({ slug }),
  close: () => set({ slug: null }),
}));
