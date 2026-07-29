"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageUpload } from "../../books/_components/ImageUpload";
import type { BookImage } from "../../books/_components/types";
import { RelatedBooksPicker, type PickedBook } from "./RelatedBooksPicker";
import { ClientApiError } from "@/lib/client-api";

export interface ArticleFormValues {
  slug?: string;
  title: string;
  excerpt: string;
  body: string;
  coverImage: BookImage | null;
  author: string;
  category: string;
  tags: string; // comma-separated in the form
  status: "draft" | "published";
  metaTitle: string;
  metaDesc: string;
  relatedBooks: PickedBook[];
}

export const EMPTY_ARTICLE: ArticleFormValues = {
  title: "",
  excerpt: "",
  body: "",
  coverImage: null,
  author: "Books Temple Editors",
  category: "Reading guides",
  tags: "",
  status: "draft",
  metaTitle: "",
  metaDesc: "",
  relatedBooks: [],
};

export function ArticleForm({
  initial,
  submitLabel,
  cancelHref,
  onSubmit,
}: {
  initial: ArticleFormValues;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (values: ArticleFormValues) => Promise<void>;
}) {
  const [form, setForm] = useState<ArticleFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof ArticleFormValues>(key: K, value: ArticleFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Save failed — please try again.");
      setSaving(false);
    }
  }

  const words = form.body.trim().split(/\s+/).filter(Boolean).length;

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="mb-5 border-l-2 border-sale bg-sale/5 px-4 py-2.5 font-body text-sm text-sale">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main */}
        <div className="space-y-4 border border-border bg-surface p-6">
          <Text label="Title" value={form.title} onChange={(v) => set("title", v)} required />
          <Text label="Slug (optional)" value={form.slug || ""} onChange={(v) => set("slug", v)} mono placeholder="auto from title" />
          <Area label="Excerpt (BLUF — 1–2 sentence summary)" value={form.excerpt} onChange={(v) => set("excerpt", v)} rows={2} />
          <label className="block">
            <span className="font-data text-xs uppercase tracking-wide text-muted">Body (markdown: ## heading, - list, &gt; quote)</span>
            <textarea
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              required
              rows={18}
              className="mt-1 w-full resize-y border border-border bg-bg px-3 py-2 font-body leading-relaxed text-text outline-none focus:border-accent"
            />
            <span className="mt-1 block text-right font-data text-xs text-muted">{words} words · ~{Math.max(1, Math.round(words / 200))} min read</span>
          </label>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="border border-border bg-surface p-5">
            <h2 className="mb-3 font-data text-xs uppercase tracking-[0.12em] text-muted">Cover</h2>
            <ImageUpload value={form.coverImage} onChange={(img) => set("coverImage", img)} />
          </div>

          <div className="space-y-4 border border-border bg-surface p-5">
            <Select label="Status" value={form.status} onChange={(v) => set("status", v as "draft" | "published")} options={["draft", "published"]} />
            <Text label="Author" value={form.author} onChange={(v) => set("author", v)} />
            <Text label="Category" value={form.category} onChange={(v) => set("category", v)} />
            <Text label="Tags (comma-separated)" value={form.tags} onChange={(v) => set("tags", v)} />
            <RelatedBooksPicker value={form.relatedBooks} onChange={(b) => set("relatedBooks", b)} />
          </div>

          <div className="space-y-4 border border-border bg-surface p-5">
            <h2 className="font-data text-xs uppercase tracking-[0.12em] text-muted">SEO</h2>
            <Text label="Meta title" value={form.metaTitle} onChange={(v) => set("metaTitle", v)} />
            <Area label="Meta description" value={form.metaDesc} onChange={(v) => set("metaDesc", v)} rows={2} />
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="flex-1 bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-50">
              {saving ? "Saving…" : submitLabel}
            </button>
            <Link href={cancelHref} className="px-4 py-3 font-data text-sm uppercase tracking-wide text-muted hover:text-text">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </form>
  );
}

function Text({ label, value, onChange, required, mono, placeholder }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; mono?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="font-data text-xs uppercase tracking-wide text-muted">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} className={`mt-1 w-full border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent ${mono ? "font-data" : "font-body"}`} />
    </label>
  );
}

function Area({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <label className="block">
      <span className="font-data text-xs uppercase tracking-wide text-muted">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="mt-1 w-full resize-y border border-border bg-bg px-3 py-2 font-body text-text outline-none focus:border-accent" />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="font-data text-xs uppercase tracking-wide text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full border border-border bg-bg px-3 py-2 font-body capitalize text-text outline-none focus:border-accent">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
