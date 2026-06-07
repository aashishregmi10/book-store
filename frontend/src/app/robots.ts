import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// Private/duplicate surfaces kept out of every crawler's index.
const disallow = ["/cart", "/checkout", "/account", "/admin", "/api"];

// AI assistants & answer engines we explicitly welcome (GEO). Being listed by
// name signals intent and avoids accidental blocks.
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-Web",
  "Anthropic-AI",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow })),
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
