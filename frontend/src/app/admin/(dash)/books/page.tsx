"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { TableSkeleton } from "@/components/ui/Skeleton";
import type { AdminBook } from "./_components/types";

export default function AdminBooks() {
  const router = useRouter();
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const path = search ? `/admin/books?search=${encodeURIComponent(search)}` : "/admin/books";
    clientApi
      .get<AdminBook[]>(path)
      .then((d) => active && setBooks(d))
      .catch(() => active && setBooks([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [search, refreshKey]);

  async function del(e: React.MouseEvent, b: AdminBook) {
    e.stopPropagation();
    if (!confirm(`Delete “${b.title}”? This cannot be undone.`)) return;
    await clientApi.del(`/admin/books/${b._id}`).catch(() => {});
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-text">Books</h1>
        <Link
          href="/admin/books/new"
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover"
        >
          <Plus className="size-4" /> Add book
        </Link>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search title or author…"
        className="mt-5 w-full max-w-sm border border-border bg-surface px-3 py-2 font-body text-sm text-text outline-none focus:border-accent"
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
    </div>
  );
}
