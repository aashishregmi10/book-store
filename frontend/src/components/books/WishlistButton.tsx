"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { useAuth } from "@/lib/stores/auth";
import { useWishlist } from "@/lib/stores/wishlist";

export function WishlistButton({
  bookId,
  className,
  variant = "overlay",
}: {
  bookId: string;
  className?: string;
  /** "overlay" = bare heart over a cover image; "bordered" = boxed icon on a light surface. */
  variant?: "overlay" | "bordered";
}) {
  const token = useAuth((s) => s.token);
  const router = useRouter();
  // Reads from the shared store so the heart reflects adds/removes made anywhere
  // (book card, drawer, wishlist page) without its own fetch.
  const wishlisted = useWishlist((s) => s.ids.has(bookId));
  const hydrate = useWishlist((s) => s.hydrate);
  const toggleWishlist = useWishlist((s) => s.toggle);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) hydrate();
  }, [token, hydrate]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!token) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    try {
      await toggleWishlist(bookId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={wishlisted}
      className={`group grid place-items-center transition-colors ${
        variant === "bordered" ? "border border-border bg-surface hover:border-[#e3534c]" : ""
      } ${className || "size-9"}`}
    >
      <Heart
        className={`size-5 text-[#e3534c] transition-all group-hover:scale-110 ${
          variant === "overlay" ? "[filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.35))]" : ""
        } ${wishlisted ? "fill-[#e3534c]" : ""}`}
      />
    </button>
  );
}
