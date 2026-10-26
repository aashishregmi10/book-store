"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Truck, RefreshCw, Loader2, MessageSquare } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { npr } from "@/lib/format";
import type { AdminOrderDetail, NcmInfo } from "../types";

interface Suggestion { branch: string; district: string; score: number; reason: string }
interface Branch { name: string; district: string; province: string; phone: string }
interface Quote {
  settings: { fromBranch: string; deliveryType: string };
  connected: boolean;
  server: "demo" | "live";
  suggestions: Suggestion[];
  branch: string;
  deliveryCharge: number | null;
  goodsAmount: number;
  codCharge: number | null;
  name: string;
  phone: string;
  phoneOk: boolean;
  address: string;
  packageName: string;
  instruction: string;
  bookingInProgress: boolean;
}

const NOT_BOOKABLE = new Set(["cancelled", "refunded", "delivered", "returned"]);
const errText = (e: unknown, fallback: string) => (e instanceof ClientApiError || e instanceof Error ? e.message : fallback);
const errCode = (e: unknown) => (e instanceof ClientApiError ? e.errors?.[0]?.code : undefined);
const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kathmandu", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

/** Courier booking for one order with Nepal Can Move. */
export function NcmPanel({ order, onChanged }: { order: AdminOrderDetail; onChanged: () => void }) {
  if (order.ncm?.orderId) return <Booked order={order} ncm={order.ncm} onChanged={onChanged} />;
  if (NOT_BOOKABLE.has(order.status)) return null;
  return <Booking order={order} onChanged={onChanged} />;
}

