"use client";

import { useState } from "react";
import Image from "next/image";
import { BookOpen, ShoppingBag, NotebookPen, Sparkles } from "lucide-react";

/**
 * Article cover with a designed editorial fallback.
 *
 * Most reading guides ship without a photographed cover (the house rule bans
 * stock photos — real book covers only). So when there's no image, instead of an
 * empty box we render an on-brand "book jacket": warm ground, a faint motif keyed
 * to the article's category, the category label in mono small-caps, and the title
 * set in the display serif. It reads as a deliberate cover, not a missing asset.
 */

// Pick a motif + accent tint from the category so guides, buying guides, etc.
// each get their own look without three identical placeholders in a row.
function variantFor(category?: string) {
  const c = (category ?? "").toLowerCase();
  if (c.includes("buying")) return { Icon: ShoppingBag, kicker: "Buying guide" };
  if (c.includes("review")) return { Icon: Sparkles, kicker: "Review" };
  if (c.includes("guide")) return { Icon: BookOpen, kicker: "Reading guide" };
  return { Icon: NotebookPen, kicker: "From the reading room" };
}

export function ArticleCover({
  src,
  alt,
  title,
  category,
  sizes,
  priority,
  className = "object-cover transition duration-500 group-hover:scale-[1.03]",
}: {
  src?: string;
  alt: string;
  title: string;
  category?: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const { Icon, kicker } = variantFor(category);
    return (
      <div className="relative flex h-full w-full flex-col justify-between bg-accent/[0.05] p-5">
        {/* Oversized, low-contrast motif anchored bottom-right as a jacket flourish. */}
        <Icon
          className="pointer-events-none absolute -bottom-6 -right-4 size-40 text-accent/10"
          strokeWidth={1}
          aria-hidden
        />
        <p className="relative font-data text-[11px] uppercase tracking-[0.18em] text-accent">{kicker}</p>
        <p className="relative line-clamp-3 font-display text-2xl leading-tight text-text">{title}</p>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
