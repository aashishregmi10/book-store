"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ImagePlus } from "lucide-react";
import { ImageUpload, GalleryUpload } from "./ImageUpload";
import { useGenres } from "./useGenres";
import { FALLBACK_GENRES, MIN_GALLERY_IMAGES, MAX_GALLERY_IMAGES, type BookFormValues } from "./types";
import { npr, discountPct } from "@/lib/format";
import { ClientApiError } from "@/lib/client-api";

export function BookForm({
  initial,
  submitLabel,
  cancelHref,
  onSubmit,
}: {
  initial: BookFormValues;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (values: BookFormValues) => Promise<void>;
}) {
  const [form, setForm] = useState<BookFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { genres } = useGenres();

  // Real options come from the admin-curated list; fall back if the API is down
  // or, on edit, keep whatever genre the book already carries even if inactive.
  const genreOptions = genres.length
    ? genres.map((g) => ({ value: g.slug, label: g.name }))
    : FALLBACK_GENRES.map((g) => ({ value: g, label: g }));
  if (form.genre && !genreOptions.some((o) => o.value === form.genre)) {
    genreOptions.unshift({ value: form.genre, label: form.genre });
  }

  function set<K extends keyof BookFormValues>(key: K, value: BookFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.coverImage) {
      setError("Please upload a cover image before saving.");
      return;
    }
    if (form.images.length < MIN_GALLERY_IMAGES) {
      setError(`Please add at least ${MIN_GALLERY_IMAGES} gallery image${MIN_GALLERY_IMAGES > 1 ? "s" : ""}.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Save failed — please try again.");
      setSaving(false);
    }
  }

  const off = discountPct(form.price, form.comparePrice);

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <p className="mb-5 border-l-2 border-sale bg-sale/5 px-4 py-2.5 font-body text-sm text-sale">{error}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Main form ──────────────────────────────────── */}
        <div className="min-w-0 border border-border bg-surface">
          <Section title="Cover & gallery">
            <ImageUpload value={form.coverImage} onChange={(img) => set("coverImage", img)} />
            <GalleryUpload
              value={form.images}
              onChange={(imgs) => set("images", imgs)}
              min={MIN_GALLERY_IMAGES}
              max={MAX_GALLERY_IMAGES}
            />
          </Section>

          <Section title="Catalogue">
            <Text label="Title" value={form.title} onChange={(v) => set("title", v)} required />
            <Text label="Author" value={form.author} onChange={(v) => set("author", v)} required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Genre"
                value={form.genre}
                onChange={(v) => set("genre", v)}
                options={genreOptions}
                hint={genres.length ? undefined : "Add genres under Genres →"}
              />
              <Select
                label="Condition"
                value={form.condition}
                onChange={(v) => set("condition", v)}
                options={[
                  { value: "new", label: "New" },
                  { value: "used", label: "Used" },
                ]}
              />
              <Text label="ISBN" value={form.isbn} onChange={(v) => set("isbn", v)} mono />
            </div>
          </Section>

          <Section title="Pricing & stock">
            <div className="grid gap-4 sm:grid-cols-3">
              <Num label="Price" value={form.price} onChange={(v) => set("price", v)} required prefix="₨" />
              <Num label="Compare at" value={form.comparePrice} onChange={(v) => set("comparePrice", v)} prefix="₨" />
              <Num label="Stock" value={form.stock} onChange={(v) => set("stock", v)} required />
            </div>
            {off > 0 && (
              <p className="font-data text-xs text-accent">
                {off}% off — strike-through {npr(form.comparePrice)} shown to readers.
              </p>
            )}
          </Section>

          <Section title="Description">
            <label className="block">
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                required
                rows={6}
                placeholder="Lead with a 40–80 word hook a reader could quote — what the book is and who it's for."
                className="w-full resize-y border border-border bg-bg px-3 py-2 font-body leading-relaxed text-text outline-none placeholder:text-muted/60 focus:border-accent"
              />
              <span className="mt-1 block text-right font-data text-xs text-muted">
                {form.description.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </label>
          </Section>
        </div>

        {/* ── Sidebar: live jacket + visibility + actions ── */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <div className="border border-border bg-surface p-5">
            <h2 className="font-data text-xs uppercase tracking-wide text-muted">Preview</h2>
            <div className="mt-3">
              <div className="relative mx-auto aspect-[2/3] w-40 overflow-hidden border border-border bg-bg">
                {form.coverImage ? (
                  <Image src={form.coverImage.secureUrl} alt="" fill sizes="160px" className="object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted">
                    <ImagePlus className="size-7" />
                  </div>
                )}
                {off > 0 && (
                  <span className="absolute left-0 top-0 bg-sale px-2 py-0.5 font-data text-[11px] text-white">-{off}%</span>
                )}
              </div>
              <h3 className="mt-3 font-display text-lg leading-snug text-text">
                {form.title || "Untitled"}
              </h3>
              <p className="label-smallcaps mt-0.5 text-sm">{form.author || "Unknown author"}</p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="font-data text-[15px] font-semibold text-text">{npr(form.price)}</span>
                {off > 0 && <span className="font-data text-xs text-muted line-through">{npr(form.comparePrice)}</span>}
              </div>
            </div>
          </div>

          <div className="border border-border bg-surface p-5">
            <h2 className="font-data text-xs uppercase tracking-wide text-muted">Visibility</h2>
            <div className="mt-3 space-y-2.5">
              <Check label="Active (visible in store)" checked={form.isActive} onChange={(v) => set("isActive", v)} />
              <Check label="Featured" checked={form.isFeatured} onChange={(v) => set("isFeatured", v)} />
              <Check label="Bestseller" checked={form.isBestseller} onChange={(v) => set("isBestseller", v)} />
              <Check label="New arrival" checked={form.isNewArrival} onChange={(v) => set("isNewArrival", v)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Saving…" : submitLabel}
            </button>
            <Link
              href={cancelHref}
              className="px-4 py-3 font-data text-sm uppercase tracking-wide text-muted hover:text-text"
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 p-5 not-first:border-t not-first:border-border sm:p-6">
      <h2 className="font-data text-xs uppercase tracking-[0.12em] text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Text({
  label,
  value,
  onChange,
  required,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`mt-1 w-full border border-border bg-bg px-3 py-2 text-text outline-none focus:border-accent ${
          mono ? "font-data" : "font-body"
        }`}
      />
    </label>
  );
}

function Num({
  label,
  value,
  onChange,
  required,
  prefix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  required?: boolean;
  prefix?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1 flex items-center border border-border bg-bg focus-within:border-accent">
        {prefix && <span className="pl-3 font-data text-sm text-muted">{prefix}</span>}
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          required={required}
          className="w-full bg-transparent px-3 py-2 font-data text-text outline-none"
        />
      </div>
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-border bg-bg px-3 py-2 font-body text-text outline-none focus:border-accent"
      >
        {options.length === 0 && <option value="">No genres yet</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block font-body text-xs text-muted">{hint}</span>}
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 font-body text-sm text-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="font-data text-xs uppercase tracking-wide text-muted">{children}</span>;
}
