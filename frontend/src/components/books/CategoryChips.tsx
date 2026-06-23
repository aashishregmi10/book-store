"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Horizontal, swipeable genre chips for quick one-tap browsing — the mobile
 * alternative to the filter sidebar (which stays available behind the Filters
 * toggle). Toggles the `genre` query param, same as the sidebar's Genre filter.
 */
export function CategoryChips({
  genres,
  className = "",
}: {
  genres: { slug: string; name: string }[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = new Set((sp.get("genre") || "").split(",").filter(Boolean));

  function go(slug?: string) {
    const params = new URLSearchParams(sp.toString());
    params.delete("page");
    if (!slug) {
      params.delete("genre");
    } else {
      const set = new Set(active);
      if (set.has(slug)) set.delete(slug);
      else set.add(slug);
      if (set.size) params.set("genre", [...set].join(","));
      else params.delete("genre");
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (!genres.length) return null;

  return (
    <div className={`-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
      <Chip label="All" active={active.size === 0} onClick={() => go()} />
      {genres.map((g) => (
        <Chip key={g.slug} label={g.name} active={active.has(g.slug)} onClick={() => go(g.slug)} />
      ))}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 font-data text-xs uppercase tracking-wide transition-colors ${
        active ? "border-accent bg-accent text-white" : "border-border text-text hover:border-accent"
      }`}
    >
      {label}
    </button>
  );
}
