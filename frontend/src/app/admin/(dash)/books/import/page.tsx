"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Loader2, Check, X } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { useGenres } from "../_components/useGenres";

const MAX = 20;

interface LookupBook {
  title: string;
  authors: string[];
  publisher?: string | null;
  pageCount?: number | null;
  language?: string | null;
  isbn13?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  origin?: string;
}
interface LookupRow {
  input_index: number;
  success: boolean;
  source?: string;
  confidence?: number;
  nepaliDetected?: boolean;
  error?: string;
  book?: LookupBook;
}
interface BulkLookup {
  results: LookupRow[];
  successful: number;
  failed: number;
}
interface CreateRow {
  title: string;
  success: boolean;
  slug?: string;
  error?: string;
}
interface BulkCreate {
  created: number;
  failed: number;
  results: CreateRow[];
}

// One book per line, optionally followed by ", <price>" (NPR). A query that
// cleans to a 10/13-digit ISBN becomes an ISBN lookup; anything else is a title.
function parseLines(raw: string): { isbn?: string; title?: string; price?: number }[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/,\s*(\d+)\s*$/); // trailing ", 650" → price
      const price = m ? Number(m[1]) : undefined;
      const query = m ? line.slice(0, m.index).trim() : line;
      const cleaned = query.replace(/[\s-]/g, "");
      const base = /^\d{9}[\dXx]$/.test(cleaned) || /^\d{13}$/.test(cleaned) ? { isbn: cleaned } : { title: query };
      return price != null ? { ...base, price } : base;
    });
}

