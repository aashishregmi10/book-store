import type { Metadata } from "next";

/**
 * Metadata boundary for the admin dashboard.
 *
 * This layout exists only to carry metadata. The layout that actually renders
 * the dashboard, `(dash)/layout.tsx`, is a Client Component, and a Client
 * Component cannot export `metadata` — so without this file every /admin URL
 * silently inherited the root layout's `canonical: "/"` and `index, follow`,
 * i.e. a dozen private URLs each telling Google they were the homepage.
 *
 * `follow: false` as well as `index: false`: unlike the storefront's utility
 * pages, nothing behind the dashboard is worth crawling onward to.
 */
export const metadata: Metadata = {
  title: { absolute: "Admin | Books Temple Nepal" },
  alternates: { canonical: "/admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
