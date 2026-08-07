import type { Metadata } from "next";
import type { BookDetail, BookCardData, Genre, ReviewData } from "./types";

export const SITE = {
  name: "Books Temple Nepal",
  // The live domain. Everything canonical is built from this — canonical tags,
  // og:url, the sitemap, and every @id in the JSON-LD below — so a wrong value
  // here tells Google the real home of this content is somewhere else.
  //
  // NEXT_PUBLIC_SITE_URL still overrides it (needed for local dev and preview
  // deploys), but the fallback is now the actual domain rather than a guess:
  // it used to read bookstemplenepal.com, which is not even the domain the
  // shop runs on. No trailing slash — `abs()` joins paths straight onto it.
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://www.bookstemple.com",
  description: "Nepal's online bookstore. Books worth reading, delivered across all seven provinces. NPR prices, cash on delivery.",
  locale: "en_NP",
  email: "bookstemple01@gmail.com",
  // Social/profile URLs strengthen the entity in Google's & AI engines' knowledge
  // graphs. These are the real, live accounts — an unclaimed handle here is worse
  // than no entry, since it points the graph at someone else's page.
  social: {
    facebook: "https://www.facebook.com/profile.php?id=61591817207908",
    instagram: "https://www.instagram.com/bookstemplenepal/",
    tiktok: "https://www.tiktok.com/@bookstemple",
  },
};

/** Profile URLs for schema.org `sameAs`. */
export const SAME_AS = Object.values(SITE.social);

const abs = (path: string) => `${SITE.url}${path}`;

/**
 * Metadata for a private/functional page: login, register, cart, checkout,
 * account, wishlist, order tracking, password reset.
 *
 * None of these export their own `metadata` today — every one is a "use
 * client" page, which can't export it, so each silently inherited the ROOT
 * layout's defaults: title "Buy Books Online in Nepal", description of the
 * whole shop, `alternates.canonical: "/"`, and `robots: index, follow`. The
 * result: a dozen different URLs all claiming via canonical to actually BE
 * the homepage, while simultaneously telling Google to index them anyway —
 * and /login, /register aren't even in robots.txt's disallow list, so Google
 * really does crawl them and sees the contradiction.
 *
 * Apply this from a sibling layout.tsx (a Server Component can export
 * metadata for a client page.tsx beneath it — that's the point of this
 * helper). `noindex, follow` because none of these pages are something a
 * search result should ever land someone on; `follow` so PageRank still
 * flows through any links they contain. The canonical is self-referencing —
 * standard practice even for a noindexed page, and it stops any other page
 * (or an accidental repeat of this bug) from claiming to be its canonical
 * home instead.
 */
export function utilityMetadata(path: string, title: string): Metadata {
  return {
    // `title.absolute`, not a plain string: the root layout's "%s | Books
    // Temple Nepal" template only threads through the DIRECT parent segment
    // (see Next's generate-metadata docs — "augment title.template from the
    // closest parent segment"). account/settings sits two layouts deep under
    // one that sets a plain string title with no template of its own, so a
    // plain string here rendered as a bare "Account settings" with no
    // suffix while every sibling page got it — inconsistent purely because
    // of nesting depth. Writing it out explicitly is immune to that.
    title: { absolute: `${title} | ${SITE.name}` },
    alternates: { canonical: path },
    robots: { index: false, follow: true },
  };
}

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
    sameAs: SAME_AS,
    areaServed: { "@type": "Country", name: "Nepal" },
    // `currenciesAccepted` and `paymentAccepted` used to sit here and were
    // flagged by the Schema Markup Validator: both are LocalBusiness
    // properties, and this is an OnlineStore (an Organization subtype), so
    // they were simply unrecognised and carried no signal. Currency and
    // payment belong on the Offer instead, where every book page already
    // declares priceCurrency NPR and acceptedPaymentMethod COD.
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

/**
 * Delivery timing only — deliberately no `shippingRate`.
 *
 * The courier bills the customer directly at its own rates (see
 * backend/src/services/pricing.js), so the shop has no shipping price to
 * declare. Quoting "0" would assert free delivery, which is false; quoting a
 * flat figure would assert a price we don't control. Omitting the rate while
 * keeping handling/transit times states exactly what we do know. Google reads
 * a missing rate as "not specified" rather than free.
 */
const shippingDetails = () => ({
  "@type": "OfferShippingDetails",
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
  // No general returns (low-margin COD store); damaged/wrong items are replaced
  // on contact, which isn't a "return" in schema terms.
  returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
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
      itemCondition: "https://schema.org/NewCondition", // the store only ever carries new copies
      // Cash on delivery, declared where schema.org actually accepts a payment
      // method (Offer, not Organization). The GoodRelations COD identifier is
      // the value Google documents for this.
      acceptedPaymentMethod: {
        "@type": "PaymentMethod",
        "@id": "http://purl.org/goodrelations/v1#COD",
        name: "Cash on Delivery",
      },
      seller: { "@id": `${SITE.url}/#organization` },
      shippingDetails: shippingDetails(),
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
    author: { "@type": "Person", name: article.author || "Books Temple Editors" },
    publisher: { "@id": `${SITE.url}/#organization` },
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
    mainEntityOfPage: abs(`/blog/${article.slug}`),
  };
}
