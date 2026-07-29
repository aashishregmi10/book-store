"use client";

import { useState } from "react";
import { BellRing, Check } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { useAuth } from "@/lib/stores/auth";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Replaces the dead "Out of stock" button on a sold-out title.
 *
 * A disabled button is a dead end — the visitor wanted this book and there was
 * nothing to do about it. This captures the demand instead, which matters here
 * because every title is stocked only two copies deep, so sold-out is a normal
 * state rather than an exceptional one.
 *
 * Signed-in visitors submit in one click (the API reads their address).
 * Guests are asked for an email inline rather than being pushed to sign up.
 */
export function RestockRequestButton({
  slug,
  full,
  size = "md",
  className = "",
}: {
  slug: string;
  full?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const user = useAuth((s) => s.user);
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const sizes = size === "sm" ? "px-3 py-2 text-xs" : "px-5 py-3 text-sm";
  const base = `inline-flex items-center justify-center gap-2 rounded-md font-data uppercase tracking-wide transition-colors ${sizes} ${
    full ? "w-full" : ""
  } ${className}`;

  async function submit(address?: string) {
    setBusy(true);
    setError("");
    try {
      await clientApi.post(`/books/${slug}/restock-request`, address ? { email: address } : {});
      setDone(true);
      setAsking(false);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Couldn't save that — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className={`${base} border border-accent/40 bg-accent/5 text-accent`} role="status">
        <Check className="size-4" /> We&apos;ll email you
      </p>
    );
  }

  // Guests get an inline email field rather than a sign-up wall.
  if (asking) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) submit(email.trim());
        }}
        className={full ? "w-full" : ""}
      >
        <div className="flex gap-2">
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email for restock notification"
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2.5 font-body text-sm text-text outline-none placeholder:text-muted/70 focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-md bg-accent px-4 py-2.5 font-data text-sm uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? <Spinner className="size-4" /> : "Notify me"}
          </button>
        </div>
        {error && <p className="mt-1.5 font-body text-xs text-sale">{error}</p>}
      </form>
    );
  }

  return (
    <div className={full ? "w-full" : ""}>
      <button
        onClick={() => (user ? submit() : setAsking(true))}
        disabled={busy}
        className={`${base} border border-accent bg-transparent text-accent hover:bg-accent hover:text-white disabled:opacity-60`}
      >
        {busy ? <Spinner className="size-4" /> : <BellRing className="size-4" />}
        Request restock
      </button>
      {error && <p className="mt-1.5 font-body text-xs text-sale">{error}</p>}
    </div>
  );
}