export default function BulkImport() {
  const { genres } = useGenres();
  const [raw, setRaw] = useState("");
  const [looking, setLooking] = useState(false);
  const [rows, setRows] = useState<LookupRow[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [genre, setGenre] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<BulkCreate | null>(null);
  const [msg, setMsg] = useState("");

  const parsed = useMemo(() => parseLines(raw), [raw]);
  const tooMany = parsed.length > MAX;

  async function lookup() {
    setMsg("");
    setCreated(null);
    if (!parsed.length) return setMsg("Add at least one ISBN or title.");
    if (tooMany) return setMsg(`Max ${MAX} per batch, you have ${parsed.length}.`);
    setLooking(true);
    try {
      // The lookup endpoint only wants identifiers; price is kept locally (by line) for create.
      const data = await clientApi.post<BulkLookup>("/admin/books/lookup/bulk", {
        books: parsed.map(({ isbn, title }) => ({ isbn, title })),
      });
      setRows(data.results);
      setSelected(new Set(data.results.filter((r) => r.success).map((r) => r.input_index)));
    } catch (err) {
      setMsg(err instanceof ClientApiError ? err.message : "Lookup failed.");
    } finally {
      setLooking(false);
    }
  }

  function toggle(i: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  async function createDrafts() {
    setMsg("");
    if (!genre) return setMsg("Pick a genre for the batch.");
    if (!price) return setMsg("Set a default price.");
    const chosen = (rows || []).filter((r) => r.success && r.book && selected.has(r.input_index));
    if (!chosen.length) return setMsg("Select at least one matched book.");
    setCreating(true);
    try {
      const books = chosen.map((r) => ({
        title: r.book!.title,
        author: r.book!.authors?.[0],
        coverUrl: r.book!.coverUrl,
        isbn13: r.book!.isbn13,
        publisher: r.book!.publisher,
        pages: r.book!.pageCount,
        language: r.book!.language,
        description: r.book!.description ?? undefined,
        price: parsed[r.input_index]?.price, // per-line price wins over the batch default
      }));
      const data = await clientApi.post<BulkCreate>("/admin/books/bulk-create", {
        defaults: { genre, price: Number(price), stock: Number(stock) || 0 },
        books,
      });
      setCreated(data);
    } catch (err) {
      setMsg(err instanceof ClientApiError ? err.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  }

  const selectedCount = (rows || []).filter((r) => r.success && selected.has(r.input_index)).length;

  return (
    <div>
      <Link href="/admin/books" className="inline-flex items-center gap-1.5 font-data text-xs uppercase tracking-wide text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> Books
      </Link>
      <h1 className="mt-2 font-display text-3xl text-text">Bulk import</h1>
      <p className="mt-1 max-w-2xl font-body text-sm text-muted">
        Paste up to {MAX} ISBNs or titles (one per line), look them up, then create them as
        drafts. Add a price per line with <code className="font-data">, 650</code>; lines without one
        use the batch default. Drafts stay hidden until you review and publish.
      </p>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={6}
        placeholder={"9780735211292, 899\nThe Alchemist, 499\nMuna Madan"}
        className="mt-5 w-full max-w-2xl border border-border bg-surface px-3 py-2 font-data text-sm text-text outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={lookup}
          disabled={looking || !parsed.length}
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {looking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Look up {parsed.length || ""}
        </button>
        <span className={`font-data text-xs ${tooMany ? "text-sale" : "text-muted"}`}>
          {parsed.length} parsed{tooMany ? ` · over the ${MAX} limit` : ""}
        </span>
      </div>

      {msg && <p className="mt-3 font-body text-sm text-sale">{msg}</p>}

      {rows && !created && (
        <div className="mt-8">
          {/* Batch defaults */}
          <div className="flex flex-wrap items-end gap-4 border border-border bg-surface p-4">
            <label className="flex flex-col gap-1 font-data text-xs uppercase tracking-wide text-muted">
              Genre
              <select value={genre} onChange={(e) => setGenre(e.target.value)} className="border border-border bg-bg px-3 py-2 font-body text-sm text-text outline-none focus:border-accent">
                <option value="">Choose…</option>
                {genres.map((g) => (
                  <option key={g.slug} value={g.slug}>{g.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-data text-xs uppercase tracking-wide text-muted">
              Default price (NPR)
              <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="w-32 border border-border bg-bg px-3 py-2 font-data text-sm text-text outline-none focus:border-accent" />
            </label>
            <label className="flex flex-col gap-1 font-data text-xs uppercase tracking-wide text-muted">
              Default stock
              <input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} className="w-24 border border-border bg-bg px-3 py-2 font-data text-sm text-text outline-none focus:border-accent" />
            </label>
            <button
              onClick={createDrafts}
              disabled={creating || !selectedCount}
              className="ml-auto inline-flex items-center gap-2 bg-accent px-4 py-2 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Create {selectedCount} draft{selectedCount === 1 ? "" : "s"}
            </button>
          </div>

          {/* Results */}
          <div className="mt-4 overflow-x-auto border border-border bg-surface">
            <table className="w-full text-left">
              <thead className="border-b border-border bg-bg font-data text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3 w-8"></th>
                  <th className="px-3 py-3">Book</th>
                  <th className="px-3 py-3">ISBN</th>
                  <th className="px-3 py-3">Confidence</th>
                  <th className="px-3 py-3">Origin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.input_index} className={r.success ? "" : "opacity-60"}>
                    <td className="px-3 py-3">
                      {r.success ? (
                        <input type="checkbox" checked={selected.has(r.input_index)} onChange={() => toggle(r.input_index)} />
                      ) : (
                        <X className="size-4 text-sale" />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r.success && r.book ? (
                        <div className="flex items-center gap-3">
                          {r.book.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- third-party metadata thumbnail, admin-only preview
                            <img src={r.book.coverUrl} alt="" className="h-12 w-8 shrink-0 object-cover" />
                          ) : (
                            <span className="grid h-12 w-8 shrink-0 place-items-center bg-bg font-data text-[10px] text-muted">no cover</span>
                          )}
                          <div>
                            <p className="font-body text-sm text-text">{r.book.title}</p>
                            <p className="font-body text-xs text-muted">{r.book.authors?.[0] || "Unknown"}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="font-body text-sm text-muted">Not found · {r.error}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-data text-xs text-muted">{r.book?.isbn13 || "—"}</td>
                    <td className="px-3 py-3 font-data text-xs text-text">{r.confidence != null ? r.confidence.toFixed(2) : "—"}</td>
                    <td className="px-3 py-3">
                      {r.book?.origin && (
                        <span className={`font-data text-xs ${r.nepaliDetected ? "text-accent" : "text-muted"}`}>
                          {r.book.origin}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {created && (
        <div className="mt-8 border border-border bg-surface p-5">
          <p className="font-display text-xl text-text">
            Created {created.created} draft{created.created === 1 ? "" : "s"}
            {created.failed > 0 && <span className="text-sale"> · {created.failed} failed</span>}
          </p>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {created.results.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2.5">
                <span className="font-body text-sm text-text">{r.title}</span>
                {r.success ? (
                  <Link href={`/admin/books/${r.slug}/edit`} className="font-data text-xs uppercase tracking-wide text-accent hover:underline">
                    Finish draft →
                  </Link>
                ) : (
                  <span className="font-data text-xs uppercase tracking-wide text-sale">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
          <Link href="/admin/books" className="mt-4 inline-block font-data text-xs uppercase tracking-wide text-muted hover:text-accent">
            ← Back to books
          </Link>
        </div>
      )}
    </div>
  );
}
