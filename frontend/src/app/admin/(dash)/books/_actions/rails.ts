"use server";

import { updateTag } from "next/cache";
import { API_BASE, RAILS_TAG } from "@/lib/api";

/**
 * Expire the storefront's cached homepage rails after an admin shuffle, so the
 * next visit to the homepage is built in the new order.
 *
 * `updateTag`, not `revalidateTag(tag, "max")`: the admin who just clicked
 * Shuffle is going to look at the homepage straight away, and "max" would serve
 * them the old order once more while refreshing in the background — reading as
 * "the button did nothing". updateTag makes the next request wait for fresh
 * data. It only works inside a Server Action, hence this file.
 *
 * A Server Action is a public endpoint, so the caller must prove they are an
 * admin before the cache is touched: their own access token goes to the API's
 * /auth/me, and only `isAdmin: true` gets through. The shuffle itself already
 * happened in the API (POST /admin/merchandising/shuffle, admin-gated there);
 * this only refreshes the storefront's copy.
 */
export async function refreshHomepageRails(token: string | null): Promise<{ ok: boolean }> {
  if (!token) return { ok: false };
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { data?: { isAdmin?: boolean } };
    if (json.data?.isAdmin !== true) return { ok: false };
  } catch {
    return { ok: false };
  }
  updateTag(RAILS_TAG);
  return { ok: true };
}
