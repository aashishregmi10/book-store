"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { useAuth, type AuthUser } from "@/lib/stores/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await clientApi.post<{ user: AuthUser; accessToken: string }>("/auth/admin/login", { email, password });
      setAuth(data.user, data.accessToken);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-text px-4">
      <div className="w-full max-w-sm border border-border bg-surface p-8">
        <div className="flex items-center gap-2 text-accent">
          <Lock className="size-5" />
          <span className="font-display text-2xl font-semibold text-text">Books Temple Admin</span>
        </div>
        <p className="mt-2 font-body text-sm text-muted">Sign in with an administrator account.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {error && <p className="border border-sale/40 bg-sale/5 px-3 py-2 font-body text-sm text-sale">{error}</p>}
          <label className="block">
            <span className="font-data text-xs uppercase tracking-wide text-muted">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="mt-1 w-full border border-border bg-bg px-3 py-2.5 font-body text-text outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="font-data text-xs uppercase tracking-wide text-muted">Password</span>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-border bg-bg px-3 py-2.5 pr-11 font-body text-text outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center text-muted hover:text-text"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>
          <button type="submit" disabled={loading} className="w-full bg-accent px-5 py-3 font-data text-sm uppercase tracking-wide text-white hover:bg-accent-hover disabled:opacity-50">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
