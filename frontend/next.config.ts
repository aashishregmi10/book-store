import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    // Auto-serve AVIF/WebP and the right size per device.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "covers.openlibrary.org" }, // seed/dev book covers
      { protocol: "https", hostname: "res.cloudinary.com" }, // admin-uploaded covers
    ],
  },
};

export default nextConfig;
