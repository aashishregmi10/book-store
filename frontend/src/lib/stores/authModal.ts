"use client";

import { create } from "zustand";

type Mode = "login" | "signup";

interface AuthModalState {
  open: boolean;
  mode: Mode;
  next?: string; // where to go after a successful auth
  openLogin: (next?: string) => void;
  openSignup: (next?: string) => void;
  setMode: (mode: Mode) => void;
  close: () => void;
}

export const useAuthModal = create<AuthModalState>((set) => ({
  open: false,
  mode: "login",
  next: undefined,
  openLogin: (next) => set({ open: true, mode: "login", next }),
  openSignup: (next) => set({ open: true, mode: "signup", next }),
  setMode: (mode) => set({ mode }),
  close: () => set({ open: false, next: undefined }),
}));
