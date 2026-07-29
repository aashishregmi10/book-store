import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { BookCover } from "@/components/books/BookCover";

interface CategoryChip {
  name: string;
  href: string;
  icon: LucideIcon;
  bg: string;
  fg: string;
  cover?: string;
}

/**
 * Photo-forward quick-browse row: a real book cover inside each circle when
 * one is available (never a stock photo). Falls back to a tinted icon for
 * the rare category with no matching book yet.
 */
export function CategoryCircles({ items }: { items: CategoryChip[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto px-1 pb-1 sm:gap-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          // Fixed width so every chip is the same size regardless of label
          // length. Without it a name like "Business & Economics" stretches its
          // own column and the row stops lining up — very visible on mobile
          // now that the taxonomy uses longer, two-word genre names.
          <Link
            key={item.href}
            href={item.href}
            className="group flex w-16 shrink-0 flex-col items-center gap-2 sm:w-24"
          >
            {item.cover ? (
              <span className="relative size-12 shrink-0 overflow-hidden rounded-full border border-border transition-transform group-hover:scale-105 sm:size-14">
                <BookCover src={item.cover} alt={item.name} title={item.name} sizes="56px" />
              </span>
            ) : (
              <span
                className="grid size-12 shrink-0 place-items-center rounded-full transition-transform group-hover:scale-105 sm:size-14"
                style={{ backgroundColor: item.bg }}
              >
                <Icon className="size-5 sm:size-6" style={{ color: item.fg }} strokeWidth={1.75} />
              </span>
            )}
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
