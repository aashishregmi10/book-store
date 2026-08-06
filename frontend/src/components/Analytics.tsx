"use client";

import { Suspense, useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * The storefront's GA4 measurement ID.
 *
 * Hardcoded rather than left to configuration: it is not a secret (it ships in
 * the HTML of every page and is readable by anyone with view-source), and
 * keeping it in an env var meant a forgotten dashboard field silently produced
 * no analytics at all, with "Data collection isn't active" as the only clue.
 *
 * Set NEXT_PUBLIC_GA_MEASUREMENT_ID to override it, or to an EMPTY STRING to
 * switch analytics off for an environment.
 */
const DEFAULT_GA_ID = "G-N2HK5DM3CH";

const configured = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
// `undefined` means "not configured" → use the default. An explicit empty
// string means "deliberately disabled" and must not fall back.
const GA_ID = (configured === undefined ? DEFAULT_GA_ID : configured).trim();

// Never report from `next dev`. Without this the default ID above would send
// every local page view into the live property and dirty the real numbers.
// Preview deploys build with NODE_ENV=production and so DO report — set
// NEXT_PUBLIC_GA_MEASUREMENT_ID to an empty string on Vercel's Preview
// environment if you want them excluded too.
const enabled = Boolean(GA_ID) && process.env.NODE_ENV === "production";

/** True when GA4 will actually report from this build. */
export const isAnalyticsConfigured = enabled;

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
  if (!enabled) return null;
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
