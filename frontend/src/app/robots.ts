import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// Private/duplicate surfaces kept out of every crawler's index.
// `/auth` covers the password-reset screens, which carry a token in the query.
// `/track` takes an order number + phone, so it must not be indexed either.
//
// `/admin` and `/oneechan` are deliberately ABSENT. Both now carry a real
// `noindex` (app/admin/layout.tsx, app/oneechan/layout.tsx), and a Disallow here
// would stop crawlers fetching them — which means never reading that noindex,
// leaving them eligible for URL-only listings that nothing can then remove.
// For `/oneechan` it is worse than useless: robots.txt is world-readable, so
// naming the obscured sign-in path here publishes the very thing it exists to
// keep quiet. Everything below is already noindexed too; it stays listed only
// to spare the crawl budget, since these are deep, parameterised, and endless.
const disallow = ["/cart", "/checkout", "/account", "/auth", "/track", "/api"];

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
