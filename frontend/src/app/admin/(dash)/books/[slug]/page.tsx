"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AdminBook } from "../_components/types";

export default function BookDetail() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [book, setBook] = useState<AdminBook | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let active = true;
    clientApi
      .get<AdminBook>(`/admin/books/${slug}`)
      .then((b) => active && (setBook(b), setStatus("ready")))
      .catch(() => active && setStatus("missing"));
    return () => {
      active = false;
    };
  }, [slug]);

  async function del() {
    if (!book) return;
    if (!confirm(`Delete “${book.title}”? This cannot be undone.`)) return;
    await clientApi.del(`/admin/books/${book._id}`).catch(() => {});
    router.push("/admin/books");
    router.refresh();
  }

  if (status === "loading")
    return (
      <div>
        <Skeleton className="h-4 w-32" />
        <div className="mt-6 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <Skeleton className="aspect-[2/3] w-full" />
          <div>
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="mt-3 h-4 w-40" />
            <div className="mt-6 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </div>
      </div>
    );
  if (status === "missing" || !book)
    return (
      <div>
        <Link href="/admin/books" className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-muted hover:text-accent">
          <ChevronLeft className="size-4" /> Back to books
        </Link>
        <p className="mt-6 font-body text-muted">We couldn&apos;t find that book.</p>
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href="/admin/books"
          className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-muted hover:text-accent"
        >
          <ChevronLeft className="size-4" /> Back to books
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/books/${book.slug}/edit`}
            className="inline-flex items-center gap-2 bg-accent px-4 py-2 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover"
          >
            <Pencil className="size-4" /> Edit
          </Link>
          <button
            onClick={del}
            className="inline-flex items-center gap-2 border border-border px-4 py-2 font-data text-sm uppercase tracking-wide text-muted hover:border-sale hover:text-sale"
          >
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Cover + at-a-glance price/stock card */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="relative aspect-[2/3] w-full overflow-hidden border border-border bg-bg">
            {book.coverImage && (
              <Image src={book.coverImage.secureUrl} alt={book.title} fill sizes="240px" className="object-cover" />
            )}
          </div>
          <div className="mt-4 border border-border bg-surface p-4">
            <div className="flex items-baseline gap-2">
              <span className="font-data text-2xl font-semibold text-text">{npr(book.price)}</span>
              {book.comparePrice ? (
                <span className="font-data text-sm text-muted line-through">{npr(book.comparePrice)}</span>
              ) : null}
            </div>
            <p className={`mt-1 font-data text-xs uppercase tracking-wide ${book.stock <= 3 ? "text-sale" : "text-accent"}`}>
              {book.stock} in stock · {book.stockStatus.replace(/-/g, " ")}
            </p>
          </div>

          {book.images && book.images.length > 0 && (
            <div className="mt-4">
              <h2 className="font-data text-xs uppercase tracking-[0.12em] text-muted">Gallery</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {book.images.map((img) => (
                  <div key={img.publicId} className="relative h-20 w-14 overflow-hidden border border-border bg-bg">
                    <Image src={img.secureUrl} alt={img.name || book.title} fill sizes="56px" className="object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Editorial column */}
        <div className="min-w-0">
          <h1 className="font-display text-4xl leading-tight text-text">{book.title}</h1>
          <p className="label-smallcaps mt-1 text-base">{book.author}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={book.isActive ? "accent" : "muted"}>{book.isActive ? "Active" : "Hidden"}</Badge>
            {book.isFeatured && <Badge tone="muted">Featured</Badge>}
            {book.isBestseller && <Badge tone="muted">Bestseller</Badge>}
            {book.isNewArrival && <Badge tone="muted">New arrival</Badge>}
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h2 className="font-data text-xs uppercase tracking-[0.12em] text-muted">About this book</h2>
            <p className="mt-2 max-w-prose font-body leading-relaxed text-text">{book.description}</p>
          </div>

          <dl className="mt-6 max-w-xl border-t border-border pt-5">
            <Row label="Genre" value={book.genre} />
            <Row label="ISBN" value={book.isbn || "—"} mono />
            <Row label="Slug" value={book.slug} mono />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-y-3 border-b border-border py-2.5 last:border-0">
      <dt className="font-data text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`text-sm ${mono ? "font-data text-text" : "font-body text-text"}`}>{value}</dd>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "accent" | "muted" }) {
  return (
    <span
      className={`px-2 py-1 font-data text-xs uppercase tracking-wide ${
        tone === "accent" ? "bg-accent text-white" : "border border-border text-muted"
      }`}
    >
      {children}
    </span>
  );
}
