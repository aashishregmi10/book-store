"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { useAuth } from "@/lib/stores/auth";

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
  const [wishlisted, setWishlisted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    clientApi
      .get<{ isWishlisted: boolean }>(`/wishlist/check/${bookId}`)
      .then((d) => active && setWishlisted(d.isWishlisted))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [bookId, token]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!token) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    try {
      if (wishlisted) {
        await clientApi.del(`/wishlist/${bookId}`);
        setWishlisted(false);
      } else {
        await clientApi.post(`/wishlist`, { bookId, source: "book_card" });
        setWishlisted(true);
      }
    } catch {
      /* swallow — keep UI responsive */
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
