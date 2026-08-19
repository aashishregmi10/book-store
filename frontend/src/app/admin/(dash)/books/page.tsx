"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Plus, Pencil, Trash2, Eye, EyeOff, X } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Pagination } from "@/components/books/Pagination";
import type { AdminBook, Genre } from "./_components/types";

// 10 rows against a 6,000-title catalogue meant 600+ pages, and the shelving
// backlog is worked in batches — you want a screenful, judged together.
const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 400;
const BULK_MAX = 100; // matches the API's cap on PATCH /admin/books/bulk

// The holding pen for imports whose subject data was inconclusive. Not a live
// genre and never browsable on the storefront (see /CLAUDE.md), but it is the
// single most useful filter in here: it *is* the backlog worklist.
const UNCLASSIFIED = "unclassified";

/** Type a page number and jump straight there — for hops the numbered
 *  window can't reach (page 2 → 8). Clamps out-of-range input rather than
 *  requesting a page the API would return empty. */
function JumpToPage({ pages, onJump }: { pages: number; onJump: (n: number) => void }) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return;
    onJump(Math.min(n, pages));
    setValue("");
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <label htmlFor="jump-to-page" className="uppercase tracking-wide">
        Go to
      </label>
      <input
        id="jump-to-page"
        type="number"
        min={1}
        max={pages}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={String(pages)}
        aria-label={`Jump to a page, 1 to ${pages}`}
        className="w-16 border border-border bg-surface px-2 py-1.5 text-center tabular-nums text-text outline-none focus:border-accent"
      />
      <button
        type="submit"
        className="border border-border px-2.5 py-1.5 uppercase tracking-wide text-text hover:border-accent hover:text-accent"
      >
        Go
      </button>
    </form>
  );
}

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Hidden" },
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

  // The URL is the single source of truth for search/tab/genre/page — shareable,
  // survives a refresh, and back/forward moves between prior filter states.
  const search = searchParams.get("search") || "";
  const tab = (searchParams.get("tab") as TabKey) || "all";
  const genre = searchParams.get("genre") || "";
  const page = Number(searchParams.get("page")) || 1;

  // Local echo of the search box so typing feels instant; only pushed to the
  // URL (and therefore only triggers a fetch) after SEARCH_DEBOUNCE_MS of
  // no typing, same debounce-in-an-effect pattern as lib/hooks/useSuggestions.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local echo from the URL (external source of truth) on back/forward navigation
    setSearchInput(search);
  }, [search]);

  // Reads the live URL rather than the `searchParams` captured at render time.
  // The debounced search effect depends only on `searchInput`, so it fires with
  // whatever closure it was created in: click a tab while a keystroke is still
  // settling and the pending push would replay the old query string and drop
  // the tab again. Reading window.location at call time keeps every update a
  // patch on the current URL instead of on a snapshot of an older one.
  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(
        typeof window === "undefined" ? searchParams.toString() : window.location.search
      );
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

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
  // Failures in here used to be swallowed — `del` had a bare `.catch(() => {})`,
  // so a book that could not be deleted looked deleted until the next refresh
  // quietly put it back.
  const [error, setError] = useState("");

  // Genre list powers both the filter and the bulk "shelve into" picker.
  const [genres, setGenres] = useState<Genre[]>([]);
  useEffect(() => {
    clientApi
      .get<Genre[]>("/admin/genres")
      .then((g) => setGenres(g.filter((x) => x.isActive && x.slug !== UNCLASSIFIED)))
      .catch(() => setGenres([])); // degrades to "All genres"; the table still works
  }, []);

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
    if (genre) params.set("genre", genre);
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
        setError(err?.message || "Couldn't load books.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [search, page, tab, genre, refreshKey]);

  // ── Selection ────────────────────────────────────────────
  // Ids only, and cleared whenever the visible set changes: a selection carried
  // across a filter change would act on rows you can no longer see.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selection is scoped to the current result set
    setSelected(new Set());
  }, [search, page, tab, genre, refreshKey]);

  const allOnPageSelected = books.length > 0 && books.every((b) => selected.has(b._id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) =>
      books.every((b) => prev.has(b._id)) ? new Set() : new Set(books.map((b) => b._id))
    );
  }

  // ── Actions ──────────────────────────────────────────────
  const [busy, setBusy] = useState(false);

  async function bulk(set: { genre?: string; isActive?: boolean }, verb: string) {
    const ids = [...selected];
    if (!ids.length || ids.length > BULK_MAX) return;
    setError("");
    setBusy(true);
    try {
      await clientApi.patch("/admin/books/bulk", { ids, set });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      // The API refuses to publish books missing a genre, cover or price and
      // says how many — surface that verbatim rather than a generic failure.
      setError((e as Error)?.message || `Couldn't ${verb} those books.`);
    } finally {
      setBusy(false);
    }
  }

  function onTab(key: TabKey) {
    updateParams({ tab: key === "all" ? null : key, page: null }); // switching tabs restarts at page 1
  }

  function goToPage(next: number) {
    updateParams({ page: next === 1 ? null : String(next) });
  }

  // Same URL shape goToPage produces, as an href — lets <Pagination> render
  // real links (middle-click, open-in-new-tab) instead of click handlers.
  function hrefForPage(n: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (n === 1) params.delete("page");
    else params.set("page", String(n));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  async function del(e: React.MouseEvent, b: AdminBook) {
    e.stopPropagation();
    if (!confirm(`Delete "${b.title}"? This cannot be undone.`)) return;
    setError("");
    try {
      await clientApi.del(`/admin/books/${b._id}`);
      // Step back a page if we just removed the only row on it.
      if (books.length === 1 && page > 1) goToPage(page - 1);
      else setRefreshKey((k) => k + 1);
    } catch (err) {
      setError((err as Error)?.message || `Couldn't delete "${b.title}".`);
    }
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search title or author…"
          className="w-full max-w-sm border border-border bg-surface px-3 py-2 font-body text-sm text-text outline-none focus:border-accent"
        />
        <select
          value={genre}
          onChange={(e) => updateParams({ genre: e.target.value || null, page: null })}
          aria-label="Filter by genre"
          className="border border-border bg-surface px-3 py-2 font-body text-sm text-text outline-none focus:border-accent"
        >
          <option value="">All genres</option>
          {/* First because it is the backlog, and the backlog is what someone
              opening this filter is nearly always here to work through. */}
          <option value={UNCLASSIFIED}>Unshelved (backlog)</option>
          {genres.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.name}
            </option>
          ))}
        </select>
        {(genre || tab !== "all" || search) && (
          <button
            onClick={() => updateParams({ genre: null, tab: null, search: null, page: null })}
            className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-muted hover:text-accent"
          >
            <X className="size-3.5" /> Clear filters
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 border border-sale/40 bg-sale/5 px-4 py-3 font-body text-sm text-sale">
          {error}
        </p>
      )}

      {/* ── Bulk action bar ──────────────────────────────────
          Appears only with a selection. Shelving and publishing are separate
          controls on purpose: giving a book a genre is reversible metadata,
          publishing puts it on a public, crawlable URL. */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-30 mt-4 flex flex-wrap items-center gap-3 border border-accent/40 bg-accent/5 px-4 py-3">
          <span className="font-data text-sm text-text">
            {selected.size} selected
            {selected.size >= BULK_MAX && <span className="text-muted"> (max {BULK_MAX})</span>}
          </span>

          <select
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              const value = e.target.value;
              e.target.value = ""; // reset so the same genre can be applied twice in a row
              if (value) bulk({ genre: value }, "shelve");
            }}
            aria-label="Shelve selected books into a genre"
            className="border border-border bg-surface px-3 py-1.5 font-body text-sm text-text outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="">Shelve into…</option>
            {genres.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.name}
              </option>
            ))}
          </select>

          <button
            disabled={busy}
            onClick={() => bulk({ isActive: true }, "publish")}
            className="inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 font-data text-xs uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <Eye className="size-3.5" /> Publish
          </button>
          <button
            disabled={busy}
            onClick={() => bulk({ isActive: false }, "hide")}
            className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 font-data text-xs uppercase tracking-wide text-text hover:border-sale hover:text-sale disabled:opacity-50"
          >
            <EyeOff className="size-3.5" /> Hide
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="font-data text-xs uppercase tracking-wide text-muted hover:text-accent"
          >
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-5">
          <TableSkeleton rows={6} cols={5} />
        </div>
      ) : (
      <div className="mt-5 overflow-x-auto border border-border bg-surface">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-bg font-data text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  aria-label="Select every book on this page"
                  className="size-4 accent-[var(--color-accent)]"
                />
              </th>
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
                className={`cursor-pointer hover:bg-bg ${selected.has(b._id) ? "bg-accent/5" : ""}`}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(b._id)}
                    onChange={() => toggleOne(b._id)}
                    aria-label={`Select ${b.title}`}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                </td>
                <td className="px-4 py-3">
                  <p className="font-body text-sm text-text">{b.title}</p>
                  <p className="font-body text-xs text-muted">{b.author}</p>
                </td>
                <td className="px-4 py-3 font-data text-sm text-text">{npr(b.price)}</td>
                <td className="px-4 py-3">
                  <span className={`font-data text-xs ${b.stock <= 3 ? "text-sale" : "text-accent"}`}>{b.stock}</span>
                </td>
                <td className="px-4 py-3">
                  {/* Genre and visibility read as badges rather than a bare word
                      plus an easily-missed "· hidden" suffix — on the backlog
                      view every row is hidden, and what you are scanning for is
                      the genre that isn't there. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`font-data text-xs ${b.genre === UNCLASSIFIED ? "text-sale" : "text-muted"}`}>
                      {b.genre === UNCLASSIFIED
                        ? "unshelved"
                        : b.genre || (b.category ? `§ ${b.category}` : "—")}
                    </span>
                    {!b.isActive && (
                      <span className="border border-border px-1.5 py-0.5 font-data text-[10px] uppercase tracking-wide text-muted">
                        Hidden
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/books/${b.slug}/edit`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Edit ${b.title}`}
                      className="p-1.5 text-muted hover:text-accent"
                    >
                      <Pencil className="size-4" />
                    </Link>
                    <button
                      onClick={(e) => del(e, b)}
                      aria-label={`Delete ${b.title}`}
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
                <td colSpan={6} className="px-4 py-10 text-center font-body text-muted">
                  {search || genre || tab !== "all"
                    ? "Nothing matches those filters."
                    : "Nothing here yet, add your first book."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {!loading && total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 font-data text-xs text-muted">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {/* Numbered window (1 … 6 7 8 9 10 … 25) for nearby pages. */}
            <Pagination
              page={page}
              pages={pages}
              hrefFor={hrefForPage}
              className="flex flex-wrap items-center gap-1.5"
            />
            {/* The window only ever reaches current ±2, so a long list still
                needs a way to reach page 8 from page 2 in one move. */}
            {pages > 7 && <JumpToPage pages={pages} onJump={goToPage} />}
          </div>
        </div>
      )}
    </div>
  );
}
