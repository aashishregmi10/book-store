"use client";

import { useState } from "react";
import Image from "next/image";
import { BookOpen } from "lucide-react";

/**
 * Cover image with a graceful fallback. If the remote image 404s or the
 * optimizer hiccups, we show a clean titled placeholder instead of the browser's
 * broken-image icon — so a missing cover never breaks the page's look.
 */
export function BookCover({
  src,
  alt,
  title,
  sizes,
  priority,
  className = "object-cover",
}: {
  src?: string;
  alt: string;
  title: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-border/30 p-4 text-center">
        <BookOpen className="size-6 text-muted" aria-hidden />
        <span className="line-clamp-4 font-display text-sm leading-snug text-muted">{title}</span>
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
