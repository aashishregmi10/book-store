"use client";

import { create } from "zustand";

type Drawer = "cart" | "wishlist" | null;

interface UiDrawerState {
  open: Drawer;
  openCart: () => void;
  openWishlist: () => void;
  close: () => void;
}

export const useDrawer = create<UiDrawerState>((set) => ({
  open: null,
  openCart: () => set({ open: "cart" }),
  openWishlist: () => set({ open: "wishlist" }),
  close: () => set({ open: null }),
}));
