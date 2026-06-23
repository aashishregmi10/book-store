"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Search, ShoppingCart, User } from "lucide-react";
import { useDrawer } from "@/lib/stores/uiDrawer";
import { useCart, selectCount } from "@/lib/stores/cart";
import { useAuth } from "@/lib/stores/auth";
import { useAuthModal } from "@/lib/stores/authModal";

/**
 * Sticky bottom navigation for one-handed mobile use (hidden on ≥ md, where the
 * header nav takes over). Primary actions: Home · Categories · Search · Cart · Account.
 */
export function BottomNav() {
  const pathname = usePathname() || "/";
  const openCart = useDrawer((s) => s.openCart);
  const count = useCart(selectCount);
  const cartHydrated = useCart((s) => s.hydrated);
  const user = useAuth((s) => s.user);
  const authHydrated = useAuth((s) => s.hydrated);
  const openLogin = useAuthModal((s) => s.openLogin);

  const cartCount = cartHydrated ? count : 0;
  const browseActive = ["/books", "/category", "/genre"].some((p) => pathname.startsWith(p));

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="grid grid-cols-5">
        <TabLink href="/" icon={Home} label="Home" active={pathname === "/"} />
        <TabLink href="/books" icon={LayoutGrid} label="Categories" active={browseActive && !pathname.includes("?")} />
        <TabLink href="/books" icon={Search} label="Search" active={false} />
        <TabButton icon={ShoppingCart} label="Cart" onClick={openCart} badge={cartCount} />
        {authHydrated && user ? (
          <TabLink href="/account" icon={User} label="Account" active={pathname.startsWith("/account")} />
        ) : (
          <TabButton icon={User} label="Account" onClick={() => openLogin()} />
        )}
      </div>
    </nav>
  );
}

const cls = (active?: boolean) =>
  `flex flex-col items-center gap-0.5 py-2 font-data text-[10px] uppercase tracking-wide transition-colors ${
    active ? "text-accent" : "text-muted hover:text-text"
  }`;

function TabLink({ href, icon: Icon, label, active }: { href: string; icon: typeof Home; label: string; active?: boolean }) {
  return (
    <Link href={href} className={cls(active)} aria-current={active ? "page" : undefined}>
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

function TabButton({ icon: Icon, label, onClick, badge }: { icon: typeof Home; label: string; onClick: () => void; badge?: number }) {
  return (
    <button onClick={onClick} className={cls(false)} aria-label={badge ? `${label}, ${badge} items` : label}>
      <span className="relative">
        <Icon className="size-5" />
        {badge ? (
          <span className="absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-semibold leading-4 text-white">
            {badge}
          </span>
        ) : null}
      </span>
      {label}
    </button>
  );
}
