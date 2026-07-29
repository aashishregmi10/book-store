"use client";

import { Check, Circle, Clock, RotateCcw, X } from "lucide-react";

export interface StatusEntry {
  status: string;
  note?: string;
  timestamp: string;
  updatedBy?: { fullName?: string; email?: string; isAdmin?: boolean } | string | null;
}

/** The happy path, in order. Terminal states sit outside it. */
export const FLOW = ["placed", "confirmed", "processing", "shipped", "delivered"] as const;
const TERMINAL = new Set(["cancelled", "refunded", "returned"]);

function iconFor(status: string) {
  if (status === "cancelled") return X;
  if (status === "refunded" || status === "returned") return RotateCcw;
  return Check;
}

function whoFor(entry: StatusEntry) {
  const by = entry.updatedBy;
  // Unpopulated (a bare id) or absent — the only writer without a user is
  // guest checkout, which records the placement itself.
  if (!by || typeof by === "string") return entry.status === "placed" ? "Customer" : "System";
  return by.fullName || by.email || (by.isAdmin ? "Admin" : "Customer");
}

/**
 * Vertical status history for one order — every transition it has actually
 * been through, newest last, with who made it and when.
 *
 * Reads `statusHistory`, which the API has always written on placement,
 * status change, cancel and refund but never surfaced anywhere. Steps of the
 * standard flow the order hasn't reached yet are shown greyed so it's obvious
 * at a glance where the order is and what comes next.
 */
export function OrderTimeline({ history, current }: { history: StatusEntry[]; current: string }) {
  const entries = [...(history ?? [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const reached = new Set(entries.map((e) => e.status));
  // Once an order is cancelled or refunded the remaining happy-path steps are
  // never going to happen — don't dangle them as "upcoming".
  const stalled = TERMINAL.has(current);
  const upcoming = stalled ? [] : FLOW.filter((s) => !reached.has(s));

  if (entries.length === 0) {
    return <p className="font-body text-sm text-muted">No history recorded for this order yet.</p>;
  }

  return (
    <ol className="relative space-y-0">
      {entries.map((e, i) => {
        const Icon = iconFor(e.status);
        const isLast = i === entries.length - 1 && upcoming.length === 0;
        const bad = TERMINAL.has(e.status);
        return (
          <li key={`${e.status}-${e.timestamp}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && <span aria-hidden className="absolute left-[11px] top-6 h-full w-px bg-border" />}
            <span
              className={`relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
                bad ? "bg-sale text-white" : "bg-accent text-white"
              }`}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-data text-xs uppercase tracking-wide text-text">{e.status}</span>
                <span className="font-data text-xs text-muted">
                  {new Date(e.timestamp).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kathmandu",
                  })}
                </span>
              </div>
              {e.note && <p className="mt-0.5 font-body text-sm text-text">{e.note}</p>}
              <p className="mt-0.5 font-body text-xs text-muted">by {whoFor(e)}</p>
            </div>
          </li>
        );
      })}

      {upcoming.map((s, i) => (
        <li key={s} className="relative flex gap-3 pb-5 last:pb-0">
          {i !== upcoming.length - 1 && (
            <span aria-hidden className="absolute left-[11px] top-6 h-full w-px bg-border" />
          )}
          <span className="relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted">
            {i === 0 ? <Clock className="size-3.5" /> : <Circle className="size-2" />}
          </span>
          <div className="min-w-0 flex-1">
            <span className="font-data text-xs uppercase tracking-wide text-muted">{s}</span>
            <p className="mt-0.5 font-body text-xs text-muted">{i === 0 ? "Next step" : "Not yet reached"}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
