"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { GoogleSignInButton } from "./GoogleSignInButton";

/** Real Google sign-in (Identity Services); Facebook is still a "coming soon"
 *  note until configured (no Apple, by request). */
export function SocialButtons() {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      <GoogleSignInButton onError={setNote} />
      <SocialButton onClick={() => setNote("Facebook sign-in is coming soon — use Google or email.")}>
        <FacebookIcon /> Facebook
      </SocialButton>
      {note && <p className="mt-2 text-center font-body text-xs text-muted">{note}</p>}
    </div>
  );
}

function SocialButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 font-body text-sm text-text transition-colors hover:border-accent"
    >
      {children}
    </button>
  );
}

export function OrDivider({ label = "or continue with email" }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="font-body text-xs text-muted">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Text/email/etc. field matching the reference layout. */
export function Field({
  label,
  type = "text",
  value,
  onChange,
  required,
  autoFocus,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-body text-sm text-text">
        {label} {required && <span className="text-sale">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-body text-text outline-none placeholder:text-muted/70 focus:border-accent"
      />
    </label>
  );
}

/** Password field with a show/hide eye toggle. */
export function PasswordInput({
  label = "Password",
  value,
  onChange,
  required,
  placeholder = "Enter a password",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="font-body text-sm text-text">
        {label} {required && <span className="text-sale">*</span>}
      </span>
      <div className="relative mt-1.5">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 pr-11 font-body text-text outline-none placeholder:text-muted/70 focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center text-muted hover:text-text"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </label>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.92-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12Z" />
    </svg>
  );
}
