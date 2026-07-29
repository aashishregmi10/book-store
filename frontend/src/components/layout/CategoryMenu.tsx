"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { Genre } from "@/lib/types";

/** Grace period before a hover-out closes the panel, so a diagonal mouse path
 *  from the trigger down into the panel doesn't dismiss it mid-move. */
const CLOSE_DELAY_MS = 140;

/**
 * "Category" nav item with a hover-opened mega-menu of every genre.
 *
 * The links are server-rendered into every page's HTML rather than fetched on
 * open — the genre silo depends on these internal links being crawlable, and a
 * menu that only populates on hover is invisible to crawlers.
 *
 * Hover is a pointer-only affordance, so the trigger is also a real link
 * (works without JS, and taps through on touch) and the panel opens on
 * keyboard focus. Escape closes it.
 */
export function CategoryMenu({ genres, active }: { genres: Genre[]; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(() => () => cancelClose(), []);

  // Escape closes; a focus that lands outside the group closes too, so
  // tabbing past the last genre link doesn't leave the panel hanging open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onFocusIn = (e: FocusEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  // No genres loaded (API down) — degrade to the plain catalogue link.
  if (genres.length === 0) {
    return (
      <Link
        href="/books"
        className={`whitespace-nowrap font-data text-sm font-medium transition-colors hover:text-accent ${
          active ? "text-accent" : "text-text/80"
        }`}
      >
        Category
      </Link>
    );
  }

  return (
    <div
      ref={wrap}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <Link
        href="/books"
        aria-expanded={open}
        aria-haspopup="true"
        onFocus={() => setOpen(true)}
        className={`flex items-center gap-1 whitespace-nowrap font-data text-sm font-medium transition-colors hover:text-accent ${
          active ? "text-accent" : "text-text/80"
        }`}
      >
        Category
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </Link>

      {/* Always in the DOM so the genre links are crawlable; visibility is
          toggled rather than the subtree being unmounted. */}
      <div
        hidden={!open}
        className="absolute left-0 top-full z-50 pt-3"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <div className="w-[min(46rem,calc(100vw-3rem))] border border-border bg-bg p-5 shadow-[0_16px_40px_-16px_rgba(28,28,28,0.28)]">
          <p className="label-smallcaps mb-3 text-xs">Browse by genre</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
            {genres.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/genre/${g.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-baseline justify-between gap-3 rounded-sm px-2 py-2 font-body text-sm text-text transition-colors hover:bg-surface hover:text-accent"
                >
                  <span className="truncate">{g.name}</span>
                  {g.bookCount !== undefined && g.bookCount > 0 && (
                    <span className="shrink-0 font-data text-xs text-muted">{g.bookCount}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-3">
            <Link
              href="/books"
              onClick={() => setOpen(false)}
              className="font-data text-sm font-medium text-accent hover:underline"
            >
              Browse the whole catalogue →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
