"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package, Users, BookText, Star, TrendingUp, TrendingDown, AlertTriangle,
  Banknote, Receipt, Heart, MessageCircleQuestion, ClipboardList, ArrowUpRight, ArrowRight,
} from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { Skeleton, StatGridSkeleton } from "@/components/ui/Skeleton";

interface Overview {
  kpis: {
    revenue: number; monthRevenue: number; lastMonthRevenue: number; monthRevenueDelta: number | null;
    todayRevenue: number; totalOrders: number; monthOrders: number; todayOrders: number;
    avgOrderValue: number; customers: number; newCustomers: number; books: number;
    lowStockCount: number; pendingReviews: number; unansweredQuestions: number; ordersToFulfill: number;
  };
  ordersByStatus: Record<string, number>;
  revenueSeries: { date: string; revenue: number; orders: number }[];
  topBooks: { title: string; slug: string; soldCount: number; price: number }[];
  mostWishlisted: { title: string; slug: string; count: number }[];
  lowStock: { title: string; slug: string; stock: number }[];
  recentOrders: { orderNumber: string; customer: string; total: number; status: string; createdAt: string }[];
  recentCustomers: { fullName: string; email: string; createdAt: string }[];
}

const STATUS_ORDER = ["placed", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded", "returned"];

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
        <div className="mt-6"><StatGridSkeleton count={6} /></div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl text-text">Overview</h1>
          <p className="font-body text-sm text-muted">{today} · all figures in NPR</p>
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Banknote} label="Revenue (lifetime)" value={npr(k.revenue)} />
        <Kpi
          icon={TrendingUp}
          label="This month"
          value={npr(k.monthRevenue)}
          delta={k.monthRevenueDelta}
          sub={`${k.monthOrders} orders`}
        />
        <Kpi icon={Receipt} label="Today" value={npr(k.todayRevenue)} sub={`${k.todayOrders} orders`} />
        <Kpi icon={ClipboardList} label="Avg. order value" value={npr(k.avgOrderValue)} />
        <Kpi icon={Package} label="Orders" value={k.totalOrders.toLocaleString()} sub={`${k.monthOrders} this month`} />
        <Kpi icon={Users} label="Customers" value={k.customers.toLocaleString()} sub={`+${k.newCustomers} this month`} />
      </div>

      {/* ── Needs attention ──────────────────────────────── */}
      <section>
        <h2 className="mb-3 font-display text-lg text-text">Needs attention</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Attention href="/admin/orders" icon={Package} label="Orders to fulfill" count={k.ordersToFulfill} />
          <Attention href="/admin/reviews" icon={Star} label="Reviews to approve" count={k.pendingReviews} />
          <Attention href="/admin/questions" icon={MessageCircleQuestion} label="Questions to answer" count={k.unansweredQuestions} />
          <Attention href="/admin/books" icon={AlertTriangle} label="Low / out of stock" count={k.lowStockCount} />
        </div>
      </section>

      {/* ── Revenue trend + status breakdown ─────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <RevenueChart series={data.revenueSeries} />
        <StatusBreakdown counts={data.ordersByStatus} total={k.totalOrders} />
      </div>

      {/* ── Top sellers + most wishlisted ────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ListCard title="Top sellers" icon={BookText} empty="No sales yet.">
          {data.topBooks.map((b) => (
            <Row key={b.slug} href={`/admin/books/${b.slug}/edit`} left={b.title} right={`${b.soldCount} sold`} sub={npr(b.price)} />
          ))}
        </ListCard>
        <ListCard title="Most wishlisted" icon={Heart} empty="No wishlists yet.">
          {data.mostWishlisted.map((b) => (
            <Row key={b.slug} href={`/admin/books/${b.slug}/edit`} left={b.title} right={`${b.count} saved`} />
          ))}
        </ListCard>
      </div>

      {/* ── Recent orders + low stock ────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ListCard title="Recent orders" icon={Package} empty="No orders yet." action={{ href: "/admin/orders", label: "All orders" }}>
          {data.recentOrders.map((o) => (
            <Row
              key={o.orderNumber}
              href="/admin/orders"
              left={o.orderNumber}
              leftSub={o.customer}
              right={npr(o.total)}
              sub={o.status}
              mono
            />
          ))}
        </ListCard>
        <ListCard title={`Low stock (${data.lowStock.length})`} icon={AlertTriangle} empty="Everything’s well stocked." accent="sale">
          {data.lowStock.map((b) => (
            <Row key={b.slug} href={`/admin/books/${b.slug}/edit`} left={b.title} right={`${b.stock} left`} danger={b.stock === 0} />
          ))}
        </ListCard>
      </div>

      {/* ── Recent customers ─────────────────────────────── */}
      <ListCard title="New customers" icon={Users} empty="No customers yet." action={{ href: "/admin/users", label: "All customers" }}>
        {data.recentCustomers.map((u) => (
          <Row key={u.email} left={u.fullName} leftSub={u.email} right={new Date(u.createdAt).toLocaleDateString()} />
        ))}
      </ListCard>
    </div>
  );
}

