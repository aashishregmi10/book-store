import Link from "next/link";

export function Footer() {
  return (
    <footer
      className="mt-24 border-t border-border/70"
      style={{ background: "color-mix(in srgb, var(--color-accent) 8%, var(--color-bg))" }}
    >
      <div className="mx-auto grid max-w-[1600px] gap-12 px-6 py-16 sm:px-8 lg:px-16 xl:px-24 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="font-display text-3xl font-semibold text-accent">PageTurn Nepal</div>
          <p className="mt-4 max-w-md font-body text-sm leading-relaxed text-muted">
            A bookshop for Nepali readers. Fifty thousand titles in English and Nepali, same-day delivery in
            Kathmandu, careful packaging to all 77 districts.
          </p>
          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-muted">Thapathali · Kathmandu · 44600</p>
        </div>

        <div>
          <div className="font-display text-sm uppercase tracking-[0.2em] text-text">Read</div>
          <ul className="mt-4 space-y-2 font-body text-sm text-muted">
            <li><Link href="/books" className="hover:text-accent">Catalogue</Link></li>
            <li><Link href="/genre/nepali-literature" className="hover:text-accent">Nepali literature</Link></li>
            <li><Link href="/blog" className="hover:text-accent">Reading guides</Link></li>
            <li><Link href="/account" className="hover:text-accent">Mystery box</Link></li>
          </ul>
        </div>

        <div>
          <div className="font-display text-sm uppercase tracking-[0.2em] text-text">Shop</div>
          <ul className="mt-4 space-y-2 font-body text-sm text-muted">
            <li><Link href="/about" className="hover:text-accent">Our story</Link></li>
            <li><Link href="/contact" className="hover:text-accent">Contact</Link></li>
            <li><Link href="/faq" className="hover:text-accent">FAQ</Link></li>
            <li><Link href="/account" className="hover:text-accent">Rewards &amp; tiers</Link></li>
            <li><a href="mailto:hello@pageturn.com.np" className="hover:text-accent">hello@pageturn.com.np</a></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-[1600px] flex-col items-start justify-between gap-2 px-6 py-6 font-body text-xs text-muted sm:px-8 lg:px-16 xl:px-24 md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} PageTurn Nepal Pvt. Ltd.</span>
          <span>NPR pricing · eSewa · Khalti · COD across all 77 districts</span>
        </div>
      </div>
    </footer>
  );
}
