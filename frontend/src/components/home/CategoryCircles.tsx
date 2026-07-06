import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface CategoryChip {
  name: string;
  href: string;
  icon: LucideIcon;
  bg: string;
  fg: string;
}

/**
 * Photo-forward (well, icon-forward) quick-browse row, sitting above the
 * exhaustive text genre-pills row (kept as-is below this). Each circle uses a
 * warm, editorial tint — never the generic blue/purple SaaS palette — with an
 * icon colored a darker shade of the same hue for contrast.
 */
export function CategoryCircles({ items }: { items: CategoryChip[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mx-auto flex max-w-4xl justify-center gap-6 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:gap-8 sm:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className="group flex shrink-0 flex-col items-center gap-2.5">
            <span
              className="grid size-16 shrink-0 place-items-center rounded-full transition-transform group-hover:scale-105 sm:size-[72px]"
              style={{ backgroundColor: item.bg }}
            >
              <Icon className="size-6 sm:size-7" style={{ color: item.fg }} strokeWidth={1.75} />
            </span>
            <span className="font-data text-[11px] uppercase tracking-wide text-text transition-colors group-hover:text-accent">
              {item.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
