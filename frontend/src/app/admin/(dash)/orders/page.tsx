"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { Pagination } from "@/components/books/Pagination";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { STATUSES, TERMINAL, askReason, nextStatus, type AdminOrder } from "./types";

/** One page of orders from GET /admin/orders. */
interface OrdersPage {
  items: AdminOrder[];
  total: number;
  page: number;
  pages: number;
}

const PAGE_SIZE = 25;


/**
 * Orders list. Rows link through to /admin/orders/[id].
 *
 * This used to expand each row into an accordion holding the items, address,
 * totals and a tabbed timeline, all inside one `colSpan` cell. That capped how
 * much an order could show, and gave an order no address of its own: you could
 * not send someone a link to an order, reload back onto it, or compare two.
 * The list's job is scanning and quick status changes; everything else lives on
 * the order's own page.
 */
export default function AdminOrders() {
  // useSearchParams needs a Suspense boundary, same as the books list.
  return (
    <Suspense fallback={<TableSkeleton rows={6} cols={5} />}>
      <AdminOrdersContent />
    </Suspense>
  );
}

function AdminOrdersContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL owns status + page, matching the books list: a filtered page is
  // shareable, survives a refresh, and back/forward walks prior states.
  const status = searchParams.get("status") || "all";
  const page = Number(searchParams.get("page")) || 1;

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // A failed status change used to be completely silent: `act` had no catch, so
  // the promise rejected unhandled, the row never moved, and the only clue was
  // the console. Anything that touches an order now reports what happened.
  const [error, setError] = useState("");

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(
        typeof window === "undefined" ? searchParams.toString() : window.location.search
      );
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Same URL shape, as an href, so <Pagination> renders real links
  // (middle-click, open-in-new-tab) rather than click handlers.
  function hrefForPage(n: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (n === 1) params.delete("page");
    else params.set("page", String(n));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  useEffect(() => {
    let active = true;
    // Clear stale rows while the new filter loads, so the skeleton replaces the
    // previous status's orders instead of appearing underneath them. Same
    // deliberate exception the books list documents: this is synchronising to
    // an external source (the API), and the alternative is showing one
    // status's orders under another status's heading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setOrders([]);
    clientApi
      .get<OrdersPage>(`/admin/orders?status=${status}&page=${page}&limit=${PAGE_SIZE}`)
      .then((d) => {
        if (!active) return;
        setOrders(d.items);
        setPages(d.pages);
        setTotal(d.total);
      })
      .catch((e) => {
        if (!active) return;
        setOrders([]);
        setPages(1);
        setTotal(0);
        setError(e?.message || "Couldn't load orders.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [status, page, refreshKey]);

  async function act(
    e: React.MouseEvent,
    id: string,
    action: "advance" | "cancel" | "refund",
    current?: string
  ) {
    // The order cell is a link; these buttons sit in the same row.
    e.preventDefault();
    e.stopPropagation();
    setError("");
    setBusy(id);
    try {
      if (action === "advance") {
        const next = nextStatus(current || "");
        if (!next) return; // nothing to advance to — the button shouldn't render either
        await clientApi.put(`/admin/orders/${id}/status`, { status: next });
      } else if (action === "cancel") {
        const reason = askReason("Why is this order being cancelled? Stock will be restored.");
        if (reason === null) return;
        await clientApi.put(`/admin/orders/${id}/cancel`, { reason });
      } else {
        const reason = askReason("Why is this order being refunded?");
        if (reason === null) return;
        await clientApi.put(`/admin/orders/${id}/refund`, { reason });
      }
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError((e as Error)?.message || "That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-text">Orders</h1>

      <div className="mt-5 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => updateParams({ status: s === "all" ? null : s, page: null })}
            className={`px-3 py-1.5 font-data text-xs uppercase tracking-wide ${
              status === s ? "bg-accent text-white" : "border border-border text-muted hover:text-accent"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 border border-sale/40 bg-sale/5 px-4 py-3 font-body text-sm text-sale"
        >
          {error}
        </p>
      )}

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
              // Derived from the shared helper rather than a literal list — the
              // literal omitted `returned`, which is what produced a "→ placed"
              // button on returned orders.
              const next = nextStatus(o.status);
              const terminal = TERMINAL.has(o.status);
              return (
                <tr key={o._id} className="hover:bg-hover">
                  <td className="px-4 py-3">
                    {/* A real <a>: middle-click and open-in-new-tab work, which
                        the previous row-level onClick handler did not support. */}
                    <Link href={`/admin/orders/${o._id}`} className="group flex items-start gap-2">
                      <ChevronRight className="mt-0.5 size-4 text-muted group-hover:text-accent" />
                      <span>
                        <span className="block font-data text-sm text-text group-hover:text-accent">
                          {o.orderNumber}
                        </span>
                        <span className="block font-body text-xs text-muted">
                          {o.itemCount} items · {new Date(o.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-body text-sm text-text">
                      {o.user?.fullName || o.deliveryAddress?.fullName || "Guest"}
                    </p>
                    <p className="font-body text-xs text-muted">{o.deliveryAddress?.province}</p>
                  </td>
                  <td className="px-4 py-3 font-data text-sm text-text">{npr(o.total)}</td>
                  <td className="px-4 py-3">
                    <span className="font-data text-xs uppercase tracking-wide text-accent">{o.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {next && (
                        <button
                          disabled={busy === o._id}
                          onClick={(e) => act(e, o._id, "advance", o.status)}
                          className="border border-border px-2 py-1 font-data text-xs uppercase text-text hover:border-accent hover:text-accent disabled:opacity-50"
                        >
                          → {next}
                        </button>
                      )}
                      {!terminal && (
                        <button
                          disabled={busy === o._id}
                          onClick={(e) => act(e, o._id, "cancel")}
                          className="font-data text-xs uppercase text-muted hover:text-sale disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                      {o.status === "delivered" && (
                        <button
                          disabled={busy === o._id}
                          onClick={(e) => act(e, o._id, "refund")}
                          className="font-data text-xs uppercase text-muted hover:text-sale disabled:opacity-50"
                        >
                          Refund
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`s${i}`}>
                  {Array.from({ length: 5 }).map((_, c) => (
                    <td key={c} className="px-4 py-4">
                      <span className="block h-4 w-full animate-pulse bg-border/70" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center font-body text-muted">
                  No orders.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="font-data text-xs uppercase tracking-wide text-muted">
            {total} order{total === 1 ? "" : "s"}
          </span>
          <Pagination
            page={page}
            pages={pages}
            hrefFor={hrefForPage}
            className="flex flex-wrap items-center gap-1.5"
          />
        </div>
      )}
    </div>
  );
}
