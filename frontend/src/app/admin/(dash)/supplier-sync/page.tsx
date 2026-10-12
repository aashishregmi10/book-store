"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { RefreshCw, PackageX, PlusCircle, AlertTriangle, Loader2 } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";

interface NewBook { title: string; author?: string; isbn13?: string; price?: number; coverUrl?: string; url?: string }
interface OutOfStock { book: string; slug?: string; title: string; isbn?: string; missCount?: number }
interface Job {
  _id: string;
  status: "queued" | "running" | "needs_captcha" | "done" | "failed";
  phase?: string;
  coverage?: number;
  error?: string;
  results?: { newBooks?: NewBook[]; outOfStock?: OutOfStock[]; absentThisRun?: number; restoredCount?: number; newReadyToPublish?: number };
  publishStatus?: "idle" | "running" | "done" | "failed";
  publishedCount?: number;
  heldCount?: number;
  publishError?: string;
  stockApplied?: boolean;
  stockAppliedCount?: number;
  finishedAt?: string;
}

const hasIsbn13 = (s?: string) => !!s && /^\d{13}$/.test(s);

const ACTIVE = (j?: Job | null) => !!j && (j.status === "queued" || j.status === "running" || j.publishStatus === "running");

export default function SupplierSyncPage() {
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [reordered, setReordered] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await clientApi.get<Job | null>("/admin/supplier-sync/status");
      setJob(j);
      return j;
    } catch {
      return null;
    }
  }, []);

  // Poll while a scan or publish is in flight.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state only after an await (async), never synchronously
    load();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load]);
  useEffect(() => {
    if (ACTIVE(job)) {
      timer.current = setTimeout(load, 3000);
      return () => { if (timer.current) clearTimeout(timer.current); };
    }
  }, [job, load]);

  async function run() {
    setBusy(true);
    try { await clientApi.post("/admin/supplier-sync/run"); await load(); } finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true);
    try { await clientApi.post("/admin/supplier-sync/publish"); await load(); } finally { setBusy(false); }
  }
  async function applyStock() {
    setBusy(true);
    try { await clientApi.post("/admin/supplier-sync/apply-stock"); await load(); } finally { setBusy(false); }
  }
  async function reorder(bookId: string) {
    setReordered((m) => ({ ...m, [bookId]: true }));
    await clientApi.post("/admin/supplier-sync/reorder", { bookId }).catch(() => setReordered((m) => ({ ...m, [bookId]: false })));
  }

  const running = ACTIVE(job);
  const r = job?.results;
  const newBooks = r?.newBooks ?? [];
  const outOfStock = r?.outOfStock ?? [];
  const readyToPublish = r?.newReadyToPublish ?? newBooks.filter((b) => hasIsbn13(b.isbn13)).length;
  const needIsbn = newBooks.length - readyToPublish;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-text">Supplier Sync</h1>
        <button
          onClick={run}
          disabled={busy || running}
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {running ? "Syncing…" : "Run sync with New Book House"}
        </button>
      </div>

      <p className="mt-3 max-w-2xl font-body text-sm text-muted">
        Scans New Book House&apos;s live Daraz listing (~9 minutes), then shows the books they&apos;ve
        added and the books they&apos;ve run out of. Needs this backend running on your machine with
        Chrome — if a slider challenge appears, solve it once in the Chrome window and re-run.
      </p>

      {/* status / progress */}
      {job && (
        <div className="mt-5 border border-border bg-surface px-4 py-3 font-data text-sm">
          {job.status === "needs_captcha" ? (
            <p className="flex items-center gap-2 text-sale">
              <AlertTriangle className="size-4" /> Daraz showed a challenge. Solve the slider in the Chrome window, then run again.
            </p>
          ) : job.status === "failed" ? (
            <p className="flex items-center gap-2 text-sale"><AlertTriangle className="size-4" /> {job.error || "Sync failed."}</p>
          ) : running ? (
            <p className="flex items-center gap-2 text-text"><Loader2 className="size-4 animate-spin text-accent" /> {job.phase || "working…"}</p>
          ) : (
            <p className="text-muted">
              Last sync: <span className="text-text">{job.phase || "done"}</span>
              {typeof job.coverage === "number" && <> · coverage {job.coverage}%</>}
              {typeof r?.restoredCount === "number" && r.restoredCount > 0 && <> · {r.restoredCount} restocked</>}
              {typeof r?.absentThisRun === "number" && <> · {r.absentThisRun} absent this run</>}
            </p>
          )}
        </div>
      )}

      {/* results */}
      {job?.status === "done" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* New books */}
          <section className="border border-border bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <h2 className="inline-flex items-center gap-2 font-display text-xl text-text"><PlusCircle className="size-5 text-accent" /> New books ({newBooks.length})</h2>
                {newBooks.length > 0 && (
                  <p className="mt-0.5 font-data text-[11px] text-muted">
                    {readyToPublish} ready to publish{needIsbn > 0 && <> · <span className="text-sale">{needIsbn} held — no ISBN found</span></>}
                  </p>
                )}
              </div>
              {readyToPublish > 0 && (
                <button
                  onClick={publish}
                  disabled={busy || job.publishStatus === "running"}
                  className="inline-flex shrink-0 items-center gap-2 border border-accent px-3 py-1.5 font-data text-xs uppercase tracking-wide text-accent hover:bg-accent hover:text-white disabled:opacity-50"
                >
                  {job.publishStatus === "running" ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {job.publishStatus === "running"
                    ? "Publishing…"
                    : job.publishStatus === "done"
                      ? `Published ${job.publishedCount}${job.heldCount ? ` · ${job.heldCount} held` : ""}`
                      : `Publish ${readyToPublish}`}
                </button>
              )}
            </div>
            <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
              {newBooks.length === 0 && <li className="px-4 py-8 text-center font-body text-sm text-muted">Nothing new this run.</li>}
              {newBooks.map((b, i) => {
                const ready = hasIsbn13(b.isbn13);
                return (
                  <li key={b.isbn13 || b.url || i} className="flex items-center gap-3 px-4 py-2">
                    <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded border border-border bg-bg">
                      {b.coverUrl ? <Image src={b.coverUrl} alt="" fill sizes="36px" className="object-cover" unoptimized /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-body text-sm text-text">{b.title}</p>
                      <p className="truncate font-data text-[11px] text-muted">
                        {b.author ? <span className="uppercase tracking-wide">{b.author}</span> : <span className="text-sale/80">no author</span>}
                        {" · "}
                        {ready ? <span>{b.isbn13}</span> : <span className="text-sale/80">no ISBN — held</span>}
                      </p>
                    </div>
                    {typeof b.price === "number" && <span className="shrink-0 font-data text-xs text-muted">{npr(b.price)}</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Out of stock */}
          <section className="border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="inline-flex items-center gap-2 font-display text-xl text-text"><PackageX className="size-5 text-sale" /> Out of stock at NBH ({outOfStock.length})</h2>
              {outOfStock.length > 0 && !job.stockApplied && (
                <button
                  onClick={applyStock}
                  disabled={busy}
                  className="inline-flex items-center gap-2 border border-sale px-3 py-1.5 font-data text-xs uppercase tracking-wide text-sale hover:bg-sale hover:text-white disabled:opacity-50"
                >
                  Mark {outOfStock.length} out of stock
                </button>
              )}
              {job.stockApplied && <span className="font-data text-xs text-muted">{job.stockAppliedCount} marked</span>}
            </div>
            <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
              {outOfStock.length === 0 && (
                <li className="px-4 py-8 text-center font-body text-sm text-muted">
                  None confirmed. A book is only listed here after it&apos;s missing from 2 complete syncs.
                </li>
              )}
              {outOfStock.map((b) => (
                <li key={b.book} className="flex items-center gap-3 px-4 py-2">
                  <p className="min-w-0 flex-1 truncate font-body text-sm text-text">{b.title}</p>
                  <button
                    onClick={() => reorder(b.book)}
                    disabled={reordered[b.book]}
                    className="shrink-0 border border-border px-2.5 py-1 font-data text-[11px] uppercase tracking-wide text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {reordered[b.book] ? "Reorder requested" : "Order for restock"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
