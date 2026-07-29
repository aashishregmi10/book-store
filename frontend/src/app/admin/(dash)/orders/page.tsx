"use client";

import { Fragment, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronRight } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { OrderTimeline, type StatusEntry } from "./_components/OrderTimeline";

interface AdminOrder {
  _id: string;
  orderNumber: string;
  total: number;
  status: string;
  itemCount: number;
  createdAt: string;
  user?: { fullName?: string; email?: string };
  deliveryAddress?: { fullName?: string; province?: string };
}

interface OrderItem {
  book?: string;
  title: string;
  author: string;
  format?: string;
  coverImage?: string;
  price: number;
  quantity: number;
}
interface AdminOrderDetail extends AdminOrder {
  items: OrderItem[];
  statusHistory?: StatusEntry[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  paymentMethod: string;
  paymentStatus: string;
  deliveryMethod: string;
  customerNote?: string;
  user?: { fullName?: string; email?: string; phone?: string };
  deliveryAddress?: {
    fullName?: string;
    phone?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
  };
}

const FLOW = ["placed", "confirmed", "processing", "shipped", "delivered"];
const STATUSES = ["all", ...FLOW, "cancelled", "refunded"];

export default function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Expandable detail: which row is open + a cache of fetched order details.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, AdminOrderDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  // Which tab each expanded row is showing, keyed by order id (defaults to
  // "details") so reopening a row remembers where you were.
  const [detailTab, setDetailTab] = useState<Record<string, "details" | "timeline">>({});

