/**
 * One-time localStorage key rename, for the 2026 rebrand to Books Temple Nepal.
 *
 * The persisted store keys carried the old brand. Renaming them alone would
 * silently empty every saved cart and sign every customer out, because zustand
 * would find nothing under the new key. This copies the old value across on
 * first load instead, so the rebrand is invisible to people mid-purchase.
 *
 * Must be called at module scope *before* the store is created — zustand's
 * persist middleware reads localStorage synchronously during `create()`.
 *
 * Safe to delete once enough time has passed that no meaningful number of
 * browsers still hold the old keys.
 */
export function renameStorageKey(from: string, to: string) {
  if (typeof window === "undefined") return; // SSR — no localStorage
  try {
    if (window.localStorage.getItem(to) !== null) return; // already migrated
    const previous = window.localStorage.getItem(from);
    if (previous === null) return; // nothing to carry over
    window.localStorage.setItem(to, previous);
    window.localStorage.removeItem(from);
  } catch {
    // Private mode, disabled storage, or quota — fall through to a fresh
    // store rather than breaking the page over a convenience migration.
  }
}
