"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Package, Search, Truck } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Guest order tracking.
 *
 * Guests can check out, and until now the order number they were handed was
 * useless to them — every order read required a session. This pairs the number
 * with the delivery phone, which is the one thing the real customer always has
 * and a stranger guessing sequential order numbers does not.
 */

interface TrackedOrder {
  orderNumber: string;
  status: string;
  createdAt: string;
  total: number;
  paymentMethod: string;
  items: { title: string; author: string; quantity: number; price: number; format?: string }[];
  deliveryAddress: { fullName: string; city: string; province: string };
  statusHistory?: { status: string; note?: string; timestamp: string }[];
  ncm?: {
    orderId?: number;
    trackId?: string;
    branch?: string;
    destinationPhone?: string;
    goodsAmount?: number;
    deliveryCharge?: number;
    codCharge?: number;
    returning?: boolean;
    events?: { status: string; at: string }[];
  };
}

// Reads better than the raw enum, and keeps the courier hand-off explicit.
const STATUS_COPY: Record<string, string> = {
  placed: "Placed, we're getting it ready",
  confirmed: "Confirmed",
  processing: "Being packed",
  shipped: "With the courier",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  returned: "Returned to the shop",
};

const place = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Nepal Can Move's status labels, in words a customer reads at a glance. */
function courierStep(label: string, returning?: boolean): string {
  const s = label.trim();
  const l = s.toLowerCase();
  if (/order created/.test(l)) return "Booked with Nepal Can Move";
  if (/pickup complete|collected/.test(l)) return "Handed to Nepal Can Move";
  const to = s.match(/^dispatched to (.+)$/i);
  if (to) return `Left for ${place(to[1])}`;
  const at = s.match(/^arrived at (.+)$/i);
  if (at) return `Reached ${place(at[1])}`;
  if (l === "dispatched") return "On the way";
  if (l === "arrived") return "Reached the delivery branch";
  if (/sent for delivery/.test(l)) return "Out for delivery";
  if (/rtv delivered/.test(l)) return "Returned to the shop";
  if (/return|vendor/.test(l)) return "Being returned to the shop";
  if (l === "delivered") return returning ? "Returned to the shop" : "Delivered";
  return s;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kathmandu", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// useSearchParams needs a Suspense boundary to keep the page statically rendered.
export default function TrackOrderPage() {
  return (
    <Suspense>
      <TrackOrder />
    </Suspense>
  );
}

function TrackOrder() {
  // /track?order=PT-… — the account page links here with the number filled in.
  const [orderNumber, setOrderNumber] = useState(useSearchParams().get("order") ?? "");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOrder(null);
    setLoading(true);
    try {
      setOrder(await clientApi.post<TrackedOrder>("/orders/lookup", { orderNumber: orderNumber.trim(), phone }));
    } catch (err) {
      setError(
        err instanceof ClientApiError
          ? err.message
          : "We couldn't reach the shop just now, try again in a moment."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-4xl leading-tight text-text sm:text-5xl">Track your order</h1>
      <p className="mt-3 font-body text-lg leading-relaxed text-muted">
        Enter the order number from your confirmation and the phone number you gave for delivery.
      </p>

      <form onSubmit={onSubmit} className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="font-data text-xs uppercase tracking-wide text-muted">Order number</span>
            <input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              required
              placeholder="PT-20260805-00001"
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2.5 font-data text-sm text-text outline-none placeholder:text-muted/60 focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="font-data text-xs uppercase tracking-wide text-muted">Delivery phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              inputMode="tel"
              placeholder="9801234567"
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2.5 font-body text-sm text-text outline-none placeholder:text-muted/60 focus:border-accent"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-sale/40 bg-sale/5 px-3 py-2 font-body text-sm text-sale">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 font-data text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {loading ? <Spinner className="size-4" /> : <Search className="size-4" />}
          {loading ? "Looking…" : "Find my order"}
        </button>
      </form>

      {order && (
        <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-data text-xs uppercase tracking-wide text-muted">Order</p>
              <p className="font-data text-lg text-text">{order.orderNumber}</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1.5 font-data text-xs uppercase tracking-wide text-accent">
              <Package className="size-3.5" />
              {STATUS_COPY[order.status] ?? order.status}
            </span>
          </div>

          <dl className="mt-5 space-y-2 border-t border-border pt-4 font-body text-sm">
            <Row label="Placed" value={new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} />
            <Row label="Delivering to" value={`${order.deliveryAddress.fullName} · ${order.deliveryAddress.city}, ${order.deliveryAddress.province}`} />
            <Row label="Payment" value={order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentMethod.toUpperCase()} />
          </dl>

          <ul className="mt-5 space-y-3 border-t border-border pt-4">
            {order.items.map((i, n) => (
              <li key={n} className="flex justify-between gap-4 font-body text-sm">
                <span className="text-text">
                  {i.title}
                  {i.format && <span className="text-muted"> · {i.format}</span>}
                  <span className="text-muted"> × {i.quantity}</span>
                </span>
                <span className="shrink-0 font-data text-text">{npr(i.price * i.quantity)}</span>
              </li>
            ))}
          </ul>

          {order.ncm?.codCharge !== undefined && order.ncm.deliveryCharge !== undefined ? (
            // Booked with the courier: the delivery charge is now known, so say
            // exactly what to have ready instead of "charged separately".
            <dl className="mt-4 space-y-2 border-t border-border pt-4 font-body text-sm">
              <Row label="Books" value={npr(order.ncm.goodsAmount ?? order.total)} />
              <Row label="Nepal Can Move delivery" value={npr(order.ncm.deliveryCharge)} />
              <div className="flex justify-between gap-4 border-t border-border pt-3">
                <dt className="font-display text-base text-text">{order.ncm.codCharge > 0 ? "Pay at the door" : "Total"}</dt>
                <dd className="font-data text-lg font-semibold text-accent">{npr(order.ncm.codCharge)}</dd>
              </div>
            </dl>
          ) : (
            <>
              <div className="mt-4 flex justify-between border-t border-border pt-4">
                <span className="font-display text-base text-text">Total</span>
                <span className="font-data text-lg font-semibold text-accent">{npr(order.total)}</span>
              </div>
              <p className="mt-3 font-body text-xs leading-relaxed text-muted">
                Books only. The courier charges delivery separately when it hands the parcel over.
              </p>
            </>
          )}
        </section>
      )}

      {order?.ncm?.orderId && (
        <section className="mt-6 border border-border bg-surface p-6">
          <p className="inline-flex items-center gap-2 font-data text-xs uppercase tracking-wide text-muted">
            <Truck className="size-4 text-accent" /> Courier · Nepal Can Move
          </p>
          <dl className="mt-3 space-y-2 font-body text-sm">
            {order.ncm.branch && <Row label="Delivering branch" value={place(order.ncm.branch)} />}
            {order.ncm.destinationPhone && <Row label="Branch phone" value={order.ncm.destinationPhone} />}
            <Row label="NCM tracking" value={order.ncm.trackId || `#${order.ncm.orderId}`} />
          </dl>
          {(order.ncm.events?.length ?? 0) > 0 && (
            <ol className="mt-5 space-y-3 border-t border-border pt-4">
              {[...(order.ncm.events ?? [])].reverse().map((e, i) => (
                <li key={`${e.status}-${e.at}`} className="flex items-start justify-between gap-4 font-body text-sm">
                  <span className={i === 0 ? "font-medium text-text" : "text-muted"}>{courierStep(e.status, order.ncm?.returning)}</span>
                  <span className="shrink-0 font-data text-xs text-muted">{when(e.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <p className="mt-8 font-body text-sm text-muted">
        Have an account?{" "}
        <Link href="/account" className="text-link underline-offset-4 hover:underline">
          All your orders are in one place.
        </Link>
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-text">{value}</dd>
    </div>
  );
}
