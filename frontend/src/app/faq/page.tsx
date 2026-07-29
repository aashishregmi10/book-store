import type { Metadata } from "next";
import Link from "next/link";
import { faqLd, breadcrumbLd, speakable, SITE } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "FAQ — Ordering, Delivery & Payment",
  description:
    "Answers about ordering books online in Nepal: delivery times, cash on delivery, payment methods, returns, and areas served.",
  alternates: { canonical: "/faq" },
};

// These are the exact questions answer engines field for a Nepal bookshop.
const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I order books online in Nepal?",
    a: "Browse the catalogue at Books Temple Nepal, add books to your cart, and check out with your delivery address. You can pay cash on delivery, so no card or online payment is needed to place an order.",
  },
  {
    q: "Do you deliver across all of Nepal?",
    a: "Yes. We deliver to all seven provinces and every one of Nepal's 77 districts. Delivery takes 1–2 days inside the Kathmandu Valley and 3–5 business days to the rest of the country.",
  },
  {
    q: "Is cash on delivery available?",
    a: "Yes — cash on delivery (COD) is available everywhere we ship. You pay the courier when your books arrive at your door.",
  },
  {
    q: "What payment methods do you accept?",
    a: "Cash on delivery is our only payment method right now — pay the courier in cash when your books arrive, anywhere in Nepal.",
  },
  {
    q: "How much does delivery cost?",
    a: "Delivery is free on orders over NPR 1,500. Below that, a flat fee of NPR 120 applies anywhere in Nepal.",
  },
  {
    q: "What if my book arrives damaged or wrong?",
    a: "Every order is carefully checked and packed before it ships. If a book arrives damaged or you received the wrong title, email us at hello@bookstemplenepal.com with a photo and we'll make it right with a replacement.",
  },
  {
    q: "Are the books new or used?",
    a: "Almost all titles are brand new. Where a book is used, it is clearly marked as 'Used' on its product page.",
  },
  {
    q: "Do you sell Nepali-language books?",
    a: "Yes — we stock Nepali literature and Nepali-language titles alongside English books. Filter the catalogue by language to see them.",
  },
  {
    q: "How do I track my order?",
    a: "Sign in and open your account to see your recent orders and their status. We also email status updates as your order moves from placed to delivered.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:px-8">
      <JsonLd
        data={[
          faqLd(FAQS),
          breadcrumbLd([{ name: "Home", path: "/" }, { name: "FAQ", path: "/faq" }]),
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Books Temple Nepal — FAQ",
            url: `${SITE.url}/faq`,
            speakable: speakable(".faq-q", ".faq-a"),
          },
        ]}
      />

      <p className="label-smallcaps font-data text-xs">Help</p>
      <h1 className="mt-2 font-display text-4xl text-text sm:text-5xl">Frequently asked questions</h1>
      <p className="mt-3 font-body text-lg leading-relaxed text-muted">
        Everything about ordering books online in Nepal — delivery, payment, and returns.
      </p>

      <dl className="mt-10 divide-y divide-border border-t border-border">
        {FAQS.map((f) => (
          <div key={f.q} className="py-6">
            <dt className="faq-q font-display text-xl text-text">{f.q}</dt>
            <dd className="faq-a mt-2 font-body leading-relaxed text-muted">{f.a}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-10 font-body text-muted">
        Still stuck?{" "}
        <Link href="/contact" className="text-accent hover:underline">Get in touch</Link> — we reply within a day.
      </p>
    </div>
  );
}
