import { utilityMetadata } from "@/lib/seo";

export const metadata = utilityMetadata("/account", "My account");

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
