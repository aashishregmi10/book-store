"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { BookForm } from "../_components/BookForm";
import { EMPTY_BOOK, cleanSpecifications, type BookFormValues } from "../_components/types";

export default function NewBook() {
  const router = useRouter();

  async function create(values: BookFormValues) {
    const payload = {
      ...values,
      comparePrice: values.comparePrice || undefined,
      specifications: cleanSpecifications(values.specifications),
    };
    await clientApi.post("/admin/books", payload);
    router.push("/admin/books");
    router.refresh();
  }

  return (
    <div>
      <Link
        href="/admin/books"
        className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-muted hover:text-accent"
      >
        <ChevronLeft className="size-4" /> Back to books
      </Link>
      <h1 className="mt-3 mb-6 font-display text-3xl text-text">Add book</h1>
      <BookForm initial={EMPTY_BOOK} submitLabel="Create book" cancelHref="/admin/books" onSubmit={create} />
    </div>
  );
}
