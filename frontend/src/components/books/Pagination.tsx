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
  if (pages <= 1) return null;
  return (
    <nav className="mt-12 flex items-center justify-center gap-2" aria-label="Pagination">
      <PageLink href={hrefFor(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft className="size-4" />
      </PageLink>
      {pageWindow(page, pages).map((n, i) =>
        n === "…" ? (
          <span key={`gap${i}`} className="px-2 font-data text-sm text-muted">
            …
          </span>
        ) : (
          <PageLink key={n} href={hrefFor(n)} active={n === page}>
            {n}
          </PageLink>
        )
      )}
      <PageLink href={hrefFor(page + 1)} disabled={page >= pages} aria-label="Next page">
        <ChevronRight className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  children,
  active,
  disabled,
  ...rest
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
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
      className={`grid size-9 place-items-center rounded-md border font-data text-sm transition-colors ${
        active ? "border-accent bg-accent text-white" : "border-border text-text hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </Link>
  );
}

// Compact page list with ellipses: 1 … 4 5 [6] 7 8 … 20
function pageWindow(current: number, total: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  const add = (n: number) => out.push(n);
  const range = (a: number, b: number) => {
    for (let i = a; i <= b; i += 1) add(i);
  };
  if (total <= 7) {
    range(1, total);
    return out;
  }
  add(1);
  if (current > 4) out.push("…");
  range(Math.max(2, current - 1), Math.min(total - 1, current + 1));
  if (current < total - 3) out.push("…");
  add(total);
  return out;
}
