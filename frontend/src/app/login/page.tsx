"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { useAuth, type AuthUser } from "@/lib/stores/auth";
import { SocialButtons, OrDivider, Field, PasswordInput, hasSocialSignIn } from "@/components/auth/AuthUI";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const fe: typeof fieldErrors = {};
    if (!email.trim()) fe.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fe.email = "Enter a valid email address.";
    if (!password) fe.password = "Password is required.";
    if (Object.keys(fe).length) return setFieldErrors(fe);
    setFieldErrors({});
    setLoading(true);
    try {
      const data = await clientApi.post<{ user: AuthUser; accessToken: string }>("/auth/login", { email, password });
      setAuth(data.user, data.accessToken);
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next || "/account");
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        <Link href="/" className="inline-flex items-center gap-1 font-body text-sm text-accent hover:underline">
          <ChevronLeft className="size-4" /> Return to homepage
        </Link>

        <h1 className="mt-5 font-display text-3xl text-text">Login</h1>
        <p className="mt-1 font-body text-muted">Hi, welcome back! Please login to your account.</p>

        {hasSocialSignIn && (
          <>
            <div className="mt-6">
              <SocialButtons />
            </div>
            <OrDivider />
          </>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md border border-sale/40 bg-sale/5 px-3 py-2 font-body text-sm text-sale">{error}</p>
          )}
          <Field label="Email" type="email" value={email} onChange={(v) => { setEmail(v); setFieldErrors((fe) => ({ ...fe, email: undefined })); }} placeholder="Enter your email" required autoFocus error={fieldErrors.email} />
          <PasswordInput label="Password" value={password} onChange={(v) => { setPassword(v); setFieldErrors((fe) => ({ ...fe, password: undefined })); }} placeholder="Enter your password" required error={fieldErrors.password} />
          <div className="flex justify-end">
            <Link href="/auth/forgot-password" className="font-body text-sm text-accent hover:underline">
              Forgot password?
            </Link>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent px-5 py-3 font-data text-sm font-medium uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Login"}
          </button>
        </form>

        <p className="mt-6 font-body text-sm text-text">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-accent hover:underline">Signup here!</Link>
        </p>
      </div>
    </div>
  );
}
