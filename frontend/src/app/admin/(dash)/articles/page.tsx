"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface AdminArticle {
  _id: string;
  slug: string;
  title: string;
  status: string;
  category?: string;
  updatedAt?: string;
}

export default function AdminArticles() {
  const [rows, setRows] = useState<AdminArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    clientApi
      .get<AdminArticle[]>("/admin/articles")
      .then((d) => active && setRows(d))
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refresh]);

  async function del(id: string) {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    await clientApi.del(`/admin/articles/${id}`).catch(() => {});
    setRefresh((n) => n + 1);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-text">Articles</h1>
        <Link href="/admin/articles/new" className="inline-flex items-center gap-2 bg-accent px-4 py-2 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">
          <Plus className="size-4" /> New article
        </Link>
      </div>
      <p className="mt-1 max-w-prose font-body text-sm text-muted">
        Reading guides and recommendations. Published articles appear at /blog and feed search & AI engines.
      </p>

      {loading ? (
        <div className="mt-5"><TableSkeleton rows={5} cols={4} /></div>
      ) : (
        <div className="mt-5 overflow-x-auto border border-border bg-surface">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-bg font-data text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((a) => (
                <tr key={a._id} className="hover:bg-bg">
                  <td className="px-4 py-3">
                    <Link href={`/admin/articles/${a.slug}/edit`} className="font-body text-sm text-text hover:text-accent">{a.title}</Link>
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-muted">{a.category || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`font-data text-xs uppercase tracking-wide ${a.status === "published" ? "text-accent" : "text-muted"}`}>{a.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={`/admin/articles/${a.slug}/edit`} aria-label="Edit" className="p-1.5 text-muted hover:text-accent"><Pencil className="size-4" /></Link>
                      <button onClick={() => del(a._id)} aria-label="Delete" className="p-1.5 text-muted hover:text-sale"><Trash2 className="size-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center font-body text-muted">No articles yet — write your first guide.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
