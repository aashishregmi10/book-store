"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";

interface Genre {
  _id: string;
  slug: string;
  name: string;
  description?: string;
  color?: string;
  isActive: boolean;
  bookCount?: number;
}

interface Draft {
  name: string;
  description: string;
  color: string;
  isActive: boolean;
}

const EMPTY: Draft = { name: "", description: "", color: "#1C5FA6", isActive: true };

export default function AdminGenres() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Refetch the list — used after create/edit/delete. State is only touched in
  // the promise callbacks, never synchronously, so it's effect-safe too.
  function load() {
    return clientApi
      .get<Genre[]>("/admin/genres")
      .then(setGenres)
      .catch(() => setGenres([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    clientApi
      .get<Genre[]>("/admin/genres")
      .then((g) => active && setGenres(g))
      .catch(() => active && setGenres([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function resetForm() {
    setDraft(EMPTY);
    setEditingSlug(null);
    setError("");
  }

  function startEdit(g: Genre) {
    setEditingSlug(g.slug);
    setDraft({ name: g.name, description: g.description || "", color: g.color || "#1C5FA6", isActive: g.isActive });
    setError("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editingSlug) {
        await clientApi.put(`/admin/genres/${editingSlug}`, draft);
      } else {
        await clientApi.post("/admin/genres", draft);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Couldn't save that genre, try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(g: Genre) {
    await clientApi.put(`/admin/genres/${g.slug}`, { isActive: !g.isActive }).catch(() => {});
    load();
  }

  async function del(g: Genre) {
    if (!confirm(`Delete the “${g.name}” genre? This cannot be undone.`)) return;
    try {
      await clientApi.del(`/admin/genres/${g._id}`);
      if (editingSlug === g.slug) resetForm();
      load();
    } catch (err) {
      alert(err instanceof ClientApiError ? err.message : "Couldn't delete that genre.");
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-text">Genres</h1>
      <p className="mt-1 max-w-prose font-body text-sm text-muted">
        The shelves of the shop. Add the categories you stock here: they become the genre options on every book,
        and each one gets its own silo page in the store.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* ── Add / edit form ───────────────────────────── */}
        <form onSubmit={submit} className="lg:sticky lg:top-6 lg:self-start">
          <div className="border border-border bg-surface p-5">
            <h2 className="font-data text-xs uppercase tracking-[0.12em] text-muted">
              {editingSlug ? "Edit genre" : "Add a genre"}
            </h2>

            {error && (
              <p className="mt-3 border-l-2 border-sale bg-sale/5 px-3 py-2 font-body text-sm text-sale">{error}</p>
            )}

            <label className="mt-4 block">
              <span className="font-data text-xs uppercase tracking-wide text-muted">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
                placeholder="e.g. Poetry"
                className="mt-1 w-full border border-border bg-bg px-3 py-2 font-body text-text outline-none focus:border-accent"
              />
            </label>

            <label className="mt-4 block">
              <span className="font-data text-xs uppercase tracking-wide text-muted">Description</span>
              <textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={3}
                placeholder="A short BLUF intro shown atop the genre's store page."
                className="mt-1 w-full resize-y border border-border bg-bg px-3 py-2 font-body text-sm leading-relaxed text-text outline-none placeholder:text-muted/60 focus:border-accent"
              />
            </label>

            <div className="mt-4 flex items-center gap-3">
              <label className="flex items-center gap-2">
                <span className="font-data text-xs uppercase tracking-wide text-muted">Colour</span>
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                  className="size-8 cursor-pointer border border-border bg-bg"
                />
              </label>
              <span className="font-data text-xs text-muted">{draft.color}</span>
            </div>

            <label className="mt-4 flex items-center gap-2.5 font-body text-sm text-text">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                className="size-4 accent-[var(--color-accent)]"
              />
              Active (shown in store + book dropdown)
            </label>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 bg-accent px-5 py-2.5 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-50"
              >
                <Plus className="size-4" /> {saving ? "Saving…" : editingSlug ? "Save changes" : "Add genre"}
              </button>
              {editingSlug && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-1.5 font-data text-sm uppercase tracking-wide text-muted hover:text-text"
                >
                  <X className="size-4" /> Cancel
                </button>
              )}
            </div>
          </div>
        </form>

        {/* ── Existing genres ───────────────────────────── */}
        <div className="overflow-x-auto border border-border bg-surface">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-bg font-data text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Genre</th>
                <th className="px-4 py-3">Books</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {genres.map((g) => (
                <tr key={g._id} className={editingSlug === g.slug ? "bg-bg" : ""}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="size-4 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: g.color || "#1C5FA6" }}
                      />
                      <div>
                        <p className="font-body text-sm text-text">{g.name}</p>
                        <p className="font-data text-xs text-muted">{g.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-data text-sm text-text">{g.bookCount ?? 0}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(g)}
                      className={`inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide ${
                        g.isActive ? "text-accent" : "text-muted"
                      }`}
                    >
                      {g.isActive ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                      {g.isActive ? "Active" : "Hidden"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(g)} aria-label="Edit" className="p-1.5 text-muted hover:text-accent">
                        <Pencil className="size-4" />
                      </button>
                      <button onClick={() => del(g)} aria-label="Delete" className="p-1.5 text-muted hover:text-sale">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && genres.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center font-body text-muted">
                    No shelves yet, add your first genre on the left.
                  </td>
                </tr>
              )}
              {loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`s${i}`}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="size-4 shrink-0 animate-pulse rounded-full bg-border/70" />
                        <span className="block h-4 w-32 animate-pulse bg-border/70" />
                      </div>
                    </td>
                    <td className="px-4 py-4"><span className="block h-4 w-8 animate-pulse bg-border/70" /></td>
                    <td className="px-4 py-4"><span className="block h-4 w-16 animate-pulse bg-border/70" /></td>
                    <td className="px-4 py-4"><span className="ml-auto block h-4 w-12 animate-pulse bg-border/70" /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
