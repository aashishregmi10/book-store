"use client";

import Link from "next/link";
import Image from "next/image";
import { BookText, User as UserIcon, Tag } from "lucide-react";
import type { Suggestions } from "@/lib/hooks/useSuggestions";

/**
 * Renders typeahead results (books, authors, genres) + a "see all" link.
 * Presentational — the parent supplies data via useSuggestions and an
 * onNavigate callback to close its overlay/dropdown on selection.
 */
export function SearchSuggestions({
  term,
  results,
  loading,
  onNavigate,
}: {
  term: string;
  results: Suggestions | null;
  loading: boolean;
  onNavigate: () => void;
}) {
  const q = term.trim();
  if (q.length < 2) return null;

  const hasAny = results && (results.books.length || results.authors.length || results.genres.length);
  if (!hasAny) {
    return (
      <p className="px-3 py-6 text-center font-body text-sm text-muted">
        {loading ? "Searching…" : <>No quick matches — press <span className="text-text">Enter</span> to search the full catalogue.</>}
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {results!.books.length > 0 && (
        <ul className="py-1.5">
          {results!.books.map((b) => (
            <li key={b.slug}>
              <Link href={`/books/${b.slug}`} onClick={onNavigate} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface">
                <Image src={b.coverImage.secureUrl} alt="" width={32} height={48} className="h-12 w-8 shrink-0 rounded border border-border object-cover" />
                <span className="min-w-0">
                  <span className="block truncate font-body text-sm text-text">{b.title}</span>
                  <span className="block truncate font-body text-xs text-muted">{b.author}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {results!.authors.length > 0 && (
        <ul className="py-1.5">
          {results!.authors.map((a) => (
            <li key={a.name}>
              <Link href={`/books?author=${encodeURIComponent(a.name)}`} onClick={onNavigate} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface">
                <UserIcon className="size-4 shrink-0 text-muted" />
                <span className="truncate font-body text-sm text-text">{a.name}</span>
                <span className="ml-auto font-data text-[10px] uppercase tracking-wide text-muted">Author</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {results!.genres.length > 0 && (
        <ul className="py-1.5">
          {results!.genres.map((g) => (
            <li key={g.slug}>
              <Link href={`/genre/${g.slug}`} onClick={onNavigate} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface">
                <Tag className="size-4 shrink-0 text-muted" />
                <span className="truncate font-body text-sm text-text">{g.name}</span>
                <span className="ml-auto font-data text-[10px] uppercase tracking-wide text-muted">Genre</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/books?q=${encodeURIComponent(q)}`} onClick={onNavigate} className="flex items-center gap-2 px-2 py-3 font-data text-xs uppercase tracking-wide text-accent hover:underline">
        <BookText className="size-4" /> See all results for “{q}”
      </Link>
    </div>
  );
}
