"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, MailCheck } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { Field } from "@/components/auth/AuthUI";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await clientApi.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        <Link href="/login" className="inline-flex items-center gap-1 font-body text-sm text-accent hover:underline">
          <ChevronLeft className="size-4" /> Back to login
        </Link>

        {sent ? (
          <div className="mt-5">
            <span className="grid size-12 place-items-center rounded-full bg-accent/10">
              <MailCheck className="size-6 text-accent" />
            </span>
            <h1 className="mt-4 font-display text-3xl text-text">Check your inbox</h1>
            <p className="mt-2 font-body text-muted">
              If an account exists for <span className="text-text">{email}</span>, we&apos;ve sent a link to reset your
              password. It expires in 1 hour — don&apos;t forget to check spam.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mt-5 font-display text-3xl text-text">Forgot password</h1>
            <p className="mt-1 font-body text-muted">Enter your email and we&apos;ll send a reset link.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {error && (
                <p className="rounded-md border border-sale/40 bg-sale/5 px-3 py-2 font-body text-sm text-sale">{error}</p>
              )}
              <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@reader.np" required autoFocus />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-accent px-5 py-3 font-data text-sm font-medium uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 font-body text-sm text-text">
          Remembered it?{" "}
          <Link href="/login" className="text-accent hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
