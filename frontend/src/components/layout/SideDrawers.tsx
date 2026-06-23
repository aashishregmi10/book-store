"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { X, ShoppingBag, Heart, Minus, Plus, Trash2 } from "lucide-react";
import { useDrawer } from "@/lib/stores/uiDrawer";
import { useCart, selectSubtotal, lineKey, type StockInfo } from "@/lib/stores/cart";
import { useAuth } from "@/lib/stores/auth";
import { useAuthModal } from "@/lib/stores/authModal";
import { useWishlist } from "@/lib/stores/wishlist";
import { clientApi } from "@/lib/client-api";
import type { BookCardData } from "@/lib/types";
import { npr } from "@/lib/format";

const FREE_DELIVERY = 1500;

export function SideDrawers() {
  const open = useDrawer((s) => s.open);
  const close = useDrawer((s) => s.close);
  if (!open) return null;
  return (
    <DrawerShell title={open === "cart" ? "Your cart" : "Your wishlist"} onClose={close}>
      {open === "cart" ? <CartPanel onClose={close} /> : <WishlistPanel onClose={close} />}
    </DrawerShell>
  );
}

function DrawerShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // Lock background scroll while the drawer is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title}>
      {/* Dimmed, blurred backdrop — makes the drawer read as a modal and closes on tap. */}
      <div className="animate-overlay-in absolute inset-0 bg-text/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-drawer-in absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-xl text-text">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-text">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CartPanel({ onClose }: { onClose: () => void }) {
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const subtotal = useCart(selectSubtotal);

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
    return <EmptyState icon={ShoppingBag} title="Your cart is empty" cta="Browse the shelves" href="/books" onClose={onClose} />;
  }

  const toFree = Math.max(0, FREE_DELIVERY - subtotal);

  return (
    <>
      <ul className="flex-1 divide-y divide-border overflow-y-auto px-5">
        {items.map((i) => (
          <li key={lineKey(i)} className="flex gap-3 py-4">
            <Link href={`/books/${i.slug}`} onClick={onClose} className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-surface">
              <Image src={i.coverImage} alt={`${i.title} cover`} fill sizes="64px" className="object-cover" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/books/${i.slug}`} onClick={onClose} className="font-display text-sm leading-snug text-text hover:text-accent">
                  {i.title}
                </Link>
                <button onClick={() => remove(lineKey(i))} aria-label="Remove" className="shrink-0 text-muted hover:text-sale">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <span className="font-body text-xs text-muted">{i.author}</span>
              {i.format && <span className="font-data text-[11px] uppercase tracking-wide text-muted">{i.format}</span>}
              <div className="mt-auto flex items-center justify-between pt-2">
                <div className="flex items-center rounded-full border border-border">
                  <button onClick={() => setQty(lineKey(i), i.quantity - 1)} aria-label="Decrease" className="grid size-7 place-items-center text-text hover:text-accent"><Minus className="size-3.5" /></button>
                  <span className="w-6 text-center font-data text-sm">{i.quantity}</span>
                  <button
                    onClick={() => setQty(lineKey(i), i.quantity + 1)}
                    disabled={i.stock !== undefined && i.quantity >= i.stock}
                    aria-label="Increase"
                    title={i.stock !== undefined && i.quantity >= i.stock ? "No more in stock" : undefined}
                    className="grid size-7 place-items-center text-text hover:text-accent disabled:cursor-not-allowed disabled:text-muted disabled:opacity-40 disabled:hover:text-muted"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <span className="font-data text-sm font-semibold text-accent">{npr(i.price * i.quantity)}</span>
              </div>
              {i.stock !== undefined && i.quantity >= i.stock && (
                <span className="mt-1 font-data text-xs text-sale">
                  {i.stock === 0 ? "Out of stock" : `Only ${i.stock} in stock`}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-border p-5">
        <div className="flex items-baseline justify-between">
          <span className="font-body text-sm text-muted">Subtotal</span>
          <span className="font-data text-lg font-semibold text-text">{npr(subtotal)}</span>
        </div>
        <p className="mt-1 font-body text-xs text-muted">
          {toFree > 0 ? `Add ${npr(toFree)} more for free delivery.` : "You've unlocked free delivery."}
        </p>
        <div className="mt-4 flex gap-3">
          <Link href="/cart" onClick={onClose} className="flex-1 rounded-full border border-border px-4 py-2.5 text-center font-data text-sm text-text hover:border-accent">
            View cart
          </Link>
          <Link href="/checkout" onClick={onClose} className="flex-1 rounded-full bg-accent px-4 py-2.5 text-center font-data text-sm font-medium text-white hover:bg-accent-hover">
            Checkout
          </Link>
        </div>
      </div>
    </>
  );
}

function WishlistPanel({ onClose }: { onClose: () => void }) {
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const openLogin = useAuthModal((s) => s.openLogin);
  const add = useCart((s) => s.add);
  // Shared store: removing here also un-fills hearts across the page instantly.
  const books = useWishlist((s) => s.items);
  const hydrateWishlist = useWishlist((s) => s.hydrate);
  const removeItem = useWishlist((s) => s.remove);

  useEffect(() => {
    if (token) hydrateWishlist(true); // refresh on open
  }, [token, hydrateWishlist]);

  function moveToCart(b: BookCardData) {
    add({ bookId: b._id, slug: b.slug, title: b.title, author: b.author, coverImage: b.coverImage.secureUrl, price: b.price });
    removeItem(b._id);
  }

  if (hydrated && !token) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-accent/10"><Heart className="size-6 text-accent" /></span>
        <p className="mt-4 font-body text-muted">Sign in to keep a wishlist that follows you across devices.</p>
        <button onClick={() => { onClose(); openLogin("/wishlist"); }} className="mt-5 rounded-full bg-accent px-6 py-2.5 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">
          Sign in
        </button>
      </div>
    );
  }

  if (books === null) {
    return <div className="flex-1 px-5 py-6 font-body text-sm text-muted">Loading…</div>;
  }
  if (books.length === 0) {
    return <EmptyState icon={Heart} title="Nothing saved yet" cta="Browse the shelves" href="/books" onClose={onClose} />;
  }

  return (
    <>
      <ul className="flex-1 divide-y divide-border overflow-y-auto px-5">
        {books.map((b) => (
          <li key={b._id} className="flex gap-3 py-4">
            <Link href={`/books/${b.slug}`} onClick={onClose} className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-surface">
              <Image src={b.coverImage.secureUrl} alt={`${b.title} cover`} fill sizes="64px" className="object-cover" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/books/${b.slug}`} onClick={onClose} className="font-display text-sm leading-snug text-text hover:text-accent">{b.title}</Link>
                <button onClick={() => removeItem(b._id)} aria-label="Remove" className="shrink-0 text-muted hover:text-sale"><Trash2 className="size-4" /></button>
              </div>
              <span className="font-body text-xs text-muted">{b.author}</span>
              <div className="mt-auto flex items-center justify-between pt-2">
                <span className="font-data text-sm font-semibold text-accent">{npr(b.price)}</span>
                <button onClick={() => moveToCart(b)} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 font-data text-xs font-medium text-white hover:bg-accent-hover">
                  <ShoppingBag className="size-3.5" /> To cart
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-border p-5">
        <Link href="/wishlist" onClick={onClose} className="block rounded-full border border-border px-4 py-2.5 text-center font-data text-sm text-text hover:border-accent">
          View full wishlist
        </Link>
      </div>
    </>
  );
}

function EmptyState({ icon: Icon, title, cta, href, onClose }: { icon: typeof ShoppingBag; title: string; cta: string; href: string; onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-accent/10"><Icon className="size-6 text-accent" /></span>
      <h3 className="mt-4 font-display text-xl text-text">{title}</h3>
      <p className="mt-1 font-body text-sm text-muted">Nothing here yet — let&apos;s fix that.</p>
      <Link href={href} onClick={onClose} className="mt-5 rounded-full bg-accent px-6 py-2.5 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">
        {cta}
      </Link>
    </div>
  );
}
