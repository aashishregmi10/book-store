import { utilityMetadata } from "@/lib/seo";

export const metadata = utilityMetadata("/cart", "Your cart");

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
