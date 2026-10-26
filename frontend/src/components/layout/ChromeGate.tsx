"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { AnnouncementBar } from "./AnnouncementBar";
import { Footer } from "./Footer";
import { BottomNav } from "./BottomNav";
import { CartBar } from "./CartBar";
import { SearchOverlay } from "./SearchOverlay";
import { AuthModal } from "../auth/AuthModal";
import { SideDrawers } from "./SideDrawers";
import { JsonLd } from "../JsonLd";
import { organizationLd, websiteLd } from "@/lib/seo";
import { useCatalogueScroll } from "@/lib/stores/catalogueScroll";
import { ADMIN_LOGIN_PREFIX } from "@/lib/admin";
import type { Genre } from "@/lib/types";

/**
 * Storefront pages get the Header/Footer + site-wide JSON-LD.
 * Admin pages render bare so the admin shell owns the chrome — both the
 * dashboard (/admin/*) and the deliberately-obscured login route (/oneechan/*).
 * Renders correctly during SSR because usePathname resolves on the server.
 */
export function ChromeGate({ children, genres = [] }: { children: React.ReactNode; genres?: Genre[] }) {
  const pathname = usePathname();
  // On mobile, hold the footer off-screen while a catalogue grid still has
  // more pages to infinite-scroll — otherwise it flashes in below the shelf
  // between load-more batches. Desktop is unaffected (footer always shows).
  const loadingMore = useCatalogueScroll((s) => s.loadingMore);
  if (pathname?.startsWith("/admin") || pathname?.startsWith(ADMIN_LOGIN_PREFIX)) return <>{children}</>;

  return (
    <>
      <JsonLd data={[organizationLd(), websiteLd()]} />
      <AnnouncementBar />
      <Header genres={genres} />
      <main className="flex-1">{children}</main>
      <div className={loadingMore ? "hidden md:block" : ""}>
        <Footer />
      </div>
      {/* Spacer so the fixed bottom nav never covers the footer on mobile. */}
      <div className="h-14 md:hidden" aria-hidden />
      <BottomNav />
      <CartBar />
      <SearchOverlay />
      <AuthModal />
      <SideDrawers />
    </>
  );
}
