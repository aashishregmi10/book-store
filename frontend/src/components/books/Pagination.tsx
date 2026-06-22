import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Shared catalogue pagination — compact page window with prev/next.
 * `hrefFor(n)` builds the URL for page n (callers preserve their own filters/sort).
 * Renders nothing for a single page.
 */
export function Pagination({
  page,
  pages,
  hrefFor,
}: {
  page: number;
  pages: number;
  hrefFor: (n: number) => string;
}) {
  // Coerce defensively — query params arrive as strings, and "5" + 2 = "52"
  // would otherwise blow up the window. Number() keeps the maths correct.
  const current = Number(page) || 1;
  const total = Number(pages) || 1;
  if (total <= 1) return null;
  return (
    <nav className="mt-12 flex flex-wrap items-center justify-center gap-2" aria-label="Pagination">
      <PageLink href={hrefFor(current - 1)} disabled={current <= 1} aria-label="Previous page">
        <ChevronLeft className="size-4" />
      </PageLink>
      {pageWindow(current, total).map((n, i) =>
        n === "…" ? (
          <span key={`gap-${i}`} className="px-2 font-data text-sm text-muted">
            …
          </span>
        ) : (
          <PageLink key={`pg-${i}`} href={hrefFor(n)} active={n === current} current={n === current}>
            {n}
          </PageLink>
        )
      )}
      <PageLink href={hrefFor(current + 1)} disabled={current >= total} aria-label="Next page">
        <ChevronRight className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  children,
  active,
  current,
  disabled,
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  current?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  if (disabled) {
    return (
      <span
        className="grid size-9 cursor-not-allowed place-items-center rounded-md border border-border font-data text-sm text-muted/40"
        {...rest}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      {...rest}
      aria-current={current ? "page" : undefined}
      className={`grid size-9 place-items-center rounded-md border font-data text-sm transition-colors ${
        active ? "border-accent bg-accent font-semibold text-white" : "border-border text-text hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * Smart page list with first/last always shown, the current page ±2, and
 * ellipses for gaps. Examples (total 102):
 *   current 1   → 1 2 3 4 5 … 102        (near start)
 *   current 8   → 1 … 6 7 8 9 10 … 102   (middle)
 *   current 102 → 1 … 98 99 100 101 102  (near end)
 * Totals ≤ 7 show every page with no ellipsis.
 */
function pageWindow(current: number, total: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  const range = (a: number, b: number) => {
    for (let i = a; i <= b; i += 1) out.push(i);
  };
  if (total <= 7) {
    range(1, total);
    return out;
  }
  const leftGap = current > 4; // need "…" after page 1
  const rightGap = current < total - 3; // need "…" before the last page

  if (!leftGap) {
    // Near the start: 1 2 3 4 5 … last
    range(1, 5);
    out.push("…", total);
  } else if (!rightGap) {
    // Near the end: 1 … last-4 … last
    out.push(1, "…");
    range(total - 4, total);
  } else {
    // Middle: 1 … current-2 … current+2 … last
    out.push(1, "…");
    range(current - 2, current + 2);
    out.push("…", total);
  }
  return out;
}
