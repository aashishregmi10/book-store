import type { Metadata } from "next";
import { SITE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Return & Refund Policy",
  description: "How returns, exchanges and refunds work at Books Temple Nepal.",
  alternates: { canonical: "/return-policy" },
};

export default function ReturnPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="label-smallcaps font-data text-xs">Legal</p>
      <h1 className="mt-3 font-display text-4xl leading-tight text-text sm:text-5xl">
        Return &amp; Refund Policy
      </h1>

      <div className="mt-10 space-y-10 font-body text-base leading-relaxed text-text">
        <p className="text-lg">
          If we send you a damaged book or the wrong title, we will make it right. We do not accept
          general change-of-mind returns.
        </p>

        <Section title="Damaged or incorrect books">
          <p>
            Contact us within <strong>2 days of delivery</strong> if a book arrives damaged or is not
            the book you ordered. Include your order number and a clear photo so we can review the
            issue. Please contact us before sending anything back.
          </p>
          <p>
            Once we confirm the issue, we will arrange a replacement or a full refund. If you paid a
            delivery charge for the order, it is included in the refund.
          </p>
        </Section>

        <Section title="Change-of-mind returns and exchanges">
          <p>
            We cannot accept returns just because you changed your mind, and we do not offer
            exchanges for a different title. If the book is damaged or incorrect, contact us under
            the policy above and we will arrange a replacement or refund.
          </p>
        </Section>

        <Section title="Refunds">
          <p>
            Orders are currently paid by cash on delivery. If your refund is approved, we will
            contact you to arrange how it is paid. We will confirm the method and timing with you
            when we approve the refund.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Email{" "}
            <a href={`mailto:${SITE.email}`} className="text-link underline-offset-4 hover:underline">
              {SITE.email}
            </a>{" "}
            or call{" "}
            <a
              href={`tel:${SITE.phone.replace(/[^+\d]/g, "")}`}
              className="text-link underline-offset-4 hover:underline"
            >
              {SITE.phone}
            </a>
            . You can also reach us through our{" "}
            <a href="/contact" className="text-link underline-offset-4 hover:underline">
              contact page
            </a>
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
