import Link from "next/link";

/**
 * The thin welcome strip above the header.
 *
 * Every claim here is one the shop already makes and can keep: genuine new
 * copies (there is no used stock), cash on delivery (the only way to pay), and
 * delivery to all 77 districts (the footer's promise, via Nepal Can Move).
 * Nothing about delivery cost — the courier sets and collects that, so the
 * shop doesn't advertise it (see services/pricing.js on the API).
 */
export function AnnouncementBar() {
  return (
    <div className="bg-text text-white">
      <div className="shell flex min-h-9 items-center justify-between gap-4 py-1.5">
        <p className="truncate font-body text-xs sm:text-sm">
          <span className="hidden md:inline">Welcome to Books Temple Nepal · </span>
          <span className="hidden sm:inline">Genuine new books, cash on delivery to all 77 districts</span>
          <span className="sm:hidden">Cash on delivery across Nepal</span>
        </p>
        <Link
          href="/track"
          className="shrink-0 font-body text-xs underline underline-offset-4 hover:text-white/80 sm:text-sm"
        >
          Track your order
        </Link>
      </div>
    </div>
  );
}