function Shell({ children, server }: { children: React.ReactNode; server?: string }) {
  return (
    <section className="border border-border bg-surface px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="label-smallcaps inline-flex items-center gap-2 text-xs">
          <Truck className="size-4 text-accent" /> Courier · Nepal Can Move
        </p>
        {server && (
          <span className={`font-data text-[10px] uppercase tracking-wide ${server === "live" ? "text-accent" : "text-sale"}`}>
            {server === "live" ? "Live" : "Demo server"}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// ── Not booked yet ───────────────────────────────────────
function Booking({ order, onChanged }: { order: AdminOrderDetail; onChanged: () => void }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [weight, setWeight] = useState("1");
  const [instruction, setInstruction] = useState("");
  const [fromPick, setFromPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quoting, setQuoting] = useState(false);

  const branchNames = useMemo(() => new Set(branches.map((b) => b.name)), [branches]);

  const fetchQuote = useCallback(async (b?: string) => {
    setQuoting(true);
    try {
      const q = await clientApi.get<Quote>(`/admin/ncm/orders/${order._id}/quote${b ? `?branch=${encodeURIComponent(b)}` : ""}`);
      setQuote(q);
      setError(null);
      return q;
    } catch (e) {
      setError(errText(e, "Couldn't get a quote from NCM."));
      return null;
    } finally {
      setQuoting(false);
    }
  }, [order._id]);

  // First load: the quote seeds the editable fields. State is only set once the
  // responses arrive (fetchQuote, used for later re-quotes, flips a loading
  // flag synchronously, which an effect must not do).
  useEffect(() => {
    let alive = true;
    clientApi.get<Branch[]>("/admin/ncm/branches").then((b) => { if (alive) setBranches(b); }).catch(() => {});
    clientApi
      .get<Quote>(`/admin/ncm/orders/${order._id}/quote`)
      .then((q) => {
        if (!alive) return;
        setQuote(q);
        setBranch(q.branch);
        setName(q.name);
        setPhone(q.phone);
        setAddress(q.address);
        setInstruction(q.instruction);
      })
      .catch((e) => { if (alive) setError(errText(e, "Couldn't get a quote from NCM.")); });
    return () => { alive = false; };
  }, [order._id]);

  function chooseBranch(value: string) {
    setBranch(value);
    if (branchNames.has(value)) fetchQuote(value);
  }

  async function saveFromBranch() {
    if (!branchNames.has(fromPick)) { setError("Pick a branch from the list."); return; }
    setBusy(true);
    try {
      await clientApi.put("/admin/ncm/settings", { fromBranch: fromPick, deliveryType: "Branch2Door" });
      await fetchQuote(branch || undefined);
    } catch (e) {
      setError(errText(e, "Couldn't save the drop-off branch."));
    } finally {
      setBusy(false);
    }
  }

  async function book(confirmNoDuplicate = false) {
    if (!quote || quote.codCharge === null || quote.deliveryCharge === null) return;
    if (!branchNames.has(branch)) { setError("Choose the delivering branch from the list."); return; }
    const ok = window.confirm(
      `Book ${order.orderNumber} with NCM?\n\n` +
        `Deliver via: ${branch}\n` +
        `NCM collects: ${npr(quote.codCharge)} (books ${npr(quote.goodsAmount)} + delivery ${npr(quote.deliveryCharge)})\n` +
        `You drop it at: ${quote.settings.fromBranch}` +
        (quote.server === "demo" ? "\n\nThis is NCM's DEMO server — not a real booking." : ""),
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await clientApi.post(`/admin/ncm/orders/${order._id}/book`, {
        branch,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        weightKg: Number(weight) || 1,
        instruction: instruction.trim(),
        confirmNoDuplicate,
      });
      setUncertain(null);
      onChanged();
    } catch (e) {
      const code = errCode(e);
      if (code === "NCM_UNCERTAIN" || code === "STALE_BOOKING") setUncertain(errText(e, ""));
      else setError(errText(e, "NCM didn't accept the booking."));
    } finally {
      setBusy(false);
    }
  }

  if (!quote && !error) {
    return <Shell><p className="font-body text-sm text-muted">Asking NCM for a quote…</p></Shell>;
  }

  if (quote && !quote.settings.fromBranch) {
    return (
      <Shell server={quote.server}>
        <p className="font-body text-sm text-text">Which NCM branch do you drop parcels at?</p>
        <p className="mt-1 font-body text-xs text-muted">Set once; every booking uses it. Delivery charges are worked out from this branch.</p>
        <BranchInput id="ncm-from" value={fromPick} onChange={setFromPick} branches={branches} />
        <button onClick={saveFromBranch} disabled={busy} className="mt-3 inline-flex min-h-11 items-center gap-2 bg-accent px-4 py-2 font-data text-xs uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-50">
          Save drop-off branch
        </button>
        {error && <p className="mt-2 font-body text-sm text-sale">{error}</p>}
      </Shell>
    );
  }

  return (
    <Shell server={quote?.server}>
      {quote && !quote.connected && <p className="mb-3 font-body text-sm text-sale">NCM isn&apos;t connected: NCM_API_TOKEN is missing on the server.</p>}
      {quote?.bookingInProgress && !uncertain && (
        <p className="mb-3 font-body text-sm text-sale">A booking for this order is already in progress or didn&apos;t finish. Refresh in a moment.</p>
      )}

      {quote && quote.suggestions.length > 0 && (
        <div className="mb-3">
          <p className="font-data text-[11px] uppercase tracking-wide text-muted">Suggested from the address</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {quote.suggestions.map((s) => (
              <button
                key={s.branch}
                type="button"
                onClick={() => chooseBranch(s.branch)}
                title={s.reason}
                className={`border px-2 py-1 font-data text-[11px] ${s.branch === branch ? "border-accent bg-accent text-white" : "border-border text-text hover:border-accent"}`}
              >
                {s.branch} <span className="opacity-70">· {s.reason}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block font-data text-[11px] uppercase tracking-wide text-muted" htmlFor="ncm-branch">Delivering branch</label>
      <BranchInput id="ncm-branch" value={branch} onChange={chooseBranch} branches={branches} />

      {quote && (
        <dl className="mt-3 space-y-1 border-t border-border pt-3 font-data text-sm">
          <Line label={`Drop at`} value={quote.settings.fromBranch} />
          <Line label="NCM delivery charge" value={quoting ? "…" : quote.deliveryCharge === null ? "—" : npr(quote.deliveryCharge)} />
          <Line label="Books" value={npr(quote.goodsAmount)} />
          <Line label="NCM collects at the door" value={quoting ? "…" : quote.codCharge === null ? "—" : npr(quote.codCharge)} strong />
        </dl>
      )}

      <div className="mt-3 grid gap-2">
        <Field label="Customer name" value={name} onChange={setName} />
        <Field label={`Phone${quote && !quote.phoneOk ? " — not a 10-digit mobile, fix before booking" : ""}`} value={phone} onChange={setPhone} warn={quote ? !quote.phoneOk && phone === quote.phone : false} />
        <Field label="Address for the rider" value={address} onChange={setAddress} multiline />
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <Field label="Weight (kg)" value={weight} onChange={setWeight} inputMode="decimal" />
          <Field label="Instruction" value={instruction} onChange={setInstruction} />
        </div>
      </div>

      {error && <p className="mt-3 font-body text-sm text-sale">{error}</p>}
      {uncertain && (
        <div className="mt-3 border border-sale/40 bg-sale/5 px-3 py-2">
          <p className="font-body text-sm text-text">{uncertain}</p>
          <button onClick={() => book(true)} disabled={busy} className="mt-2 font-data text-xs uppercase tracking-wide text-sale underline-offset-4 hover:underline disabled:opacity-50">
            I&apos;ve checked the NCM portal — it isn&apos;t booked. Book now
          </button>
        </div>
      )}

      <button
        onClick={() => book(false)}
        disabled={busy || quoting || !quote?.connected || quote?.codCharge === null || !branchNames.has(branch)}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 bg-accent px-4 py-2 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Truck className="size-4" />} Book with NCM
      </button>
      <p className="mt-2 font-body text-xs text-muted">Book once the books are in hand. You then drop the parcel at {quote?.settings.fromBranch || "your NCM branch"}; tracking updates on its own.</p>
    </Shell>
  );
}

// ── Booked ───────────────────────────────────────────────
function Booked({ order, ncm, onChanged }: { order: AdminOrderDetail; ncm: NcmInfo; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<{ text: string; by: string; at: string }[] | null>(null);
  const [draft, setDraft] = useState("");

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      await clientApi.post(`/admin/ncm/orders/${order._id}/refresh`);
      onChanged();
    } catch (e) {
      setError(errText(e, "Couldn't refresh from NCM."));
    } finally {
      setBusy(false);
    }
  }

  async function loadComments() {
    try {
      setComments(await clientApi.get(`/admin/ncm/orders/${order._id}/comments`));
    } catch (e) {
      setError(errText(e, "Couldn't load NCM comments."));
    }
  }

  async function sendComment() {
    if (draft.trim().length < 2) return;
    setBusy(true);
    try {
      await clientApi.post(`/admin/ncm/orders/${order._id}/comments`, { text: draft.trim() });
      setDraft("");
      await loadComments();
    } catch (e) {
      setError(errText(e, "NCM didn't take the comment."));
    } finally {
      setBusy(false);
    }
  }

  const events = [...(ncm.events ?? [])].reverse();

  return (
    <Shell>
      <p className="font-display text-xl text-text">NCM #{ncm.orderId}</p>
      <p className="mt-0.5 font-body text-sm text-muted">
        {ncm.lastStatus || "Booked"}{ncm.lastStatusAt ? ` · ${when(ncm.lastStatusAt)}` : ""}
        {ncm.returning ? " · returning to you" : ""}
      </p>
      {ncm.lastStatus === "Drop off Order Created" && (
        <p className="mt-2 border border-accent/40 bg-accent/5 px-3 py-2 font-body text-sm text-text">
          Drop this parcel at <strong>{ncm.fromBranch}</strong> — write {order.orderNumber} / NCM #{ncm.orderId} on it.
        </p>
      )}

      <dl className="mt-3 space-y-1 border-t border-border pt-3 font-data text-sm">
        {ncm.trackId && <Line label="NCM tracking id" value={ncm.trackId} />}
        <Line label="Route" value={`${ncm.fromBranch} → ${ncm.branch}`} />
        {ncm.destinationPhone && <Line label="Delivering branch" value={ncm.destinationPhone} />}
        <Line label="Books" value={npr(ncm.goodsAmount ?? 0)} />
        <Line label="NCM delivery" value={npr(ncm.deliveryCharge ?? 0)} />
        <Line label="NCM collects" value={npr(ncm.codCharge ?? 0)} strong />
        {ncm.paymentStatus && <Line label="NCM payout to us" value={ncm.paymentStatus} />}
        {ncm.refund?.amount ? <Line label="Refund via NCM" value={npr(ncm.refund.amount)} /> : null}
      </dl>

      {events.length > 0 && (
        <ol className="mt-3 space-y-1.5 border-t border-border pt-3">
          {events.map((e, i) => (
            <li key={`${e.status}-${e.at}-${i}`} className="flex justify-between gap-3 font-body text-xs">
              <span className={i === 0 ? "text-text" : "text-muted"}>{e.status}</span>
              <span className="shrink-0 font-data text-muted">{when(e.at)}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        <button onClick={refresh} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 font-data text-xs uppercase tracking-wide text-muted hover:text-accent disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh from NCM
        </button>
        {comments === null && (
          <button onClick={loadComments} className="inline-flex min-h-11 items-center gap-1.5 font-data text-xs uppercase tracking-wide text-muted hover:text-accent">
            <MessageSquare className="size-3.5" /> NCM comments
          </button>
        )}
      </div>

      {comments !== null && (
        <div className="mt-2 border-t border-border pt-3">
          {comments.length === 0 && <p className="font-body text-xs text-muted">No comments on this parcel yet.</p>}
          <ul className="space-y-2">
            {comments.map((c, i) => (
              <li key={i} className="font-body text-xs">
                <span className="text-text">{c.text}</span>
                <span className="block font-data text-[10px] text-muted">{c.by} · {when(c.at)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Reply to NCM…" className="min-h-11 flex-1 border border-border bg-bg px-3 font-body text-sm" />
            <button onClick={sendComment} disabled={busy || draft.trim().length < 2} className="border border-accent px-3 font-data text-xs uppercase tracking-wide text-accent hover:bg-accent hover:text-white disabled:opacity-50">Send</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 font-body text-sm text-sale">{error}</p>}
    </Shell>
  );
}

function BranchInput({ id, value, onChange, branches }: { id: string; value: string; onChange: (v: string) => void; branches: Branch[] }) {
  return (
    <>
      <input
        id={id}
        list={`${id}-list`}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="Type to search NCM branches"
        className="mt-1 min-h-11 w-full border border-border bg-bg px-3 font-data text-sm uppercase"
      />
      <datalist id={`${id}-list`}>
        {branches.map((b) => (
          <option key={b.name} value={b.name}>{b.district ? `${b.district} district` : ""}</option>
        ))}
      </datalist>
    </>
  );
}

function Field({ label, value, onChange, multiline, warn, inputMode }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; warn?: boolean; inputMode?: "decimal" }) {
  const cls = `mt-1 w-full border bg-bg px-3 py-2 font-body text-sm ${warn ? "border-sale" : "border-border"}`;
  return (
    <label className="block font-data text-[11px] uppercase tracking-wide text-muted">
      {label}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={cls} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode={inputMode} className={`${cls} min-h-11`} />
      )}
    </label>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "font-semibold text-text" : "text-text"}>{value}</dd>
    </div>
  );
}
