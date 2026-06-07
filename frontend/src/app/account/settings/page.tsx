"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Award, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/stores/auth";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { Field, PasswordInput } from "@/components/auth/AuthUI";
import { PageSpinner } from "@/components/ui/Spinner";

export default function AccountSettingsPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const setUser = useAuth((s) => s.setUser);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  useEffect(() => {
    if (hydrated && !token) router.replace("/login?next=/account/settings");
  }, [hydrated, token, router]);

  useEffect(() => {
    if (!token) return;
    clientApi
      .get<{ fullName: string; phone?: string }>("/auth/me")
      .then((u) => {
        setFullName(u.fullName || "");
        setPhone(u.phone || "");
      })
      .catch(() => {});
  }, [token]);

  if (!user) {
    return <div className="mx-auto max-w-2xl px-4 py-24"><PageSpinner label="Loading…" /></div>;
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileErr("");
    setProfileMsg("");
    setSavingProfile(true);
    try {
      await clientApi.put("/auth/profile", { fullName, phone });
      if (user) setUser({ ...user, fullName });
      setProfileMsg("Profile saved.");
    } catch (err) {
      setProfileErr(err instanceof ClientApiError ? err.message : "Couldn't save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr("");
    setPwMsg("");
    if (next.length < 8) return setPwErr("New password must be at least 8 characters.");
    if (next !== confirm) return setPwErr("New passwords don't match.");
    setSavingPw(true);
    try {
      await clientApi.put("/auth/change-password", { currentPassword: current, newPassword: next });
      setPwMsg("Password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setPwErr(err instanceof ClientApiError ? err.message : "Couldn't change your password.");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-12 sm:px-8 lg:px-16 xl:px-24">
      <Link href="/account" className="inline-flex items-center gap-1 font-body text-sm text-accent hover:underline">
        <ChevronLeft className="size-4" /> Back to account
      </Link>
      <h1 className="mt-4 font-display text-4xl text-text">Account settings</h1>
      <p className="mt-2 font-body text-muted">Manage your profile and password.</p>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Identity card */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <span className="grid size-12 place-items-center rounded-full bg-accent/10">
            <UserIcon className="size-6 text-accent" />
          </span>
          <h2 className="mt-4 font-display text-2xl text-text">{user.fullName}</h2>
          <p className="font-body text-sm text-muted">{user.email}</p>
          <dl className="mt-5 space-y-3 border-t border-border pt-5">
            <div className="flex items-center justify-between">
              <dt className="font-data text-xs uppercase tracking-wide text-muted">Tier</dt>
              <dd className="inline-flex items-center gap-1 font-data text-sm text-text"><Award className="size-3.5 text-accent" /> {user.tier}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="font-data text-xs uppercase tracking-wide text-muted">Points</dt>
              <dd className="font-data text-sm text-text">{user.points}</dd>
            </div>
            {user.referralCode && (
              <div className="flex items-center justify-between">
                <dt className="font-data text-xs uppercase tracking-wide text-muted">Referral</dt>
                <dd className="font-data text-sm text-accent">{user.referralCode}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Profile */}
        <form onSubmit={saveProfile} className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-xl text-text">Profile</h2>
          <div className="mt-4 space-y-4">
            {profileErr && <Banner tone="error">{profileErr}</Banner>}
            {profileMsg && <Banner tone="ok">{profileMsg}</Banner>}
            <Field label="Full name" value={fullName} onChange={setFullName} required />
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="+977 …" />
            <label className="block">
              <span className="font-body text-sm text-text">Email</span>
              <input value={user.email} readOnly className="mt-1.5 w-full cursor-not-allowed rounded-md border border-border bg-bg px-3 py-2.5 font-body text-muted outline-none" />
            </label>
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="mt-5 rounded-full bg-accent px-6 py-2.5 font-data text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {savingProfile ? "Saving…" : "Save profile"}
          </button>
        </form>

        {/* Password */}
        <form onSubmit={changePassword} className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-xl text-text">Change password</h2>
          <div className="mt-4 space-y-4">
            {pwErr && <Banner tone="error">{pwErr}</Banner>}
            {pwMsg && <Banner tone="ok">{pwMsg}</Banner>}
            <PasswordInput label="Current password" value={current} onChange={setCurrent} placeholder="Your current password" required />
            <PasswordInput label="New password" value={next} onChange={setNext} placeholder="At least 8 characters" required />
            <PasswordInput label="Confirm new password" value={confirm} onChange={setConfirm} placeholder="Re-enter new password" required />
          </div>
          <button
            type="submit"
            disabled={savingPw}
            className="mt-5 rounded-full bg-accent px-6 py-2.5 font-data text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {savingPw ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-md border-l-2 px-3 py-2 font-body text-sm ${
        tone === "error" ? "border-sale bg-sale/5 text-sale" : "border-accent bg-accent/5 text-accent"
      }`}
    >
      {children}
    </p>
  );
}
