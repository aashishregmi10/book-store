"use client";

import { useState } from "react";
import Link from "next/link";
import { ClientApiError } from "@/lib/client-api";
import { useGenres } from "../../books/_components/useGenres";

export type CouponType = "percentage" | "fixed" | "free_shipping";

export interface CouponFormValues {
  code: string;
  description: string;
  type: CouponType;
  value: string;
  minOrderAmount: string;
  maxDiscount: string;
  usageLimit: string;
  perUserLimit: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  newUserOnly: boolean;
  applicableGenres: string[];
}

export const EMPTY_COUPON: CouponFormValues = {
  code: "",
  description: "",
  type: "percentage",
  value: "10",
  minOrderAmount: "",
  maxDiscount: "",
  usageLimit: "",
  perUserLimit: "1",
  startDate: "",
  endDate: "",
  isActive: true,
  newUserOnly: false,
  applicableGenres: [],
};

/**
 * The form keeps every numeric/date field as a string so an empty box stays
 * empty rather than snapping to 0 — "no cap" and "capped at zero" are very
 * different coupons. `toPayload` drops the blanks on the way out.
 */
export function toPayload(v: CouponFormValues): Record<string, unknown> {
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  return {
    code: v.code.trim().toUpperCase(),
    description: v.description.trim() || undefined,
    type: v.type,
    // A free-shipping coupon carries no amount; the model still requires a
    // number, so send the 0 the pricing service expects.
    value: v.type === "free_shipping" ? 0 : num(v.value),
    minOrderAmount: num(v.minOrderAmount),
    maxDiscount: v.type === "percentage" ? num(v.maxDiscount) : undefined,
    usageLimit: num(v.usageLimit),
    perUserLimit: num(v.perUserLimit),
    startDate: v.startDate || undefined,
    endDate: v.endDate || undefined,
    isActive: v.isActive,
    newUserOnly: v.newUserOnly,
    applicableGenres: v.applicableGenres,
  };
}

export function CouponForm({
  initial,
  submitLabel,
  cancelHref,
  onSubmit,
}: {
  initial: CouponFormValues;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (values: CouponFormValues) => Promise<void>;
}) {
  const [form, setForm] = useState<CouponFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { genres } = useGenres();

  function set<K extends keyof CouponFormValues>(key: K, value: CouponFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleGenre(slug: string) {
    setForm((f) => ({
      ...f,
      applicableGenres: f.applicableGenres.includes(slug)
        ? f.applicableGenres.filter((g) => g !== slug)
        : [...f.applicableGenres, slug],
    }));
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

  const isPercent = form.type === "percentage";
  const isShipping = form.type === "free_shipping";

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="mb-5 border-l-2 border-sale bg-sale/5 px-4 py-2.5 font-body text-sm text-sale">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main */}
        <div className="space-y-4 border border-border bg-surface p-6">
          <label className="block">
            <span className="font-data text-xs uppercase tracking-wide text-muted">
              Code <span className="text-sale">*</span>
            </span>
            <input
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              required
              minLength={3}
              maxLength={24}
              placeholder="LAUNCH10"
              className="mt-1 w-full border border-border bg-bg px-3 py-2 font-data uppercase tracking-[0.12em] text-text outline-none focus:border-accent"
            />
            <span className="mt-1 block font-body text-xs text-muted">
              What the shopper types at checkout. Case doesn&apos;t matter — it&apos;s stored uppercase.
            </span>
          </label>

          <label className="block">
            <span className="font-data text-xs uppercase tracking-wide text-muted">Description (internal)</span>
            <input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={200}
              placeholder="Launch promo — 10% off everything"
              className="mt-1 w-full border border-border bg-bg px-3 py-2 font-body text-text outline-none focus:border-accent"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-data text-xs uppercase tracking-wide text-muted">Type</span>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value as CouponType)}
                className="mt-1 w-full border border-border bg-bg px-3 py-2 font-body text-text outline-none focus:border-accent"
              >
                <option value="percentage">Percentage off</option>
                <option value="fixed">Fixed amount off (NPR)</option>
                {/* "Free delivery" is deliberately not offered any more: the
                    shop no longer bills delivery, so such a coupon would
                    discount nothing. Existing ones stay valid in the enum and
                    still redeem (as a zero discount) rather than erroring —
                    this only stops new ones being created. */}
                {form.type === "free_shipping" && (
                  <option value="free_shipping">Free delivery (retired)</option>
                )}
              </select>
            </label>

            {!isShipping && (
              <Num
                label={isPercent ? "Percent off *" : "Amount off (NPR) *"}
                value={form.value}
                onChange={(v) => set("value", v)}
                required
                min={0}
                max={isPercent ? 100 : undefined}
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Num
              label="Minimum order (NPR)"
              value={form.minOrderAmount}
              onChange={(v) => set("minOrderAmount", v)}
              min={0}
              placeholder="no minimum"
            />
            {isPercent && (
              <Num
                label="Max discount cap (NPR)"
                value={form.maxDiscount}
                onChange={(v) => set("maxDiscount", v)}
                min={1}
                placeholder="uncapped"
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Num
              label="Total redemptions allowed"
              value={form.usageLimit}
              onChange={(v) => set("usageLimit", v)}
              min={1}
              placeholder="unlimited"
            />
            <Num label="Per customer" value={form.perUserLimit} onChange={(v) => set("perUserLimit", v)} min={1} placeholder="1" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-data text-xs uppercase tracking-wide text-muted">Starts</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className="mt-1 w-full border border-border bg-bg px-3 py-2 font-data text-text outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="font-data text-xs uppercase tracking-wide text-muted">Ends</span>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className="mt-1 w-full border border-border bg-bg px-3 py-2 font-data text-text outline-none focus:border-accent"
              />
            </label>
          </div>
          <p className="font-body text-xs text-muted">Leave both dates empty to run the coupon until you switch it off.</p>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="space-y-3 border border-border bg-surface p-5">
            <h2 className="font-data text-xs uppercase tracking-[0.12em] text-muted">Availability</h2>
            <Check label="Active" checked={form.isActive} onChange={(v) => set("isActive", v)} hint="Off = nobody can redeem it." />
            <Check
              label="New customers only"
              checked={form.newUserOnly}
              onChange={(v) => set("newUserOnly", v)}
              hint="Blocks anyone with a previous order."
            />
          </div>

          <div className="border border-border bg-surface p-5">
            <h2 className="mb-1 font-data text-xs uppercase tracking-[0.12em] text-muted">Limit to genres</h2>
            <p className="mb-3 font-body text-xs text-muted">
              None selected = applies to the whole catalogue.
            </p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {genres.map((g) => (
                <label key={g.slug} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.applicableGenres.includes(g.slug)}
                    onChange={() => toggleGenre(g.slug)}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  <span className="font-body text-sm text-text">{g.name}</span>
                </label>
              ))}
              {genres.length === 0 && <p className="font-body text-sm text-muted">No genres loaded.</p>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-50"
            >
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

function Num({
  label,
  value,
  onChange,
  required,
  min,
  max,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-data text-xs uppercase tracking-wide text-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        min={min}
        max={max}
        placeholder={placeholder}
        className="mt-1 w-full border border-border bg-bg px-3 py-2 font-data text-text outline-none focus:border-accent"
      />
    </label>
  );
}

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
      <span>
        <span className="block font-body text-sm text-text">{label}</span>
        {hint && <span className="block font-body text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
