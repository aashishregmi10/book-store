"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useAuthModal } from "@/lib/stores/authModal";
import { useAuth } from "@/lib/stores/auth";
import { clientApi } from "@/lib/client-api";

/**
 * Slim utility strip above the main header: a delivery promise on the left,
 * account + language affordances on the right. Dark navy so it reads as
 * "chrome" and lets the pale-blue header below breathe.
 */
export function TopBar() {
  const openLogin = useAuthModal((s) => s.openLogin);
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const [hasOrders, setHasOrders] = useState(false);

  // "Track order" only makes sense once the user has actually placed an order.
  // (No token → the `user && hasOrders` render guard already hides it.)
  useEffect(() => {
    if (!token) return;
    let active = true;
    clientApi
      .get<unknown[]>("/orders/my-orders")
      .then((orders) => active && setHasOrders(Array.isArray(orders) && orders.length > 0))
      .catch(() => active && setHasOrders(false));
    return () => {
      active = false;
    };
  }, [token]);

  // Build the right-hand cluster, then join with "·" so separators only ever
  // appear between two visible items (no dangling dots).
  const actions: React.ReactNode[] = [];

  // Sign in — only for signed-out visitors. Wait for hydration to avoid a flash.
  if (hydrated && !user) {
    actions.push(
      <button key="signin" onClick={() => openLogin()} className="whitespace-nowrap transition-colors hover:text-bg">
        Sign in
      </button>
    );
  }

  // Track order — only when signed in AND they have orders to track.
  if (user && hasOrders) {
    actions.push(
      <Link key="track" href="/account" className="whitespace-nowrap transition-colors hover:text-bg">
        Track order
      </Link>
    );
  }

  // Language toggle — placeholder until i18n lands. Always shown.
  actions.push(
    <button key="lang" type="button" className="whitespace-nowrap transition-colors hover:text-bg">
      नेपाली
    </button>
  );

  return (
    <div className="bg-text text-bg">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-2 font-data text-xs sm:px-8 lg:px-16 xl:px-24">
        <p className="truncate text-bg/85">
          Free delivery on orders over NPR 1,500 <span className="mx-1 text-bg/40">·</span> Same-day in Kathmandu Valley
        </p>

        <div className="flex shrink-0 items-center gap-3 text-bg/70">
          {actions.map((node, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="text-bg/30">·</span>}
              {node}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
