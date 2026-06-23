"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so the app is installable + works offline.
 * Production only — a dev service worker would cache Turbopack chunks and serve
 * stale builds. Renders nothing.
 */
export function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
