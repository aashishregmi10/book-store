"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { BookForm } from "../../_components/BookForm";
import { EMPTY_BOOK, EMPTY_SPECIFICATIONS, cleanSpecifications, cleanVariants, type AdminBook, type BookFormValues } from "../../_components/types";
import { Skeleton } from "@/components/ui/Skeleton";

export default function EditBook() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [initial, setInitial] = useState<BookFormValues | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let active = true;
    clientApi
      .get<AdminBook>(`/admin/books/${slug}`)
      .then((b) => {
        if (!active) return;
        setInitial({
          ...EMPTY_BOOK,
          ...b,
          comparePrice: b.comparePrice ?? 0,
          coverImage: b.coverImage ?? null,
          images: b.images ?? [],
          specifications: { ...EMPTY_SPECIFICATIONS, ...(b.specifications ?? {}) },
          variants: b.variants ?? [],
        });
        setStatus("ready");
      })
      .catch(() => active && setStatus("missing"));
    return () => {
      active = false;
    };
  }, [slug]);

  async function save(values: BookFormValues) {
    const payload = {
      ...values,
      comparePrice: values.comparePrice || undefined,
      specifications: cleanSpecifications(values.specifications),
      variants: cleanVariants(values.variants),
    };
    await clientApi.put(`/admin/books/${slug}`, payload);
    router.push(`/admin/books/${slug}`);
    router.refresh();
  }

  return (
    <div>
      <Link
        href={`/admin/books/${slug}`}
        className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-muted hover:text-accent"
      >
        <ChevronLeft className="size-4" /> Back to book
      </Link>
      <h1 className="mt-3 mb-6 font-display text-3xl text-text">Edit book</h1>

      {status === "loading" && (
        <div className="max-w-2xl space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {status === "missing" && <p className="font-body text-muted">We couldn&apos;t find that book.</p>}
      {status === "ready" && initial && (
        <BookForm initial={initial} submitLabel="Save changes" cancelHref={`/admin/books/${slug}`} onSubmit={save} />
      )}
    </div>
  );
}
