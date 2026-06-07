"use client";

import { useEffect, useState } from "react";
import { ShieldBan, ShieldCheck } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";

interface AdminUser {
  _id: string;
  fullName: string;
  email: string;
  tier: string;
  points: number;
  isBanned: boolean;
  orderCount: number;
  totalSpent: number;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const path = search ? `/admin/users?search=${encodeURIComponent(search)}` : "/admin/users";
    clientApi
      .get<AdminUser[]>(path)
      .then((d) => active && setUsers(d))
      .catch(() => active && setUsers([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [search, refreshKey]);
  const refresh = () => setRefreshKey((k) => k + 1);

  async function toggleBan(u: AdminUser) {
    setBusy(u._id);
    try {
      await clientApi.put(`/admin/users/${u._id}/${u.isBanned ? "unban" : "ban"}`, {});
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-text">Customers</h1>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email…" className="mt-5 w-full max-w-sm border border-border bg-surface px-3 py-2 font-body text-sm text-text outline-none focus:border-accent" />

      <div className="mt-5 overflow-x-auto border border-border bg-surface">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-bg font-data text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Orders</th>
              <th className="px-4 py-3">Spent</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u._id} className={`hover:bg-bg ${u.isBanned ? "opacity-60" : ""}`}>
                <td className="px-4 py-3">
                  <p className="font-body text-sm text-text">{u.fullName}</p>
                  <p className="font-body text-xs text-muted">{u.email}</p>
                </td>
                <td className="px-4 py-3 font-data text-xs uppercase text-muted">{u.tier} · {u.points}p</td>
                <td className="px-4 py-3 font-data text-sm text-text">{u.orderCount}</td>
                <td className="px-4 py-3 font-data text-sm text-text">{npr(u.totalSpent)}</td>
                <td className="px-4 py-3">
                  <span className={`font-data text-xs uppercase ${u.isBanned ? "text-sale" : "text-accent"}`}>{u.isBanned ? "Banned" : "Active"}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <button disabled={busy === u._id} onClick={() => toggleBan(u)} className={`inline-flex items-center gap-1.5 border border-border px-2 py-1 font-data text-xs uppercase disabled:opacity-50 ${u.isBanned ? "text-accent hover:border-accent" : "text-sale hover:border-sale"}`}>
                      {u.isBanned ? <ShieldCheck className="size-3.5" /> : <ShieldBan className="size-3.5" />}
                      {u.isBanned ? "Unban" : "Ban"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`s${i}`}>
                  {Array.from({ length: 6 }).map((_, c) => (
                    <td key={c} className="px-4 py-4"><span className="block h-4 w-full animate-pulse bg-border/70" /></td>
                  ))}
                </tr>
              ))}
            {!loading && users.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center font-body text-muted">No customers.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
