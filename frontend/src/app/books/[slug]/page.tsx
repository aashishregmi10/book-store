import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookCover } from "@/components/books/BookCover";
import { notFound } from "next/navigation";
import { Star, Truck, RotateCcw, ShieldCheck } from "lucide-react";

import { apiGetOrNull } from "@/lib/api";
import type { BookDetail, BookCardData, ReviewData, QuestionData } from "@/lib/types";
import { npr, discountPct } from "@/lib/format";
import { bookLd, breadcrumbLd, qaPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { BookCard } from "@/components/books/BookCard";
import { AddToCartButton } from "@/components/books/AddToCartButton";
import { FormatPicker } from "@/components/books/FormatPicker";
import { WishlistButton } from "@/components/books/WishlistButton";
import { AskQuestion } from "@/components/books/AskQuestion";
import { ReviewForm } from "@/components/books/ReviewForm";

// Section labels for breadcrumb + related heading on category books.
const CATEGORY_LABEL: Record<string, string> = { manga: "Manga", kids: "Kids", loksewa: "Loksewa" };

export const dynamic = "force-dynamic";

interface BookResponse {
  book: BookDetail;
  related: BookCardData[];
  reviews: ReviewData[];
  questions: QuestionData[];
}

// Cached per-request so generateMetadata and the page share one fetch.
const getBook = cache((slug: string) =>
  apiGetOrNull<BookResponse>(`/books/${slug}`, { tags: [`book:${slug}`] })
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getBook(slug);
  if (!data) return { title: "Book not found" };
  const { book } = data;
  const soldOut = book.stockStatus === "out-of-stock" || book.stockStatus === "discontinued";
  return {
    title: book.metaTitle || `${book.title} by ${book.author} — ${npr(book.price)}`,
    description:
      book.metaDescription ||
      `Buy ${book.title} by ${book.author} online in Nepal for ${npr(book.price)}. ${soldOut ? "Currently out of stock — see similar titles." : "In stock, cash on delivery across Nepal."}`,
    alternates: { canonical: `/books/${book.slug}` },
    // Out-of-stock pages stay live but temporarily noindex (SEO Guide §8.1).
    robots: soldOut ? { index: false, follow: true } : undefined,
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
    ["Condition", book.condition === "used" ? "Used" : "New"],
  ];

  return (
    <>
      <JsonLd
        data={[
          bookLd(book, reviews),
          breadcrumbLd([
            { name: "Home", path: "/" },
            book.category
              ? { name: CATEGORY_LABEL[book.category], path: `/category/${book.category}` }
              : { name: book.genre, path: `/genre/${book.genre}` },
            { name: book.title, path: `/books/${book.slug}` },
          ]),
          ...(questions.length ? [qaPageLd({ title: book.title, slug: book.slug }, questions)] : []),
        ]}
      />

      <div className="mx-auto max-w-[1600px] px-6 py-8 sm:px-8 lg:px-16 xl:px-24">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="font-data text-xs uppercase tracking-wide text-muted">
          <Link href="/" className="hover:text-accent">Home</Link>
          <span className="px-2">/</span>
          {book.category ? (
            <Link href={`/category/${book.category}`} className="hover:text-accent">{CATEGORY_LABEL[book.category]}</Link>
          ) : (
            <Link href={`/genre/${book.genre}`} className="hover:text-accent">{book.genre.replace(/-/g, " ")}</Link>
          )}
          <span className="px-2">/</span>
          <span className="text-text">{book.title}</span>
        </nav>

        <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,360px)_1fr]">
          {/* Cover */}
          <div className="relative">
            <div className="relative mx-auto aspect-[2/3] w-full max-w-xs overflow-hidden border border-border bg-surface md:mx-0">
              <BookCover
                src={book.coverImage.secureUrl}
                alt={`${book.title} by ${book.author} — book cover`}
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

            <div className="mt-4 flex items-center gap-3">
              <span className="inline-flex items-center gap-1 font-data text-sm text-text">
                <Star className="size-4 fill-star text-star" />
                {book.avgRating?.toFixed(1) ?? "0.0"}
              </span>
              <span className="font-body text-sm text-muted">({book.reviewCount} reviews)</span>
            </div>

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

                <p className="mt-2 font-data text-sm">
                  {soldOut ? (
                    <span className="text-sale">Currently out of stock</span>
                  ) : book.stockStatus === "low-stock" ? (
                    <span className="text-sale">Only a few left — order soon</span>
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
              <li className="flex items-center gap-2"><RotateCcw className="size-4 text-accent" /> 7-day returns on unread books</li>
              <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-accent" /> Cash on delivery — pay when it arrives</li>
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

        {/* Description */}
        <section className="mt-12 max-w-3xl">
          <h2 className="font-display text-2xl text-text">About this book</h2>
          <p className="mt-3 whitespace-pre-line font-body leading-relaxed text-text">{book.description}</p>
        </section>

        {/* Reviews */}
        <section className="mt-12 max-w-3xl">
          <h2 className="font-display text-2xl text-text">Reader reviews</h2>
          {reviews.length > 0 ? (
            <ul className="mt-4 space-y-5">
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
            <p className="mt-3 font-body text-muted">No reviews yet — be the first to share your thoughts.</p>
          )}
          <ReviewForm slug={book.slug} />
        </section>

        {/* Questions & answers (QAPage) */}
        <section className="mt-12 max-w-3xl">
          <h2 className="font-display text-2xl text-text">Questions &amp; answers</h2>
          {questions.length > 0 ? (
            <dl className="mt-4 space-y-5">
              {questions.map((q) => (
                <div key={q._id} className="border-b border-border pb-5">
                  <dt className="font-display text-lg text-text">{q.question}</dt>
                  <dd className="mt-1 font-body leading-relaxed text-muted">{q.answer}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 font-body text-muted">No questions yet — be the first to ask about this book.</p>
          )}
          <AskQuestion slug={book.slug} />
        </section>

        {/* Same-silo related */}
        {related.length > 0 && (
          <section className="mt-14">
            <h2 className="font-display text-2xl text-text">
              More in {book.category ? CATEGORY_LABEL[book.category] : book.genre.replace(/-/g, " ")}
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {related.map((b) => (
                <BookCard key={b.slug} book={b} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
