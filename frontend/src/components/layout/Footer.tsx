import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/lib/seo";

// Brand marks are inlined rather than imported: lucide dropped its brand icon
// set (no Facebook/Instagram/TikTok exports), and third-party logos are
// trademarks that shouldn't be redrawn by an icon library anyway.
type IconProps = { className?: string };

function FacebookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
    </svg>
  );
}

function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .77-5.06V9.7a5.69 5.69 0 0 0-.77-.05 5.66 5.66 0 1 0 5.66 5.66V9.01a7.35 7.35 0 0 0 4.29 1.38V7.3a4.29 4.29 0 0 1-3.21-1.48Z" />
    </svg>
  );
}

const SOCIALS = [
  { href: SITE.social.facebook, label: "Books Temple Nepal on Facebook", Icon: FacebookIcon },
  { href: SITE.social.instagram, label: "Books Temple Nepal on Instagram", Icon: InstagramIcon },
  { href: SITE.social.tiktok, label: "Books Temple Nepal on TikTok", Icon: TikTokIcon },
];

export function Footer() {
  return (
    <footer
      className="mt-24 border-t border-border/70"
      style={{ background: "color-mix(in srgb, var(--color-accent) 8%, var(--color-bg))" }}
    >
      <div className="shell grid gap-12 py-16 md:grid-cols-4">
        <div className="md:col-span-2">
          {/* Full lockup here — the footer has room for the "Online Bookstore"
              subtitle that has to be cropped out of the header at 32px. */}
          <Image
            src="/logo-full.png"
            alt="Books Temple Nepal, online bookstore"
            width={1200}
            height={427}
            className="h-16 w-auto sm:h-20"
          />
          <p className="mt-4 max-w-md font-body text-sm leading-relaxed text-muted">
            A bookshop for Nepali readers. Over 2,000 titles in English and Nepali, carefully packed and
            carried to all 77 districts.
          </p>

          <ul className="mt-6 flex items-center gap-3">
            {SOCIALS.map(({ href, label, Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={label}
                  className="grid size-11 place-items-center rounded-full border border-border text-text transition-colors hover:border-accent hover:text-accent"
                >
                  <Icon className="size-5" />
                </a>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-muted">Kathmandu · Nepal</p>
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
            <li><Link href="/account" className="hover:text-accent">Rewards &amp; tiers</Link></li>
            <li><Link href="/track" className="hover:text-accent">Track an order</Link></li>
            <li><Link href="/terms" className="hover:text-accent">Terms &amp; returns</Link></li>
            <li><Link href="/privacy" className="hover:text-accent">Privacy</Link></li>
            <li><a href={`mailto:${SITE.email}`} className="hover:text-accent">{SITE.email}</a></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border/60">
        <div className="shell flex flex-col items-start justify-between gap-2 py-6 font-body text-xs text-muted md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} Books Temple Nepal Pvt. Ltd.</span>
          <span>NPR pricing · Cash on Delivery across all 77 districts</span>
        </div>
      </div>
    </footer>
  );
}
