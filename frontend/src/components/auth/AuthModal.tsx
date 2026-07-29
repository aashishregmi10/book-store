"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useAuthModal } from "@/lib/stores/authModal";
import { useAuth, type AuthUser } from "@/lib/stores/auth";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { SocialButtons, OrDivider, Field, PasswordInput, hasSocialSignIn } from "./AuthUI";

export function AuthModal() {
  const { open, mode, next, setMode, close } = useAuthModal();

  // Lock body scroll + close on Escape while open. (No setState here.)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-text/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "login" ? "Login" : "Sign up"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* key remounts the form with fresh state when the mode flips or it reopens */}
      <AuthModalBody key={mode} mode={mode} next={next} setMode={setMode} close={close} />
    </div>
  );
}

function AuthModalBody({
  mode,
  next,
  setMode,
  close,
}: {
  mode: "login" | "signup";
  next?: string;
  setMode: (m: "login" | "signup") => void;
  close: () => void;
}) {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", referralCode: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; password?: string }>({});

  // Clear a field's error as the user fixes it.
  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((fe) => (fe[k as keyof typeof fe] ? { ...fe, [k]: undefined } : fe));
  };
  const isLogin = mode === "login";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Inline required-field validation.
    const fe: typeof fieldErrors = {};
    if (!isLogin && !form.fullName.trim()) fe.fullName = "Please enter your name.";
    if (!form.email.trim()) fe.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) fe.email = "Enter a valid email address.";
    if (!form.password) fe.password = "Password is required.";
    else if (!isLogin && form.password.length < 8) fe.password = "Password must be at least 8 characters.";
    if (Object.keys(fe).length) {
      setFieldErrors(fe);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    try {
      const data = isLogin
        ? await clientApi.post<{ user: AuthUser; accessToken: string }>("/auth/login", {
            email: form.email,
            password: form.password,
          })
        : await clientApi.post<{ user: AuthUser; accessToken: string }>("/auth/register", {
            fullName: form.fullName,
            email: form.email,
            password: form.password,
            referralCode: form.referralCode || undefined,
          });
      setAuth(data.user, data.accessToken);
      close();
      if (next) router.push(next);
      else router.refresh();
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-panel-in relative my-auto w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl sm:p-8">
      <button
        onClick={close}
        aria-label="Close"
        className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text"
      >
        <X className="size-5" />
      </button>

      <h2 className="font-display text-3xl text-text">{isLogin ? "Login" : "Signup"}</h2>
      <p className="mt-1 font-body text-muted">
        {isLogin ? "Hi, welcome back! Please login to your account." : "Hi there! Welcome to Books Temple Nepal."}
      </p>

      {hasSocialSignIn && (
        <>
          <div className="mt-6">
            <SocialButtons />
          </div>
          <OrDivider />
        </>
      )}

      <form onSubmit={onSubmit} className={hasSocialSignIn ? "space-y-4" : "mt-6 space-y-4"}>
        {error && <p className="rounded-md border border-sale/40 bg-sale/5 px-3 py-2 font-body text-sm text-sale">{error}</p>}
        {!isLogin && <Field label="Name" value={form.fullName} onChange={set("fullName")} placeholder="Enter your name" required autoFocus error={fieldErrors.fullName} />}
        <Field label="Email" type="email" value={form.email} onChange={set("email")} placeholder="Enter your email" required autoFocus={isLogin} error={fieldErrors.email} />
        <PasswordInput
          label="Password"
          value={form.password}
          onChange={set("password")}
          placeholder={isLogin ? "Enter your password" : "At least 8 characters"}
          required
          error={fieldErrors.password}
        />
        {!isLogin && <Field label="Referral code (optional)" value={form.referralCode} onChange={set("referralCode")} placeholder="Got a code? Enter it here" />}

        {isLogin && (
          <div className="flex justify-end">
            <Link href="/auth/forgot-password" onClick={close} className="font-body text-sm text-accent hover:underline">
              Forgot password?
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-accent px-5 py-3 font-data text-sm font-medium uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? (isLogin ? "Signing in…" : "Creating account…") : isLogin ? "Login" : "Signup"}
        </button>
      </form>

      <p className="mt-6 font-body text-sm text-text">
        {isLogin ? (
          <>
            Don&apos;t have an account?{" "}
            <button onClick={() => setMode("signup")} className="text-accent hover:underline">Signup here!</button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button onClick={() => setMode("login")} className="text-accent hover:underline">Login here!</button>
          </>
        )}
      </p>
    </div>
  );
}
