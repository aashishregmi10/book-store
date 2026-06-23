"use client";

import { usePathname } from "next/navigation";
import { TopBar } from "./TopBar";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { BottomNav } from "./BottomNav";
import { CartBar } from "./CartBar";
import { AuthModal } from "../auth/AuthModal";
import { SideDrawers } from "./SideDrawers";
import { JsonLd } from "../JsonLd";
import { organizationLd, websiteLd } from "@/lib/seo";

/**
 * Storefront pages get the Header/Footer + site-wide JSON-LD.
 * Admin pages (/admin/*) render bare so the admin shell owns the chrome.
 * Renders correctly during SSR because usePathname resolves on the server.
 */
export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return <>{children}</>;

  return (
    <>
      <JsonLd data={[organizationLd(), websiteLd()]} />
      <TopBar />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      {/* Spacer so the fixed bottom nav never covers the footer on mobile. */}
      <div className="h-14 md:hidden" aria-hidden />
      <BottomNav />
      <CartBar />
      <AuthModal />
      <SideDrawers />
    </>
  );
}
