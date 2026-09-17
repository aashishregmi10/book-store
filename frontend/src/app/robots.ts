import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// Only `/api` is disallowed, and the reason is narrow: it is the one private
// surface that cannot carry a `noindex`, because JSON has no <head>. Everywhere
// a meta tag is possible, the meta tag is the tool.
//
// That rule used to be applied to `/admin` and `/oneechan` alone, on exactly the
// right reasoning — a Disallow stops a crawler fetching the page, which means it
// never reads the noindex, leaving the URL eligible for a title-only listing
// that nothing can then remove. For `/oneechan` it is worse than useless:
// robots.txt is world-readable, so naming the obscured sign-in path publishes
// the very thing it exists to keep quiet.
//
// The same reasoning applies to /cart, /checkout, /account, /auth and /track,
// and they were listed here anyway, justified as sparing crawl budget on
// surfaces that are "deep, parameterised, and endless". They are not: they are
// six fixed URLs, and /account and /track are linked from the header of every
// page on the site. So Googlebot met them constantly, could not fetch them, and
// could not see that they already answer `noindex, follow` — which is what put
// "Blocked by robots.txt" in Search Console on 17 Sept 2026. The block was doing
// nothing except hiding the instruction that actually works.
//
// Verified live before removing the block, every route beneath those prefixes
// rather than a sample: /cart, /checkout, /account, /account/settings,
// /auth/forgot-password, /auth/reset-password and /track all serve
// `noindex, follow` from utilityMetadata() in lib/seo.ts, and /auth itself 404s.
//
// Crawl cost of the change: seven URLs against a catalogue of 5,800.
const disallow = ["/api"];

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
