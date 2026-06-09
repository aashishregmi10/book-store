"use client";

import { useEffect, useState } from "react";
import { Star, Check, X } from "lucide-react";
import { clientApi } from "@/lib/client-api";

interface AdminReview {
  _id: string;
  rating: number;
  title?: string;
  body: string;
  isApproved: boolean;
  isVerifiedPurchase: boolean;
  createdAt: string;
  book?: { title: string; slug: string };
  user?: { fullName: string };
}

const TABS = ["pending", "approved", "all"];

export default function AdminReviews() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    clientApi
      .get<AdminReview[]>(`/admin/reviews?status=${tab}`)
      .then((d) => active && setReviews(d))
      .catch(() => active && setReviews([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [tab, refreshKey]);
  const refresh = () => setRefreshKey((k) => k + 1);

  async function moderate(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      await clientApi.put(`/admin/reviews/${id}/${action}`, {});
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-text">Reviews</h1>

      <div className="mt-5 flex gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 font-data text-xs uppercase tracking-wide ${tab === t ? "bg-accent text-white" : "border border-border text-muted hover:text-accent"}`}>{t}</button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={`s${i}`} className="border border-border bg-surface p-4">
              <span className="block h-4 w-24 animate-pulse bg-border/70" />
              <span className="mt-2 block h-4 w-1/2 animate-pulse bg-border/70" />
              <span className="mt-2 block h-4 w-3/4 animate-pulse bg-border/70" />
            </div>
          ))}
        {!loading && reviews.map((r) => (
          <div key={r._id} className="border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 font-data text-sm text-text"><Star className="size-3.5 fill-star text-star" /> {r.rating}.0</span>
                  {r.isVerifiedPurchase && <span className="font-data text-xs uppercase text-accent">Verified</span>}
                  {r.isApproved && <span className="font-data text-xs uppercase text-muted">Approved</span>}
                </div>
                <p className="mt-1 font-body text-sm text-text">{r.book?.title || "Unknown book"} · {r.user?.fullName || "A reader"}</p>
                {r.title && <p className="mt-1 font-display text-lg text-text">{r.title}</p>}
                <p className="mt-1 font-body text-sm text-muted">{r.body}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {!r.isApproved && (
                  <button disabled={busy === r._id} onClick={() => moderate(r._id, "approve")} aria-label="Approve" className="grid size-9 place-items-center border border-border text-accent hover:border-accent disabled:opacity-50"><Check className="size-4" /></button>
                )}
                <button disabled={busy === r._id} onClick={() => moderate(r._id, "reject")} aria-label="Reject" className="grid size-9 place-items-center border border-border text-sale hover:border-sale disabled:opacity-50"><X className="size-4" /></button>
              </div>
            </div>
          </div>
        ))}
        {!loading && reviews.length === 0 && <p className="py-10 text-center font-body text-muted">No {tab} reviews.</p>}
      </div>
    </div>
  );
}
