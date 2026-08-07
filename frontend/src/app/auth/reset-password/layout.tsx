import { utilityMetadata } from "@/lib/seo";

// The token this page reads is a query param, not part of the path, so the
// canonical here deliberately omits it — a token-bearing URL should never be
// the "canonical" version of anything.
export const metadata = utilityMetadata("/auth/reset-password", "Reset password");

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
