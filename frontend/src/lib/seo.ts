import type { BookDetail, BookCardData, Genre, ReviewData } from "./types";

export const SITE = {
  name: "PageTurn Nepal",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://pageturn.com.np",
  description: "Nepal's online bookstore — books worth reading, delivered across all seven provinces. NPR prices, cash on delivery.",
  locale: "en_NP",
  twitter: "@pageturnnp",
  email: "hello@pageturn.com.np",
  // Social/profile URLs strengthen the entity in Google's & AI engines' knowledge graphs.
  sameAs: [
    "https://www.facebook.com/pageturnnepal",
    "https://www.instagram.com/pageturnnepal",
    "https://twitter.com/pageturnnp",
  ],
};

const abs = (path: string) => `${SITE.url}${path}`;

// ── Organization / OnlineStore (homepage) — Nepal trust signals ───────
export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${SITE.url}/#organization`,
    name: SITE.name,
    url: SITE.url,
    logo: abs("/logo.png"),
    image: abs("/logo.png"),
    description: SITE.description,
    email: SITE.email,
    foundingDate: "2026",
    sameAs: SITE.sameAs,
    areaServed: { "@type": "Country", name: "Nepal" },
    currenciesAccepted: "NPR",
    paymentAccepted: "Cash on Delivery",
    knowsAbout: ["Nepali publishing market", "Educational textbooks Nepal", "Book distribution logistics"],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      email: SITE.email,
      areaServed: "NP",
      availableLanguage: ["en", "ne"],
    },
    address: {
      "@type": "PostalAddress",
      addressCountry: "NP",
      addressLocality: "Kathmandu",
    },
  };
}

// ── WebSite + SearchAction (homepage) ───────────────────
export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    publisher: { "@id": `${SITE.url}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      // Real search lives at /books?q= (there is no /search route).
      target: { "@type": "EntryPoint", urlTemplate: `${SITE.url}/books?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

// Delivery + returns mirror backend/src/services/pricing.js (free ≥ NPR 1500, else 120).
const shippingDetails = (price: number) => ({
  "@type": "OfferShippingDetails",
  shippingRate: { "@type": "MonetaryAmount", value: price >= 1500 ? "0" : "120", currency: "NPR" },
  shippingDestination: { "@type": "DefinedRegion", addressCountry: "NP" },
  deliveryTime: {
    "@type": "ShippingDeliveryTime",
    handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
    transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 5, unitCode: "DAY" },
  },
});

const returnPolicy = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "NP",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: 7,
  returnMethod: "https://schema.org/ReturnByMail",
  returnFees: "https://schema.org/FreeReturn",
};

// One schema.org Review from a stored review.
function toReview(r: ReviewData) {
  return {
    "@type": "Review",
    reviewRating: { "@type": "Rating", ratingValue: String(r.rating), bestRating: "5", worstRating: "1" },
    author: { "@type": "Person", name: r.user?.fullName || "Verified reader" },
    datePublished: r.createdAt,
    ...(r.title ? { name: r.title } : {}),
    reviewBody: r.body,
  };
}

// ── Product + Book + Offer + AggregateRating + Review (book detail) ────────
// Emitting ["Product","Book"] makes the page eligible for Google product/merchant
// rich results AND book results, while staying a single node.
export function bookLd(book: BookDetail, reviews: ReviewData[] = []) {
  const inStock = book.stockStatus !== "out-of-stock" && book.stockStatus !== "discontinued";
  const validUntil = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
  return {
    "@context": "https://schema.org",
    "@type": ["Product", "Book"],
    name: book.title,
    author: { "@type": "Person", name: book.author },
    image: book.coverImage.secureUrl,
    sku: book._id,
    ...(book.isbn ? { isbn: book.isbn, gtin13: book.isbn } : {}),
    ...(book.specifications?.pages ? { numberOfPages: book.specifications.pages } : {}),
    inLanguage: book.specifications?.language || "en",
    bookFormat:
      book.specifications?.format === "Hardcover"
        ? "https://schema.org/Hardcover"
        : book.specifications?.format === "Audiobook"
          ? "https://schema.org/AudiobookFormat"
          : book.specifications?.format === "E-book"
            ? "https://schema.org/EBook"
            : "https://schema.org/Paperback",
    brand: { "@type": "Brand", name: book.specifications?.publisher || SITE.name },
    ...(book.specifications?.publisher ? { publisher: { "@type": "Organization", name: book.specifications.publisher } } : {}),
    description: book.description?.slice(0, 500),
    ...(book.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: book.avgRating.toFixed(1),
            reviewCount: book.reviewCount,
            bestRating: "5",
            worstRating: "1",
          },
        }
      : {}),
    ...(reviews.length ? { review: reviews.slice(0, 10).map(toReview) } : {}),
    offers: {
      "@type": "Offer",
      url: abs(`/books/${book.slug}`),
      priceCurrency: "NPR",
      price: String(book.price),
      priceValidUntil: validUntil,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: book.condition === "used" ? "https://schema.org/UsedCondition" : "https://schema.org/NewCondition",
      seller: { "@id": `${SITE.url}/#organization` },
      shippingDetails: shippingDetails(book.price),
      hasMerchantReturnPolicy: returnPolicy,
    },
  };
}

// ── BreadcrumbList ──────────────────────────────────────
export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: abs(it.path),
    })),
  };
}

// ── ItemList (genre silo page) ──────────────────────────
export function itemListLd(genre: Genre, books: BookCardData[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Best ${genre.name} Books in Nepal`,
    numberOfItems: books.length,
    itemListElement: books.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: abs(`/books/${b.slug}`),
      name: b.title,
    })),
  };
}

// ── FAQPage (genre / faq pages) ─────────────────────────
export function faqLd(qas: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qas.map((qa) => ({
      "@type": "Question",
      name: qa.q,
      acceptedAnswer: { "@type": "Answer", text: qa.a },
    })),
  };
}

// ── QAPage (customer Q&A on a book) — strong for answer engines ──
export function qaPageLd(
  book: { title: string; slug: string },
  qas: { question: string; answer: string; answeredAt?: string; createdAt?: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "QAPage",
    mainEntity: qas.map((qa) => ({
      "@type": "Question",
      name: qa.question,
      url: abs(`/books/${book.slug}`),
      answerCount: 1,
      acceptedAnswer: {
        "@type": "Answer",
        text: qa.answer,
        ...(qa.answeredAt ? { dateCreated: qa.answeredAt } : {}),
        author: { "@type": "Organization", name: SITE.name },
      },
      ...(qa.createdAt ? { dateCreated: qa.createdAt } : {}),
    })),
  };
}

// ── Article / BlogPosting (content hub) ─────────────────
export function articleLd(article: {
  title: string;
  slug: string;
  excerpt?: string;
  coverImage?: string;
  author?: string;
  publishedAt?: string;
  updatedAt?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.excerpt,
    ...(article.coverImage ? { image: article.coverImage } : {}),
    author: { "@type": "Person", name: article.author || "PageTurn Editors" },
    publisher: { "@id": `${SITE.url}/#organization` },
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
    mainEntityOfPage: abs(`/blog/${article.slug}`),
  };
}

// Marks a CSS selector as voice-assistant readable (AEO).
export function speakable(...cssSelectors: string[]) {
  return { "@type": "SpeakableSpecification", cssSelector: cssSelectors };
}
