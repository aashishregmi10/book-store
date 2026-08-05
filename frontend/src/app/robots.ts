import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// Private/duplicate surfaces kept out of every crawler's index.
// `/oneechan` is the admin sign-in route; it was missing here, so the one URL
// whose whole value is being obscure was the one crawlers were free to index.
// `/auth` covers the password-reset screens, which carry a token in the query.
const disallow = ["/cart", "/checkout", "/account", "/admin", "/oneechan", "/auth", "/api"];

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
