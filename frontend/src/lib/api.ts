import type { ApiEnvelope } from "./types";

/**
 * Server-side base URL for the Express API. The frontend never touches
 * MongoDB directly (see /CLAUDE.md) — it always goes through this API.
 */
const API_BASE = process.env.API_URL || "http://localhost:5000/api";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface GetOptions {
  /** Next 16 cache tags for on-demand revalidation (paired with `revalidate`). */
  tags?: string[];
  /** Seconds to cache. Omit for request-time (dynamic) fetch — the default while the API may be unreachable at build. */
  revalidate?: number;
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
  const next: { revalidate?: number; tags?: string[] } = {};
  if (opts.revalidate !== undefined) next.revalidate = opts.revalidate;
  if (opts.tags) next.tags = opts.tags;

  let res: Response;
  try {
    res = await fetch(url, {
      // No `revalidate` ⇒ uncached ⇒ request-time render (dynamic).
      ...(opts.revalidate !== undefined || opts.tags ? { next } : { cache: "no-store" }),
      headers: { Accept: "application/json" },
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
