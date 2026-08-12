import type { Metadata } from "next";

// Keep the admin sign-in out of every index. This is deliberately NOT in
// robots.txt — that file is public, so a Disallow rule there would broadcast
// the very path we moved off /admin to keep quiet, and would also stop crawlers
// fetching the page to read the noindex below. A noindex keeps it out of results
// without naming it anywhere a crawler can read up front. (robots.ts listed it
// for a while, which defeated both halves of that; it has been removed.)
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};

export default function OneechanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