/* ── pieces ──────────────────────────────────────────────── */

function Kpi({ icon: Icon, label, value, sub, delta }: { icon: typeof Banknote; label: string; value: string; sub?: string; delta?: number | null }) {
  return (
    <div className="border border-border bg-surface p-5">
      <Icon className="size-5 text-accent" />
      <p className="mt-3 font-data text-2xl font-semibold text-text">{value}</p>
      <div className="flex items-center justify-between gap-2">
        <p className="font-body text-sm text-muted">{label}</p>
        {delta != null && (
          <span className={`inline-flex items-center gap-0.5 font-data text-xs font-medium ${delta >= 0 ? "text-accent" : "text-sale"}`}>
            {delta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {sub && <p className="mt-0.5 font-data text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Attention({ href, icon: Icon, label, count }: { href: string; icon: typeof Package; label: string; count: number }) {
  const active = count > 0;
  return (
    <Link
      href={href}
      className={`group flex items-center justify-between gap-3 border p-4 transition-colors ${
        active ? "border-accent/40 bg-accent/5 hover:border-accent" : "border-border bg-surface hover:border-accent"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`size-5 ${active ? "text-accent" : "text-muted"}`} />
        <div>
          <p className="font-data text-2xl font-semibold text-text">{count}</p>
          <p className="font-body text-xs text-muted">{label}</p>
        </div>
      </div>
      <ArrowUpRight className="size-4 shrink-0 text-muted transition-colors group-hover:text-accent" />
    </Link>
  );
}

function RevenueChart({ series }: { series: Overview["revenueSeries"] }) {
  const max = Math.max(1, ...series.map((d) => d.revenue));
  const total = series.reduce((n, d) => n + d.revenue, 0);
  return (
    <section className="border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg text-text">Revenue · last 14 days</h2>
        <span className="font-data text-sm font-semibold text-accent">{npr(total)}</span>
      </div>
      <div className="mt-5 flex h-36 items-end gap-1.5">
        {series.map((d) => (
          <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end">
            <div
              className="w-full bg-accent/80 transition-colors group-hover:bg-accent"
              style={{ height: `${Math.max(2, (d.revenue / max) * 100)}%` }}
              title={`${new Date(d.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}: ${npr(d.revenue)} · ${d.orders} orders`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-data text-[10px] text-muted">
        <span>{new Date(series[0]?.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
        <span>{new Date(series[series.length - 1]?.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
      </div>
    </section>
  );
}

function StatusBreakdown({ counts, total }: { counts: Record<string, number>; total: number }) {
  const rows = STATUS_ORDER.filter((s) => counts[s] > 0);
  return (
    <section className="border border-border bg-surface p-5">
      <h2 className="font-display text-lg text-text">Orders by status</h2>
      {rows.length === 0 ? (
        <p className="mt-4 font-body text-sm text-muted">No orders yet.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {rows.map((s) => (
            <li key={s}>
              <div className="flex items-center justify-between font-data text-xs">
                <span className="uppercase tracking-wide text-muted">{s}</span>
                <span className="text-text">{counts[s]}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg">
                <div
                  className={`h-full rounded-full ${s === "cancelled" || s === "refunded" || s === "returned" ? "bg-sale/70" : "bg-accent/70"}`}
                  style={{ width: `${total ? (counts[s] / total) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListCard({
  title, icon: Icon, empty, accent, action, children,
}: {
  title: string; icon: typeof Package; empty: string; accent?: "sale";
  action?: { href: string; label: string }; children: React.ReactNode[];
}) {
  const items = (children as React.ReactNode[]).filter(Boolean);
  return (
    <section className="border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="flex items-center gap-2 font-display text-lg text-text">
          <Icon className={`size-4 ${accent === "sale" ? "text-sale" : "text-accent"}`} /> {title}
        </h2>
        {action && (
          <Link href={action.href} className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-muted hover:text-accent">
            {action.label} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-6 font-body text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">{items}</ul>
      )}
    </section>
  );
}

function Row({
  href, left, leftSub, right, sub, mono, danger,
}: {
  href?: string; left: string; leftSub?: string; right?: string; sub?: string; mono?: boolean; danger?: boolean;
}) {
  const leftEl = (
    <div className="min-w-0">
      <p className={`truncate text-sm text-text ${mono ? "font-data" : "font-body"}`}>{left}</p>
      {leftSub && <p className="truncate font-body text-xs text-muted">{leftSub}</p>}
    </div>
  );
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      {href ? <Link href={href} className="min-w-0 flex-1 hover:text-accent">{leftEl}</Link> : <div className="min-w-0 flex-1">{leftEl}</div>}
      <div className="shrink-0 text-right">
        {right && <p className={`font-data text-sm ${danger ? "text-sale" : "text-text"}`}>{right}</p>}
        {sub && <p className="font-data text-xs uppercase tracking-wide text-accent">{sub}</p>}
      </div>
    </li>
  );
}
