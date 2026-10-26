"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, ShoppingBag, Heart, User, Truck } from "lucide-react";
import { useCart, selectCount } from "@/lib/stores/cart";
import { useAuth } from "@/lib/stores/auth";
import { useAuthModal } from "@/lib/stores/authModal";
import { useDrawer } from "@/lib/stores/uiDrawer";
import { useWishlist } from "@/lib/stores/wishlist";
import { useSuggestions } from "@/lib/hooks/useSuggestions";
import { SearchSuggestions } from "@/components/books/SearchSuggestions";
import type { Genre } from "@/lib/types";
import { AccountMenu } from "./AccountMenu";
import { CategoryNav } from "./CategoryNav";

/**
 * Two rows: brand, search and the shopper's actions (sticky, so search and the
 * bag are always one tap away), then the category bar, which scrolls away.
 * Articles, Our Story and Contact moved to the footer; Rewards lives in the
 * account menu.
 */
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

  const cartCount = cartHydrated ? count : 0;
  const wishCount = authHydrated && user ? wishlistCount : 0;

  return (
    <>
    <header className="sticky top-0 z-50 border-b border-border bg-bg/95 backdrop-blur">
      <div className="shell flex items-center gap-4 py-3 lg:gap-8 lg:py-4">
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
            width={542}
            height={168}
            priority
            className="h-10 w-auto sm:h-14"
          />
        </Link>

        {/* Search — fills the middle (keeps the typed query visible after search) */}
        <Suspense fallback={<div className="hidden flex-1 md:block" />}>
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
        <div className="ml-auto flex shrink-0 items-center gap-1 lg:gap-4">
          {/* Tracking is a top-level action: COD shoppers check on a parcel
              far more often than they change account settings. */}
          <Link href="/track" className={`${action} hidden lg:flex ${pathname === "/track" ? "text-accent" : ""}`}>
            <Truck className="size-5" aria-hidden />
            <span className={actionLabel}>Track order</span>
          </Link>

          {/* Wishlist — opens the drawer */}
          <button onClick={openWishlist} aria-label={`Wishlist, ${wishCount} saved`} className={action}>
            <span className="relative">
              <Heart className="size-5" aria-hidden />
              <Badge count={wishCount} />
            </span>
            <span className={actionLabel}>Wishlist</span>
          </button>

          {/* Bag — md+ only; BottomNav carries it on phones */}
          <button onClick={openCart} aria-label={`Bag, ${cartCount} items`} className={`${action} hidden md:flex`}>
            <span className="relative">
              <ShoppingBag className="size-5" aria-hidden />
              <Badge count={cartCount} />
            </span>
            <span className={actionLabel}>Bag</span>
          </button>

          {authHydrated && user ? (
            <AccountMenu />
          ) : (
            <button onClick={() => openLogin()} className={action}>
              <User className="size-5" aria-hidden />
              <span className="hidden font-body text-sm sm:inline lg:text-[13px]">Sign in</span>
            </button>
          )}
        </div>
      </div>
    </header>
    <CategoryNav genres={genres} />
    </>
  );
}

// Icon over label from lg up (like a shop counter's signage); icon only below.
const action =
  "relative flex min-h-11 items-center gap-2 rounded-md px-2.5 py-1 text-text transition-colors hover:text-accent lg:flex-col lg:gap-1";
const actionLabel = "hidden font-body text-[13px] lg:inline";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 font-data text-[10px] font-semibold leading-4 text-white">
      {count}
    </span>
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
    <div ref={ref} className="relative hidden min-w-0 flex-1 md:block">
      <form onSubmit={submit} className="flex items-stretch">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          type="search"
          name="q"
          placeholder="Search by title, author or ISBN"
          aria-label="Search books"
          className="h-12 min-w-0 flex-1 rounded-l-md border border-r-0 border-border bg-surface px-4 font-body text-[15px] text-text outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          aria-label="Search"
          className="grid w-14 shrink-0 place-items-center rounded-r-md bg-accent text-white transition-colors hover:bg-accent-hover"
        >
          <Search className="size-5" />
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
