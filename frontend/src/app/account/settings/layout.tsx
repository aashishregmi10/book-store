import { utilityMetadata } from "@/lib/seo";

// Overrides the parent app/account/layout.tsx metadata for this segment.
export const metadata = utilityMetadata("/account/settings", "Account settings");

export default function AccountSettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