  useEffect(() => {
    let active = true;
    clientApi
      .get<AdminOrder[]>(`/admin/orders?status=${status}`)
      .then((d) => active && setOrders(d))
      .catch(() => active && setOrders([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [status, refreshKey]);
  const refresh = () => {
    setDetails({}); // stale after a status change
    setRefreshKey((k) => k + 1);
  };

  function toggle(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!details[id]) {
      setDetailLoading(id);
      clientApi
        .get<AdminOrderDetail>(`/admin/orders/${id}`)
        .then((d) => setDetails((m) => ({ ...m, [id]: d })))
        .catch(() => {})
        .finally(() => setDetailLoading((cur) => (cur === id ? null : cur)));
    }
  }

  async function act(id: string, action: "advance" | "cancel" | "refund", current?: string) {
    setBusy(id);
    try {
      if (action === "advance") {
        const next = FLOW[FLOW.indexOf(current || "") + 1];
        if (next) await clientApi.put(`/admin/orders/${id}/status`, { status: next });
      } else if (action === "cancel") {
        if (confirm("Cancel this order and restore stock?")) await clientApi.put(`/admin/orders/${id}/cancel`, {});
      } else {
        if (confirm("Refund this order?")) await clientApi.put(`/admin/orders/${id}/refund`, {});
      }
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-text">Orders</h1>

      <div className="mt-5 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 font-data text-xs uppercase tracking-wide ${status === s ? "bg-accent text-white" : "border border-border text-muted hover:text-accent"}`}>{s}</button>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto border border-border bg-surface">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-bg font-data text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((o) => {
              const terminal = ["delivered", "cancelled", "refunded"].includes(o.status);
              const isOpen = expanded === o._id;
              const detail = details[o._id];
              return (
                <Fragment key={o._id}>
                  <tr className="cursor-pointer hover:bg-bg" onClick={() => toggle(o._id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        {isOpen ? <ChevronDown className="mt-0.5 size-4 text-muted" /> : <ChevronRight className="mt-0.5 size-4 text-muted" />}
                        <div>
                          <p className="font-data text-sm text-text">{o.orderNumber}</p>
                          <p className="font-body text-xs text-muted">{o.itemCount} items · {new Date(o.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-body text-sm text-text">{o.user?.fullName || o.deliveryAddress?.fullName || "Guest"}</p>
                      <p className="font-body text-xs text-muted">{o.deliveryAddress?.province}</p>
                    </td>
                    <td className="px-4 py-3 font-data text-sm text-text">{npr(o.total)}</td>
                    <td className="px-4 py-3"><span className="font-data text-xs uppercase tracking-wide text-accent">{o.status}</span></td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        {!terminal && (
                          <button disabled={busy === o._id} onClick={() => act(o._id, "advance", o.status)} className="border border-border px-2 py-1 font-data text-xs uppercase text-text hover:border-accent hover:text-accent disabled:opacity-50">
                            → {FLOW[FLOW.indexOf(o.status) + 1] || ""}
                          </button>
                        )}
                        {!terminal && (
                          <button disabled={busy === o._id} onClick={() => act(o._id, "cancel")} className="font-data text-xs uppercase text-muted hover:text-sale disabled:opacity-50">Cancel</button>
                        )}
                        {o.status === "delivered" && (
                          <button disabled={busy === o._id} onClick={() => act(o._id, "refund")} className="font-data text-xs uppercase text-muted hover:text-sale disabled:opacity-50">Refund</button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="bg-bg">
                      <td colSpan={5} className="px-4 py-4">
                        {detailLoading === o._id && !detail ? (
                          <p className="font-body text-sm text-muted">Loading order details…</p>
                        ) : detail ? (
                          <>
                          <div className="mb-4 flex gap-1 border-b border-border">
                            {(["details", "timeline"] as const).map((t) => (
                              <button
                                key={t}
                                onClick={() => setDetailTab((m) => ({ ...m, [o._id]: t }))}
                                className={`-mb-px border-b-2 px-3.5 py-2 font-data text-xs uppercase tracking-wide transition-colors ${
                                  (detailTab[o._id] ?? "details") === t
                                    ? "border-accent text-accent"
                                    : "border-transparent text-muted hover:text-text"
                                }`}
                              >
                                {t === "details" ? "Details" : `Timeline (${detail.statusHistory?.length ?? 0})`}
                              </button>
                            ))}
                          </div>

                          {(detailTab[o._id] ?? "details") === "timeline" ? (
                            <div className="max-w-xl">
                              <OrderTimeline history={detail.statusHistory ?? []} current={detail.status} />
                            </div>
                          ) : (
                          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
                            {/* Line items */}
                            <div>
                              <p className="label-smallcaps mb-2 text-xs">Items</p>
                              <ul className="divide-y divide-border border border-border bg-surface">
                                {detail.items.map((it, idx) => (
                                  <li key={idx} className="flex items-center gap-3 px-3 py-2">
                                    <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded border border-border bg-bg">
                                      {it.coverImage ? (
                                        <Image src={it.coverImage} alt={`${it.title} cover`} fill sizes="40px" className="object-cover" />
                                      ) : null}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-body text-sm text-text">
                                        {it.title}
                                        {it.format ? <span className="ml-2 font-data text-xs uppercase tracking-wide text-muted">{it.format}</span> : null}
                                      </p>
                                      <p className="truncate font-body text-xs text-muted">{it.author}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-data text-sm text-text">{it.quantity} × {npr(it.price)}</p>
                                      <p className="font-data text-xs text-muted">{npr(it.price * it.quantity)}</p>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Address + totals */}
                            <div className="space-y-4">
                              <div>
                                <p className="label-smallcaps mb-1 text-xs">Deliver to</p>
                                <p className="font-body text-sm text-text">{detail.deliveryAddress?.fullName}</p>
                                <p className="font-body text-sm text-muted">{detail.deliveryAddress?.phone}</p>
                                <p className="font-body text-sm text-muted">
                                  {[detail.deliveryAddress?.address1, detail.deliveryAddress?.address2, detail.deliveryAddress?.city, detail.deliveryAddress?.province]
                                    .filter(Boolean)
                                    .join(", ")}
                                </p>
                                <p className="mt-1 font-data text-xs uppercase tracking-wide text-muted">{detail.deliveryMethod} delivery</p>
                              </div>

                              <dl className="space-y-1 border-t border-border pt-3 font-data text-sm">
                                <Row label="Subtotal" value={npr(detail.subtotal)} />
                                <Row label="Delivery" value={detail.deliveryFee === 0 ? "Free" : npr(detail.deliveryFee)} />
                                {detail.discount > 0 && <Row label="Discount" value={`−${npr(detail.discount)}`} />}
                                <Row label="Total" value={npr(detail.total)} strong />
                                <Row label="Payment" value={`${detail.paymentMethod.toUpperCase()} · ${detail.paymentStatus}`} />
                              </dl>

                              {detail.customerNote && (
                                <p className="border-t border-border pt-3 font-body text-sm text-muted">
                                  <span className="text-text">Note:</span> {detail.customerNote}
                                </p>
                              )}
                            </div>
                          </div>
                          )}
                          </>
                        ) : (
                          <p className="font-body text-sm text-sale">Couldn&apos;t load order details.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`s${i}`}>
                  {Array.from({ length: 5 }).map((_, c) => (
                    <td key={c} className="px-4 py-4"><span className="block h-4 w-full animate-pulse bg-border/70" /></td>
                  ))}
                </tr>
              ))}
            {!loading && orders.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center font-body text-muted">No orders.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
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
