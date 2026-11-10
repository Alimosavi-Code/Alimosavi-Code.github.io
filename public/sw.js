/* ShiftKar Web v6.7.2 — offline-first service worker.
 * Network-first for pages, bundles, manifest & icons (so updates appear immediately),
 * cache-first for immutable font files.
 * The base path is derived from the SW scope, so the SAME file works on
 * the root domain (""), GitHub Pages user sites ("") and project sites
 * ("/<repo>") without any rebuild-time rewriting. */
const CACHE = 'shiftkar-web-v675';
const BASE = new URL(self.registration.scope).pathname.replace(/\/+$/, "");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([`${BASE}/`, `${BASE}/manifest.webmanifest`]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) return;

  const url = new URL(req.url);
  const p = url.pathname;

  /* Do not intercept the standalone /download page or its assets */
  if (p === `${BASE}/download` || p.startsWith(`${BASE}/download/`)) return;
  const immutableFont = p.startsWith(`${BASE}/fonts/`);

  /* Immutable font files: cache-first */
  if (immutableFont) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  /* Pages, JS/CSS bundles, manifest & icons: network-first with offline cache fallback */
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && req.destination !== "") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match(`${BASE}/`))),
  );
});
