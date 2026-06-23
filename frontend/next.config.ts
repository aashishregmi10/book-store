import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    // Skip the optimizer in dev (it's slow and intermittently fails on large
    // covers); production keeps full AVIF/WebP optimization + edge caching.
    unoptimized: process.env.NODE_ENV === "development",
    // Auto-serve AVIF/WebP and the right size per device.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "covers.openlibrary.org" }, // seed/dev book covers
      { protocol: "https", hostname: "res.cloudinary.com" }, // admin-uploaded covers
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google profile avatars
    ],
  },
  async headers() {
    return [
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
