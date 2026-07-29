import type { Metadata } from "next";
import { Montserrat, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ChromeGate } from "@/components/layout/ChromeGate";
import { PWARegister } from "@/components/PWARegister";
import { Analytics } from "@/components/Analytics";
import { apiGet } from "@/lib/api";
import type { Genre } from "@/lib/types";
import { SITE } from "@/lib/seo";

// Single type family for headings + body (matches can-logistic's Montserrat).
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

// Origin only — preconnect ignores any path, and NEXT_PUBLIC_API_URL carries
// a trailing /api. Falsy (and so skipped) when the URL is unset or malformed.
const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "").origin;
  } catch {
    return null;
  }
})();

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Buy Books Online in Nepal | Books Temple Nepal",
    template: "%s | Books Temple Nepal",
  },
  description: SITE.description,
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    siteName: SITE.name,
    url: SITE.url,
    title: "Buy Books Online in Nepal | Books Temple Nepal",
    description: SITE.description,
  },
  // Card type only — there is no X/Twitter account to attribute to, and a
  // `site` handle that isn't ours would credit someone else's profile.
  twitter: { card: "summary_large_image" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  verification: {
    ...(process.env.NEXT_PUBLIC_GSC_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GSC_VERIFICATION } : {}),
    ...(process.env.NEXT_PUBLIC_BING_VERIFICATION ? { other: { "msvalidate.01": process.env.NEXT_PUBLIC_BING_VERIFICATION } } : {}),
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Genres power the header's Category mega-menu. Fetched here so the links are
  // in the server HTML of every page — the genre silo relies on those internal
  // links being crawlable. An API outage degrades the menu to a plain /books
  // link rather than failing the page.
  //
  // The `genres` tag is kept for on-demand invalidation, but note nothing in
  // the app calls revalidateTag today, so a tag alone would cache this fetch
  // indefinitely and a newly added genre would never reach the header. The
  // hourly window makes it self-heal regardless.
  const genres = await apiGet<Genre[]>("/genres", { tags: ["genres"], revalidate: 3600 }).catch(
    () => [] as Genre[]
  );

  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        {/* Speed up the LCP cover image (covers are served from Cloudinary). */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="" />
        {/* Sign-in latency is dominated by round trips to these two origins:
            Google Identity Services for the button, and our own API for the
            token exchange. Warm the TCP + TLS handshakes before either is hit. */}
        <link rel="preconnect" href="https://accounts.google.com" crossOrigin="" />
        {API_ORIGIN && <link rel="preconnect" href={API_ORIGIN} crossOrigin="" />}
      </head>
      <body className="flex min-h-full flex-col bg-bg text-text">
        <ChromeGate genres={genres}>{children}</ChromeGate>
        <PWARegister />
        <Analytics />
      </body>
    </html>
  );
}
