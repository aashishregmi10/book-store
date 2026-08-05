import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Terms & Returns",
  description:
    "How ordering from Books Temple Nepal works: cash on delivery, courier charges, cancellations, and what happens if a book arrives damaged or wrong.",
  alternates: { canonical: "/terms" },
};

/**
 * These describe how the shop actually behaves today — COD only (enforced in
 * backend/src/routes/orders.route.js), delivery billed by the courier (see
 * services/pricing.js), cancellation allowed before dispatch (the cancel route
 * refuses anything past `processing`), and the no-general-returns stance
 * already declared in lib/seo.ts as MerchantReturnNotPermitted.
 *
 * Keep them in step with that code. Worth a lawyer's eye before relying on them
 * in a dispute.
 */
const LAST_UPDATED = "5 August 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="label-smallcaps font-data text-xs">Legal</p>
      <h1 className="mt-3 font-display text-4xl leading-tight text-text sm:text-5xl">Terms &amp; Returns</h1>
      <p className="mt-3 font-data text-sm text-muted">Last updated {LAST_UPDATED}</p>

      <div className="mt-10 space-y-10 font-body text-base leading-relaxed text-text">
        <p className="text-lg">
          Plain version: you order, we pack it, a courier brings it, you pay cash at the door. If we get it
          wrong, we fix it.
        </p>

        <Section title="Ordering">
          <p>
            Placing an order is an offer to buy, which we accept when we dispatch it. We may decline an
            order — if a title turns out to be unavailable, if the address is outside what our courier can
            reach, or if something looks fraudulent. Prices are in Nepali Rupees and can change, but the
            price shown when you order is the price you pay us.
          </p>
        </Section>

        <Section title="Payment">
          <p>
            Cash on delivery only, for now. You pay the courier when the parcel reaches you. We do not take
            card or online payment, and we will never ask you for card details over the phone or by email.
          </p>
        </Section>

        <Section title="Delivery charges">
          <p>
            The order total covers the books. The courier charges its own delivery fee at handover, set by
            them and varying with where the parcel is going — we neither set that amount nor collect it.
          </p>
          <p className="mt-3">
            Typically 1–2 days inside the Kathmandu Valley and 3–5 days elsewhere in Nepal. Those are
            estimates from the courier, not guarantees.
          </p>
        </Section>

        <Section title="Cancelling">
          <p>
            You can cancel free of charge any time before the parcel is dispatched, from{" "}
            <Link href="/account" className="text-link underline-offset-4 hover:underline">
              your account
            </Link>
            . Once it has shipped it can no longer be cancelled from the site — write to us instead. Any
            reward points you spent on a cancelled order are returned to your balance.
          </p>
        </Section>

        <Section title="If something is wrong with your book">
          <p>
            We do not run general change-of-mind returns — margins on books here do not support it, and
            you pay only once you have the parcel in hand, so you can decline it at the door.
          </p>
          <p className="mt-3">
            But if a book arrives <strong>damaged</strong>, or it is <strong>not the book you ordered</strong>,
            that is our problem, not yours. Tell us within <strong>7 days</strong> with a photo and we will
            replace it or refund you in full, including any delivery you were charged. No argument.
          </p>
        </Section>

        <Section title="Reward points">
          <p>
            Points are earned on completed purchases and can be spent against future orders. They have no
            cash value, cannot be transferred, and are reversed if the order that earned them is cancelled
            or refunded. We may adjust the earn rate, and will say so if we do.
          </p>
        </Section>

        <Section title="Reviews and questions">
          <p>
            Only verified buyers can review a book. Keep it about the book: we remove anything abusive, or
            posted to advertise something else. What you post is public under your display name.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            Keep your password to yourself — you are responsible for what happens under your account. Tell
            us if you think someone else has got into it. We may suspend an account that is being used to
            defraud us or to abuse other customers.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Books Temple Nepal, Kathmandu, Nepal ·{" "}
            <a href={`mailto:${SITE.email}`} className="text-link underline-offset-4 hover:underline">
              {SITE.email}
            </a>
            <br />
            See also our{" "}
            <Link href="/privacy" className="text-link underline-offset-4 hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-8">
      <h2 className="font-display text-2xl text-text">{title}</h2>
      <div className="mt-3 space-y-3 text-muted">{children}</div>
    </section>
  );
}
