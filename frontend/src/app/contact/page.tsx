import type { Metadata } from "next";
import { Mail, MessageCircle, Clock, Truck } from "lucide-react";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with PageTurn Nepal — an online bookshop. Email or message us about an order, a book request, or trade enquiries. Cash on delivery across all seven provinces.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">


      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* Ways to reach us */}
        <div className="space-y-3">
          <Channel icon={Mail} title="Email" detail="hello@pageturn.com.np" href="mailto:hello@pageturn.com.np" />
          <Channel icon={MessageCircle} title="Phone / WhatsApp" detail="+977 1-4XXXXXX" href="tel:+97714XXXXXX" />
          <Channel icon={Clock} title="Reply time" detail="Within a day, Sun–Fri" />
          <Channel icon={Truck} title="Delivery" detail="All 77 districts · same-day in the Valley" />
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
