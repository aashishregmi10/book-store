"use client";

import { useEffect, useState } from "react";
import { Shuffle, Loader2, ExternalLink } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { getToken } from "@/lib/stores/auth";
import { refreshHomepageRails } from "../_actions/rails";

interface RailsState {
  shuffledAt: string | null;
  shuffledBy: string | null;
  rails: { bestsellers: unknown[]; newArrivals: unknown[]; featured: unknown[] };
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Kathmandu",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * Re-rolls the order of the three curated homepage rails. The API stores a new
 * shuffle seed (so the order stays put until the next click), then a Server
 * Action expires the storefront's cached copy so the homepage shows it now.
 */
export function ShuffleRails() {
  const [state, setState] = useState<RailsState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    clientApi
      .get<RailsState>("/admin/merchandising")
      .then((s) => { if (alive) setState(s); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function shuffle() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // clientApi refreshes an expired token, so the token handed to the
      // Server Action straight after is a live one.
      setState(await clientApi.post<RailsState>("/admin/merchandising/shuffle"));
      const { ok } = await refreshHomepageRails(getToken());
      setNote(ok ? "Shuffled. The homepage shows the new order now." : "Shuffled. The homepage picks up the new order within 5 minutes.");
    } catch (err) {
      setError((err as Error)?.message || "Couldn't shuffle the homepage rails.");
    } finally {
      setBusy(false);
    }
  }

  const counts = state
    ? `${state.rails.bestsellers.length} bestsellers · ${state.rails.newArrivals.length} new arrivals · ${state.rails.featured.length} staff favourites`
    : null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border border-border bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-data text-xs uppercase tracking-wide text-text">Homepage rails</p>
        <p className="mt-0.5 font-body text-sm text-muted">
          Bestsellers, New arrivals and Staff favourites (the Featured flag) appear in a shuffled order.{" "}
          {state && (state.shuffledAt
            ? `Last shuffled ${when(state.shuffledAt)}${state.shuffledBy ? ` by ${state.shuffledBy}` : ""}.`
            : "Not shuffled yet.")}
        </p>
        {counts && <p className="mt-0.5 font-data text-[11px] text-muted">{counts}</p>}
        {note && <p className="mt-1 font-body text-sm text-accent">{note}</p>}
        {error && <p className="mt-1 font-body text-sm text-sale">{error}</p>}
      </div>
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center gap-1.5 px-2 font-data text-xs uppercase tracking-wide text-muted hover:text-accent"
      >
        View homepage <ExternalLink className="size-3.5" />
      </a>
      <button
        onClick={shuffle}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 border border-accent px-4 py-2 font-data text-sm uppercase tracking-wide text-accent hover:bg-accent hover:text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Shuffle className="size-4" />}
        {busy ? "Shuffling…" : "Shuffle"}
      </button>
    </div>
  );
}
