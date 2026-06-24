"use client";

import { create } from "zustand";

/** Controls the mobile search overlay (opened from the bottom nav / header). */
interface SearchOverlayState {
  open: boolean;
  openSearch: () => void;
  close: () => void;
}

export const useSearchOverlay = create<SearchOverlayState>((set) => ({
  open: false,
  openSearch: () => set({ open: true }),
  close: () => set({ open: false }),
}));
