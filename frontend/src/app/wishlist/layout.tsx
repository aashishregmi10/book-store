import { utilityMetadata } from "@/lib/seo";

export const metadata = utilityMetadata("/wishlist", "Your wishlist");

export default function WishlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
