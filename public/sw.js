// Minimal service worker (§7.1): an offline fallback page, nothing else.
// Only page navigations are intercepted, and only to catch a network
// failure. Feeds, API responses, images and anything auth-related are never
// cached: the one cached response is /offline, which holds no user data.
// Bump CACHE when /offline changes.

const CACHE = "offline-v2";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  // Sign-in is the riskiest flow on iOS; leave it entirely to the browser.
  if (new URL(req.url).pathname.startsWith("/oauth/")) return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});
