import type { Metadata } from "next";
import Link from "next/link";

import { FAQS } from "@/lib/faq";
import { faqLd, breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "Questions about ordering books in Nepal",
  description:
    "How buying books from Books Temple Nepal works: cash on delivery, who charges the courier fee, delivery times to all seven provinces, cancellations and replacements.",
  alternates: { canonical: "/faq" },
};

// Standing answers change when the shop's policy changes, not on a timer.
export const revalidate = 86_400;

export default function FaqPage() {
  return (
    <>
      <JsonLd
        data={[
          faqLd(FAQS),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Questions", path: "/faq" },
          ]),
        ]}
      />

      <div className="shell max-w-3xl py-10">
        <nav aria-label="Breadcrumb" className="font-data text-xs uppercase tracking-wide text-muted">
          <Link href="/" className="hover:text-accent">Home</Link>
          <span className="px-2">/</span>
          <span className="text-text">Questions</span>
        </nav>

        <h1 className="mt-3 font-display text-4xl leading-tight text-text sm:text-5xl">
          Questions about ordering books in Nepal
        </h1>

        {/* BLUF: the three facts most people are actually here to check, in one
            extractable sentence, before any of the detail below. */}
        <p className="mt-5 border-l-2 border-accent pl-5 font-body text-lg leading-relaxed text-text">
          Books Temple Nepal delivers to all seven provinces, takes cash on delivery only, and prices
          every book in Nepali Rupees. Delivery is typically 1&ndash;2 days inside the Kathmandu
          Valley and 3&ndash;5 days elsewhere, with the courier charging its own fee at the door.
        </p>

        {/* A definition list, matching the book page's specs: it pairs each
            question with its answer structurally rather than by proximity,
            which is markedly easier to extract than a stack of headings. */}
        <dl className="mt-10 space-y-8">
          {FAQS.map((f) => (
            <div key={f.question} className="border-b border-border pb-8 last:border-0">
              <dt className="font-display text-xl leading-snug text-text">{f.question}</dt>
              <dd className="mt-3 font-body leading-relaxed text-muted">{f.answer}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 font-body text-sm text-muted">
          Still stuck?{" "}
          <Link href="/contact" className="text-accent underline underline-offset-4">
            Send us a message
          </Link>{" "}
          and a person will answer. Full details are in our{" "}
          <Link href="/terms" className="text-accent underline underline-offset-4">
            terms and returns
          </Link>
          .
        </p>
      </div>
    </>
  );
}
