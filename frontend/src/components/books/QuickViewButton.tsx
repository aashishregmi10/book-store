"use client";

import { Eye } from "lucide-react";
import { useQuickView } from "@/lib/stores/quickView";

/** Opens the quick-view sheet for a book without navigating. */
export function QuickViewButton({ slug, className }: { slug: string; className?: string }) {
  const open = useQuickView((s) => s.open);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open(slug);
      }}
      aria-label="Quick view"
      className={`grid place-items-center rounded-full border border-border bg-surface/90 text-text backdrop-blur transition-colors hover:border-accent hover:text-accent ${className || "size-9"}`}
    >
      <Eye className="size-4" />
    </button>
  );
}
