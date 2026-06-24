"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useSearchOverlay } from "@/lib/stores/searchOverlay";

/**
 * Full-screen search input that drops down from the top — the mobile search
 * entry point (the header search bar is desktop-only). Opened from the bottom
 * nav's Search tab and the header magnifier; submits to /books?q=.
 */
export function SearchOverlay() {
  const open = useSearchOverlay((s) => s.open);
  const close = useSearchOverlay((s) => s.close);
  const router = useRouter();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    close();
    setQ("");
    router.push(term ? `/books?q=${encodeURIComponent(term)}` : "/books");
  }

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="animate-overlay-in absolute inset-0 bg-text/40 backdrop-blur-sm" onClick={close} />
      <div className="animate-panel-in absolute inset-x-0 top-0 border-b border-border bg-bg p-4 shadow-lg">
        <form onSubmit={submit} className="mx-auto flex max-w-2xl items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              name="q"
              aria-label="Search books"
              placeholder="Search by title, author, or ISBN"
              className="w-full rounded-full border border-border bg-surface py-3 pl-11 pr-4 font-body text-text outline-none focus:border-accent"
            />
          </div>
          <button type="submit" className="rounded-full bg-accent px-5 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">
            Go
          </button>
          <button type="button" onClick={close} aria-label="Close search" className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:text-text">
            <X className="size-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
