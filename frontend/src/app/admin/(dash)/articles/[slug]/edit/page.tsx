"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { ArticleForm, type ArticleFormValues } from "../../_components/ArticleForm";
import type { BookImage } from "../../../books/_components/types";
import { PageSpinner } from "@/components/ui/Spinner";

interface AdminArticleDetail {
  slug: string;
  title: string;
  excerpt?: string;
  body: string;
  coverImage?: BookImage;
  author?: string;
  category?: string;
  tags?: string[];
  status?: string;
  metaTitle?: string;
  metaDesc?: string;
  relatedBooks?: { _id: string; title: string }[];
}

export default function EditArticle() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [initial, setInitial] = useState<ArticleFormValues | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    clientApi
      .get<AdminArticleDetail>(`/admin/articles/${slug}`)
      .then((a) =>
        active &&
        setInitial({
          slug: a.slug,
          title: a.title,
          excerpt: a.excerpt || "",
          body: a.body || "",
          coverImage: a.coverImage || null,
          author: a.author || "PageTurn Editors",
          category: a.category || "Reading guides",
          tags: (a.tags || []).join(", "),
          status: a.status === "published" ? "published" : "draft",
          metaTitle: a.metaTitle || "",
          metaDesc: a.metaDesc || "",
          relatedBooks: (a.relatedBooks || []).map((b) => ({ _id: b._id, title: b.title })),
        })
      )
      .catch(() => active && setMissing(true));
    return () => {
      active = false;
    };
  }, [slug]);

  async function save(values: ArticleFormValues) {
    const payload: Record<string, unknown> = {
      ...values,
      tags: values.tags.split(",").map((s) => s.trim()).filter(Boolean),
      relatedBooks: values.relatedBooks.map((b) => b._id),
    };
    if (!values.coverImage) delete payload.coverImage;
    await clientApi.put(`/admin/articles/${slug}`, payload);
    router.push("/admin/articles");
    router.refresh();
  }

  if (missing) return <p className="font-body text-muted">We couldn&apos;t find that article.</p>;
  if (!initial) return <PageSpinner label="Loading article…" />;

  return (
    <div>
      <Link href="/admin/articles" className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-muted hover:text-accent">
        <ChevronLeft className="size-4" /> Back to articles
      </Link>
      <h1 className="mt-3 mb-6 font-display text-3xl text-text">Edit article</h1>
      <ArticleForm initial={initial} submitLabel="Save changes" cancelHref="/admin/articles" onSubmit={save} />
    </div>
  );
}
