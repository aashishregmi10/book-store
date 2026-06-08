import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: "PageTurn",
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    background_color: "#e8f1fb",
    theme_color: "#1c5fa6",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
