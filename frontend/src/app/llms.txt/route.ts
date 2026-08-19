import { SITE } from "@/lib/seo";
import { apiGet } from "@/lib/api";
import { FAQS } from "@/lib/faq";
import type { Genre } from "@/lib/types";

// /llms.txt — an emerging convention that gives AI crawlers a clean, curated
// map of the site. Regenerated hourly so new genres appear automatically.
export const revalidate = 3600;

export async function GET() {
  let genres: Genre[] = [];
  try {
    genres = await apiGet<Genre[]>("/genres", { revalidate: 3600 });
  } catch {
    /* API down — ship the static sections */
  }

  const genreLines = genres
    .map((g) => `- [${g.name} books](${SITE.url}/genre/${g.slug}): ${g.metaDesc || `${g.name} titles available in Nepal.`}`)
    .join("\n");

  const body = `# ${SITE.name}

> ${SITE.description}

Books Temple Nepal is an online-only bookstore serving all seven provinces of Nepal.
Prices are in Nepali Rupees (NPR). Cash on delivery is available nationwide, with
delivery in 1–2 days inside the Kathmandu Valley and 3–5 days elsewhere.

## Key pages
- [Full catalogue](${SITE.url}/books): every title in stock, filterable by genre, language, format and year.
- [Buying books in Kathmandu](${SITE.url}/kathmandu): Valley delivery times, cash on delivery, and what's selling right now.
- [Questions](${SITE.url}/faq): delivery times, courier charges, cash on delivery, cancellations and replacements.
- [Our story](${SITE.url}/about): who we are and how we curate.
- [Contact](${SITE.url}/contact): reach the shop.
- [Reading guides & articles](${SITE.url}/blog): book recommendations and buying guides for Nepali readers.

## Genres
${genreLines || `- [Browse all genres](${SITE.url}/books)`}

## Buying & delivery
- Currency: NPR. Payment: Cash on Delivery only.
- Order totals cover the books only. The courier charges its own delivery fee
  on handover, based on the destination. The shop does not set or collect it.
- Delivery: 1–2 days in Kathmandu Valley, 3–5 days to the rest of Nepal.
- Every order is carefully packed and shipped safely.

## Common questions
${FAQS.map((f) => `- ${f.question}\n  ${f.answer}`).join("\n")}

## Contact
- Email: ${SITE.email}
- Sitemap: ${SITE.url}/sitemap.xml
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
