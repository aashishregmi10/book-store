"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircleQuestion, Check } from "lucide-react";
import { useAuth } from "@/lib/stores/auth";
import { clientApi, ClientApiError } from "@/lib/client-api";

export function AskQuestion({ slug }: { slug: string }) {
  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await clientApi.post(`/books/${slug}/questions`, { question });
      setSent(true);
      setQuestion("");
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Couldn't send your question — try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 font-body text-sm text-accent">
        <Check className="size-4" /> Thanks — we&apos;ll answer your question soon.
      </p>
    );
  }

  if (hydrated && !token) {
    return (
      <p className="mt-4 font-body text-sm text-muted">
        <Link href={`/login?next=/books/${slug}`} className="text-accent hover:underline">Sign in</Link> to ask a question about this book.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 font-data text-sm text-text transition-colors hover:border-accent"
      >
        <MessageCircleQuestion className="size-4 text-accent" /> Ask a question
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 max-w-xl">
      {error && <p className="mb-2 font-body text-sm text-sale">{error}</p>}
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        required
        minLength={5}
        rows={3}
        placeholder="e.g. Is this the Nepali or English edition?"
        className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-body text-sm text-text outline-none placeholder:text-muted focus:border-accent"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-accent px-5 py-2 font-data text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Sending…" : "Submit question"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="font-data text-sm text-muted hover:text-text">
          Cancel
        </button>
      </div>
    </form>
  );
}
