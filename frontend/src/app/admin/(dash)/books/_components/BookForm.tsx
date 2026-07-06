"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ImagePlus, Sparkles, Loader2 } from "lucide-react";
import { ImageUpload, GalleryUpload } from "./ImageUpload";
import { useGenres } from "./useGenres";
import {
  FALLBACK_GENRES,
  FORMATS,
  CATEGORY_OPTIONS,
  MIN_GALLERY_IMAGES,
  MAX_GALLERY_IMAGES,
  type BookFormValues,
  type BookSpecifications,
  type BookVariantInput,
  type IsbnLookup,
} from "./types";
import { Trash2, Plus } from "lucide-react";
import { npr, discountPct } from "@/lib/format";
import { clientApi, ClientApiError } from "@/lib/client-api";

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
  const genreOptions = [
    { value: "", label: "— None (section book) —" },
    ...(genres.length
      ? genres.map((g) => ({ value: g.slug, label: g.name }))
      : FALLBACK_GENRES.map((g) => ({ value: g, label: g }))),
  ];
  if (form.genre && !genreOptions.some((o) => o.value === form.genre)) {
    genreOptions.unshift({ value: form.genre, label: form.genre });
  }

  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");

  function set<K extends keyof BookFormValues>(key: K, value: BookFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setSpec<K extends keyof BookSpecifications>(key: K, value: BookSpecifications[K]) {
    setForm((f) => ({ ...f, specifications: { ...f.specifications, [key]: value } }));
  }

  // ── Format variants ──
  const hasVariants = form.variants.length > 0;
  function addVariant() {
    const used = new Set(form.variants.map((v) => v.format));
    const next = FORMATS.find((f) => !used.has(f)) || "Paperback";
    setForm((f) => ({ ...f, variants: [...f.variants, { format: next, price: 0, stock: 0 }] }));
  }
  function updateVariant(i: number, patch: Partial<BookVariantInput>) {
    setForm((f) => ({ ...f, variants: f.variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) }));
  }
  function removeVariant(i: number) {
    setForm((f) => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }));
  }

  // Prefill title/author/cover/specs from Open Library by ISBN.
  async function autofill() {
    const isbn = form.isbn.trim();
    if (!isbn) {
      setLookupMsg("Enter an ISBN first.");
      return;
    }
    setLooking(true);
    setLookupMsg("");
    try {
      const data = await clientApi.get<IsbnLookup>(`/admin/books/lookup?isbn=${encodeURIComponent(isbn)}`);
      const s = data.specifications || {};
      setForm((f) => ({
        ...f,
        title: data.title || f.title,
        author: data.author || f.author,
        coverImage: data.coverImage || f.coverImage,
        specifications: {
          ...f.specifications,
          ...(s.pages ? { pages: s.pages } : {}),
          ...(s.publisher ? { publisher: s.publisher } : {}),
          ...(s.publishedDate ? { publishedDate: s.publishedDate } : {}),
          ...(s.language ? { language: s.language } : {}),
        },
      }));
      setLookupMsg("Filled from Open Library — review the details, then save.");
    } catch (err) {
      setLookupMsg(err instanceof ClientApiError ? err.message : "Lookup failed — add details manually.");
    } finally {
      setLooking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.genre && !form.category) {
      setError("Pick a Genre or a Section (Manga / Kids / Loksewa).");
      return;
    }
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
            {/* ISBN + auto-fill from Open Library */}
            <div>
              <span className="font-data text-xs uppercase tracking-wide text-muted">ISBN</span>
              <div className="mt-1 flex gap-2">
                <input
                  value={form.isbn}
                  onChange={(e) => set("isbn", e.target.value)}
                  placeholder="e.g. 9780385472579"
                  className="w-full border border-border bg-bg px-3 py-2 font-data text-text outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={autofill}
                  disabled={looking}
                  className="inline-flex shrink-0 items-center gap-2 border border-accent px-3 py-2 font-data text-sm text-accent transition-colors hover:bg-accent/5 disabled:opacity-50"
                >
                  {looking ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Auto-fill
                </button>
              </div>
              {lookupMsg && <p className="mt-1 font-body text-xs text-muted">{lookupMsg}</p>}
            </div>

            <Text label="Title" value={form.title} onChange={(v) => set("title", v)} required />
            <Text label="Author" value={form.author} onChange={(v) => set("author", v)} required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Genre"
                value={form.genre}
                onChange={(v) => set("genre", v)}
                options={genreOptions}
                hint={genres.length ? "Optional if you pick a Section below." : "Add genres under Genres →"}
              />
              <Select
                label="Section (Manga / Kids / Loksewa)"
                value={form.category}
                onChange={(v) => set("category", v)}
                options={CATEGORY_OPTIONS}
                hint="Optional — shows the book under a top-nav section."
              />
            </div>
          </Section>

          <Section title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Format" value={form.specifications.format} onChange={(v) => setSpec("format", v)} options={FORMATS.map((f) => ({ value: f, label: f }))} />
              <Num label="Pages" value={form.specifications.pages} onChange={(v) => setSpec("pages", v)} />
              <Text label="Language" value={form.specifications.language} onChange={(v) => setSpec("language", v)} />
              <Text label="Publisher" value={form.specifications.publisher} onChange={(v) => setSpec("publisher", v)} />
              <Text label="Published year" value={form.specifications.publishedDate} onChange={(v) => setSpec("publishedDate", v)} />
            </div>
          </Section>

          <Section title="Pricing & stock">
            {hasVariants ? (
              <p className="font-body text-sm text-muted">
                Price &amp; stock are derived from the formats below ({npr(Math.min(...form.variants.map((v) => v.price || 0)))} from,{" "}
                {form.variants.reduce((n, v) => n + (Number(v.stock) || 0), 0)} in stock total).
              </p>
            ) : (
              <>
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
              </>
            )}
          </Section>

          <Section title="Formats (optional)">
            <p className="font-body text-sm text-muted">
              Add formats only if this title sells in more than one edition (e.g. Hardcover &amp; Paperback) at
              different prices. Leave empty for a single-format book.
            </p>
            {form.variants.map((v, i) => (
              <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <label className="block">
                  <FieldLabel>Format</FieldLabel>
                  <select
                    value={v.format}
                    onChange={(e) => updateVariant(i, { format: e.target.value })}
                    className="mt-1 w-full border border-border bg-bg px-3 py-2 font-body text-text outline-none focus:border-accent"
                  >
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </label>
                <Num label="Price" value={v.price} onChange={(val) => updateVariant(i, { price: val })} prefix="₨" />
                <Num label="Stock" value={v.stock} onChange={(val) => updateVariant(i, { stock: val })} />
                <button
                  type="button"
                  onClick={() => removeVariant(i)}
                  aria-label="Remove format"
                  className="mb-1 grid size-9 place-items-center border border-border text-muted hover:border-sale hover:text-sale"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addVariant}
              className="inline-flex items-center gap-2 border border-accent px-3 py-2 font-data text-sm text-accent transition-colors hover:bg-accent/5"
            >
              <Plus className="size-4" /> Add format
            </button>
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
