import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    // Skip the optimizer in dev (it's slow and intermittently fails on large
    // covers); production keeps full AVIF/WebP optimization + edge caching.
    unoptimized: process.env.NODE_ENV === "development",
    // Resize at Cloudinary instead of through Vercel's metered optimizer, which
    // 402s every request once the monthly allowance is spent — see the loader.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    // Auto-serve AVIF/WebP and the right size per device.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "covers.openlibrary.org" }, // seed/dev book covers
      { protocol: "https", hostname: "res.cloudinary.com" }, // admin-uploaded covers
      // Supplier product photos. Every cover was originally copied from here,
      // and when the Cloudinary account was deactivated these were the only
      // surviving copies — see backend/scripts/restore-covers-from-scrape.js.
      // Temporary: covers move to R2 in migrate-covers-to-r2.js, after which
      // this entry can go.
      { protocol: "https", hostname: "img.drz.lazcdn.com" },
      // Cloudflare R2 — where covers actually live now. Two pre-built sizes per
      // book; see src/lib/image-loader.ts for which one gets requested.
      { protocol: "https", hostname: "pub-42418bf059814fca83907788f2d769f1.r2.dev" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google profile avatars
    ],
  },
  // Genre taxonomy restructure (backend/GENRE-TAXONOMY-PROPOSAL.md). Permanent
  // so search engines transfer the old URLs' equity to the new slugs rather
  // than treating them as new pages. Every retired slug must land somewhere —
  // a 404 here throws away whatever ranking the old genre page had.
  async redirects() {
    const moved: Record<string, string> = {
      biography: "biography-memoir",
      business: "business-economics",
      politics: "politics-society",
      spirituality: "spirituality-religion",
      horror: "mystery-thriller",
      // Folded: too few titles to sustain their own page.
      strategy: "business-economics",
      games: "business-economics",
      law: "politics-society",
      educational: "science-technology",
    };

    return [
      ...Object.entries(moved).map(([from, to]) => ({
        source: `/genre/${from}`,
        destination: `/genre/${to}`,
        permanent: true,
      })),
      // `general` was never a genre — it was the import fallback holding 90% of
      // the catalogue. The honest destination is the full catalogue.
      { source: "/genre/general", destination: "/books", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        /*
          Baseline security headers on every response.

          Deliberately NOT including a Content-Security-Policy. Next's App
          Router injects inline scripts for streaming and hydration, so any CSP
          shipped without nonce middleware has to allow 'unsafe-inline' on
          script-src — which removes the one thing a CSP is mainly there to
          stop. That policy would satisfy a scanner and almost nothing else.
          Doing it properly means generating a nonce per request in middleware
          and threading it through; worth doing as its own change, not smuggled
          in behind a headers tweak.

          The four below have no such caveat: they are unambiguous wins and
          cannot break a page that does not frame itself or sniff its own MIME
          types. Referrer-Policy matches what browsers already default to, but
          stating it explicitly is what audits look for and removes the doubt.
        */
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The shop asks for none of these; denying them means an injected
          // script cannot ask on our behalf either.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
      {
        /*
          Generated OG cards are IMAGES, but Next serves them from a page-shaped
          path (/books/<slug>/opengraph-image?<hash>). Google crawled them as page
          candidates and parked every one under "Crawled - currently not indexed" —
          one wasted URL per book, which at this catalogue size costs more crawl
          budget than the catalogue itself.

          X-Robots-Tag rather than a robots.txt Disallow: the card must stay
          FETCHABLE (that is the point of og:image), it just must not be indexed.
          Social crawlers ignore this header, so link previews are unaffected, and
          the real covers are separate Cloudinary URLs that stay in Google Images.
        */
        source: "/:path*/opengraph-image",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        // Same, for the site-level card at the root.
        source: "/opengraph-image",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        // Always fetch the latest service worker; allow it to control the root scope.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
