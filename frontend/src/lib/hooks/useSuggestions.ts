"use client";

import { useEffect, useState } from "react";
import { clientApi, ClientApiError } from "@/lib/client-api";

export interface Suggestions {
  books: { slug: string; title: string; author: string; coverImage: { secureUrl: string } }[];
  genres: { slug: string; name: string }[];
  authors: { name: string }[];
}

/**
 * Debounced search typeahead. Fetches book/author/genre suggestions for `query`
 * (2+ chars), cancelling stale requests. Shared by the mobile search overlay and
 * the desktop header search.
 */
export function useSuggestions(query: string) {
  const [results, setResults] = useState<Suggestions | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      if (term.length < 2) {
        setResults(null);
        return;
      }
      setLoading(true);
      clientApi
        .get<Suggestions>(`/books/search-suggestions?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((d) => setResults(d))
        .catch((err) => {
          if (!(err instanceof ClientApiError && err.errors?.[0]?.code === "ABORTED")) setResults(null);
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  return { results, loading };
}
