import { utilityMetadata } from "@/lib/seo";

export const metadata = utilityMetadata("/track", "Track your order");

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
