"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, Check } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { TableSkeleton } from "@/components/ui/Skeleton";

type Status = "pending" | "answered" | "all";

interface AdminQuestion {
  _id: string;
  question: string;
  answer?: string;
  isAnswered: boolean;
  createdAt: string;
  book?: { title: string; slug: string };
  user?: { fullName: string };
}

export default function AdminQuestions() {
  const [rows, setRows] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>("pending");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    clientApi
      .get<AdminQuestion[]>(`/admin/questions?status=${status}`)
      .then((d) => active && setRows(d))
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [status, refresh]);

  async function publish(id: string) {
    const answer = (drafts[id] || "").trim();
    if (answer.length < 2) return;
    await clientApi.put(`/admin/questions/${id}/answer`, { answer }).catch(() => {});
    setRefresh((n) => n + 1);
  }
  async function del(id: string) {
    if (!confirm("Delete this question?")) return;
    await clientApi.del(`/admin/questions/${id}`).catch(() => {});
    setRefresh((n) => n + 1);
  }

  const TABS: [Status, string][] = [
    ["pending", "Pending"],
    ["answered", "Answered"],
    ["all", "All"],
  ];

  return (
    <div>
      <h1 className="font-display text-3xl text-text">Questions &amp; answers</h1>
      <p className="mt-1 max-w-prose font-body text-sm text-muted">
        Answer customer questions about books. Published answers appear on the book page and feed the QAPage structured data.
      </p>

      <div className="mt-5 flex gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`rounded-full px-3.5 py-1.5 font-data text-xs uppercase tracking-wide transition-colors ${
              status === key ? "bg-accent text-white" : "border border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-5">
          <TableSkeleton rows={5} cols={2} />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-8 font-body text-muted">Nothing here.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((q) => (
            <li key={q._id} className="border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {q.book && (
                    <Link href={`/admin/books/${q.book.slug}`} className="font-data text-xs uppercase tracking-wide text-accent hover:underline">
                      {q.book.title}
                    </Link>
                  )}
                  <p className="mt-1 font-display text-lg text-text">{q.question}</p>
                  <p className="font-body text-xs text-muted">
                    asked by {q.user?.fullName || "a reader"} · {new Date(q.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => del(q._id)} aria-label="Delete" className="p-1.5 text-muted hover:text-sale">
                  <Trash2 className="size-4" />
                </button>
              </div>

              {q.isAnswered ? (
                <p className="mt-3 rounded-md border-l-2 border-accent bg-accent/5 px-3 py-2 font-body text-sm text-text">{q.answer}</p>
              ) : (
                <div className="mt-3">
                  <textarea
                    value={drafts[q._id] || ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q._id]: e.target.value }))}
                    rows={2}
                    placeholder="Write an answer…"
                    className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 font-body text-sm text-text outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => publish(q._id)}
                    className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 font-data text-sm font-medium text-white hover:bg-accent-hover"
                  >
                    <Check className="size-4" /> Publish answer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
