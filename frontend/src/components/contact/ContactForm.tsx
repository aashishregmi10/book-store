"use client";

import { useState } from "react";
import { Send, Check } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";
import { Spinner } from "@/components/ui/Spinner";

const TOPICS = ["An order", "A book request", "Trade & wholesale", "Just saying hi"];

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", topic: TOPICS[0], message: "" });
  // Honeypot. Hidden from people, irresistible to bots — see the field below.
  const [website, setWebsite] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      // This used to flip straight to the thank-you screen without sending
      // anything anywhere — the note promised a reply within a day and the
      // message went nowhere. It now only confirms once the API has the note.
      await clientApi.post("/contact", { ...form, website });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ClientApiError
          ? err.message
          : "We couldn't send that just now. Email us at hello@bookstemplenepal.com instead."
      );
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center sm:p-8">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent/10">
          <Check className="size-7 text-accent" />
        </span>
        <h2 className="mt-4 font-display text-2xl text-text">Thanks for the note, {form.name || "friend"}.</h2>
        <p className="mt-2 font-body text-muted">We read everything and usually reply within a day.</p>
        <button
          onClick={() => {
            setForm({ name: "", email: "", topic: TOPICS[0], message: "" });
            setSent(false);
          }}
          className="mt-6 rounded-full border border-border px-5 py-2.5 font-data text-sm text-text hover:border-accent"
        >
          Send another
        </button>
      </div>
    );
  }

  const inputCls =
    "mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 font-body text-sm text-text outline-none focus:border-accent";

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-display text-xl text-text">Send us a note</h2>

      <div className="mt-4 space-y-3.5">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className="block">
            <span className="font-data text-xs uppercase tracking-wide text-muted">Your name</span>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} required className={inputCls} />
          </label>
          <label className="block">
            <span className="font-data text-xs uppercase tracking-wide text-muted">Email</span>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required className={inputCls} />
          </label>
        </div>

        <label className="block">
          <span className="font-data text-xs uppercase tracking-wide text-muted">What&apos;s it about?</span>
          <select value={form.topic} onChange={(e) => set("topic", e.target.value)} className={inputCls}>
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-data text-xs uppercase tracking-wide text-muted">Message</span>
          <textarea
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            required
            rows={4}
            className={`${inputCls} resize-y leading-relaxed`}
          />
        </label>
      </div>

      {/* Honeypot — off-screen and out of the tab order, so nobody using a
          keyboard or a screen reader can land in it, but a form-filling bot
          will. Anything typed here means the submission isn't a person. */}
      <label aria-hidden className="sr-only" style={{ position: "absolute", left: "-9999px" }}>
        Website
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-sale/40 bg-sale/5 px-3 py-2 font-body text-sm text-sale">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-2.5 font-data text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {sending ? <Spinner className="size-4" /> : <Send className="size-4" />}
        {sending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
