"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { renameStorageKey } from "./renameStorageKey";

// Carry any pre-rebrand session across before persist reads storage below,
// so the rename doesn't sign every existing customer out.
renameStorageKey("pageturn-auth", "bookstemple-auth");

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  points: number;
  tier: string;
  isAdmin?: boolean;
  referralCode?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  hydrated: boolean;
  setAuth: (user: AuthUser, token: string) => void;
  setUser: (user: AuthUser) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      hydrated: false,
      setAuth: (user, token) => set({ user, token }),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null, token: null }),
    }),
    {
      name: "bookstemple-auth",
      partialize: (s) => ({ user: s.user, token: s.token }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);

/** Read the current access token outside React (used by the API client). */
export const getToken = () => useAuth.getState().token;

/** Replace just the access token after a silent refresh. */
export const setAccessToken = (token: string) => useAuth.setState({ token });

/** Drop the session (refresh failed / logged out) outside React. */
export const clearAuth = () => useAuth.getState().clear();
