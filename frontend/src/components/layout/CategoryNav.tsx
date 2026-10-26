"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { Genre } from "@/lib/types";
import { groupGenres, type GenreGroup } from "@/lib/genreGroups";
import { NavDropdown } from "./NavDropdown";

// Shelves a browser reaches for most, one click from every page. Revealed by
// width: the row can't clip (the dropdown panels hang off it), so anything that
// doesn't fit at a breakpoint is hidden there rather than pushing the page
// sideways — at 1024px the full set needed ~1,210px of a ~1,010px row.
const QUICK = [
  { href: "/books?sort=popular", label: "Bestsellers", show: "flex" },
  { href: "/books?sort=newest", label: "New arrivals", show: "flex" },
  { href: "/genre/nepali-literature", label: "Nepali literature", show: "hidden xl:flex" },
  { href: "/genre/self-help", label: "Self-help", show: "hidden xl:flex" },
  { href: "/category/manga", label: "Manga", show: "hidden 2xl:flex" },
];

// Two-column lists flow down the first column before the second (CSS columns,
// not a grid), so a shelf list reads top to bottom like a store directory.
// Long names may wrap; the vertical padding keeps a wrapped name from running
// into the one below it.
function GenreList({ group, columns = 1 }: { group: GenreGroup; columns?: 1 | 2 }) {
  const item = "flex min-h-10 items-baseline justify-between gap-4 py-2 font-body text-[15px] leading-snug text-text transition-colors hover:text-accent";
  return (
    <ul className={columns === 2 ? "columns-2 gap-x-8" : ""}>
      {group.genres.map((g) => (
        <li key={g.slug} className="break-inside-avoid">
          <Link href={`/genre/${g.slug}`} className={item}>
            <span>{g.name}</span>
            {g.bookCount ? <span className="font-data text-xs text-muted">{g.bookCount}</span> : null}
          </Link>
        </li>
      ))}
      {group.extras.map((x) => (
        <li key={x.href} className="break-inside-avoid">
          <Link href={x.href} className={item}>
            {x.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const groupLabel = "mb-3 font-data text-xs font-semibold uppercase tracking-[0.16em] text-text";

/** The header's second row: every genre, grouped, plus the shelves people reach for most. */
export function CategoryNav({ genres }: { genres: Genre[] }) {
  const pathname = usePathname() ?? "";
  const groups = groupGenres(genres);
  if (groups.length === 0) return null;

  return (
    <nav aria-label="Categories" className="hidden border-b border-border bg-bg lg:block">
      <div className="shell flex items-center">
        <NavDropdown
          label="All categories"
          href="/books"
          icon={<Menu className="size-5" aria-hidden />}
          active={pathname.startsWith("/genre") || pathname.startsWith("/category")}
          panelClassName="w-[min(64rem,calc(100vw-4rem))]"
        >
          <div className="grid grid-cols-[1fr_2fr_1fr] gap-8">
            {groups.map((g) => (
              <div key={g.key}>
                <p className={groupLabel}>{g.label}</p>
                <GenreList group={g} columns={g.key === "non-fiction" ? 2 : 1} />
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <Link href="/books" className="font-body text-sm font-medium text-accent hover:underline">
              Browse the whole catalogue →
            </Link>
          </div>
        </NavDropdown>

        <span className="mx-2 h-6 w-px bg-border" aria-hidden />

        {groups.map((g) => (
          <NavDropdown key={g.key} label={g.label} panelClassName={g.key === "non-fiction" ? "w-[36rem]" : "w-72"}>
            <p className={groupLabel}>{g.label}</p>
            <GenreList group={g} columns={g.key === "non-fiction" ? 2 : 1} />
          </NavDropdown>
        ))}

        <span className="mx-2 h-6 w-px bg-border" aria-hidden />

        {QUICK.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className={`${q.show} min-h-11 items-center whitespace-nowrap px-3 font-body text-[15px] text-text transition-colors hover:text-accent`}
          >
            {q.label}
          </Link>
        ))}

        <Link
          href="/blog"
          className={`ml-auto hidden min-h-11 items-center whitespace-nowrap px-3 font-body text-[15px] transition-colors hover:text-accent xl:flex ${
            pathname.startsWith("/blog") ? "text-accent" : "text-muted"
          }`}
        >
          Reading guides
        </Link>
      </div>
    </nav>
  );
}
