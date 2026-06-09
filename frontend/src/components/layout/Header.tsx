"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ShoppingCart, Heart, User } from "lucide-react";
import { useCart, selectCount } from "@/lib/stores/cart";
import { useAuth } from "@/lib/stores/auth";
import { useAuthModal } from "@/lib/stores/authModal";
import { useDrawer } from "@/lib/stores/uiDrawer";
import { AccountMenu } from "./AccountMenu";

const NAV = [
  { to: "/books", label: "Catalogue" },
  { to: "/blog", label: "Articles" },
  { to: "/about", label: "Our Story" },
  { to: "/contact", label: "Contact" },
  { to: "/account", label: "Rewards" },
];

export function Header() {
  const pathname = usePathname();
  const count = useCart(selectCount);
  const cartHydrated = useCart((s) => s.hydrated);
  const user = useAuth((s) => s.user);
  const authHydrated = useAuth((s) => s.hydrated);
  const openLogin = useAuthModal((s) => s.openLogin);
  const openCart = useDrawer((s) => s.openCart);
  const openWishlist = useDrawer((s) => s.openWishlist);

  const isActive = (to: string) => pathname === to || (to !== "/" && pathname?.startsWith(to));
  const cartCount = cartHydrated ? count : 0;

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-6 py-3.5 sm:px-8 lg:px-16 xl:px-24">
        <Link href="/" className="flex shrink-0 items-baseline gap-2">
          <span className="font-display text-2xl font-semibold tracking-tight text-accent">PageTurn</span>
          <span className="text-xs uppercase tracking-[0.3em] text-muted">Nepal</span>
        </Link>

        {/* Primary nav — beside the logo */}
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {NAV.map((n) => (
            <Link
              key={n.to}
              href={n.to}
              className={`whitespace-nowrap font-data text-sm font-medium transition-colors hover:text-accent ${
                isActive(n.to) ? "text-accent" : "text-text/80"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Search — fills the middle */}
        <form action="/books" className="mx-4 hidden max-w-md flex-1 items-center md:flex">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              name="q"
              placeholder="Search by title, author, or ISBN"
              aria-label="Search books"
              className="w-full rounded-l-md border border-border bg-surface py-2 pl-9 pr-3 font-body text-sm text-text outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-r-md border border-l-0 border-border bg-surface px-3 py-2 font-data text-sm text-text transition-colors hover:border-accent hover:text-accent"
          >
            <Search className="size-4" /> Search
          </button>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* Mobile search icon */}
          <Link href="/books" aria-label="Search" className="p-2 text-text hover:text-accent md:hidden">
            <Search className="size-5" />
          </Link>

          {/* Wishlist — pill on desktop, icon on mobile (opens drawer) */}
          <button
            onClick={openWishlist}
            className="hidden items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 font-data text-sm font-medium text-text transition-colors hover:border-accent md:inline-flex"
          >
            <Heart className="size-4 text-accent" /> Wishlist
          </button>
          <button onClick={openWishlist} aria-label="Wishlist" className="p-2 text-text transition-colors hover:text-[#e3534c] md:hidden">
            <Heart className="size-5" />
          </button>

          {/* Cart icon + count badge (opens drawer) */}
          <button onClick={openCart} aria-label={`Cart, ${cartCount} items`} className="relative p-2 text-text hover:text-accent">
            <ShoppingCart className="size-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-white">
                {cartCount}
              </span>
            )}
          </button>

          {/* Auth: name + person icon when signed in, person icon only otherwise */}
          {authHydrated && user ? (
            <AccountMenu />
          ) : (
            <button
              onClick={() => openLogin()}
              aria-label="Sign in"
              className="grid size-9 place-items-center rounded-full text-text transition-colors hover:bg-bg hover:text-accent"
            >
              <User className="size-5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
