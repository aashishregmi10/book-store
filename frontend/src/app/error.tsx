"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary. Without one, any thrown render error showed
 * Next's default error screen — in production that is a bare "Application
 * error: a client-side exception has occurred", with no branding and no way
 * back into the shop.
 *
 * `reset()` re-renders the failed segment, which is genuinely worth offering:
 * most failures here are a transient API hiccup, and retrying costs nothing.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack in production
    // logs, so it needs to reach the console rather than being swallowed.
    console.error("[route-error]", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="label-smallcaps font-data text-xs">Something broke</p>
      <h1 className="mt-3 max-w-2xl font-display text-4xl leading-tight text-text sm:text-5xl">
        That didn&apos;t load properly.
      </h1>
      <p className="mt-4 max-w-md font-body text-lg leading-relaxed text-muted">
        Our end, not yours. Try again, and if it keeps happening, tell us and we&apos;ll fix it.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-accent px-6 py-3 font-data text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Try again
        </button>
        <Link
          href="/books"
          className="rounded-full border border-border px-6 py-3 font-data text-sm text-text transition-colors hover:border-accent hover:text-accent"
        >
          Browse the shelves
        </Link>
      </div>

      {error.digest && (
        <p className="mt-8 font-data text-xs text-muted">
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
