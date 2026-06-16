"use client";

import { getToken, setAccessToken, clearAuth } from "./stores/auth";
import type { ApiEnvelope } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

// Auth errors that a token refresh can plausibly fix. ADMIN_REQUIRED / BANNED /
// RATE_LIMITED are deliberately excluded — refreshing won't help those.
const REFRESHABLE = new Set(["TOKEN_EXPIRED", "INVALID_TOKEN", "NO_TOKEN"]);

// Single-flight refresh: concurrent 401/403s share one /auth/refresh call.
let refreshing: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "include", // sends the httpOnly refresh cookie
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const json = await res.json().catch(() => null);
        const token = (json as ApiEnvelope<{ accessToken?: string }> | null)?.data?.accessToken ?? null;
        if (token) setAccessToken(token);
        return token;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

// Reads the error code from a failed response without consuming the caller's
// copy of the body (uses a clone).
async function errorCode(res: Response): Promise<string | undefined> {
  const json = await res.clone().json().catch(() => null);
  return (json as { errors?: Array<{ code?: string }> } | null)?.errors?.[0]?.code;
}

export class ClientApiError extends Error {
  status: number;
  errors: Array<{ field?: string; code?: string; message?: string }>;
  constructor(message: string, status: number, errors: ClientApiError["errors"] = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: "application/json", ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function unwrap<T>(res: Response): Promise<T> {
  let json: (ApiEnvelope<T> & { errors?: unknown }) | { message?: string; errors?: unknown } | null = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    const j = (json || {}) as { message?: string; errors?: ClientApiError["errors"] };
    throw new ClientApiError(j.message || `Request failed (${res.status})`, res.status, j.errors || []);
  }
  return (json as ApiEnvelope<T>).data;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true, signal?: AbortSignal): Promise<T> {
  const headers = authHeaders(body !== undefined ? { "Content-Type": "application/json" } : undefined);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: "include", // send/receive the httpOnly refresh cookie
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal, // lets callers cancel stale/duplicate requests
    });
  } catch (err) {
    // Surface aborts distinctly so callers can ignore them instead of showing
    // a "can't reach the server" error for an intentional cancellation.
    if ((err as Error)?.name === "AbortError") throw new ClientApiError("Aborted", 0, [{ code: "ABORTED" }]);
    throw new ClientApiError(`Can't reach the server. Is the API running?`, 0);
  }

  if (res.status >= 400 && retry && path !== "/auth/refresh") {
    const code = await errorCode(res);
    if (code && REFRESHABLE.has(code)) {
      const token = await refreshAccessToken();
      if (token) return request<T>(method, path, body, false, signal); // retry once with the fresh token
      clearAuth(); // refresh failed — session is over
    }
  }

  return unwrap<T>(res);
}

// Multipart upload — do NOT set Content-Type; the browser adds the boundary.
async function upload<T>(path: string, form: FormData, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "include",
      body: form,
    });
  } catch {
    throw new ClientApiError(`Can't reach the server. Is the API running?`, 0);
  }

  if (res.status >= 400 && retry) {
    const code = await errorCode(res);
    if (code && REFRESHABLE.has(code)) {
      const token = await refreshAccessToken();
      if (token) return upload<T>(path, form, false);
      clearAuth();
    }
  }

  return unwrap<T>(res);
}

export const clientApi = {
  get: <T>(path: string, opts?: { signal?: AbortSignal }) => request<T>("GET", path, undefined, true, opts?.signal),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, form: FormData) => upload<T>(path, form),
};
