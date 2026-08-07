import { utilityMetadata } from "@/lib/seo";

export const metadata = utilityMetadata("/register", "Create an account");

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
