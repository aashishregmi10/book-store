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

const MULTI_KEYS = ["genre", "language", "format", "year"] as const;
// Every filter key the toolbar can clear.
const ALL_KEYS = [...MULTI_KEYS, "q", "minPrice", "maxPrice", "minRating", "condition", "author", "publisher"];

type Chip = { id: string; kind: "multi" | "single" | "price" | "q"; key: string; value: string; label: string };

export function BooksToolbar({ genres, total }: { genres: { slug: string; name: string }[]; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const genreName = (slug: string) => genres.find((g) => g.slug === slug)?.name ?? slug.replace(/-/g, " ");

  const chips: Chip[] = [];
  for (const key of MULTI_KEYS) {
    (sp.get(key) || "")
      .split(",")
      .filter(Boolean)
      .forEach((v) => chips.push({ id: `${key}:${v}`, kind: "multi", key, value: v, label: key === "genre" ? genreName(v) : v }));
  }
  const minRating = sp.get("minRating");
  if (minRating) chips.push({ id: "minRating", kind: "single", key: "minRating", value: minRating, label: `${minRating}★ & up` });
  const condition = sp.get("condition");
  if (condition) chips.push({ id: "condition", kind: "single", key: "condition", value: condition, label: condition === "new" ? "New" : "Used" });
  const author = sp.get("author");
  if (author) chips.push({ id: "author", kind: "single", key: "author", value: author, label: author });
  const publisher = sp.get("publisher");
  if (publisher) chips.push({ id: "publisher", kind: "single", key: "publisher", value: publisher, label: publisher });
  const minP = sp.get("minPrice");
  const maxP = sp.get("maxPrice");
  if (minP || maxP) {
    const label = minP && maxP ? `Rs ${minP}–${maxP}` : minP ? `≥ Rs ${minP}` : `≤ Rs ${maxP}`;
    chips.push({ id: "price", kind: "price", key: "price", value: "", label });
  }
  if (sp.get("q")) chips.push({ id: "q", kind: "q", key: "q", value: sp.get("q") as string, label: `“${sp.get("q")}”` });

  function push(params: URLSearchParams) {
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }
  function removeChip(chip: Chip) {
    const params = new URLSearchParams(sp.toString());
    if (chip.kind === "multi") {
      const set = new Set((sp.get(chip.key) || "").split(",").filter(Boolean));
      set.delete(chip.value);
      if (set.size) params.set(chip.key, [...set].join(","));
      else params.delete(chip.key);
    } else if (chip.kind === "price") {
      params.delete("minPrice");
      params.delete("maxPrice");
    } else {
      params.delete(chip.key);
    }
    push(params);
  }
  function clearAll() {
    const params = new URLSearchParams(sp.toString());
    ALL_KEYS.forEach((k) => params.delete(k));
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
              key={c.id}
              onClick={() => removeChip(c)}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 font-data text-xs text-accent transition-colors hover:bg-accent/20"
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
