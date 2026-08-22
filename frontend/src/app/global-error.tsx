"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches failures in the root layout itself, where
 * error.tsx can't help because the layout that would wrap it is the thing that
 * broke. It has to render its own <html>/<body>, and it cannot rely on the
 * fonts or the Tailwind theme loading, so the styling here is deliberately
 * inline and self-contained rather than using the design tokens.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          color: "#333a3f",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.875rem", margin: "0 0 0.75rem", lineHeight: 1.2 }}>
            Books Temple Nepal is having a moment.
          </h1>
          <p style={{ margin: "0 0 1.5rem", lineHeight: 1.6, color: "#6a757b" }}>
            Something went wrong loading the shop. Reloading usually sorts it.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#1d76bc",
              color: "#fff",
              border: "none",
              borderRadius: "999px",
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ marginTop: "2rem", fontSize: "0.75rem", color: "#6a757b" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
