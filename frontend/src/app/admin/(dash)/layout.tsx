"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, BookText, Tags, Newspaper, Package, Users, Star, Heart, MessageCircleQuestion, Ticket, Store, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/stores/auth";
import { clientApi } from "@/lib/client-api";
import { ADMIN_LOGIN_PATH } from "@/lib/admin";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/books", label: "Books", icon: BookText },
  { href: "/admin/genres", label: "Genres", icon: Tags },
  { href: "/admin/articles", label: "Articles", icon: Newspaper },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket },
  { href: "/admin/orders", label: "Orders", icon: Package },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/questions", label: "Q&A", icon: MessageCircleQuestion },
  { href: "/admin/wishlists", label: "Wishlists", icon: Heart },
];

export default function AdminDashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const clear = useAuth((s) => s.clear);

  // The sidebar is a slide-over below lg. It used to be a fixed 224px column at
  // every width, which on a 375px phone left 151px for the content — every
  // table and form in here was effectively unusable on a handset, and orders
  // are exactly the thing you want to check away from a desk.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (hydrated && (!token || !user?.isAdmin)) router.replace(ADMIN_LOGIN_PATH);
  }, [hydrated, token, user, router]);

  // Escape closes it, matching the storefront's drawers.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  function logout() {
    clientApi.post("/auth/logout").catch(() => {});
    clear();
    router.replace(ADMIN_LOGIN_PATH);
  }

  // Block flash of admin content before the guard resolves. (The API enforces
  // requireAdmin on every route regardless — this only stops the shell showing.)
  if (!hydrated || !user?.isAdmin) {
    return <div className="grid min-h-screen place-items-center bg-bg font-body text-muted">Checking access…</div>;
  }

  const sidebar = (
    <>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <span className="font-display text-xl font-semibold text-text">
          Books Temple <span className="text-accent">Admin</span>
        </span>
        <button
          onClick={() => setNavOpen(false)}
          aria-label="Close menu"
          className="-mr-2 grid size-9 place-items-center text-muted hover:text-text lg:hidden"
        >
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {NAV.map((n) => {
          const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              // Dismiss on navigate, or the drawer stays over the page it just
              // opened. Handled here rather than in an effect on `pathname` —
              // the click is the actual event, and the effect version trips
              // the compiler's set-state-in-effect rule for good reason.
              onClick={() => setNavOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`mb-1 flex items-center gap-3 px-3 py-2.5 font-data text-sm uppercase tracking-wide transition-colors ${active ? "bg-accent text-white" : "text-muted hover:bg-bg hover:text-text"}`}
            >
              <n.icon className="size-4 shrink-0" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <Link href="/" className="mb-1 flex items-center gap-3 px-3 py-2.5 font-data text-sm uppercase tracking-wide text-muted hover:text-accent">
          <Store className="size-4 shrink-0" /> View store
        </Link>
        <button onClick={logout} className="flex w-full items-center gap-3 px-3 py-2.5 font-data text-sm uppercase tracking-wide text-muted hover:text-sale">
          <LogOut className="size-4 shrink-0" /> Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Desktop: a permanent column. */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface lg:flex">{sidebar}</aside>

      {/* Mobile/tablet: the same nav as an overlay drawer. */}
      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-text/40 backdrop-blur-sm"
            onClick={() => setNavOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="animate-drawer-in-left absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-border bg-surface"
          >
            {sidebar}
          </aside>
        </div>
      )}

      {/* `min-w-0` matters: without it a wide table inside stretches this flex
          child past the viewport instead of scrolling within its own wrapper. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
            className="grid size-11 place-items-center text-text hover:text-accent"
          >
            <Menu className="size-5" />
          </button>
          <span className="font-display text-lg font-semibold text-text">
            Books Temple <span className="text-accent">Admin</span>
          </span>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
