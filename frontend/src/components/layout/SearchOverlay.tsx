"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Search, X, BookText, User as UserIcon, Tag } from "lucide-react";
import { useSearchOverlay } from "@/lib/stores/searchOverlay";
import { clientApi, ClientApiError } from "@/lib/client-api";

interface Suggestions {
  books: { slug: string; title: string; author: string; coverImage: { secureUrl: string } }[];
  genres: { slug: string; name: string }[];
  authors: { name: string }[];
}

/**
 * Full-screen search input (mobile entry point — the header search is desktop-
 * only) with a live, debounced typeahead: matching books, authors and genres
 * appear below the field as you type. Enter searches the full catalogue.
 */
export function SearchOverlay() {
  const open = useSearchOverlay((s) => s.open);
  const close = useSearchOverlay((s) => s.close);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Suggestions | null>(null);
  const [loading, setLoading] = useState(false);

  // Lock scroll + Escape while open.
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

  // Debounced typeahead. All setState lives inside the timeout/promise (async),
  // so it never fires synchronously within the effect.
  useEffect(() => {
    const term = q.trim();
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
  }, [q]);

  if (!open) return null;

  function go(href: string) {
    close();
    setQ("");
    router.push(href);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    go(term ? `/books?q=${encodeURIComponent(term)}` : "/books");
  }

  const term = q.trim();
  const hasAny = results && (results.books.length || results.authors.length || results.genres.length);

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="animate-overlay-in absolute inset-0 bg-text/40 backdrop-blur-sm" onClick={close} />
      <div className="animate-panel-in absolute inset-x-0 top-0 flex max-h-[88vh] flex-col border-b border-border bg-bg p-4 shadow-lg">
        <form onSubmit={submit} className="mx-auto flex w-full max-w-2xl items-center gap-2">
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

        {/* Live suggestions */}
        {term.length >= 2 && (
          <div className="mx-auto mt-3 w-full max-w-2xl overflow-y-auto">
            {!hasAny ? (
              <p className="px-1 py-6 text-center font-body text-sm text-muted">
                {loading ? "Searching…" : <>No quick matches — press <span className="text-text">Enter</span> to search the full catalogue.</>}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {results!.books.length > 0 && (
                  <ul className="py-1.5">
                    {results!.books.map((b) => (
                      <li key={b.slug}>
                        <button onClick={() => go(`/books/${b.slug}`)} className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-surface">
                          <Image src={b.coverImage.secureUrl} alt="" width={32} height={48} className="h-12 w-8 shrink-0 rounded border border-border object-cover" />
                          <span className="min-w-0">
                            <span className="block truncate font-body text-sm text-text">{b.title}</span>
                            <span className="block truncate font-body text-xs text-muted">{b.author}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {results!.authors.length > 0 && (
                  <ul className="py-1.5">
                    {results!.authors.map((a) => (
                      <li key={a.name}>
                        <button onClick={() => go(`/books?author=${encodeURIComponent(a.name)}`)} className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-surface">
                          <UserIcon className="size-4 shrink-0 text-muted" />
                          <span className="truncate font-body text-sm text-text">{a.name}</span>
                          <span className="ml-auto font-data text-[10px] uppercase tracking-wide text-muted">Author</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {results!.genres.length > 0 && (
                  <ul className="py-1.5">
                    {results!.genres.map((g) => (
                      <li key={g.slug}>
                        <button onClick={() => go(`/genre/${g.slug}`)} className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-surface">
                          <Tag className="size-4 shrink-0 text-muted" />
                          <span className="truncate font-body text-sm text-text">{g.name}</span>
                          <span className="ml-auto font-data text-[10px] uppercase tracking-wide text-muted">Genre</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={`/books?q=${encodeURIComponent(term)}`} onClick={close} className="flex items-center gap-2 px-1 py-3 font-data text-xs uppercase tracking-wide text-accent hover:underline">
                  <BookText className="size-4" /> See all results for “{term}”
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
