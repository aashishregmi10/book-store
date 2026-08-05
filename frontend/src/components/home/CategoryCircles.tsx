import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface CategoryChip {
  name: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Tinted pastel circles, cycled by position rather than mapped per slug: a
 * genre added to the taxonomy later picks up a colour on its own instead of
 * rendering uncoloured until someone remembers to extend a lookup table.
 * Eight entries, so no two neighbours in a row ever share a tint.
 */
const TINTS = [
  { bg: "#fde7ef", fg: "#c2557e" }, // pink
  { bg: "#e3f5e9", fg: "#3b8f63" }, // green
  { bg: "#fdf1d8", fg: "#b5822a" }, // amber
  { bg: "#e2eefb", fg: "#2c6fb5" }, // blue
  { bg: "#eee9fa", fg: "#6b54b8" }, // lilac
  { bg: "#fcebe0", fg: "#c0663a" }, // peach
  { bg: "#f5e8fa", fg: "#94489e" }, // violet
  { bg: "#e0f2f1", fg: "#2f857e" }, // teal
];

/**
 * Quick-browse genre row: one tinted circle per genre, horizontally scrollable
 * with a visible track so it's obvious there's more past the right edge.
 */
export function CategoryCircles({ items }: { items: CategoryChip[] }) {
  if (items.length === 0) return null;

  return (
    <div className="scroll-row flex gap-5 px-1 pb-3 sm:gap-7">
      {items.map((item, i) => {
        const Icon = item.icon;
        const tint = TINTS[i % TINTS.length];
        return (
          // Fixed width so every chip is the same size regardless of label
          // length. Without it a name like "Business & Economics" stretches its
          // own column and the row stops lining up — very visible on mobile
          // now that the taxonomy uses longer, two-word genre names.
          <Link
            key={item.href}
            href={item.href}
            className="group flex w-20 shrink-0 flex-col items-center gap-2.5 sm:w-24"
          >
            <span
              className="grid size-16 shrink-0 place-items-center rounded-full transition-transform duration-200 group-hover:scale-105 sm:size-20"
              style={{ backgroundColor: tint.bg }}
            >
              <Icon className="size-7 sm:size-8" style={{ color: tint.fg }} strokeWidth={1.75} />
            </span>
            {/* Two lines max, centred — long genre names wrap instead of
                forcing the column wider. */}
            <span className="line-clamp-2 text-center font-data text-[11px] leading-tight uppercase tracking-wide text-text transition-colors group-hover:text-accent">
              {item.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
