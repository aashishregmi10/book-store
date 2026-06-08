"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { ArticleForm, EMPTY_ARTICLE, type ArticleFormValues } from "../_components/ArticleForm";

export default function NewArticle() {
  const router = useRouter();

  async function create(values: ArticleFormValues) {
    const payload: Record<string, unknown> = {
      ...values,
      tags: values.tags.split(",").map((s) => s.trim()).filter(Boolean),
      relatedBooks: values.relatedBooks.map((b) => b._id),
    };
    if (!values.coverImage) delete payload.coverImage;
    if (!values.slug) delete payload.slug;
    await clientApi.post("/admin/articles", payload);
    router.push("/admin/articles");
    router.refresh();
  }

  return (
    <div>
      <Link href="/admin/articles" className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-muted hover:text-accent">
        <ChevronLeft className="size-4" /> Back to articles
      </Link>
      <h1 className="mt-3 mb-6 font-display text-3xl text-text">New article</h1>
      <ArticleForm initial={EMPTY_ARTICLE} submitLabel="Create article" cancelHref="/admin/articles" onSubmit={create} />
    </div>
  );
}
