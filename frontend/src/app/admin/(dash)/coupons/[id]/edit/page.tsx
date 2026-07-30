"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { CouponForm, toPayload, type CouponFormValues, type CouponType } from "../../_components/CouponForm";
import { PageSpinner } from "@/components/ui/Spinner";

interface AdminCouponDetail {
  code: string;
  description?: string;
  type: CouponType;
  value: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usageCount?: number;
  perUserLimit?: number;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  newUserOnly?: boolean;
  applicableGenres?: string[];
}

// <input type="date"> only accepts yyyy-MM-dd; the API returns full ISO stamps.
const dateInput = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
const numInput = (n?: number) => (n === undefined || n === null ? "" : String(n));

export default function EditCoupon() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [initial, setInitial] = useState<CouponFormValues | null>(null);
  const [redeemed, setRedeemed] = useState(0);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    clientApi
      .get<AdminCouponDetail>(`/admin/coupons/${id}`)
      .then((c) => {
        if (!active) return;
        setRedeemed(c.usageCount || 0);
        setInitial({
          code: c.code,
          description: c.description || "",
          type: c.type,
          value: numInput(c.value),
          minOrderAmount: numInput(c.minOrderAmount),
          maxDiscount: numInput(c.maxDiscount),
          usageLimit: numInput(c.usageLimit),
          perUserLimit: numInput(c.perUserLimit ?? 1),
          startDate: dateInput(c.startDate),
          endDate: dateInput(c.endDate),
          isActive: c.isActive !== false,
          newUserOnly: c.newUserOnly === true,
          applicableGenres: c.applicableGenres || [],
        });
      })
      .catch(() => active && setMissing(true));
    return () => {
      active = false;
    };
  }, [id]);

  async function save(values: CouponFormValues) {
    await clientApi.put(`/admin/coupons/${id}`, toPayload(values));
    router.push("/admin/coupons");
    router.refresh();
  }

  if (missing) return <p className="font-body text-muted">We couldn&apos;t find that coupon.</p>;
  if (!initial) return <PageSpinner label="Loading coupon…" />;

  return (
    <div>
      <Link href="/admin/coupons" className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-muted hover:text-accent">
        <ChevronLeft className="size-4" /> Back to coupons
      </Link>
      <h1 className="mt-3 font-display text-3xl text-text">Edit coupon</h1>
      <p className="mb-6 mt-1 font-body text-sm text-muted">
        Redeemed {redeemed} {redeemed === 1 ? "time" : "times"} so far.
      </p>
      <CouponForm initial={initial} submitLabel="Save changes" cancelHref="/admin/coupons" onSubmit={save} />
    </div>
  );
}
