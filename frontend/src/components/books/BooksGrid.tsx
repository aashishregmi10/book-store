"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clientApi } from "@/lib/client-api";
import type { BookCardData, Paged } from "@/lib/types";
import { useCatalogueScroll } from "@/lib/stores/catalogueScroll";
import { BookCard } from "./BookCard";

/**
 * Catalogue grid with "Load more" + infinite scroll (replaces numbered
 * pagination — painful on mobile). Progressive enhancement: the button is a real
 * link to the next page (crawlable / works without JS); JS intercepts it to fetch
 * and append. The first page is server-rendered for SEO.
 */
export function BooksGrid({
  initialItems,
  initialPage,
  pages,
  total,
  apiParams,
  path,
  urlQuery,
}: {
  initialItems: BookCardData[];
  initialPage: number;
  pages: number;
  total: number;
  apiParams: Record<string, string>; // params for GET /books (no page)
  path: string; // address-bar path, e.g. /books or /category/manga
  urlQuery: string; // address-bar query without page, for the crawlable href
}) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = page < pages;
  // Note: parents pass a `key` derived from the active filters/sort, so this
  // component remounts (fresh initialItems) whenever the query changes.

  // Tell ChromeGate to hold the footer off-screen (mobile) while there's more
  // to auto-load, so it doesn't flash in between load-more batches. Resets on
  // unmount so leaving the catalogue never leaves the footer stuck hidden.
  const setLoadingMore = useCatalogueScroll((s) => s.setLoadingMore);
  useEffect(() => {
    setLoadingMore(hasMore);
    return () => setLoadingMore(false);
  }, [hasMore, setLoadingMore]);

  const loadMore = useCallback(async () => {
    if (loading || page >= pages) return;
    setLoading(true);
    const next = page + 1;
    try {
      const usp = new URLSearchParams(apiParams);
      usp.set("page", String(next));
      const data = await clientApi.get<Paged<BookCardData>>(`/books?${usp.toString()}`);
      setItems((prev) => [...prev, ...data.items]);
      setPage(next);
    } catch {
      /* keep what we have; the link still works as a full navigation */
    } finally {
      setLoading(false);
    }
  }, [loading, page, pages, apiParams]);

  // Auto-load as the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const nextHref = `${path}?${urlQuery ? `${urlQuery}&` : ""}page=${page + 1}`;

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((b) => (
          <BookCard key={b._id} book={b} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-10 flex flex-col items-center gap-2">
          <div ref={sentinel} aria-hidden className="h-px w-full" />
          <a
            href={nextHref}
            onClick={(e) => {
              e.preventDefault();
              loadMore();
            }}
            aria-busy={loading}
            className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 font-data text-sm uppercase tracking-wide text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </a>
        </div>
      )}

      <p className="mt-4 text-center font-data text-xs uppercase tracking-wide text-muted">
        Showing {items.length} of {total}
      </p>
    </>
  );
}
