"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Check, PenLine } from "lucide-react";
import { useAuth } from "@/lib/stores/auth";
import { useAuthModal } from "@/lib/stores/authModal";
import { clientApi, ClientApiError } from "@/lib/client-api";

interface Eligibility {
  eligible: boolean;
  purchased: boolean;
  alreadyReviewed: boolean;
}

/**
 * Write-a-review form for the book page. Policy: only verified buyers (a
 * delivered order for this book) may review, and reviews publish immediately.
 * We check eligibility up front so a non-buyer never writes a review only to be
 * rejected.
 */
export function ReviewForm({ slug }: { slug: string }) {
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const openLogin = useAuthModal((s) => s.openLogin);
  const router = useRouter();

  const [elig, setElig] = useState<Eligibility | null>(null);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // No token → the `!token` render branch shows the sign-in prompt, so no reset
    // is needed here (and synchronous setState in an effect is disallowed).
    if (!token) return;
    let active = true;
    clientApi
      .get<Eligibility>(`/books/${slug}/can-review`)
      .then((d) => active && setElig(d))
      .catch(() => active && setElig(null));
    return () => {
      active = false;
    };
  }, [token, slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (rating < 1) {
      setError("Please pick a star rating.");
      return;
    }
    setLoading(true);
    try {
      await clientApi.post(`/books/${slug}/reviews`, { rating, title: title.trim() || undefined, body });
      setSent(true);
      router.refresh(); // pull in the newly-published review + updated rating
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Couldn't post your review — try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 font-body text-sm text-accent">
        <Check className="size-4" /> Thanks for your review!
      </p>
    );
  }

  // Signed out.
  if (hydrated && !token) {
    return (
      <p className="mt-4 font-body text-sm text-muted">
        <button onClick={() => openLogin(`/books/${slug}`)} className="text-accent hover:underline">
          Sign in
        </button>{" "}
        to review a book you&apos;ve read.
      </p>
    );
  }

  // Waiting on auth hydration or the eligibility check.
  if (!hydrated || (token && elig === null)) {
    return <div className="mt-4 h-5 w-56 animate-pulse rounded bg-border/70" aria-hidden />;
  }

  if (elig?.alreadyReviewed) {
    return <p className="mt-4 font-body text-sm text-muted">You&apos;ve already reviewed this book — thank you.</p>;
  }

  if (!elig?.purchased) {
    return (
      <p className="mt-4 font-body text-sm text-muted">
        Only verified buyers can review. Once you&apos;ve received this book, you can share your thoughts here.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 font-data text-sm text-text transition-colors hover:border-accent"
      >
        <PenLine className="size-4 text-accent" /> Write a review
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 max-w-xl">
      {error && <p className="mb-2 font-body text-sm text-sale">{error}</p>}

      {/* Star picker */}
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-checked={rating === n}
            role="radio"
            className="p-0.5"
          >
            <Star
              className={`size-6 transition-colors ${
                (hover || rating) >= n ? "fill-accent text-accent" : "text-border"
              }`}
            />
          </button>
        ))}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={100}
        placeholder="Headline (optional) — e.g. A clear, practical read"
        className="mt-3 w-full rounded-md border border-border bg-bg px-3 py-2 font-body text-sm text-text outline-none placeholder:text-muted focus:border-accent"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        minLength={10}
        maxLength={2000}
        rows={4}
        placeholder="What did you think? What stood out, who would you recommend it to?"
        className="mt-2 w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-body text-sm text-text outline-none placeholder:text-muted focus:border-accent"
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-accent px-5 py-2 font-data text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Posting…" : "Post review"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="font-data text-sm text-muted hover:text-text">
          Cancel
        </button>
      </div>
    </form>
  );
}
