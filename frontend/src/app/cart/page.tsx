"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { useCart, selectSubtotal, lineKey, type StockInfo } from "@/lib/stores/cart";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";

// No delivery constants here any more: the courier bills its own rate directly
// at handover, so the cart has no fee to add and no threshold to dangle.
// See backend/src/services/pricing.js.
const POINTS_RATE = 0.05;
const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export default function CartPage() {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const subtotal = useCart(selectSubtotal);
  const [promo, setPromo] = useState("");

  // Refresh stock + drop any items whose book was deleted/deactivated server-side.
  useEffect(() => {
    const ids = useCart.getState().items.map((i) => i.bookId);
    if (!ids.length) return;
    clientApi
      .get<{ _id: string; stock: number; variants?: { variantId: string; stock: number }[] }[]>(`/books/active?ids=${ids.join(",")}`)
      .then((books) =>
        useCart.getState().reconcile(books.map((b): StockInfo => ({ bookId: b._id, stock: b.stock, variants: b.variants })))
      )
      .catch(() => {});
  }, []);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent/10">
          <ShoppingBag className="size-7 text-accent" />
        </span>
        <h1 className="mt-5 font-display text-3xl text-text">Your cart is empty</h1>
        <p className="mt-2 font-body text-muted">Nothing here yet — let&apos;s fix that.</p>
        <Link href="/books" className="mt-6 inline-block rounded-full bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">
          Browse the shelves
        </Link>
      </div>
    );
  }

  const total = subtotal;
  const points = Math.round(subtotal * POINTS_RATE);
  const word = COUNT_WORDS[items.length] ?? String(items.length);
  const heading = `${word} good ${items.length === 1 ? "choice" : "choices"}.`;
  const checkoutHref = promo.trim() ? `/checkout?promo=${encodeURIComponent(promo.trim())}` : "/checkout";

  return (
    <div className="shell pb-24 pt-12">
      <p className="label-smallcaps font-data text-xs">Your cart</p>
      <h1 className="mt-2 font-display text-5xl text-text md:text-6xl">{heading}</h1>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        {/* Line items */}
        <ul className="h-fit divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {items.map((i) => (
            <li key={lineKey(i)} className="flex gap-5 p-5">
              <Link href={`/books/${i.slug}`} className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-bg">
                <Image src={i.coverImage} alt={`${i.title} cover`} fill sizes="80px" className="object-cover" />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <Link href={`/books/${i.slug}`} className="font-display text-lg leading-snug text-text hover:text-accent">
                  {i.title}
                </Link>
                <span className="font-body text-sm text-muted">{i.author}</span>
                {i.format && <span className="mt-0.5 font-data text-xs uppercase tracking-wide text-muted">{i.format}</span>}

                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">
                  <div className="flex items-center rounded-full border border-border">
                    <button
                      onClick={() => setQty(lineKey(i), i.quantity - 1)}
                      aria-label="Decrease quantity"
                      className="grid size-7 place-items-center text-text transition-colors hover:text-accent"
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-data text-sm">{i.quantity}</span>
                    <button
                      onClick={() => setQty(lineKey(i), i.quantity + 1)}
                      disabled={i.stock !== undefined && i.quantity >= i.stock}
                      aria-label="Increase quantity"
                      title={i.stock !== undefined && i.quantity >= i.stock ? "No more in stock" : undefined}
                      className="grid size-7 place-items-center text-text transition-colors hover:text-accent disabled:cursor-not-allowed disabled:text-muted disabled:opacity-40 disabled:hover:text-muted"
                    >
                      +
                    </button>
                  </div>
                  {i.stock !== undefined && i.quantity >= i.stock && (
                    <span className="font-data text-xs text-sale">
                      {i.stock === 0 ? "Out of stock" : `Only ${i.stock} in stock`}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end justify-between text-right">
                <div>
                  <div className="font-data text-lg font-semibold text-accent">{npr(i.price * i.quantity)}</div>
                  {i.quantity > 1 && <div className="font-data text-xs text-muted">{npr(i.price)} each</div>}
                </div>
                <button onClick={() => remove(lineKey(i))} className="font-body text-xs text-muted hover:text-sale">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/* Order summary */}
        <aside className="h-fit rounded-2xl border border-border bg-surface p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-xl text-text">Order summary</h2>
          <dl className="mt-6 space-y-3 font-body text-sm">
            <Row label="Subtotal" value={npr(subtotal)} />
            <Row label="Reading points earned" value={`+${points} pts`} muted />
          </dl>

          <div className="my-5 h-px bg-border" />

          <div className="flex items-baseline justify-between">
            <span className="font-display text-base text-text">Total</span>
            <span className="font-data text-2xl font-semibold text-accent">{npr(total)}</span>
          </div>

          <input
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="Promo code"
            className="mt-6 w-full rounded-md border border-border bg-bg px-3 py-2.5 font-body text-sm text-text outline-none placeholder:text-muted focus:border-accent"
          />

          <Link
            href={checkoutHref}
            className="mt-4 block rounded-full bg-accent px-6 py-3.5 text-center font-data text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Checkout — Cash on Delivery
          </Link>

          <p className="mt-4 text-center font-body text-xs leading-relaxed text-muted">
            Books only — the courier charges delivery separately when it hands the parcel over.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-data ${muted ? "text-accent" : "text-text"}`}>{value}</dd>
    </div>
  );
}
