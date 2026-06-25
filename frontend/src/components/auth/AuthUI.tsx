"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { GoogleSignInButton, isGoogleConfigured } from "./GoogleSignInButton";

/** Whether any social sign-in option is available (only Google for now).
 *  The modal uses this to decide whether to show the social row + divider. */
export const hasSocialSignIn = isGoogleConfigured;

/** Real Google sign-in (Identity Services). Facebook was removed by request. */
export function SocialButtons() {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      <GoogleSignInButton onError={setNote} />
      {note && <p className="mt-2 text-center font-body text-xs text-muted">{note}</p>}
    </div>
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
  error,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  error?: string;
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
        aria-required={required}
        aria-invalid={!!error}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={`mt-1.5 w-full rounded-md border bg-surface px-3 py-2.5 font-body text-text outline-none placeholder:text-muted/70 focus:border-accent ${error ? "border-sale" : "border-border"}`}
      />
      {error && <span className="mt-1 block font-body text-xs text-sale">{error}</span>}
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
  error,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  error?: string;
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
          aria-required={required}
          aria-invalid={!!error}
          placeholder={placeholder}
          className={`w-full rounded-md border bg-surface px-3 py-2.5 pr-11 font-body text-text outline-none placeholder:text-muted/70 focus:border-accent ${error ? "border-sale" : "border-border"}`}
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
      {error && <span className="mt-1 block font-body text-xs text-sale">{error}</span>}
    </label>
  );
}
