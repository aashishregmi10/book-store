"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

const LANGUAGES: Option[] = [
  { value: "Nepali", label: "Nepali" },
  { value: "English", label: "English" },
  { value: "Others", label: "Others" },
];

const FORMS: Option[] = [
  { value: "Paperback", label: "Paperback" },
  { value: "Hardcover", label: "Hardcover" },
  { value: "E-book", label: "E-Book" },
  { value: "Audiobook", label: "Audiobook" },
];

const RATINGS: Option[] = [
  { value: "4", label: "4★ & up" },
  { value: "3", label: "3★ & up" },
  { value: "2", label: "2★ & up" },
];

// Multi-select (comma-joined) keys vs. single-value keys.
const MULTI_KEYS = ["genre", "language", "format"] as const;

export function BooksFilters({
  genres,
  authors = [],
  publishers = [],
  hideGenre = false,
  currentGenre,
}: {
  genres: { slug: string; name: string }[];
  authors?: string[];
  publishers?: string[];
  /** Hide the Genre filter (e.g. on a fixed section page like Manga/Kids). */
  hideGenre?: boolean;
  /**
   * Slug of the genre silo this page already represents (/genre/[slug]). There
   * the genre lives in the path, not the query, so it can't be a comma-joined
   * checkbox set: Genre becomes single-select and picking one navigates between
   * genre pages, which keeps each silo's own canonical + ItemList intact.
   */
  currentGenre?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [genreQuery, setGenreQuery] = useState("");
  const [authorQuery, setAuthorQuery] = useState("");
  const [publisherQuery, setPublisherQuery] = useState("");
  const appliedMin = sp.get("minPrice") || "";
  const appliedMax = sp.get("maxPrice") || "";
  const [priceMin, setPriceMin] = useState(appliedMin);
  const [priceMax, setPriceMax] = useState(appliedMax);

  // Keep the inputs in sync if the price filter changes from elsewhere (e.g.
  // its chip is removed in BooksToolbar, or "Clear all" runs) — otherwise the
  // Apply/Reset logic below would compare against a stale applied value.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local echo from the URL (external source of truth) when the filter changes elsewhere
    setPriceMin(appliedMin);
    setPriceMax(appliedMax);
  }, [appliedMin, appliedMax]);

  // Only offer "Reset" once the applied filter matches what's in the boxes —
  // if the shopper edits the range after applying, the button flips back to
  // "Apply" so they can commit the new range in one click instead of first
  // having to reset and then re-enter it.
  const hasAppliedPrice = !!(appliedMin || appliedMax);
  const priceDirty = priceMin !== appliedMin || priceMax !== appliedMax;
  const showPriceReset = hasAppliedPrice && !priceDirty;

  const selected = (key: string) => new Set((sp.get(key) || "").split(",").filter(Boolean));

  function commit(params: URLSearchParams) {
    params.delete("page"); // reset pagination when filters change
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Multi-select toggle (comma-joined; only used for safe enum/slug values).
  function toggle(key: string, value: string) {
    const set = selected(key);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    const params = new URLSearchParams(sp.toString());
    if (set.size) params.set(key, [...set].join(","));
    else params.delete(key);
    commit(params);
  }

  // Single-select toggle (one value; clicking the active one clears it). Used for
  // rating, author, publisher — the last two can contain commas.
  function setSingle(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (sp.get(key) === value) params.delete(key);
    else params.set(key, value);
    commit(params);
  }

  function applyPrice() {
    const params = new URLSearchParams(sp.toString());
    if (priceMin) params.set("minPrice", priceMin);
    else params.delete("minPrice");
    if (priceMax) params.set("maxPrice", priceMax);
    else params.delete("maxPrice");
    commit(params);
  }

  function resetPrice() {
    const params = new URLSearchParams(sp.toString());
    params.delete("minPrice");
    params.delete("maxPrice");
    setPriceMin("");
    setPriceMax("");
    commit(params);
  }

  // On a genre silo the genre is the page itself, so it behaves as single-select:
  // another genre swaps silo, and unticking the current one widens to the full
  // catalogue. Other filters ride along either way.
  function chooseGenre(slug: string) {
    const params = new URLSearchParams(sp.toString());
    params.delete("page");
    params.delete("genre");
    const query = params.toString();
    const base = currentGenre === slug ? "/books" : `/genre/${slug}`;
    router.push(query ? `${base}?${query}` : base, { scroll: false });
  }

  // Badge on the mobile Filters toggle. The silo's own genre isn't a removable
  // filter, so it must not inflate this — a count that includes something the
  // panel can't clear reads as broken.
  const activeCount =
    MULTI_KEYS.reduce((n, k) => n + selected(k).size, 0) +
    (sp.get("minPrice") || sp.get("maxPrice") ? 1 : 0) +
    (sp.get("minRating") ? 1 : 0) +
    (sp.get("author") ? 1 : 0) +
    (sp.get("publisher") ? 1 : 0);

  const filterList = (items: string[], query: string) =>
    items.filter((v) => v.toLowerCase().includes(query.trim().toLowerCase()));

  const genreOptions = genres
    .filter((g) => g.name.toLowerCase().includes(genreQuery.trim().toLowerCase()))
    .map((g) => ({ value: g.slug, label: g.name }));

  return (
    <aside className="lg:w-60 lg:shrink-0">
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen((o) => !o)}
        className="mb-4 inline-flex w-full items-center justify-between rounded-md border border-border bg-surface px-4 py-2.5 font-data text-sm uppercase tracking-wide text-text lg:hidden"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="size-4" /> Filters{activeCount > 0 && ` (${activeCount})`}
        </span>
        {mobileOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {/* No "Clear all" here: the toolbar's removable chips sit above the grid
          on every screen this renders on, so a second clearing control in the
          sidebar was a duplicate of a control the shopper can already see. */}
      <div className={`${mobileOpen ? "block" : "hidden"} lg:block`}>

        {!hideGenre && (
          <Section title="Genre">
            <input
              value={genreQuery}
              onChange={(e) => setGenreQuery(e.target.value)}
              placeholder="Search genre…"
              className="mb-3 w-full rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text outline-none placeholder:text-muted focus:border-accent"
            />
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {genreOptions.length === 0 ? (
                <p className="font-body text-sm text-muted">No matching genres.</p>
              ) : (
                genreOptions.map((o) => (
                  <Check
                    key={o.value}
                    label={o.label}
                    checked={currentGenre ? currentGenre === o.value : selected("genre").has(o.value)}
                    onChange={() => (currentGenre ? chooseGenre(o.value) : toggle("genre", o.value))}
                  />
                ))
              )}
            </div>
          </Section>
        )}

        <Section title="Price (NPR)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="Min"
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-data text-sm text-text outline-none focus:border-accent"
            />
            <span className="text-muted">–</span>
            <input
              type="number"
              min={0}
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="Max"
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-data text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <button
            onClick={showPriceReset ? resetPrice : applyPrice}
            className={
              showPriceReset
                ? "mt-2.5 w-full rounded-md border border-border px-3 py-1.5 font-data text-xs uppercase tracking-wide text-muted hover:border-sale hover:text-sale"
                : "mt-2.5 w-full rounded-md bg-accent px-3 py-1.5 font-data text-xs uppercase tracking-wide text-white hover:bg-accent-hover"
            }
          >
            {showPriceReset ? "Reset" : "Apply"}
          </button>
        </Section>

        <Section title="Rating">
          {RATINGS.map((o) => (
            <Check key={o.value} label={o.label} checked={sp.get("minRating") === o.value} onChange={() => setSingle("minRating", o.value)} />
          ))}
        </Section>

        <Section title="Language">
          {LANGUAGES.map((o) => (
            <Check key={o.value} label={o.label} checked={selected("language").has(o.value)} onChange={() => toggle("language", o.value)} />
          ))}
        </Section>

        <Section title="Form">
          {FORMS.map((o) => (
            <Check key={o.value} label={o.label} checked={selected("format").has(o.value)} onChange={() => toggle("format", o.value)} />
          ))}
        </Section>

        {authors.length > 0 && (
          <Section title="Author">
            <input
              value={authorQuery}
              onChange={(e) => setAuthorQuery(e.target.value)}
              placeholder="Search author…"
              className="mb-3 w-full rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text outline-none placeholder:text-muted focus:border-accent"
            />
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {filterList(authors, authorQuery).map((a) => (
                <Check key={a} label={a} checked={sp.get("author") === a} onChange={() => setSingle("author", a)} />
              ))}
            </div>
          </Section>
        )}

        {publishers.length > 0 && (
          <Section title="Publisher">
            <input
              value={publisherQuery}
              onChange={(e) => setPublisherQuery(e.target.value)}
              placeholder="Search publisher…"
              className="mb-3 w-full rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text outline-none placeholder:text-muted focus:border-accent"
            />
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {filterList(publishers, publisherQuery).map((p) => (
                <Check key={p} label={p} checked={sp.get("publisher") === p} onChange={() => setSingle("publisher", p)} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`py-4 ${last ? "" : "border-b border-border"}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between">
        <span className="font-display text-base font-semibold text-text">{title}</span>
        {open ? <ChevronUp className="size-4 text-muted" /> : <ChevronDown className="size-4 text-muted" />}
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 font-body text-sm text-text">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-[var(--color-accent)]" />
      {label}
    </label>
  );
}
