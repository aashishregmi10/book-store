import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: "Books Temple",
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    // Must track the live palette in globals.css (--color-bg / --color-accent).
    // These were still the warm-neutral + forest-green pair from an earlier
    // brand, so the PWA splash screen and the Android title bar rendered in
    // colours that appear nowhere on the site.
    background_color: "#e8f1fb",
    theme_color: "#1c5fa6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Maskable: full-bleed tile so Android can crop to any shape without clipping.
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
