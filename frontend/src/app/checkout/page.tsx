"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { useCart } from "@/lib/stores/cart";
import { useAuth } from "@/lib/stores/auth";
import { useAuthModal } from "@/lib/stores/authModal";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { isNepaliPhone } from "@/lib/phone";

// Mirrors POINTS_REDEMPTION_ENABLED in backend/src/services/pricing.js, which
// is the authority — pricing is computed server-side and a redeem request is
// ignored there regardless of what this page shows. This flag only decides
// whether the customer is offered a control that would work. Flip both together.
const POINTS_REDEMPTION_ENABLED = false;

const PROVINCES = ["Koshi", "Madhesh", "Bagmati", "Gandaki", "Lumbini", "Karnali", "Sudurpashchim"];
// Only one delivery speed is offered right now, so there's nothing for a
// shopper to choose — "standard" is sent as a fixed value, not a picked one.
const DELIVERY_METHOD = "standard";

interface Priced {
  subtotal: number;
  deliveryFee: number;
  total: number;
  pointsEarned: number;
  pointsUsed: number;
  pointsDiscount: number;
  couponCode: string | null;
  couponDiscount: number;
  couponError: string | null;
  issues: { message: string }[];
}

export default function CheckoutPage() {
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const openLogin = useAuthModal((s) => s.openLogin);

  const [priced, setPriced] = useState<Priced | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  // Two states, not one: `codeInput` is what's being typed, `appliedCode` is
  // what the server has been asked to price. Re-pricing on every keystroke
  // would fire a request per character and flash "Invalid coupon" at someone
  // halfway through typing a valid one.
  const [codeInput, setCodeInput] = useState("");
  const [appliedCode, setAppliedCode] = useState("");

  // Points are opt-in: a shopper saving them for a bigger book shouldn't have
  // the balance spent for them. The server clamps whatever we send.
  const [usePoints, setUsePoints] = useState(false);
  const balance = user?.points ?? 0;

  const [addr, setAddr] = useState({ fullName: "", phone: "", address1: "", address2: "", city: "", province: "Bagmati" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof addr, string>>>({});
  const set = (k: keyof typeof addr) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setAddr((a) => ({ ...a, [k]: e.target.value }));
    setFieldErrors((fe) => (fe[k] ? { ...fe, [k]: undefined } : fe));
  };

  // Authoritative pricing from the server whenever items / coupon change.
  useEffect(() => {
    if (items.length === 0) return;
    const payload = {
      items: items.map((i) => ({ bookId: i.bookId, variantId: i.variantId, quantity: i.quantity })),
      deliveryMethod: DELIVERY_METHOD,
      couponCode: appliedCode || undefined,
      pointsUsed: usePoints ? balance : 0,
    };
    clientApi.post<Priced>("/cart/validate", payload).then(setPriced).catch(() => setPriced(null));
  }, [items, appliedCode, usePoints, balance]);

  if (orderNumber) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <PartyPopper className="mx-auto size-12 text-accent" />
        <h1 className="mt-4 font-display text-4xl text-text">Order placed!</h1>
        <p className="mt-2 font-body text-muted">
          Thank you. Your order <span className="font-data text-text">{orderNumber}</span> is confirmed, pay cash when it arrives.
        </p>
        {/* Guests get a tracking route too. They used to be handed an order
            number with nowhere to type it — "Track order" only rendered for
            signed-in users, and every order read required a session. */}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={user ? "/account" : "/track"}
            className="bg-accent px-5 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover"
          >
            Track order
          </Link>
          <Link href="/books" className="border border-border px-5 py-3 font-data text-sm uppercase tracking-wide text-text hover:border-accent">Keep browsing</Link>
        </div>
        {!user && (
          <p className="mt-4 font-body text-sm text-muted">
            Keep that number: you can check on your order any time with it and your phone number.
          </p>
        )}
      </div>
    );
  }

  // Auth is still rehydrating from storage. Render nothing rather than flash
  // the sign-in wall at someone who is already signed in.
  if (!hydrated) {
    return <div className="mx-auto h-64 max-w-2xl px-4 sm:px-6" aria-hidden />;
  }

  // Checkout needs an account: the order has to belong to someone who can
  // then track it and earn points on it. Add to cart is gated the same way,
  // so in practice only a cart persisted from before this rule reaches here.
  // Checked before the empty-cart branch so the message is the actionable one.
  if (!token) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-3xl text-text">Sign in to finish your order</h1>
        <p className="mt-2 font-body text-muted">
          Your books are saved. Signing in keeps the order in your account, so you can track it and collect points on it.
        </p>
        <button
          onClick={() => openLogin("/checkout")}
          className="mt-6 inline-block bg-accent px-6 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover"
        >
          Sign in
        </button>
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
    else if (!isNepaliPhone(addr.phone)) fe.phone = "Enter a valid Nepali phone number, e.g. 9801234567.";
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
        deliveryMethod: DELIVERY_METHOD,
        paymentMethod: "cod",
        // Only send a code the server has already accepted, so a rejected one
        // can't fail the whole order at the last step.
        couponCode: priced?.couponCode || undefined,
        pointsUsed: usePoints ? balance : 0,
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

          <h2 className="pt-2 font-display text-xl text-text">Have a coupon?</h2>
          {priced?.couponCode ? (
            <div className="flex items-center justify-between border border-accent bg-accent/5 px-4 py-3">
              <span className="font-data text-sm uppercase tracking-[0.12em] text-accent">{priced.couponCode} applied</span>
              <button
                type="button"
                onClick={() => {
                  setAppliedCode("");
                  setCodeInput("");
                }}
                className="font-data text-xs uppercase tracking-wide text-muted hover:text-sale"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  // The coupon box lives inside the checkout form, so a bare
                  // Enter here would submit the order instead of applying.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setAppliedCode(codeInput.trim());
                  }
                }}
                placeholder="Enter code"
                aria-label="Coupon code"
                className="min-w-0 flex-1 border border-border bg-surface px-3 py-2.5 font-data uppercase tracking-[0.12em] text-text outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setAppliedCode(codeInput.trim())}
                disabled={!codeInput.trim()}
                className="border border-accent px-5 py-2.5 font-data text-sm uppercase tracking-wide text-accent hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-accent"
              >
                Apply
              </button>
            </div>
          )}
          {priced?.couponError && <p className="font-body text-sm text-sale">{priced.couponError}</p>}

          {/* Redemption is paused while the launch discount runs (see
              POINTS_REDEMPTION_ENABLED in backend services/pricing.js). Points
              still accrue, so the balance is worth showing — but offering a
              checkbox the server will ignore would read as a broken checkout.
              Say plainly that they are banked instead. */}
          {user && balance > 0 && !POINTS_REDEMPTION_ENABLED && (
            <>
              <h2 className="pt-2 font-display text-xl text-text">Your points</h2>
              <p className="border border-border px-4 py-3 font-body text-sm text-muted">
                You have <span className="text-text">{balance} points</span> saved up. Spending them
                is paused for now while every book carries a launch discount, and they keep adding
                up in the meantime.
              </p>
            </>
          )}

          {user && balance > 0 && POINTS_REDEMPTION_ENABLED && (
            <>
              <h2 className="pt-2 font-display text-xl text-text">Your points</h2>
              <label className="flex cursor-pointer items-start gap-3 border border-border px-4 py-3 has-[:checked]:border-accent">
                <input
                  type="checkbox"
                  checked={usePoints}
                  onChange={(e) => setUsePoints(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-accent)]"
                />
                <span>
                  <span className="block font-body text-sm text-text">
                    Put my {balance} points towards this order
                  </span>
                  <span className="block font-body text-xs text-muted">
                    Worth {npr(balance)}. Whatever you don&apos;t spend stays on your account.
                  </span>
                </span>
              </label>
            </>
          )}
        </div>

        <aside className="h-fit border border-border bg-surface p-6">
          <h2 className="font-display text-xl text-text">Order summary</h2>
          <dl className="mt-4 space-y-2 font-data text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="text-text">{priced ? npr(priced.subtotal) : "…"}</dd></div>
            {priced && priced.couponDiscount > 0 && (
              <div className="flex justify-between text-accent"><dt>Discount ({priced.couponCode})</dt><dd>−{npr(priced.couponDiscount)}</dd></div>
            )}
            {priced && priced.pointsDiscount > 0 && (
              <div className="flex justify-between text-accent"><dt>Points ({priced.pointsUsed})</dt><dd>−{npr(priced.pointsDiscount)}</dd></div>
            )}
            {/* No Delivery line. The courier bills its own rate directly, so
                any figure here — including "Free" — would be one we neither
                set nor collect. The note below says who to expect it from
                instead of quietly leaving a gap in the maths. */}
            <div className="flex justify-between border-t border-border pt-2 text-base"><dt className="font-semibold text-text">Total</dt><dd className="font-semibold text-text">{priced ? npr(priced.total) : "…"}</dd></div>
          </dl>
          <p className="mt-3 font-body text-xs leading-relaxed text-muted">
            This is the price of the books. The courier charges its own delivery fee on
            handover, based on where the parcel is going.
          </p>
          {priced?.issues?.length ? (
            <ul className="mt-3 space-y-1">
              {priced.issues.map((iss, n) => <li key={n} className="font-body text-xs text-sale">{iss.message}</li>)}
            </ul>
          ) : null}
          {user && priced && priced.pointsEarned > 0 && (
            <p className="mt-3 font-body text-xs text-accent">
              You’ll earn {priced.pointsEarned} points on this order: {npr(priced.pointsEarned)} off a future one.
            </p>
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
