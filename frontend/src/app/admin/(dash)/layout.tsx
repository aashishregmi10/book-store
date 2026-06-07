"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, BookText, Tags, Package, Users, Star, Heart, Store, LogOut } from "lucide-react";
import { useAuth } from "@/lib/stores/auth";
import { clientApi } from "@/lib/client-api";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/books", label: "Books", icon: BookText },
  { href: "/admin/genres", label: "Genres", icon: Tags },
  { href: "/admin/orders", label: "Orders", icon: Package },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/wishlists", label: "Wishlists", icon: Heart },
];

export default function AdminDashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const clear = useAuth((s) => s.clear);

  useEffect(() => {
    if (hydrated && (!token || !user?.isAdmin)) router.replace("/admin/login");
  }, [hydrated, token, user, router]);

  function logout() {
    clientApi.post("/auth/logout").catch(() => {});
    clear();
    router.replace("/admin/login");
  }

  // Block flash of admin content before the guard resolves.
  if (!hydrated || !user?.isAdmin) {
    return <div className="grid min-h-screen place-items-center bg-bg font-body text-muted">Checking access…</div>;
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <span className="font-display text-xl font-semibold text-text">PageTurn <span className="text-accent">Admin</span></span>
        </div>
        <nav className="flex-1 p-3">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`mb-1 flex items-center gap-3 px-3 py-2 font-data text-sm uppercase tracking-wide transition-colors ${active ? "bg-accent text-white" : "text-muted hover:bg-bg hover:text-text"}`}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <Link href="/" className="mb-1 flex items-center gap-3 px-3 py-2 font-data text-sm uppercase tracking-wide text-muted hover:text-accent">
            <Store className="size-4" /> View store
          </Link>
          <button onClick={logout} className="flex w-full items-center gap-3 px-3 py-2 font-data text-sm uppercase tracking-wide text-muted hover:text-sale">
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6 lg:p-8">{children}</main>
    </div>
  );
}
