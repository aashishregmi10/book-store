import { utilityMetadata } from "@/lib/seo";

export const metadata = utilityMetadata("/checkout", "Checkout");

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
