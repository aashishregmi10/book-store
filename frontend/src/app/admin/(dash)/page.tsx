"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, Users, BookText, Star, TrendingUp, AlertTriangle, Banknote } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { Skeleton, StatGridSkeleton } from "@/components/ui/Skeleton";

interface Overview {
  kpis: { totalOrders: number; monthOrders: number; revenue: number; customers: number; books: number; lowStockCount: number; pendingReviews: number };
  lowStock: { title: string; slug: string; stock: number }[];
  recentOrders: { orderNumber: string; customer: string; total: number; status: string; createdAt: string }[];
}

export default function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    clientApi.get<Overview>("/admin/overview").then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="font-body text-sale">{err}</p>;
  if (!data) {
    return (
      <div>
        <h1 className="font-display text-3xl text-text">Overview</h1>
        <div className="mt-6">
          <StatGridSkeleton count={6} />
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const cards = [
    { label: "Revenue", value: npr(k.revenue), icon: Banknote },
    { label: "Orders", value: k.totalOrders, icon: Package },
    { label: "This month", value: k.monthOrders, icon: TrendingUp },
    { label: "Customers", value: k.customers, icon: Users },
    { label: "Books", value: k.books, icon: BookText },
    { label: "Pending reviews", value: k.pendingReviews, icon: Star },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl text-text">Overview</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="border border-border bg-surface p-5">
            <c.icon className="size-5 text-accent" />
            <p className="mt-3 font-data text-2xl font-semibold text-text">{c.value}</p>
            <p className="font-body text-sm text-muted">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Low stock */}
        <section className="border border-border bg-surface">
          <h2 className="flex items-center gap-2 border-b border-border px-5 py-3 font-display text-lg text-text">
            <AlertTriangle className="size-4 text-sale" /> Low stock ({data.lowStock.length})
          </h2>
          {data.lowStock.length === 0 ? (
            <p className="px-5 py-6 font-body text-sm text-muted">Everything’s well stocked.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.lowStock.map((b) => (
                <li key={b.slug} className="flex items-center justify-between px-5 py-3">
                  <Link href={`/admin/books`} className="font-body text-sm text-text hover:text-accent">{b.title}</Link>
                  <span className={`font-data text-xs ${b.stock === 0 ? "text-sale" : "text-muted"}`}>{b.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent orders */}
        <section className="border border-border bg-surface">
          <h2 className="border-b border-border px-5 py-3 font-display text-lg text-text">Recent orders</h2>
          {data.recentOrders.length === 0 ? (
            <p className="px-5 py-6 font-body text-sm text-muted">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentOrders.map((o) => (
                <li key={o.orderNumber} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-data text-sm text-text">{o.orderNumber}</p>
                    <p className="font-body text-xs text-muted">{o.customer}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-data text-sm text-text">{npr(o.total)}</p>
                    <p className="font-data text-xs uppercase tracking-wide text-accent">{o.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
