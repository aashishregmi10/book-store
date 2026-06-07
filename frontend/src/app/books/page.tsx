import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { BookCardData, Genre, Paged } from "@/lib/types";
import { BookCard } from "@/components/books/BookCard";
import { BooksFilters } from "@/components/books/BooksFilters";
import { BooksToolbar } from "@/components/books/BooksToolbar";

export const dynamic = "force-dynamic";

const FILTER_PARAMS = ["q", "genre", "language", "format", "year", "page", "sort"];

// Filtered/sorted/paged catalogue views are consolidated to the clean /books
// canonical and kept out of the index (links stay followable) to avoid thin,
// near-duplicate pages eating crawl budget.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = FILTER_PARAMS.some((k) => sp[k]);
  return {
    title: sp.q ? `Search: ${sp.q}` : "All Books",
    description: "Browse every title at PageTurn Nepal — NPR prices, cash on delivery across all seven provinces.",
    alternates: { canonical: "/books" },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [data, genres] = await Promise.all([
    apiGet<Paged<BookCardData>>("/books", {
      tags: ["books"],
      searchParams: {
        q: sp.q,
        search: sp.q,
        sort: sp.sort,
        genre: sp.genre,
        language: sp.language,
        format: sp.format,
        year: sp.year,
        page: sp.page,
      },
    }).catch(() => null),
    apiGet<Genre[]>("/genres", { tags: ["genres"] }).catch(() => [] as Genre[]),
  ]);

  const page = data?.page ?? 1;
  const pages = data?.pages ?? 1;

  // Build a page URL that preserves the current filters/sort/search.
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") params.set(k, v);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `/books?${qs}` : "/books";
  };

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-10 sm:px-8 lg:px-16 xl:px-24">
      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <BooksFilters genres={genres.map((g) => ({ slug: g.slug, name: g.name }))} />

        <div className="min-w-0">
          <BooksToolbar genres={genres.map((g) => ({ slug: g.slug, name: g.name }))} total={data?.total ?? 0} />

          {!data ? (
            <p className="py-20 text-center font-body text-muted">
              We couldn&apos;t reach the catalogue — make sure the API is running, then refresh.
            </p>
          ) : data.items.length === 0 ? (
            <div className="py-20 text-center">
              <p className="font-display text-2xl text-text">No matches on this shelf.</p>
              <p className="mt-2 font-body text-muted">Try removing a filter or searching for something else.</p>
              <Link href="/books" className="mt-5 inline-block rounded-full bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">
                Reset filters
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {data.items.map((b) => (
                  <BookCard key={b.slug} book={b} />
                ))}
              </div>

              {pages > 1 && (
                <nav className="mt-12 flex items-center justify-center gap-2" aria-label="Pagination">
                  <PageLink href={pageHref(page - 1)} disabled={page <= 1} aria-label="Previous page">
                    <ChevronLeft className="size-4" />
                  </PageLink>
                  {pageWindow(page, pages).map((n, i) =>
                    n === "…" ? (
                      <span key={`gap${i}`} className="px-2 font-data text-sm text-muted">
                        …
                      </span>
                    ) : (
                      <PageLink key={n} href={pageHref(n)} active={n === page}>
                        {n}
                      </PageLink>
                    )
                  )}
                  <PageLink href={pageHref(page + 1)} disabled={page >= pages} aria-label="Next page">
                    <ChevronRight className="size-4" />
                  </PageLink>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
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
      <span className="grid size-9 cursor-not-allowed place-items-center rounded-md border border-border font-data text-sm text-muted/40" {...rest}>
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
