"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { useCart } from "@/lib/stores/cart";
import { useAuth } from "@/lib/stores/auth";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { npr } from "@/lib/format";

const PROVINCES = ["Koshi", "Madhesh", "Bagmati", "Gandaki", "Lumbini", "Karnali", "Sudurpashchim"];
const METHODS = [
  { id: "standard", label: "Standard (3–5 days)" },
  { id: "express", label: "Express (1–2 days, Valley)" },
  { id: "same-day", label: "Same-day (Valley, order by 2pm)" },
];

interface Priced {
  subtotal: number;
  deliveryFee: number;
  total: number;
  pointsEarned: number;
  issues: { message: string }[];
}

export default function CheckoutPage() {
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const user = useAuth((s) => s.user);

  const [method, setMethod] = useState("standard");
  const [priced, setPriced] = useState<Priced | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const [addr, setAddr] = useState({ fullName: "", phone: "", address1: "", address2: "", city: "", province: "Bagmati" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof addr, string>>>({});
  const set = (k: keyof typeof addr) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setAddr((a) => ({ ...a, [k]: e.target.value }));
    setFieldErrors((fe) => (fe[k] ? { ...fe, [k]: undefined } : fe));
  };

  // Authoritative pricing from the server whenever items / method change.
  useEffect(() => {
    if (items.length === 0) return;
    const payload = { items: items.map((i) => ({ bookId: i.bookId, variantId: i.variantId, quantity: i.quantity })), deliveryMethod: method };
    clientApi.post<Priced>("/cart/validate", payload).then(setPriced).catch(() => setPriced(null));
  }, [items, method]);

  if (orderNumber) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <PartyPopper className="mx-auto size-12 text-accent" />
        <h1 className="mt-4 font-display text-4xl text-text">Order placed!</h1>
        <p className="mt-2 font-body text-muted">
          Thank you. Your order <span className="font-data text-text">{orderNumber}</span> is confirmed — pay cash when it arrives.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {user && <Link href="/account" className="bg-accent px-5 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">Track order</Link>}
          <Link href="/books" className="border border-border px-5 py-3 font-data text-sm uppercase tracking-wide text-text hover:border-accent">Keep browsing</Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-3xl text-text">Your cart is empty</h1>
        <Link href="/books" className="mt-6 inline-block bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover">Browse the shelves</Link>
      </div>
    );
  }

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const fe: Partial<Record<keyof typeof addr, string>> = {};
    if (!addr.fullName.trim()) fe.fullName = "Full name is required.";
    if (!addr.phone.trim()) fe.phone = "Phone number is required.";
    else if (addr.phone.replace(/\D/g, "").length < 7) fe.phone = "Enter a valid phone number.";
    if (!addr.address1.trim()) fe.address1 = "Address is required.";
    if (!addr.city.trim()) fe.city = "City is required.";
    if (Object.keys(fe).length) {
      setFieldErrors(fe);
      return;
    }
    setFieldErrors({});
    setPlacing(true);
    try {
      const data = await clientApi.post<{ order: { orderNumber: string } }>("/orders", {
        items: items.map((i) => ({ bookId: i.bookId, variantId: i.variantId, quantity: i.quantity })),
        deliveryAddress: addr,
        deliveryMethod: method,
        paymentMethod: "cod",
      });
      clear();
      setOrderNumber(data.order.orderNumber);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Couldn’t place the order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <form onSubmit={placeOrder} className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl text-text">Checkout</h1>
      {!user && (
        <p className="mt-2 font-body text-sm text-muted">
          Checking out as a guest. <Link href="/login?next=/checkout" className="text-accent underline-offset-4 hover:underline">Sign in</Link> to earn points.
        </p>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <h2 className="font-display text-xl text-text">Delivery details</h2>
          {error && <p className="border border-sale/40 bg-sale/5 px-3 py-2 font-body text-sm text-sale">{error}</p>}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" value={addr.fullName} onChange={set("fullName")} required error={fieldErrors.fullName} />
            <Field label="Phone (+977)" value={addr.phone} onChange={set("phone")} required error={fieldErrors.phone} />
            <div className="sm:col-span-2"><Field label="Address" value={addr.address1} onChange={set("address1")} required error={fieldErrors.address1} /></div>
            <div className="sm:col-span-2"><Field label="Apartment, landmark (optional)" value={addr.address2} onChange={set("address2")} /></div>
            <Field label="City" value={addr.city} onChange={set("city")} required error={fieldErrors.city} />
            <label className="block">
              <span className="font-data text-xs uppercase tracking-wide text-muted">Province</span>
              <select value={addr.province} onChange={set("province")} className="mt-1 w-full border border-border bg-surface px-3 py-2.5 font-body text-text outline-none focus:border-accent">
                {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>

          <h2 className="pt-2 font-display text-xl text-text">Delivery method</h2>
          <div className="space-y-2">
            {METHODS.map((m) => (
              <label key={m.id} className={`flex cursor-pointer items-center gap-3 border px-4 py-3 ${method === m.id ? "border-accent" : "border-border"}`}>
                <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} className="accent-[var(--color-accent)]" />
                <span className="font-body text-sm text-text">{m.label}</span>
              </label>
            ))}
          </div>
        </div>

        <aside className="h-fit border border-border bg-surface p-6">
          <h2 className="font-display text-xl text-text">Order summary</h2>
          <dl className="mt-4 space-y-2 font-data text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="text-text">{priced ? npr(priced.subtotal) : "…"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="text-text">{priced ? (priced.deliveryFee === 0 ? "Free" : npr(priced.deliveryFee)) : "…"}</dd></div>
            <div className="flex justify-between border-t border-border pt-2 text-base"><dt className="font-semibold text-text">Total</dt><dd className="font-semibold text-text">{priced ? npr(priced.total) : "…"}</dd></div>
          </dl>
          {priced?.issues?.length ? (
            <ul className="mt-3 space-y-1">
              {priced.issues.map((iss, n) => <li key={n} className="font-body text-xs text-sale">{iss.message}</li>)}
            </ul>
          ) : null}
          {user && priced && priced.pointsEarned > 0 && (
            <p className="mt-3 font-body text-xs text-accent">You’ll earn {priced.pointsEarned} points.</p>
          )}
          <button type="submit" disabled={placing || !!priced?.issues?.length} className="mt-5 w-full bg-accent px-5 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-50">
            {placing ? "Placing order…" : "Place order (COD)"}
          </button>
        </aside>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, required, error }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; required?: boolean; error?: string }) {
  return (
    <label className="block">
      <span className="font-data text-xs uppercase tracking-wide text-muted">
        {label} {required && <span className="text-sale">*</span>}
      </span>
      <input
        value={value}
        onChange={onChange}
        aria-required={required}
        aria-invalid={!!error}
        className={`mt-1 w-full border bg-surface px-3 py-2.5 font-body text-text outline-none focus:border-accent ${error ? "border-sale" : "border-border"}`}
      />
      {error && <span className="mt-1 block font-body text-xs text-sale">{error}</span>}
    </label>
  );
}
