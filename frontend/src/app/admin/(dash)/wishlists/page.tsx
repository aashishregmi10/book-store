"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface UserWishlist {
  _id: string;
  fullName: string;
  email: string;
  count: number;
}

export default function AdminWishlists() {
  const [rows, setRows] = useState<UserWishlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    const path = search ? `/admin/wishlists?search=${encodeURIComponent(search)}` : "/admin/wishlists";
    clientApi
      .get<UserWishlist[]>(path)
      .then((d) => active && setRows(d))
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [search]);

  return (
    <div>
      <h1 className="font-display text-3xl text-text">Wishlists</h1>
      <p className="mt-1 max-w-prose font-body text-sm text-muted">
        Who saved what. Open a customer to see their saved titles — use it to prioritise restocks, target a promo, or reach out when a saved title drops in price.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search customer name or email…"
        className="mt-5 w-full max-w-sm rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text outline-none focus:border-accent"
      />

      {loading ? (
        <div className="mt-5">
          <TableSkeleton rows={6} cols={3} />
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {rows.map((u) => (
            <Link
              key={u._id}
              href={`/admin/wishlists/${u._id}`}
              className="flex items-center justify-between gap-4 border border-border bg-surface px-4 py-3 transition-colors hover:border-accent"
            >
              <div className="min-w-0">
                <p className="truncate font-body text-sm text-text">{u.fullName}</p>
                <p className="truncate font-body text-xs text-muted">{u.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-data text-xs uppercase tracking-wide text-accent">{u.count} saved</span>
                <ChevronRight className="size-4 text-muted" />
              </div>
            </Link>
          ))}
          {rows.length === 0 && <p className="px-4 py-10 text-center font-body text-muted">No saved lists yet.</p>}
        </div>
      )}
    </div>
  );
}
