"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus, Search } from "lucide-react";
import { clientApi } from "@/lib/client-api";

export interface PickedBook {
  _id: string;
  title: string;
}

interface SearchResult {
  _id: string;
  title: string;
  author: string;
}

export function RelatedBooksPicker({
  value,
  onChange,
}: {
  value: PickedBook[];
  onChange: (books: PickedBook[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    debounce.current = setTimeout(() => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      clientApi
        .get<SearchResult[]>(`/admin/books?search=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.slice(0, 8)))
        .catch(() => setResults([]));
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  function add(b: SearchResult) {
    if (!value.some((v) => v._id === b._id)) onChange([...value, { _id: b._id, title: b.title }]);
    setQuery("");
    setResults([]);
    setOpen(false);
  }
  function remove(id: string) {
    onChange(value.filter((v) => v._id !== id));
  }

  return (
    <div>
      <span className="font-data text-xs uppercase tracking-wide text-muted">Related books</span>

      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {value.map((b) => (
            <li key={b._id} className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 font-body text-xs text-accent">
              {b.title}
              <button type="button" onClick={() => remove(b._id)} aria-label="Remove"><X className="size-3" /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Search a book to link…"
          className="w-full border border-border bg-bg py-2 pl-9 pr-3 font-body text-sm text-text outline-none focus:border-accent"
        />
        {open && results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto border border-border bg-surface shadow-lg">
            {results.map((b) => (
              <li key={b._id}>
                <button
                  type="button"
                  onClick={() => add(b)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-body text-sm text-text hover:bg-hover"
                >
                  <Plus className="size-3.5 text-accent" />
                  <span className="truncate">{b.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted">{b.author}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
