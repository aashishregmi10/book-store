"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Package, Heart, Settings, Gift, LogOut } from "lucide-react";
import { useAuth } from "@/lib/stores/auth";
import { clientApi } from "@/lib/client-api";

const ITEMS = [
  { href: "/account", label: "My account", icon: User },
  { href: "/account#orders", label: "My orders", icon: Package },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account#rewards", label: "Rewards", icon: Gift },
  { href: "/account/settings", label: "Account settings", icon: Settings },
];

export function AccountMenu() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const clear = useAuth((s) => s.clear);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  if (!user) return null;

  function logout() {
    clientApi.post("/auth/logout").catch(() => {});
    clear();
    setOpen(false);
    router.push("/");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full px-2.5 py-1.5 text-text transition-colors hover:bg-bg hover:text-accent"
      >
        <User className="size-5 shrink-0" />
        <span className="hidden max-w-[8rem] truncate font-data text-sm font-medium sm:inline">
          {user.fullName.split(" ")[0]}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-[0_12px_32px_-12px_rgba(28,93,156,0.35)]">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate font-body text-sm font-medium text-text">{user.fullName}</p>
            <p className="truncate font-body text-xs text-muted">{user.email}</p>
          </div>
          <nav className="py-1" role="menu">
            {ITEMS.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 font-body text-sm text-text transition-colors hover:bg-bg hover:text-accent"
              >
                <it.icon className="size-4 text-muted" /> {it.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-border py-1">
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 px-4 py-2.5 font-body text-sm text-text transition-colors hover:bg-bg hover:text-sale"
            >
              <LogOut className="size-4 text-muted" /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
