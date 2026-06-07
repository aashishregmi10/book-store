"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

const SORTS: [string, string][] = [
  ["popular", "Most popular"],
  ["newest", "Newest arrivals"],
  ["price-low", "Price: low to high"],
  ["price-high", "Price: high to low"],
  ["rating", "Top rated"],
];

const FILTER_KEYS = ["genre", "language", "format", "year"] as const;

export function BooksToolbar({ genres, total }: { genres: { slug: string; name: string }[]; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const genreName = (slug: string) => genres.find((g) => g.slug === slug)?.name ?? slug.replace(/-/g, " ");

  const chips: { key: string; value: string; label: string }[] = [];
  for (const key of FILTER_KEYS) {
    (sp.get(key) || "")
      .split(",")
      .filter(Boolean)
      .forEach((v) => chips.push({ key, value: v, label: key === "genre" ? genreName(v) : v }));
  }
  if (sp.get("q")) chips.push({ key: "q", value: sp.get("q") as string, label: `“${sp.get("q")}”` });

  function push(params: URLSearchParams) {
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }
  function removeChip(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (key === "q") {
      params.delete("q");
    } else {
      const set = new Set((sp.get(key) || "").split(",").filter(Boolean));
      set.delete(value);
      if (set.size) params.set(key, [...set].join(","));
      else params.delete(key);
    }
    push(params);
  }
  function clearAll() {
    const params = new URLSearchParams(sp.toString());
    [...FILTER_KEYS, "q"].forEach((k) => params.delete(k));
    push(params);
  }
  function setSort(value: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("sort", value);
    push(params);
  }

  const sort = sp.get("sort") || "newest";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <p className="font-data text-xs uppercase tracking-wide text-muted">
          {total} {total === 1 ? "book" : "books"}
        </p>
        <label className="flex items-center gap-2">
          <span className="font-data text-xs uppercase tracking-wide text-muted">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 font-body text-sm text-text outline-none focus:border-accent"
          >
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={`${c.key}:${c.value}`}
              onClick={() => removeChip(c.key, c.value)}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 font-data text-xs capitalize text-accent transition-colors hover:bg-accent/20"
            >
              {c.label}
              <X className="size-3" />
            </button>
          ))}
          <button onClick={clearAll} className="font-data text-xs uppercase tracking-wide text-muted hover:text-sale">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
