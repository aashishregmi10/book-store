"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { OrderTimeline } from "../_components/OrderTimeline";
import { NcmPanel } from "../_components/NcmPanel";
import { FLOW, askReason, type AdminOrderDetail } from "../types";

/**
 * A whole page per order, rather than an accordion inside the list.
 *
 * The expanding row had to live inside a `colSpan` cell, which capped how much
 * an order could show and pushed the timeline behind a sub-tab to fit. It also
 * had no address of its own: you could not link a colleague to an order, reload
 * onto it, or open two side by side. Fulfilment is the job the admin does most,
 * so it gets real URLs.
 */
export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    let active = true;
    clientApi
      .get<AdminOrderDetail>(`/admin/orders/${id}`)
      .then((d) => active && setOrder(d))
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => load(), [load]);

  async function act(action: "advance" | "cancel" | "refund") {
    if (!order) return;
    setBusy(true);
    try {
      if (action === "advance") {
        const next = FLOW[FLOW.indexOf(order.status) + 1];
        if (next) await clientApi.put(`/admin/orders/${order._id}/status`, { status: next });
      } else if (action === "cancel") {
        const reason = askReason("Why is this order being cancelled? Stock will be restored.");
        if (reason === null) return;
        await clientApi.put(`/admin/orders/${order._id}/cancel`, { reason });
      } else {
        const reason = askReason("Why is this order being refunded?");
        if (reason === null) return;
        await clientApi.put(`/admin/orders/${order._id}/refund`, { reason });
      }
      setLoading(true);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (loading && !order) {
    return <p className="font-body text-sm text-muted">Loading order…</p>;
  }
  if (failed || !order) {
    return (
      <div>
        <BackLink />
        <p className="mt-4 font-body text-sm text-sale">Couldn&apos;t load this order.</p>
      </div>
    );
  }

  const terminal = order.status === "cancelled" || order.status === "refunded" || order.status === "delivered";
  const next = FLOW[FLOW.indexOf(order.status) + 1];

  return (
    <div>
      <BackLink />

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-text">{order.orderNumber}</h1>
          <p className="mt-1 font-body text-sm text-muted">
            {new Date(order.createdAt).toLocaleString()} · {order.itemCount} item
            {order.itemCount === 1 ? "" : "s"} · {npr(order.total)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-border px-3 py-1.5 font-data text-xs uppercase tracking-wide text-accent">
            {order.status}
          </span>
          {!terminal && next && (
            <button
              disabled={busy}
              onClick={() => act("advance")}
              className="border border-border px-3 py-1.5 font-data text-xs uppercase tracking-wide text-text hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Mark {next}
            </button>
          )}
          {order.status !== "cancelled" && order.status !== "refunded" && order.status !== "delivered" && (
            <button
              disabled={busy}
              onClick={() => act("cancel")}
              className="font-data text-xs uppercase tracking-wide text-muted hover:text-sale disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {order.status === "delivered" && (
            <button
              disabled={busy}
              onClick={() => act("refund")}
              className="font-data text-xs uppercase tracking-wide text-muted hover:text-sale disabled:opacity-50"
            >
              Refund
            </button>
          )}
        </div>
      </div>

      {/* Both panels are on screen at once now. In the accordion the timeline
          sat behind a tab purely because the row had no room for it, which hid
          exactly the information you want while chasing a late delivery. */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="label-smallcaps mb-2 text-xs">Items</p>
          <ul className="divide-y divide-border border border-border bg-surface">
            {order.items.map((it, idx) => (
              <li key={idx} className="flex items-center gap-3 px-3 py-3">
                <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded border border-border bg-bg">
                  {it.coverImage ? (
                    <Image src={it.coverImage} alt={`${it.title} cover`} fill sizes="44px" className="object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm text-text">
                    {it.book ? (
                      <Link href={`/admin/books/${it.book}`} className="hover:text-accent">
                        {it.title}
                      </Link>
                    ) : (
                      it.title
                    )}
                    {it.format ? (
                      <span className="ml-2 font-data text-xs uppercase tracking-wide text-muted">{it.format}</span>
                    ) : null}
                  </p>
                  <p className="truncate font-body text-xs text-muted">{it.author}</p>
                </div>
                <div className="text-right">
                  <p className="font-data text-sm text-text">
                    {it.quantity} × {npr(it.price)}
                  </p>
                  <p className="font-data text-xs text-muted">{npr(it.price * it.quantity)}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <p className="label-smallcaps mb-3 text-xs">Timeline</p>
            <div className="max-w-xl">
              <OrderTimeline history={order.statusHistory ?? []} current={order.status} />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <p className="label-smallcaps mb-1 text-xs">Customer</p>
            <p className="font-body text-sm text-text">{order.user?.fullName || "Guest"}</p>
            {order.user?.email && <p className="font-body text-sm text-muted">{order.user.email}</p>}
            {order.user?.phone && <p className="font-body text-sm text-muted">{order.user.phone}</p>}
          </div>

          <div>
            <p className="label-smallcaps mb-1 text-xs">Deliver to</p>
            <p className="font-body text-sm text-text">{order.deliveryAddress?.fullName}</p>
            <p className="font-body text-sm text-muted">{order.deliveryAddress?.phone}</p>
            <p className="font-body text-sm text-muted">
              {[
                order.deliveryAddress?.address1,
                order.deliveryAddress?.address2,
                order.deliveryAddress?.city,
                order.deliveryAddress?.province,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            <p className="mt-1 font-data text-xs uppercase tracking-wide text-muted">
              {order.deliveryMethod} delivery
            </p>
          </div>

          <dl className="space-y-1 border-t border-border pt-4 font-data text-sm">
            <Row label="Subtotal" value={npr(order.subtotal)} />
            {/* Only for orders placed back when the shop billed delivery itself.
                New orders carry 0 (the courier charges the customer directly),
                so a row there would just be noise. */}
            {order.deliveryFee > 0 && <Row label="Delivery (legacy)" value={npr(order.deliveryFee)} />}
            {order.discount > 0 && <Row label="Discount" value={`−${npr(order.discount)}`} />}
            <Row label="Total" value={npr(order.total)} strong />
            <Row label="Payment" value={`${order.paymentMethod.toUpperCase()} · ${order.paymentStatus}`} />
          </dl>

          {/* The courier booking. Once booked, NCM moves the status along on its
              own (webhooks + a periodic check), so the buttons above become an
              override rather than the usual way through. */}
          <NcmPanel
            order={order}
            onChanged={() => {
              setLoading(true);
              load();
            }}
          />

          {order.customerNote && (
            <p className="border-t border-border pt-4 font-body text-sm text-muted">
              <span className="text-text">Note:</span> {order.customerNote}
            </p>
          )}

          {/* Why this order ended where it did. It is recorded in the timeline
              too, but that means scrolling a history to answer the first
              question anyone opening a cancelled order asks. */}
          {(order.cancellationReason || order.refundReason) && (
            <p className="mt-4 border border-sale/40 bg-sale/5 px-4 py-3 font-body text-sm text-text">
              <span className="font-data text-xs uppercase tracking-wide text-sale">
                {order.refundReason ? "Refunded" : "Cancelled"}
              </span>
              <span className="mt-1 block">{order.refundReason || order.cancellationReason}</span>
            </p>
          )}
        </div>
      </div>

      <button
        onClick={() => router.refresh()}
        className="mt-10 font-data text-xs uppercase tracking-wide text-muted hover:text-accent"
      >
        Refresh
      </button>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/orders"
      className="inline-flex items-center gap-2 font-data text-xs uppercase tracking-wide text-muted hover:text-accent"
    >
      <ArrowLeft className="size-4" /> All orders
    </Link>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "font-semibold text-text" : "text-text"}>{value}</dd>
    </div>
  );
}
