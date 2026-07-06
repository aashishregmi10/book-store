import type { Metadata } from "next";
import { Montserrat, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ChromeGate } from "@/components/layout/ChromeGate";
import { PWARegister } from "@/components/PWARegister";
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Buy Books Online in Nepal | PageTurn Nepal",
    template: "%s | PageTurn Nepal",
  },
  description: SITE.description,
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    siteName: SITE.name,
    url: SITE.url,
    title: "Buy Books Online in Nepal | PageTurn Nepal",
    description: SITE.description,
  },
  twitter: { card: "summary_large_image", site: SITE.twitter },
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        {/* Speed up the LCP cover image (covers are served from Cloudinary). */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="" />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-text">
        <ChromeGate>{children}</ChromeGate>
        <PWARegister />
      </body>
    </html>
  );
}
