"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface AdminArticle {
  _id: string;
  slug: string;
  title: string;
  status: string;
  category?: string;
  readingTime?: number;
  publishedAt?: string;
  updatedAt?: string;
}

interface ArticlesPage {
  items: AdminArticle[];
  total: number;
  page: number;
  pages: number;
}

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 400;
const TABS = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/**
 * Articles list.
 *
 * Previously an unpaginated table fed by an endpoint capped at .limit(200):
 * fine while there were a dozen guides, a silent cliff at the scale this shelf
 * is heading for — article 201 simply would not exist in here. Now paged,
 * searchable and filterable by status, matching the books table.
 */
export default function AdminArticles() {
  const [rows, setRows] = useState<AdminArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<TabKey>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  // A failed delete used to be swallowed by a bare .catch(() => {}), so the row
  // reappeared on the next refresh with no explanation.
  const [error, setError] = useState("");

  // Debounce the search box, and reset to page 1 whenever the query changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronising to the API, same exception the books table documents
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (tab !== "all") params.set("status", tab);
    if (search) params.set("search", search);
    clientApi
      .get<ArticlesPage>(`/admin/articles?${params}`, { signal: ctrl.signal })
      .then((d) => {
        setRows(d.items);
        setTotal(d.total);
        setPages(d.pages);
      })
      .catch((err) => {
        if (err?.errors?.[0]?.code === "ABORTED") return; // superseded request
        setRows([]);
        setTotal(0);
        setPages(1);
        setError(err?.message || "Couldn't load articles.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [page, tab, search, refresh]);

  async function del(a: AdminArticle) {
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    setError("");
    try {
      await clientApi.del(`/admin/articles/${a._id}`);
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else setRefresh((n) => n + 1);
    } catch (err) {
      setError((err as Error)?.message || `Couldn't delete "${a.title}".`);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-text">Articles</h1>
        <Link
          href="/admin/articles/new"
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover"
        >
          <Plus className="size-4" /> New article
        </Link>
      </div>
      <p className="mt-1 max-w-prose font-body text-sm text-muted">
        Reading guides and recommendations. Published articles appear at /blog and feed search &amp; AI engines.
      </p>

      <div className="mt-5 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
            className={`-mb-px border-b-2 px-3.5 py-2 font-data text-xs uppercase tracking-wide transition-colors ${
              tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search title, slug or category…"
        className="mt-4 w-full max-w-sm border border-border bg-surface px-3 py-2 font-body text-sm text-text outline-none focus:border-accent"
      />

      {error && (
        <p role="alert" className="mt-4 border border-sale/40 bg-sale/5 px-4 py-3 font-body text-sm text-sale">
          {error}
        </p>
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
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((a) => (
                <tr key={a._id} className="hover:bg-hover">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/articles/${a.slug}/edit`}
                      className="font-body text-sm text-text hover:text-accent"
                    >
                      {a.title}
                    </Link>
                    <p className="font-data text-xs text-muted">
                      /{a.slug}
                      {a.readingTime ? ` · ${a.readingTime} min` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-muted">{a.category || "—"}</td>
                  <td className="px-4 py-3 font-data text-xs tabular-nums text-muted">
                    {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString("en-GB") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-data text-xs uppercase tracking-wide ${
                        a.status === "published" ? "text-accent" : "text-muted"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {a.status === "published" && (
                        <a
                          href={`/blog/${a.slug}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={`View ${a.title} on the site`}
                          className="p-1.5 text-muted hover:text-accent"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      )}
                      <Link
                        href={`/admin/articles/${a.slug}/edit`}
                        aria-label={`Edit ${a.title}`}
                        className="p-1.5 text-muted hover:text-accent"
                      >
                        <Pencil className="size-4" />
                      </Link>
                      <button
                        onClick={() => del(a)}
                        aria-label={`Delete ${a.title}`}
                        className="p-1.5 text-muted hover:text-sale"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center font-body text-muted">
                    {search || tab !== "all"
                      ? "Nothing matches those filters."
                      : "No articles yet, write your first guide."}
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
          {/* Prev/next rather than the storefront's numbered <Pagination>: that
              control renders real hrefs, and this table's paging lives in
              component state, not the URL. */}
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="border border-border px-3 py-1.5 uppercase tracking-wide text-text hover:border-accent hover:text-accent disabled:opacity-40"
            >
              Prev
            </button>
            <span className="tabular-nums">
              {page} / {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="border border-border px-3 py-1.5 uppercase tracking-wide text-text hover:border-accent hover:text-accent disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
