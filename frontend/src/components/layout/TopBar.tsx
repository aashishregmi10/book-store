"use client";

import Link from "next/link";
import { useAuthModal } from "@/lib/stores/authModal";

/**
 * Slim utility strip above the main header: a delivery promise on the left,
 * account + language affordances on the right. Dark navy so it reads as
 * "chrome" and lets the pale-blue header below breathe.
 */
export function TopBar() {
  const openLogin = useAuthModal((s) => s.openLogin);
  return (
    <div className="bg-text text-bg">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-2 font-data text-xs sm:px-8 lg:px-16 xl:px-24">
        <p className="truncate text-bg/85">
          Free delivery on orders over NPR 1,500 <span className="mx-1 text-bg/40">·</span> Same-day in Kathmandu Valley
        </p>

        <div className="flex shrink-0 items-center gap-3 text-bg/70">
          <button onClick={() => openLogin()} className="whitespace-nowrap transition-colors hover:text-bg">
            Sign in
          </button>
          <span className="text-bg/30">·</span>
          <Link href="/account" className="whitespace-nowrap transition-colors hover:text-bg">
            Track order
          </Link>
          <span className="text-bg/30">·</span>
          {/* Language toggle — placeholder until i18n lands. */}
          <button type="button" className="whitespace-nowrap transition-colors hover:text-bg">
            नेपाली
          </button>
        </div>
      </div>
    </div>
  );
}
