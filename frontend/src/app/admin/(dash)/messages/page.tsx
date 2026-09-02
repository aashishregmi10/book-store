"use client";

import { useEffect, useState } from "react";
import { Check, CornerUpLeft } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { TableSkeleton } from "@/components/ui/Skeleton";

type Status = "new" | "read" | "replied" | "all";

interface ContactMessage {
  _id: string;
  name: string;
  email: string;
  topic?: string;
  message: string;
  status: "new" | "read" | "replied";
  createdAt: string;
  user?: { fullName: string; email: string };
}

interface Payload {
  messages: ContactMessage[];
  unread: number;
}

const TABS: [Status, string][] = [
  ["new", "New"],
  ["read", "Read"],
  ["replied", "Replied"],
  ["all", "All"],
];

export default function AdminMessages() {
  const [rows, setRows] = useState<ContactMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>("new");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    clientApi
      .get<Payload>(`/admin/contact?status=${status}`)
      .then((d) => {
        if (!active) return;
        setRows(d.messages || []);
        setUnread(d.unread || 0);
      })
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [status, refresh]);

  async function setStatusOf(id: string, next: ContactMessage["status"]) {
    await clientApi.put(`/admin/contact/${id}/status`, { status: next }).catch(() => {});
    setRefresh((n) => n + 1);
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-text">Messages</h1>
      <p className="mt-1 max-w-prose font-body text-sm text-muted">
        Notes sent through the contact form. Every one is stored here whether or not the
        notification email went out, so nothing is lost to a failed send.
        {unread > 0 && (
          <>
            {" "}
            <span className="font-medium text-accent">{unread} unread.</span>
          </>
        )}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`rounded-full px-3.5 py-1.5 font-data text-xs uppercase tracking-wide transition-colors ${
              status === key
                ? "bg-accent text-white"
                : "border border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {label}
            {key === "new" && unread > 0 ? ` (${unread})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-5">
          <TableSkeleton rows={4} cols={2} />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-8 font-body text-muted">
          {status === "new" ? "No unread messages — you're all caught up." : "Nothing here."}
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((m) => (
            <li key={m._id} className="border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg text-text">{m.name}</span>
                    {m.topic && (
                      <span className="font-data text-xs uppercase tracking-wide text-accent">
                        {m.topic}
                      </span>
                    )}
                    {m.status === "new" && (
                      <span className="rounded-full bg-accent px-2 py-0.5 font-data text-[0.65rem] uppercase tracking-wide text-white">
                        New
                      </span>
                    )}
                    {m.status === "replied" && (
                      <span className="rounded-full border border-border px-2 py-0.5 font-data text-[0.65rem] uppercase tracking-wide text-muted">
                        Replied
                      </span>
                    )}
                  </div>
                  <a
                    href={`mailto:${m.email}`}
                    className="font-data text-sm text-accent hover:underline"
                  >
                    {m.email}
                  </a>
                  <p className="font-body text-xs text-muted">
                    {new Date(m.createdAt).toLocaleString()}
                    {/* Only shown when the sender happened to be signed in, so a
                        note can be matched to an account without asking them. */}
                    {m.user ? ` · signed in as ${m.user.fullName}` : " · not signed in"}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent(
                      `Re: ${m.topic || "your message"} — Books Temple Nepal`
                    )}`}
                    onClick={() => setStatusOf(m._id, "replied")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 font-data text-xs text-white hover:bg-accent-hover"
                  >
                    <CornerUpLeft className="size-3.5" /> Reply
                  </a>
                  {m.status === "new" && (
                    <button
                      onClick={() => setStatusOf(m._id, "read")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 font-data text-xs text-muted hover:border-accent hover:text-accent"
                    >
                      <Check className="size-3.5" /> Mark read
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-3 whitespace-pre-line border-l-2 border-accent bg-accent/5 px-3 py-2 font-body text-sm text-text">
                {m.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
