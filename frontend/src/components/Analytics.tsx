"use client";

import { Suspense, useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/** True when GA4 is configured. Nothing renders without a measurement ID, so
 *  local dev and preview deploys stay out of the property by default. */
export const isAnalyticsConfigured = Boolean(GA_ID);

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * GA4 via gtag.js.
 *
 * Two things the copy-paste snippet from the GA console gets wrong in an App
 * Router app, both handled here:
 *
 * 1. `gtag('config', ID)` sends a page_view immediately and then never again.
 *    Every client-side navigation after the first — which is most of them, since
 *    the storefront is a SPA once hydrated — would go unrecorded. So we disable
 *    the automatic hit (`send_page_view: false`) and fire page_view ourselves on
 *    each route change, including the first.
 * 2. Dropping a raw <script> in <head> blocks hydration. next/script with
 *    afterInteractive loads it off the critical path instead.
 */
export function Analytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { send_page_view: false });
        `}
      </Script>
      {/* useSearchParams needs a Suspense boundary or it opts the whole tree
          out of static rendering. */}
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
    </>
  );
}

/** Fires one page_view per route change. Renders nothing. */
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // gtag.js may not have finished loading on the first paint. Queueing onto
  // dataLayer directly is safe — gtag replays the queue once it initialises.
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const qs = searchParams?.toString();
    const path = qs ? `${pathname}?${qs}` : pathname;
    // Guard against double-firing: React 19 Strict Mode invokes effects twice
    // in dev, which would otherwise log two page_views per navigation.
    if (lastPath.current === path) return;
    lastPath.current = path;

    window.dataLayer = window.dataLayer || [];
    window.gtag?.("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}
