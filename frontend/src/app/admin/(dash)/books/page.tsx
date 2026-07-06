"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { TableSkeleton } from "@/components/ui/Skeleton";
import type { AdminBook } from "./_components/types";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "bestseller", label: "Bestseller" },
  { key: "featured", label: "Featured" },
  { key: "new-arrival", label: "New arrival" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

interface BooksPage {
  items: AdminBook[];
  total: number;
  page: number;
  pages: number;
}

export default function AdminBooks() {
  return (
    <Suspense fallback={<TableSkeleton rows={6} cols={5} />}>
      <AdminBooksContent />
    </Suspense>
  );
}

function AdminBooksContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL is the single source of truth for search/tab/page — shareable,
  // survives a refresh, and back/forward moves between prior filter states.
  const search = searchParams.get("search") || "";
  const tab = (searchParams.get("tab") as TabKey) || "all";
  const page = Number(searchParams.get("page")) || 1;

  // Local echo of the search box so typing feels instant; only pushed to the
  // URL (and therefore only triggers a fetch) after SEARCH_DEBOUNCE_MS of
  // no typing, same debounce-in-an-effect pattern as lib/hooks/useSuggestions.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local echo from the URL (external source of truth) on back/forward navigation
    setSearchInput(search);
  }, [search]);

  function updateParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params}`, { scroll: false });
  }

  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => {
      updateParams({ search: searchInput || null, page: null }); // new query restarts at page 1
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const [books, setBooks] = useState<AdminBook[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // AbortController cancels the in-flight request when the effect re-runs —
    // this dedupes React Strict Mode's dev-only double-invoke and prevents
    // search-as-you-type races (a slow earlier response can't clobber a newer one).
    const ctrl = new AbortController();
    // Intentional: show the spinner immediately when search/page changes. (On the
    // initial mount loading is already true, so this is a no-op render then.)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    if (tab !== "all") params.set("filter", tab);
    clientApi
      .get<BooksPage>(`/admin/books?${params}`, { signal: ctrl.signal })
      .then((d) => {
        setBooks(d.items);
        setTotal(d.total);
        setPages(d.pages);
      })
      .catch((err) => {
        if (err?.errors?.[0]?.code === "ABORTED") return; // superseded request — ignore
        setBooks([]);
        setTotal(0);
        setPages(1);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [search, page, tab, refreshKey]);

  function onTab(key: TabKey) {
    updateParams({ tab: key === "all" ? null : key, page: null }); // switching tabs restarts at page 1
  }

  function goToPage(next: number) {
    updateParams({ page: next === 1 ? null : String(next) });
  }

  async function del(e: React.MouseEvent, b: AdminBook) {
    e.stopPropagation();
    if (!confirm(`Delete “${b.title}”? This cannot be undone.`)) return;
    await clientApi.del(`/admin/books/${b._id}`).catch(() => {});
    // Step back a page if we just removed the only row on it.
    if (books.length === 1 && page > 1) goToPage(page - 1);
    else setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-text">Books</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/books/import"
            className="inline-flex items-center gap-2 border border-border px-4 py-2 font-data text-sm uppercase tracking-wide text-text hover:border-accent hover:text-accent"
          >
            Import
          </Link>
          <Link
            href="/admin/books/new"
            className="inline-flex items-center gap-2 bg-accent px-4 py-2 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover"
          >
            <Plus className="size-4" /> Add book
          </Link>
        </div>
      </div>

      {/* Status / merchandising tabs */}
      <div className="mt-5 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onTab(t.key)}
            className={`-mb-px border-b-2 px-3.5 py-2 font-data text-xs uppercase tracking-wide transition-colors ${
              tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search title or author…"
        className="mt-4 w-full max-w-sm border border-border bg-surface px-3 py-2 font-body text-sm text-text outline-none focus:border-accent"
      />

      {loading ? (
        <div className="mt-5">
          <TableSkeleton rows={6} cols={5} />
        </div>
      ) : (
      <div className="mt-5 overflow-x-auto border border-border bg-surface">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-bg font-data text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Genre</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {books.map((b) => (
              <tr
                key={b._id}
                onClick={() => router.push(`/admin/books/${b.slug}`)}
                className="cursor-pointer hover:bg-bg"
              >
                <td className="px-4 py-3">
                  <p className="font-body text-sm text-text">{b.title}</p>
                  <p className="font-body text-xs text-muted">
                    {b.author}
                    {!b.isActive && " · hidden"}
                  </p>
                </td>
                <td className="px-4 py-3 font-data text-sm text-text">{npr(b.price)}</td>
                <td className="px-4 py-3">
                  <span className={`font-data text-xs ${b.stock <= 3 ? "text-sale" : "text-accent"}`}>{b.stock}</span>
                </td>
                <td className="px-4 py-3 font-body text-sm text-muted">{b.genre}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/books/${b.slug}/edit`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Edit"
                      className="p-1.5 text-muted hover:text-accent"
                    >
                      <Pencil className="size-4" />
                    </Link>
                    <button
                      onClick={(e) => del(e, b)}
                      aria-label="Delete"
                      className="p-1.5 text-muted hover:text-sale"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {books.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center font-body text-muted">
                  Nothing here yet — add your first book.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {!loading && total > 0 && (
        <div className="mt-4 flex items-center justify-between font-data text-xs text-muted">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="border border-border px-3 py-1.5 uppercase tracking-wide text-text hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text"
            >
              Prev
            </button>
            <span className="tabular-nums">
              Page {page} of {pages}
            </span>
            <button
              onClick={() => goToPage(Math.min(pages, page + 1))}
              disabled={page >= pages}
              className="border border-border px-3 py-1.5 uppercase tracking-wide text-text hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
