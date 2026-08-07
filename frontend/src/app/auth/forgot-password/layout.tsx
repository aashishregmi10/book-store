import { utilityMetadata } from "@/lib/seo";

export const metadata = utilityMetadata("/auth/forgot-password", "Forgot password");

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
