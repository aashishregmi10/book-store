"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { clientApi } from "@/lib/client-api";
import { CouponForm, EMPTY_COUPON, toPayload, type CouponFormValues } from "../_components/CouponForm";

export default function NewCoupon() {
  const router = useRouter();

  async function create(values: CouponFormValues) {
    await clientApi.post("/admin/coupons", toPayload(values));
    router.push("/admin/coupons");
    router.refresh();
  }

  return (
    <div>
      <Link href="/admin/coupons" className="inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-muted hover:text-accent">
        <ChevronLeft className="size-4" /> Back to coupons
      </Link>
      <h1 className="mt-3 mb-6 font-display text-3xl text-text">New coupon</h1>
      <CouponForm initial={EMPTY_COUPON} submitLabel="Create coupon" cancelHref="/admin/coupons" onSubmit={create} />
    </div>
  );
}
