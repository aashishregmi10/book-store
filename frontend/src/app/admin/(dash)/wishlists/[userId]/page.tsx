"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { npr } from "@/lib/format";
import { Skeleton } from "@/components/ui/Skeleton";

interface WishItem {
  _id: string;
  title: string;
  slug: string;
  author?: string;
  price: number;
  comparePrice?: number;
  stockStatus: string;
  genre: string;
  coverImage?: string;
}
interface WishlistDetail {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  createdAt: string;
  count: number;
  items: WishItem[];
}

export default function WishlistDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<WishlistDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let active = true;
    clientApi
      .get<WishlistDetail>(`/admin/wishlists/${userId}`)
      .then((d) => active && (setData(d), setStatus("ready")))
      .catch(() => active && setStatus("missing"));
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <div>
      <Link href="/admin/wishlists" className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-muted hover:text-accent">
        <ChevronLeft className="size-4" /> All wishlists
      </Link>

      {status === "loading" && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      )}

      {status === "missing" && <p className="mt-6 font-body text-muted">Customer not found.</p>}

      {status === "ready" && data && (
        <>
          <h1 className="mt-3 font-display text-3xl text-text">{data.fullName}</h1>
          <p className="mt-1 font-body text-sm text-muted">
            {data.email}
            {data.phone ? ` · ${data.phone}` : ""} · {data.count} saved
          </p>

          {data.items.length === 0 ? (
            <p className="mt-6 font-body text-muted">This customer&apos;s wishlist is empty.</p>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((b) => (
                <li key={b._id} className="flex gap-3 border border-border bg-surface p-3">
                  <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded border border-border bg-bg">
                    {b.coverImage ? <Image src={b.coverImage} alt={`${b.title} cover`} fill sizes="64px" className="object-cover" /> : null}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link href={`/admin/books/${b.slug}`} className="font-body text-sm text-text hover:text-accent">
                      {b.title}
                    </Link>
                    {b.author && <p className="font-body text-xs text-muted">{b.author}</p>}
                    <p className="font-data text-xs uppercase tracking-wide text-muted">{b.genre}</p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="font-data text-sm text-text">{npr(b.price)}</span>
                      <span className={`font-data text-xs uppercase tracking-wide ${b.stockStatus === "in-stock" ? "text-accent" : "text-sale"}`}>
                        {b.stockStatus.replace(/-/g, " ")}
                      </span>
                    </div>
                    <Link href={`/books/${b.slug}`} target="_blank" className="mt-1 font-data text-xs text-muted hover:text-accent">
                      View on storefront →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
