"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, ShoppingCart, Heart, LogIn } from "lucide-react";
import { useCart, selectCount } from "@/lib/stores/cart";
import { useAuth } from "@/lib/stores/auth";
import { useAuthModal } from "@/lib/stores/authModal";
import { useDrawer } from "@/lib/stores/uiDrawer";
import { useWishlist } from "@/lib/stores/wishlist";
import { useSuggestions } from "@/lib/hooks/useSuggestions";
import { SearchSuggestions } from "@/components/books/SearchSuggestions";
import type { Genre } from "@/lib/types";
import { AccountMenu } from "./AccountMenu";
import { CategoryMenu } from "./CategoryMenu";

// "Category" is handled separately — it opens the genre mega-menu.
const NAV = [
  { to: "/blog", label: "Articles" },
  { to: "/about", label: "Our Story" },
  { to: "/contact", label: "Contact" },
  { to: "/account", label: "Rewards" },
];

export function Header({ genres = [] }: { genres?: Genre[] }) {
  const pathname = usePathname();
  const count = useCart(selectCount);
  const cartHydrated = useCart((s) => s.hydrated);
  const user = useAuth((s) => s.user);
  const authHydrated = useAuth((s) => s.hydrated);
  const openLogin = useAuthModal((s) => s.openLogin);
  const openCart = useDrawer((s) => s.openCart);
  const openWishlist = useDrawer((s) => s.openWishlist);
  const wishlistCount = useWishlist((s) => s.ids.size);

  // Load the wishlist once the session is known; drop it on sign-out.
  useEffect(() => {
    if (!authHydrated) return;
    if (user) useWishlist.getState().hydrate();
    else useWishlist.getState().clear();
  }, [authHydrated, user]);

  const isActive = (to: string) => pathname === to || (to !== "/" && pathname?.startsWith(to));
  const cartCount = cartHydrated ? count : 0;
  const wishCount = authHydrated && user ? wishlistCount : 0;

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-bg/85 backdrop-blur">
      <div className="shell flex items-center gap-6 py-3.5">
        {/* Brand lockup. Sized by height with width:auto so the aspect ratio is
            never distorted; the source PNG is trimmed to its ink so there's no
            dead margin to compensate for.

            The wordmark is a hairline script: its strokes are roughly a pixel
            wide, so at the 32/40px it used to render at the letterforms broke
            up and it read as a smudge rather than a name. It needs real height
            to stay legible — 40px on phones and 56px from sm up, which the row
            can afford now that the gutters are tighter. Still capped below the
            nav's line height so the header bar doesn't grow. */}
        <Link href="/" className="flex shrink-0 items-center" aria-label="Books Temple Nepal home">
          <Image
            src="/logo-wordmark.png"
            alt="Books Temple Nepal"
            width={900}
            height={278}
            priority
            className="h-10 w-auto sm:h-14"
          />
        </Link>

        {/* Primary nav — beside the logo */}
        <nav className="hidden items-center gap-5 lg:flex" aria-label="Primary">
          <CategoryMenu genres={genres} active={isActive("/books")} />
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

        {/* Search — fills the middle (keeps the typed query visible after search) */}
        <Suspense fallback={<div className="mx-4 hidden max-w-md flex-1 md:flex" />}>
          <HeaderSearch />
        </Suspense>

        {/* On mobile this row plus the shrink-0 logo don't both fit at once —
            Search and Cart are dropped below md because BottomNav (also
            md:hidden, so it's live on exactly the same screens) already gives
            one-tap access to both from a fixed bottom tab. Wishlist stays: it
            has no bottom-nav equivalent. Without this the row overflowed its
            container and — because nothing here clips overflow-x — that
            pushed the whole page wider than the viewport, showing as dead
            space down the right edge with the sign-in control stranded at it. */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* Wishlist — icon only with count badge (opens drawer) */}
          <button onClick={openWishlist} aria-label={`Wishlist, ${wishCount} saved`} className="relative p-2 text-text transition-colors hover:text-[#e3534c]">
            <Heart className="size-5" />
            {wishCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-white">
                {wishCount}
              </span>
            )}
          </button>

          {/* Cart icon + count badge (opens drawer) — md+ only, see above */}
          <button
            onClick={openCart}
            aria-label={`Cart, ${cartCount} items`}
            className="relative hidden p-2 text-text hover:text-accent md:inline-flex"
          >
            <ShoppingCart className="size-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-white">
                {cartCount}
              </span>
            )}
          </button>

          {/* Auth: account menu when signed in; a clear "Sign in" control otherwise */}
          {authHydrated && user ? (
            <AccountMenu />
          ) : (
            <button
              onClick={() => openLogin()}
              aria-label="Sign in"
              className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 font-data text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent md:px-3.5"
            >
              <LogIn className="size-4 text-accent" />
              <span className="hidden sm:inline">Sign in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// Desktop search with a live typeahead dropdown. Initialises from the URL `q`
// so the box reflects the active search; Enter searches the full catalogue.
function HeaderSearch() {
  const router = useRouter();
  const initialQ = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { results, loading } = useSuggestions(q);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    setOpen(false);
    router.push(term ? `/books?q=${encodeURIComponent(term)}` : "/books");
  }

  return (
    <div ref={ref} className="relative mx-4 hidden max-w-md flex-1 md:block">
      <form onSubmit={submit} className="flex items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
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

      {open && q.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-bg shadow-[0_12px_32px_-12px_rgba(29,118,188,0.35)]">
          <SearchSuggestions term={q} results={results} loading={loading} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
