"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Award, Copy, Check, Gift, Coins } from "lucide-react";
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

interface PointsEntry {
  amount: number;
  reason: string;
  createdAt: string;
}

interface PointsData {
  points: number;
  tier: string;
  history: PointsEntry[];
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function AccountPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [pointsData, setPointsData] = useState<PointsData | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    if (hydrated && !token) router.replace("/login?next=/account");
  }, [hydrated, token, router]);

  useEffect(() => {
    if (!token) return;
    clientApi.get<OrderRow[]>("/orders/my-orders").then(setOrders).catch(() => setOrders([]));
    clientApi.get<PointsData>("/auth/points").then(setPointsData).catch(() => setPointsData(null));
  }, [token]);

  if (!user) return <div className="mx-auto max-w-2xl px-4 py-24"><PageSpinner label="Loading your account…" /></div>;

  const balance = pointsData?.points ?? user.points ?? 0;

  return (
    <div className="shell py-10">
      {/* Identity + what the account is worth, in one line each. */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-display text-4xl text-text">{user.fullName}</h1>
          <p className="mt-1 font-body text-muted">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 font-data text-xs uppercase tracking-wide text-text">
            <Award className="size-4 text-accent" /> {pointsData?.tier || user.tier}
          </span>
          {/* Points meant nothing on their own — a balance with no stated value.
              Showing the rupee equivalent is the whole point of having them. */}
          <span className="rounded-md border border-accent bg-accent/5 px-3 py-2 text-right">
            <span className="block font-data text-lg leading-none text-accent">{balance}</span>
            <span className="mt-0.5 block font-body text-xs text-muted">points · {npr(balance)} off</span>
          </span>
          <Link href="/account/settings" className="font-data text-xs uppercase tracking-wide text-muted hover:text-accent">
            Settings
          </Link>
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

              {/* The terms are the reason anyone reads this card, so they get
                  the emphasis rather than sitting in grey supporting text. */}
              <p className="mt-3 border-l-4 border-accent bg-accent/10 px-4 py-3 font-body text-sm font-semibold leading-relaxed text-accent-hover">
                Your friend gets NPR 50 off their first order. When they buy, you get 100 points.
              </p>

              <label className="mt-5 block font-data text-xs uppercase tracking-wide text-muted">Your invite link</label>
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
                      --color-text / surface tokens for a high-contrast scan. */}
                  <QRCodeSVG value={link} size={104} fgColor="#333a3f" bgColor="#ffffff" level="M" aria-label="QR code for your invite link" />
                </div>
                <div>
                  <p className="font-data text-xs uppercase tracking-wide text-muted">Scan to invite</p>
                  <p className="mt-1 font-body text-sm text-text">
                    Hand someone your phone and let them scan this. Easier than spelling out a code.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="space-y-10">
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
                      <p className="font-body text-xs text-muted">{shortDate(o.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-data text-sm text-text">{npr(o.total)}</p>
                        <p className="font-data text-xs uppercase tracking-wide text-accent">{o.status}</p>
                      </div>
                      <Link
                        href={`/track?order=${encodeURIComponent(o.orderNumber)}`}
                        className="inline-flex min-h-11 items-center font-data text-xs uppercase tracking-wide text-link underline-offset-4 hover:underline"
                      >
                        Track
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Points ledger — every movement was already recorded; this is the
              first place a shopper can actually see it, which is how a referral
              bonus becomes visible instead of just appearing in the balance. */}
          <div id="points" className="scroll-mt-24">
            <h2 className="flex items-center gap-2 font-display text-2xl text-text"><Coins className="size-5 text-accent" /> Points activity</h2>
            <p className="mt-1 font-body text-sm text-muted">
              You earn 1 point for every NPR 50 you spend. Each point takes NPR 1 off a later order.
            </p>
            {pointsData === null ? (
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="flex items-center justify-between py-4">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-12" />
                  </li>
                ))}
              </ul>
            ) : pointsData.history.length === 0 ? (
              <p className="mt-4 font-body text-muted">Nothing here yet, your first order will start it off.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {pointsData.history.map((h, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-body text-sm text-text">{h.reason}</p>
                      <p className="font-body text-xs text-muted">{shortDate(h.createdAt)}</p>
                    </div>
                    <span className={`shrink-0 font-data text-sm ${h.amount < 0 ? "text-muted" : "text-accent"}`}>
                      {h.amount > 0 ? `+${h.amount}` : h.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
