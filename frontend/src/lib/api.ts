import type { ApiEnvelope } from "./types";

/**
 * Server-side base URL for the Express API. The frontend never touches
 * MongoDB directly (see /CLAUDE.md) — it always goes through this API.
 */
export const API_BASE = process.env.API_URL || "http://localhost:5000/api";

/**
 * Marks a request as coming from our own server rather than a browser, so the
 * API's IP-keyed rate limiter doesn't count every shopper's server render
 * against the one shared Vercel egress address. Server-only — this module is
 * never bundled for the client, and the value has no `NEXT_PUBLIC_` prefix, so
 * it cannot leak into the browser. Optional: unset simply means no exemption.
 */
const INTERNAL_KEY = process.env.INTERNAL_API_KEY;

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * Default cache window for any tagged read that doesn't name its own. Nothing
 * calls `revalidateTag` today (the admin is a separate app that talks to
 * Express directly), so a tag on its own would pin a response forever — the
 * time window is what actually makes the catalogue self-heal.
 */
export const DEFAULT_REVALIDATE = 300; // 5 minutes

/**
 * Tag on every read of the homepage rails (Bestsellers / New arrivals / Staff
 * favourites). The admin's "Shuffle homepage" expires exactly this tag, so a
 * shuffle shows up on the next visit without invalidating the whole catalogue.
 */
export const RAILS_TAG = "rails";

/**
 * Revalidation windows, longest-lived first. Kept together so the whole
 * storefront's freshness/latency trade-off is one thing to read and tune.
 */
export const CACHE_TTL = {
  /** Taxonomy — 16 slugs that change when someone edits seed-taxonomy.js. */
  genres: 3600,
  /** Editorial — articles are published, then rarely touched. */
  articles: 900,
  /** Catalogue listings + homepage rails. Stock and price move here. */
  catalogue: 300,
  /** A single book: price, stock and reviews all surface on this page. */
  book: 120,
} as const;

interface GetOptions {
  /** Next 16 cache tags for on-demand revalidation (paired with `revalidate`). */
  tags?: string[];
  /** Seconds to cache. Defaults to DEFAULT_REVALIDATE when `tags` are given. */
  revalidate?: number;
  /** Opt out of the Data Cache entirely — per-user reads, never catalogue reads. */
  noStore?: boolean;
  searchParams?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, searchParams?: GetOptions["searchParams"]) {
  const url = new URL(`${API_BASE}${path}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/**
 * GET a JSON `{ data, message }` envelope from the API and return `data`.
 * Throws ApiError on non-2xx or network failure so pages can render
 * graceful empty/error states.
 */
export async function apiGet<T>(path: string, opts: GetOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.searchParams);

  // `fetch` is uncached by default in Next 16, and `next.tags` alone does NOT
  // opt a request in — without `cache: 'force-cache'` the tags are inert and
  // every render hits Express again. That, plus `force-dynamic` on the pages,
  // is what had the whole storefront re-querying Mongo on every navigation.
  const cached = !opts.noStore && (opts.tags !== undefined || opts.revalidate !== undefined);

  let res: Response;
  try {
    res = await fetch(url, {
      ...(cached
        ? {
            cache: "force-cache" as const,
            next: {
              revalidate: opts.revalidate ?? DEFAULT_REVALIDATE,
              ...(opts.tags ? { tags: opts.tags } : {}),
            },
          }
        : { cache: "no-store" as const }),
      headers: {
        Accept: "application/json",
        ...(INTERNAL_KEY ? { "x-internal-key": INTERNAL_KEY } : {}),
      },
    });
  } catch (err) {
    throw new ApiError(`Network error reaching API: ${(err as Error).message}`, 0);
  }

  let json: ApiEnvelope<T> | { message?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    throw new ApiError((json as { message?: string })?.message || `API ${res.status}`, res.status, json);
  }
  return (json as ApiEnvelope<T>).data;
}

/** Convenience: returns null instead of throwing on 404 (e.g. unknown slug). */
export async function apiGetOrNull<T>(path: string, opts: GetOptions = {}): Promise<T | null> {
  try {
    return await apiGet<T>(path, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
