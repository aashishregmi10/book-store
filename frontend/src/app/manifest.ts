import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: "Books Temple",
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    // Brand palette (/CLAUDE.md). Were leftover generic-blue values that clashed
    // with the forest-green mark and the warm off-white app background.
    background_color: "#FAF7F2",
    theme_color: "#2D5A3D",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Maskable: full-bleed tile so Android can crop to any shape without clipping.
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
