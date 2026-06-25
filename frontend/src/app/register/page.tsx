"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { useAuth, type AuthUser } from "@/lib/stores/auth";
import { SocialButtons, OrDivider, Field, PasswordInput, hasSocialSignIn } from "@/components/auth/AuthUI";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const refParam = useSearchParams().get("ref");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    referralCode: refParam ? refParam.toUpperCase() : "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; password?: string }>({});

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((fe) => (fe[k as keyof typeof fe] ? { ...fe, [k]: undefined } : fe));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const fe: typeof fieldErrors = {};
    if (!form.fullName.trim()) fe.fullName = "Please enter your name.";
    if (!form.email.trim()) fe.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) fe.email = "Enter a valid email address.";
    if (!form.password) fe.password = "Password is required.";
    else if (form.password.length < 8) fe.password = "Password must be at least 8 characters.";
    if (Object.keys(fe).length) return setFieldErrors(fe);
    setFieldErrors({});
    setLoading(true);
    try {
      const payload = { ...form, referralCode: form.referralCode || undefined };
      const data = await clientApi.post<{ user: AuthUser; accessToken: string }>("/auth/register", payload);
      setAuth(data.user, data.accessToken);
      router.push("/account");
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

        <h1 className="mt-5 font-display text-3xl text-text">Signup</h1>
        <p className="mt-1 font-body text-muted">Hi there! Welcome to PageTurn Nepal.</p>

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
          <Field label="Name" value={form.fullName} onChange={set("fullName")} placeholder="Enter your name" required autoFocus error={fieldErrors.fullName} />
          <Field label="Email" type="email" value={form.email} onChange={set("email")} placeholder="Enter your email" required error={fieldErrors.email} />
          <PasswordInput value={form.password} onChange={set("password")} placeholder="Enter a password" required error={fieldErrors.password} />
          <Field label="Referral code (optional)" value={form.referralCode} onChange={set("referralCode")} placeholder="Got a code? Enter it here" />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent px-5 py-3 font-data text-sm font-medium uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Signup"}
          </button>
        </form>

        <p className="mt-6 font-body text-sm text-text">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">Login here!</Link>
        </p>
      </div>
    </div>
  );
}
