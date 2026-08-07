import type { Metadata } from "next";
import { Mail, MessageCircle, Clock, Truck } from "lucide-react";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  // Trimmed to fit inside Google's ~155-160 char SERP snippet — the previous
  // copy (175 chars) risked being cut mid-sentence.
  description:
    "Get in touch with Books Temple Nepal. Email or message us about an order, a book request, or trade enquiries. Cash on delivery across Nepal.",
  alternates: { canonical: "/contact" },
};

// Set NEXT_PUBLIC_CONTACT_PHONE to the shop's real number (E.164, e.g.
// +9779800000000) to show the phone/WhatsApp row. It is deliberately hidden
// while unset: the page previously shipped a literal "+977 1-4XXXXXX"
// placeholder wired to a tel: link, so anyone who tapped it dialled nonsense.
const PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE;

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      {/* The page had no heading at all — no <h1> for readers or for search. */}
      <h1 className="font-display text-4xl leading-tight text-text sm:text-5xl">Talk to a bookseller.</h1>
      <p className="mt-3 max-w-xl font-body text-lg leading-relaxed text-muted">
        Question about an order, after a title we don&apos;t stock, or buying in bulk? Send a note and
        a person will read it.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* Ways to reach us */}
        <div className="space-y-3">
          <Channel icon={Mail} title="Email" detail="bookstemple01@gmail.com" href="mailto:bookstemple01@gmail.com" />
          {PHONE && (
            <Channel
              icon={MessageCircle}
              title="Phone / WhatsApp"
              detail={PHONE}
              href={`tel:${PHONE.replace(/[^+\d]/g, "")}`}
            />
          )}
          <Channel icon={Clock} title="Reply time" detail="Within a day, Sun–Fri" />
          <Channel icon={Truck} title="Delivery" detail="All 77 districts" />
        </div>

        {/* Form */}
        <ContactForm />
      </div>
    </div>
  );
}

function Channel({ icon: Icon, title, detail, href }: { icon: typeof Mail; title: string; detail: string; href?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10">
        <Icon className="size-4 text-accent" />
      </span>
      <div className="min-w-0">
        <p className="font-data text-xs uppercase tracking-wide text-muted">{title}</p>
        {href ? (
          <a href={href} className="font-body text-sm text-text hover:text-accent">{detail}</a>
        ) : (
          <p className="font-body text-sm text-text">{detail}</p>
        )}
      </div>
    </div>
  );
}
