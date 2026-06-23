/* PageTurn Nepal service worker — installability + lightweight offline support.
 * Strategy:
 *   • navigations  → network-first, fall back to /offline.html when offline
 *   • static assets/images/fonts (same-origin) → cache-first (stale-while-revalidate)
 *   • API + cross-origin (Cloudinary/Google) → left to the network, never cached
 */
const CACHE = "pageturn-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API/CDN → network
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/admin")) return;

  // Page navigations: network-first with an offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Hashed static assets + images/fonts: serve from cache, refresh in background.
  if (url.pathname.startsWith("/_next/static") || /\.(?:png|jpe?g|svg|webp|avif|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

// Optional push support (no-op until VAPID is configured).
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { return; }
  event.waitUntil(
    self.registration.showNotification(data.title || "PageTurn Nepal", {
      body: data.body || "",
      icon: data.icon || "/icon-192.png",
    })
  );
});
