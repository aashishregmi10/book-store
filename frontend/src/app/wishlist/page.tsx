"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, Share2, ShoppingBag, Bell, Check, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/stores/auth";
import { useAuthModal } from "@/lib/stores/authModal";
import { useCart } from "@/lib/stores/cart";
import { useWishlist } from "@/lib/stores/wishlist";
import type { BookCardData } from "@/lib/types";
import { npr } from "@/lib/format";
import { Skeleton } from "@/components/ui/Skeleton";

type Filter = "all" | "in-stock" | "on-sale" | "out";

const inStock = (b: BookCardData) => b.stockStatus !== "out-of-stock" && b.stockStatus !== "discontinued";
const onSale = (b: BookCardData) => !!b.comparePrice && b.comparePrice > b.price;

export default function WishlistPage() {
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const openLogin = useAuthModal((s) => s.openLogin);
  const add = useCart((s) => s.add);
  // Shared store is the source of truth so removals here keep the header count in sync.
  const books = useWishlist((s) => s.items);
  const hydrateWishlist = useWishlist((s) => s.hydrate);
  const removeItem = useWishlist((s) => s.remove);
  const [filter, setFilter] = useState<Filter>("all");
  const [notified, setNotified] = useState<Set<string>>(new Set());
  const [shared, setShared] = useState(false);
  const [alerted, setAlerted] = useState(false);

  useEffect(() => {
    if (token) hydrateWishlist(true);
  }, [token, hydrateWishlist]);

  const stats = useMemo(() => {
    const list = books ?? [];
    return {
      count: list.length,
      genres: new Set(list.map((b) => b.genre)).size,
      listValue: list.reduce((n, b) => n + b.price, 0),
      inStockCount: list.filter(inStock).length,
      savings: list.reduce((n, b) => n + (onSale(b) ? (b.comparePrice as number) - b.price : 0), 0),
    };
  }, [books]);

  function moveToCart(b: BookCardData) {
    add({ bookId: b._id, slug: b.slug, title: b.title, author: b.author, coverImage: b.coverImage.secureUrl, price: b.price });
    removeItem(b._id);
  }
  function moveAllInStock() {
    (books ?? []).filter(inStock).forEach(moveToCart);
  }
  async function shareList() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title: "My Books Temple wishlist", url });
      else await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      /* dismissed */
    }
  }

  // ── Signed-out ─────────────────────────────────────────
  if (hydrated && !token) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent/10">
          <Heart className="size-7 text-accent" />
        </span>
        <h1 className="mt-5 font-display text-3xl text-text">Save books for later</h1>
        <p className="mt-2 font-body text-muted">Sign in to keep a wishlist that follows you across devices.</p>
        <button onClick={() => openLogin("/wishlist")} className="mt-6 inline-block rounded-full bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">
          Sign in
        </button>
      </div>
    );
  }

  const list = books ?? [];
  const filtered = list.filter((b) =>
    filter === "in-stock" ? inStock(b) : filter === "on-sale" ? onSale(b) : filter === "out" ? !inStock(b) : true
  );
  const FILTERS: [Filter, string, number][] = [
    ["all", "All", list.length],
    ["in-stock", "In stock", stats.inStockCount],
    ["on-sale", "On sale", list.filter(onSale).length],
    ["out", "Restocking", list.length - stats.inStockCount],
  ];

  return (
    <div className="shell py-12">
      {books === null ? (
        <WishlistSkeleton />
      ) : list.length === 0 ? (
        <div className="py-20 text-center">
          <p className="label-smallcaps font-data text-xs">Saved for later</p>
          <h1 className="mt-2 font-display text-5xl text-text">Your wishlist.</h1>
          <p className="mx-auto mt-4 max-w-md font-body text-muted">
            Your shelf of someday-reads is empty. Tap the heart on any book and it&apos;ll wait for you here.
          </p>
          <Link href="/books" className="mt-6 inline-block rounded-full bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-10 lg:grid-cols-[340px_minmax(0,1fr)]">
            {/* ── Sticky summary + actions ───────────────── */}
            <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
              <div>
                <p className="label-smallcaps font-data text-xs">Saved for later</p>
                <h1 className="mt-2 font-display text-4xl leading-tight text-text">Your wishlist.</h1>
                <p className="mt-3 font-body text-sm leading-relaxed text-muted">
                  {stats.count} {stats.count === 1 ? "title" : "titles"} waiting for the right rainy afternoon, we&apos;ll
                  nudge you when prices drop.
                </p>
              </div>

              <dl className="rounded-2xl border border-border bg-surface p-5">
                <SummaryRow label="Saved titles" value={String(stats.count)} hint={`across ${stats.genres} ${stats.genres === 1 ? "genre" : "genres"}`} />
                <SummaryRow label="List value" value={npr(stats.listValue)} hint={`${stats.inStockCount} in stock today`} mono />
                <SummaryRow label="Potential savings" value={stats.savings > 0 ? npr(stats.savings) : "—"} hint="from current promos" mono last />
              </dl>

              <div className="space-y-2.5">
                <button
                  onClick={moveAllInStock}
                  disabled={stats.inStockCount === 0}
                  className="w-full rounded-full bg-accent px-5 py-3 font-data text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  Move all in-stock to cart
                </button>
                <button
                  onClick={shareList}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 py-3 font-data text-sm text-text transition-colors hover:border-accent"
                >
                  {shared ? <Check className="size-4 text-accent" /> : <Share2 className="size-4" />}
                  {shared ? "Link copied" : "Share list"}
                </button>
              </div>
            </aside>

            {/* ── Item list ──────────────────────────────── */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map(([key, label, n]) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className={`rounded-full px-3.5 py-1.5 font-data text-xs uppercase tracking-wide transition-colors ${
                        filter === key ? "bg-accent text-white" : "border border-border text-muted hover:border-accent hover:text-accent"
                      }`}
                    >
                      {label} <span className="opacity-70">{n}</span>
                    </button>
                  ))}
                </div>
                <span className="font-body text-sm text-muted">
                  Sorted by <span className="text-text">recently added</span>
                </span>
              </div>

              <ul className="mt-5 space-y-4">
                {filtered.map((b) => {
                  const available = inStock(b);
                  return (
                    <li
                      key={b._id}
                      className="group flex gap-5 rounded-2xl border border-border bg-surface p-4 transition-shadow hover:shadow-[0_6px_24px_-12px_rgba(29,118,188,0.3)] sm:p-5"
                    >
                      <Link href={`/books/${b.slug}`} className="relative h-32 w-22 shrink-0 overflow-hidden rounded-lg border border-border bg-bg">
                        <Image src={b.coverImage.secureUrl} alt={`${b.title} cover`} fill sizes="88px" className="object-cover" />
                      </Link>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-data text-xs uppercase tracking-wide text-muted">{b.genre.replace(/-/g, " ")}</span>
                          {!available && (
                            <span className="rounded-full border border-sale/40 bg-sale/5 px-2 py-0.5 font-data text-[10px] uppercase tracking-wide text-sale">
                              Restocking
                            </span>
                          )}
                          {onSale(b) && available && (
                            <span className="rounded-full bg-accent/10 px-2 py-0.5 font-data text-[10px] uppercase tracking-wide text-accent">
                              On sale
                            </span>
                          )}
                        </div>
                        <Link href={`/books/${b.slug}`} className="mt-1 font-display text-xl leading-snug text-text transition-colors group-hover:text-accent">
                          {b.title}
                        </Link>
                        <p className="font-body text-sm text-muted">{b.author}</p>
                        <div className="mt-auto flex items-baseline gap-2 pt-2">
                          <span className="font-data text-lg font-semibold text-accent">{npr(b.price)}</span>
                          {onSale(b) && <span className="font-data text-sm text-muted line-through">{npr(b.comparePrice as number)}</span>}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end justify-between">
                        {available ? (
                          <button
                            onClick={() => moveToCart(b)}
                            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-data text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                          >
                            <ShoppingBag className="size-4" /> Move to cart
                          </button>
                        ) : (
                          <button
                            onClick={() => setNotified((s) => new Set(s).add(b._id))}
                            disabled={notified.has(b._id)}
                            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 font-data text-sm text-text transition-colors hover:border-accent disabled:opacity-60"
                          >
                            <Bell className="size-4" /> {notified.has(b._id) ? "We'll email you" : "Notify me"}
                          </button>
                        )}
                        <button onClick={() => removeItem(b._id)} className="font-body text-sm text-muted hover:text-sale">
                          Remove
                        </button>
                      </div>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="rounded-2xl border border-dashed border-border px-4 py-12 text-center font-body text-muted">
                    Nothing in this filter.
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* ── Alerts banner ──────────────────────────── */}
          <div className="mt-12 overflow-hidden rounded-3xl bg-text px-6 py-9 sm:px-12">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <p className="inline-flex items-center gap-2 font-data text-xs uppercase tracking-[0.2em] text-accent">
                  <Sparkles className="size-4" /> Wishlist superpowers
                </p>
                <h2 className="mt-3 font-display text-2xl text-bg sm:text-3xl">We&apos;ll watch the shelves so you don&apos;t have to.</h2>
                <p className="mt-2 max-w-md font-body text-sm leading-relaxed text-bg/70">
                  Turn on alerts to hear the moment a book restocks, a signed copy lands, or the price drops below your threshold.
                </p>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); setAlerted(true); }} className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  required
                  placeholder="you@reader.np"
                  className="w-full rounded-full border border-bg/20 bg-bg/10 px-5 py-3 font-body text-sm text-bg outline-none placeholder:text-bg/40 focus:border-accent"
                />
                <button type="submit" className="shrink-0 rounded-full bg-accent px-6 py-3 font-data text-sm font-medium text-white transition-colors hover:bg-accent-hover">
                  {alerted ? "Alerts on ✓" : "Turn on alerts"}
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryRow({ label, value, hint, mono, last }: { label: string; value: string; hint: string; mono?: boolean; last?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-3 ${last ? "" : "border-b border-border"}`}>
      <div>
        <dt className="font-data text-xs uppercase tracking-wide text-muted">{label}</dt>
        <dd className="font-body text-xs text-muted">{hint}</dd>
      </div>
      <span className={`text-right text-lg font-semibold text-accent ${mono ? "font-data" : "font-display"}`}>{value}</span>
    </div>
  );
}

function WishlistSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
