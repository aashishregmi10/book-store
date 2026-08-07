"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { PasswordInput } from "@/components/auth/AuthUI";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setLoading(true);
    try {
      await clientApi.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => router.push("/login"), 1600);
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

        <h1 className="mt-5 font-display text-3xl text-text">Reset password</h1>

        {!token ? (
          <p className="mt-3 font-body text-muted">
            This reset link is missing its token. Request a new one from{" "}
            <Link href="/auth/forgot-password" className="text-accent hover:underline">Forgot password</Link>.
          </p>
        ) : done ? (
          <div className="mt-4">
            <span className="grid size-12 place-items-center rounded-full bg-accent/10">
              <ShieldCheck className="size-6 text-accent" />
            </span>
            <p className="mt-3 font-body text-text">Password reset. Taking you to the login screen…</p>
          </div>
        ) : (
          <>
            <p className="mt-1 font-body text-muted">Choose a new password for your account.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {error && (
                <p className="rounded-md border border-sale/40 bg-sale/5 px-3 py-2 font-body text-sm text-sale">{error}</p>
              )}
              <PasswordInput label="New password" value={password} onChange={setPassword} placeholder="At least 8 characters" required />
              <PasswordInput label="Confirm new password" value={confirm} onChange={setConfirm} placeholder="Re-enter new password" required />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-accent px-5 py-3 font-data text-sm font-medium uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {loading ? "Resetting…" : "Reset password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
