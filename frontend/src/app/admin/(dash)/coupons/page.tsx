"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface AdminCoupon {
  _id: string;
  code: string;
  description?: string;
  type: "percentage" | "fixed" | "free_shipping";
  value: number;
  minOrderAmount?: number;
  usageLimit?: number;
  usageCount: number;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function worth(c: AdminCoupon): string {
  // Retired type — the shop no longer bills delivery, so these discount
  // nothing. Labelled honestly rather than left promising a saving.
  if (c.type === "free_shipping") return "Free delivery (no effect)";
  if (c.type === "fixed") return `${npr(c.value)} off`;
  return `${c.value}% off`;
}

/**
 * "Active" on the record and "redeemable right now" are different things — a
 * coupon can be switched on but scheduled for next week, or long expired. The
 * status column reports what a shopper would actually experience.
 */
function status(c: AdminCoupon): { label: string; tone: string } {
  const now = Date.now();
  if (!c.isActive) return { label: "Off", tone: "text-muted" };
  if (c.startDate && now < new Date(c.startDate).getTime()) return { label: `From ${shortDate(c.startDate)}`, tone: "text-muted" };
  if (c.endDate && now > new Date(c.endDate).getTime()) return { label: "Expired", tone: "text-sale" };
  if (c.usageLimit && c.usageCount >= c.usageLimit) return { label: "Used up", tone: "text-sale" };
  return { label: "Live", tone: "text-accent" };
}

export default function AdminCoupons() {
  const [rows, setRows] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    clientApi
      .get<AdminCoupon[]>("/admin/coupons")
      .then((d) => active && setRows(d))
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refresh]);

  async function del(id: string, code: string) {
    if (!confirm(`Delete ${code}? Shoppers who have the code will no longer be able to use it.`)) return;
    await clientApi.del(`/admin/coupons/${id}`).catch(() => {});
    setRefresh((n) => n + 1);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-text">Coupons</h1>
        <Link
          href="/admin/coupons/new"
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover"
        >
          <Plus className="size-4" /> New coupon
        </Link>
      </div>
      <p className="mt-1 max-w-prose font-body text-sm text-muted">
        Discount codes shoppers type at checkout. The cart re-prices on the server, so a code is worth exactly what it says here.
      </p>

      {loading ? (
        <div className="mt-5">
          <TableSkeleton rows={4} cols={5} />
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto border border-border bg-surface">
          <table className="w-full text-left">
            <thead className="border-b border-border bg-bg font-data text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Worth</th>
                <th className="px-4 py-3">Conditions</th>
                <th className="px-4 py-3">Used</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => {
                const s = status(c);
                return (
                  <tr key={c._id} className="hover:bg-bg">
                    <td className="px-4 py-3">
                      <Link href={`/admin/coupons/${c._id}/edit`} className="font-data tracking-[0.12em] text-text hover:text-accent">
                        {c.code}
                      </Link>
                      {c.description && <span className="mt-0.5 block font-body text-xs text-muted">{c.description}</span>}
                    </td>
                    <td className="px-4 py-3 font-body text-sm text-text">{worth(c)}</td>
                    <td className="px-4 py-3 font-body text-sm text-muted">
                      {c.minOrderAmount ? `Min ${npr(c.minOrderAmount)}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-data text-sm text-muted">
                      {c.usageCount}
                      {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-data text-xs uppercase tracking-wide ${s.tone}`}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/coupons/${c._id}/edit`} aria-label="Edit" className="p-1.5 text-muted hover:text-accent">
                          <Pencil className="size-4" />
                        </Link>
                        <button onClick={() => del(c._id, c.code)} aria-label="Delete" className="p-1.5 text-muted hover:text-sale">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center font-body text-muted">
                    No coupons yet, create one to run your first promotion.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
