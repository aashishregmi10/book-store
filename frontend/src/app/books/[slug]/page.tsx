import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookCover } from "@/components/books/BookCover";
import { notFound } from "next/navigation";
import { Star, Truck, Package, ShieldCheck } from "lucide-react";

import { apiGetOrNull, CACHE_TTL } from "@/lib/api";
import type { BookDetail, BookCardData, ReviewData, QuestionData } from "@/lib/types";
import { npr, discountPct } from "@/lib/format";
import { bookLd, breadcrumbLd, qaPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { BookCard } from "@/components/books/BookCard";
import { AddToCartButton } from "@/components/books/AddToCartButton";
import { StickyBuyBar } from "@/components/books/StickyBuyBar";
import { FormatPicker } from "@/components/books/FormatPicker";
import { WishlistButton } from "@/components/books/WishlistButton";
import { AskQuestion } from "@/components/books/AskQuestion";
import { ReviewForm } from "@/components/books/ReviewForm";
import { BookTabs } from "@/components/books/BookTabs";

// Section labels for breadcrumb + related heading on category books.
const CATEGORY_LABEL: Record<string, string> = { manga: "Manga", kids: "Kids", loksewa: "Loksewa" };

// Internal holding genre for books whose subject data was inconclusive. It's
// isActive:false, so /genre/unclassified 404s — a breadcrumb (and its matching
// JSON-LD) must never point there. These books stay fully buyable; they just
// hang off the catalogue rather than a genre page until someone shelves them.
const HOLDING_GENRE = "unclassified";

/** Where a book's breadcrumb parent points, and what it's called. */
function breadcrumbParent(book: { category?: string | null; genre: string }) {
  if (book.category) {
    return { name: CATEGORY_LABEL[book.category] ?? book.category, path: `/category/${book.category}` };
  }
  if (book.genre === HOLDING_GENRE) return { name: "All books", path: "/books" };
  return { name: book.genre.replace(/-/g, " "), path: `/genre/${book.genre}` };
}

// ISR — a book page has no per-visitor content, so it is prerendered on first
// request and refreshed in the background. Two minutes is short enough that a
// price or stock edit in the admin surfaces quickly.
export const revalidate = 120;

interface BookResponse {
  book: BookDetail;
  related: BookCardData[];
  reviews: ReviewData[];
  questions: QuestionData[];
}

// Cached per-request so generateMetadata and the page share one fetch.
const getBook = cache((slug: string) =>
  apiGetOrNull<BookResponse>(`/books/${slug}`, { tags: [`book:${slug}`], revalidate: CACHE_TTL.book })
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getBook(slug);
  if (!data) return { title: "Book not found" };
  const { book } = data;
  const soldOut = book.stockStatus === "out-of-stock" || book.stockStatus === "discontinued";
  return {
    title: book.metaTitle || `${book.title} by ${book.author} - ${npr(book.price)}`,
    description:
      book.metaDescription ||
      `Buy ${book.title} by ${book.author} online in Nepal for ${npr(book.price)}. ${soldOut ? "Currently out of stock. See similar titles." : "In stock, cash on delivery across Nepal."}`,
    alternates: { canonical: `/books/${book.slug}` },
    // Only `discontinued` — permanently gone — is noindexed. Merely being out of
    // stock is not.
    //
    // This is a deliberate divergence from CLAUDE.md §"Out-of-stock books stay
    // 200 … + temporary noindex", agreed with the shop owner. The reason is the
    // stock model: titles are held at ~2 copies, so a book crosses in and out of
    // stock constantly. Under the old rule each crossing pulled the URL from the
    // index and every restock made it re-earn its ranking from nothing — churn
    // across hundreds of pages, and no page ever accumulating history. Google's
    // guidance for temporarily unavailable products is to keep them indexable
    // and say so in the markup, which `bookLd()` already does via
    // `availability: OutOfStock`. Please don't "restore" the noindex here
    // without re-reading that reasoning.
    robots:
      book.stockStatus === "discontinued" ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      title: `${book.title} by ${book.author}`,
      description: `${npr(book.price)} · ${book.author}`,
      // og:image is provided by the dynamic opengraph-image.tsx in this segment.
    },
  };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getBook(slug);
  if (!data) notFound();

  const { book, related, reviews, questions } = data;
  const soldOut = book.stockStatus === "out-of-stock" || book.stockStatus === "discontinued";
  const off = discountPct(book.price, book.comparePrice);

  const specs: [string, string | number | undefined][] = [
    ["Author", book.author],
    ["Format", book.specifications?.format],
    ["Pages", book.specifications?.pages],
    ["Language", book.specifications?.language],
    ["Publisher", book.specifications?.publisher],
    ["ISBN", book.isbn],
  ];

  return (
    <>
      <JsonLd
        data={[
          bookLd(book, reviews),
          breadcrumbLd([
            { name: "Home", path: "/" },
            breadcrumbParent(book),
            { name: book.title, path: `/books/${book.slug}` },
          ]),
          ...(questions.length ? [qaPageLd({ title: book.title, slug: book.slug }, questions)] : []),
        ]}
      />

      <div className="shell py-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="font-data text-xs uppercase tracking-wide text-muted">
          <Link href="/" className="hover:text-accent">Home</Link>
          <span className="px-2">/</span>
          <Link href={breadcrumbParent(book).path} className="hover:text-accent">
            {breadcrumbParent(book).name}
          </Link>
          <span className="px-2">/</span>
          <span className="text-text">{book.title}</span>
        </nav>

        <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,360px)_1fr]">
          {/* Cover */}
          <div className="relative">
            <div className="relative mx-auto aspect-[2/3] w-full max-w-xs overflow-hidden border border-border bg-surface md:mx-0">
              <BookCover
                src={book.coverImage.secureUrl}
                alt={`${book.title} by ${book.author}, book cover`}
                title={book.title}
                priority
                sizes="(max-width: 768px) 80vw, 360px"
              />
              {off > 0 && <span className="absolute left-0 top-0 bg-sale px-2 py-0.5 font-data text-xs text-white">-{off}%</span>}
            </div>
          </div>

          {/* Detail */}
          <div>
            {/* BLUF — extractable lead sentence */}
            <h1 className="font-display text-4xl leading-tight text-text sm:text-5xl">{book.title}</h1>
            <p className="label-smallcaps mt-2 text-base">{book.author}</p>

            {/* Only show a rating when one exists. Every book ships with
                avgRating 0 and reviewCount 0, so rendering this
                unconditionally put a filled gold star beside "0.0" on all
                5,863 books that have no reviews yet — which reads as a
                zero-star rating rather than an absent one. BookCard already
                guarded this; the detail page did not. bookLd() is unaffected:
                it already omits aggregateRating when reviewCount is 0, so
                nothing was being published to Google either way. */}
            {book.reviewCount > 0 ? (
              <div className="mt-4 flex items-center gap-3">
                <span className="inline-flex items-center gap-1 font-data text-sm text-text">
                  <Star className="size-4 fill-star text-star" />
                  {book.avgRating.toFixed(1)}
                </span>
                <span className="font-body text-sm text-muted">
                  ({book.reviewCount} {book.reviewCount === 1 ? "review" : "reviews"})
                </span>
              </div>
            ) : (
              <p className="mt-4 font-body text-sm text-muted">No reviews yet.</p>
            )}

            {book.variants?.length ? (
              <>
                <FormatPicker book={book} />
                <div className="mt-4">
                  <WishlistButton bookId={book._id} className="size-12" variant="bordered" />
                </div>
              </>
            ) : (
              <>
                <div className="mt-5 flex items-baseline gap-3">
                  <span className="font-data text-3xl font-semibold text-text">{npr(book.price)}</span>
                  {book.comparePrice && book.comparePrice > book.price && (
                    <span className="font-data text-lg text-muted line-through">{npr(book.comparePrice)}</span>
                  )}
                </div>

                {/* Every title is stocked at a fixed 2 copies, so "only a few
                    left" would be true of the whole catalogue and read as a
                    fake-urgency tactic. In stock or not, nothing in between. */}
                <p className="mt-2 font-data text-sm">
                  {soldOut ? (
                    <>
                      <span className="text-sale">Currently out of stock</span>
                      {/* This page stays indexed while out of stock, so someone
                          can land here from search and find nothing to buy.
                          Point them at the same-silo alternatives already on the
                          page rather than letting them bounce. */}
                      {related.length > 0 && (
                        <>
                          {" · "}
                          <a href="#more-like-this" className="text-accent underline underline-offset-4">
                            see similar titles
                          </a>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-accent">In stock · ships today from Kathmandu</span>
                  )}
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <AddToCartButton
                    book={{ bookId: book._id, slug: book.slug, title: book.title, author: book.author, coverImage: book.coverImage.secureUrl, price: book.price, stock: book.stock }}
                    disabled={soldOut}
                  />
                  <WishlistButton bookId={book._id} className="size-12" variant="bordered" />
                </div>
              </>
            )}

            {/* trust row */}
            <ul className="mt-6 grid gap-2 font-body text-sm text-muted">
              <li className="flex items-center gap-2"><Truck className="size-4 text-accent" /> Kathmandu 1–2 days · rest of Nepal 3–5 days</li>
              <li className="flex items-center gap-2"><Package className="size-4 text-accent" /> Carefully packed &amp; shipped safely</li>
              <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-accent" /> Cash on delivery: pay when it arrives</li>
            </ul>

            {/* Specs as a definition list — far more AI-citable than prose */}
            <section aria-label="Book details" className="mt-8 border-t border-border pt-6">
              <h2 className="font-display text-xl text-text">Book specifications</h2>
              <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                {specs.filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-border/60 py-1.5">
                    <dt className="font-body text-sm text-muted">{k}</dt>
                    <dd className="font-data text-sm text-text">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </div>

        {/* Description, reviews and Q&A share one tab strip. Every panel is
            still server-rendered into the HTML — BookTabs hides the inactive
            ones rather than dropping them, so the description and Q&A stay
            crawlable and keep matching the JSON-LD emitted above. */}
        <BookTabs
          tabs={[
            {
              id: "about",
              label: "About this book",
              panel: (
                <div>
                  <h2 className="sr-only">About this book</h2>
                  <p className="max-w-3xl whitespace-pre-line font-body text-[1.0625rem] leading-relaxed text-text">
                    {book.description}
                  </p>
                </div>
              ),
            },
            {
              id: "reviews",
              label: "Reader reviews",
              count: reviews.length,
              panel: (
                <div className="max-w-3xl">
                  <h2 className="sr-only">Reader reviews</h2>
                  {reviews.length > 0 ? (
                    <ul className="space-y-5">
                      {reviews.map((r) => (
                        <li key={r._id} className="border-b border-border pb-5">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 font-data text-sm text-text">
                              <Star className="size-3.5 fill-star text-star" /> {r.rating}.0
                            </span>
                            {r.isVerifiedPurchase && <span className="font-data text-xs uppercase tracking-wide text-accent">Verified</span>}
                          </div>
                          {r.title && <p className="mt-1 font-display text-lg text-text">{r.title}</p>}
                          <p className="mt-1 font-body text-text">{r.body}</p>
                          <p className="label-smallcaps mt-1 text-xs">{r.user?.fullName || "A reader"}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="font-body text-muted">No reviews yet. Be the first to share your thoughts.</p>
                  )}
                  <ReviewForm slug={book.slug} />
                </div>
              ),
            },
            {
              id: "questions",
              label: "Questions & answers",
              count: questions.length,
              panel: (
                <div className="max-w-3xl">
                  <h2 className="sr-only">Questions &amp; answers</h2>
                  {questions.length > 0 ? (
                    <dl className="space-y-5">
                      {questions.map((q) => (
                        <div key={q._id} className="border-b border-border pb-5">
                          <dt className="font-display text-lg text-text">{q.question}</dt>
                          <dd className="mt-1 font-body leading-relaxed text-muted">{q.answer}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="font-body text-muted">No questions yet. Be the first to ask about this book.</p>
                  )}
                  <AskQuestion slug={book.slug} />
                </div>
              ),
            },
          ]}
        />

        {/* Same-silo related */}
        {related.length > 0 && (
          <section id="more-like-this" className="mt-14" style={{ scrollMarginTop: "5rem" }}>
            <h2 className="font-display text-2xl text-text">
              {book.genre === HOLDING_GENRE && !book.category
                ? "More books"
                : `More in ${breadcrumbParent(book).name}`}
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {related.map((b) => (
                <BookCard key={b.slug} book={b} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Mobile sticky buy bar (single-format books) + spacer so it never covers content */}
      {!book.variants?.length && (
        <>
          <div className="h-16 md:hidden" aria-hidden />
          <StickyBuyBar
            book={{ bookId: book._id, slug: book.slug, title: book.title, author: book.author, coverImage: book.coverImage.secureUrl, price: book.price }}
            soldOut={soldOut}
          />
        </>
      )}
    </>
  );
}
