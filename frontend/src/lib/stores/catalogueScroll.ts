"use client";

import { create } from "zustand";

/**
 * Set by BooksGrid while infinite scroll still has more pages to fetch, so
 * ChromeGate can keep the global footer off-screen on mobile until the shelf
 * is fully loaded — otherwise it flashes in between load-more batches.
 */
interface CatalogueScrollState {
  loadingMore: boolean;
  setLoadingMore: (v: boolean) => void;
}

export const useCatalogueScroll = create<CatalogueScrollState>((set) => ({
  loadingMore: false,
  setLoadingMore: (v) => set({ loadingMore: v }),
}));
