import type { Metadata } from "next";

// Keep the admin sign-in out of every index. Note this is deliberately NOT in
// robots.txt — that file is public, so a Disallow rule there would broadcast
// the very path we moved off /admin to keep quiet. A noindex on the page keeps
// it out of results without naming it anywhere a crawler can read up front.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};

export default function OneechanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
