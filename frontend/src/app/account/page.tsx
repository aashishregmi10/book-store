"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Award, Copy, Check, Gift } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/stores/auth";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageSpinner } from "@/components/ui/Spinner";

interface OrderRow {
  orderNumber: string;
  total: number;
  status: string;
  createdAt: string;
}

export default function AccountPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    if (hydrated && !token) router.replace("/login?next=/account");
  }, [hydrated, token, router]);

  useEffect(() => {
    if (!token) return;
    clientApi.get<OrderRow[]>("/orders/my-orders").then(setOrders).catch(() => setOrders([]));
  }, [token]);

  if (!user) return <div className="mx-auto max-w-2xl px-4 py-24"><PageSpinner label="Loading your account…" /></div>;

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-10 sm:px-8 lg:px-16 xl:px-24">
      <div className="border-b border-border pb-6">
        <h1 className="font-display text-4xl text-text">{user.fullName}</h1>
        <p className="mt-1 font-body text-muted">{user.email}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 font-data text-xs uppercase tracking-wide">
          <span className="inline-flex items-center gap-1 border border-border px-2 py-1 text-text"><Award className="size-3.5 text-accent" /> {user.tier}</span>
          <span className="border border-border px-2 py-1 text-text">{user.points} points</span>
          <Link href="/account/settings" className="ml-auto text-muted hover:text-accent">Settings</Link>
        </div>
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_1.4fr]">
      {/* Rewards / referral */}
      {user.referralCode && (() => {
        // Build from the live origin so the link always points at the real
        // deployment (avoids a stale/wrong NEXT_PUBLIC_SITE_URL → 404). This block
        // only renders client-side (after auth hydration), so window is available.
        const site = (typeof window !== "undefined" && window.location.origin) || process.env.NEXT_PUBLIC_SITE_URL || "";
        const link = `${site}/register?ref=${user.referralCode}`;
        async function copy(kind: "code" | "link", text: string) {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(kind);
            setTimeout(() => setCopied(null), 1800);
          } catch {
            /* clipboard blocked */
          }
        }
        return (
          <div id="rewards" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6">
            <h2 className="inline-flex items-center gap-2 font-display text-xl text-text">
              <Gift className="size-5 text-accent" /> Share &amp; earn
            </h2>
            <p className="mt-1 font-body text-sm text-muted">
              Give friends NPR 50 off their first order — you earn 100 points for every friend who buys.
            </p>

            {/* Shareable link */}
            <label className="mt-4 block font-data text-xs uppercase tracking-wide text-muted">Your invite link</label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2.5 font-data text-sm text-text outline-none"
              />
              <button
                onClick={() => copy("link", link)}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 font-data text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === "link" ? "Copied" : "Copy link"}
              </button>
            </div>

            {/* Code */}
            <div className="mt-4 flex items-center gap-3">
              <span className="font-data text-xs uppercase tracking-wide text-muted">Or share code</span>
              <code className="rounded-md bg-bg px-3 py-1.5 font-data text-sm tracking-wide text-accent">{user.referralCode}</code>
              <button
                onClick={() => copy("code", user.referralCode!)}
                className="inline-flex items-center gap-1.5 font-data text-xs uppercase tracking-wide text-muted transition-colors hover:text-accent"
              >
                {copied === "code" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied === "code" ? "Copied" : "Copy"}
              </button>
            </div>

            {/* Scannable invite — point a phone camera at it to open the link */}
            <div className="mt-5 flex items-center gap-4 border-t border-border pt-5">
              <div className="shrink-0 rounded-md border border-border bg-white p-2.5">
                {/* qrcode.react needs literal colour strings; these mirror the
                    --color-text (navy) / surface tokens for a high-contrast scan. */}
                <QRCodeSVG value={link} size={104} fgColor="#15233b" bgColor="#ffffff" level="M" aria-label="QR code for your invite link" />
              </div>
              <div>
                <p className="font-data text-xs uppercase tracking-wide text-muted">Scan to invite</p>
                <p className="mt-1 font-body text-sm text-text">
                  Point a phone camera here to open your invite link — handy for sharing in person.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Orders */}
      <div id="orders" className="scroll-mt-24">
        <h2 className="flex items-center gap-2 font-display text-2xl text-text"><Package className="size-5 text-accent" /> Recent orders</h2>
        {orders === null ? (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex items-center justify-between py-4">
                <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div>
                <div className="space-y-2 text-right"><Skeleton className="ml-auto h-4 w-16" /><Skeleton className="ml-auto h-3 w-12" /></div>
              </li>
            ))}
          </ul>
        ) : orders.length === 0 ? (
          <p className="mt-4 font-body text-muted">
            No orders yet.{" "}
            <Link href="/books" className="text-accent underline-offset-4 hover:underline">Start with a good book →</Link>
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {orders.map((o) => (
              <li key={o.orderNumber} className="flex items-center justify-between py-4">
                <div>
                  <p className="font-data text-sm text-text">{o.orderNumber}</p>
                  <p className="font-body text-xs text-muted">{new Date(o.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-data text-sm text-text">{npr(o.total)}</p>
                  <p className="font-data text-xs uppercase tracking-wide text-accent">{o.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  );
}
