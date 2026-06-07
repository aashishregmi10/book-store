"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface WishItem {
  _id: string;
  title: string;
  slug: string;
  price: number;
  stockStatus: string;
  genre: string;
}
interface UserWishlist {
  _id: string;
  fullName: string;
  email: string;
  count: number;
  items: WishItem[];
}

export default function AdminWishlists() {
  const [rows, setRows] = useState<UserWishlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

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
        Who saved what. Use it to prioritise restocks, target a promo, or reach out when a saved title drops in price.
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
          {rows.map((u) => {
            const expanded = open === u._id;
            return (
              <div key={u._id} className="border border-border bg-surface">
                <button
                  onClick={() => setOpen(expanded ? null : u._id)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-bg"
                >
                  <div className="min-w-0">
                    <p className="truncate font-body text-sm text-text">{u.fullName}</p>
                    <p className="truncate font-body text-xs text-muted">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-data text-xs uppercase tracking-wide text-accent">{u.count} saved</span>
                    {expanded ? <ChevronDown className="size-4 text-muted" /> : <ChevronRight className="size-4 text-muted" />}
                  </div>
                </button>

                {expanded && (
                  <ul className="divide-y divide-border border-t border-border">
                    {u.items.map((b) => (
                      <li key={b._id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                        <div className="min-w-0">
                          <Link href={`/admin/books/${b.slug}`} className="font-body text-sm text-text hover:text-accent">
                            {b.title}
                          </Link>
                          <p className="font-data text-xs uppercase tracking-wide text-muted">{b.genre}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-data text-sm text-text">{npr(b.price)}</span>
                          <span className={`font-data text-xs uppercase tracking-wide ${b.stockStatus === "in-stock" ? "text-accent" : "text-sale"}`}>
                            {b.stockStatus.replace(/-/g, " ")}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="px-4 py-10 text-center font-body text-muted">No saved lists yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
