"use client";

import { useState } from "react";
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

// Most recent six years (today is 2026).
const YEARS: Option[] = Array.from({ length: 6 }, (_, i) => {
  const y = String(2026 - i);
  return { value: y, label: y };
});

export function BooksFilters({ genres }: { genres: { slug: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [genreQuery, setGenreQuery] = useState("");

  const selected = (key: string) => new Set((sp.get(key) || "").split(",").filter(Boolean));

  function toggle(key: string, value: string) {
    const set = selected(key);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    const params = new URLSearchParams(sp.toString());
    if (set.size) params.set(key, [...set].join(","));
    else params.delete(key);
    params.delete("page"); // reset pagination when filters change
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearAll() {
    const params = new URLSearchParams(sp.toString());
    ["genre", "language", "format", "year"].forEach((k) => params.delete(k));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const activeCount =
    selected("genre").size + selected("language").size + selected("format").size + selected("year").size;

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

      <div className={`${mobileOpen ? "block" : "hidden"} lg:block`}>
        {activeCount > 0 && (
          <button onClick={clearAll} className="mb-3 font-data text-xs uppercase tracking-wide text-accent hover:underline">
            Clear all ({activeCount})
          </button>
        )}

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
                <Check key={o.value} label={o.label} checked={selected("genre").has(o.value)} onChange={() => toggle("genre", o.value)} />
              ))
            )}
          </div>
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

        <Section title="Publication Year" last>
          {YEARS.map((o) => (
            <Check key={o.value} label={o.label} checked={selected("year").has(o.value)} onChange={() => toggle("year", o.value)} />
          ))}
        </Section>
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
