// Offline app shell. API calls are never cached here (the app's outbox handles them).
const C = "iron-log-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(["/", "/icon.svg", "/manifest.webmanifest"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate") {
    // network first so new deploys show up; fall back to cached shell offline
    e.respondWith(fetch(e.request).then((r) => { caches.open(C).then((c) => c.put("/", r.clone())); return r; }).catch(() => caches.match("/")));
    return;
  }
  // hashed assets: cache first
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const cl = r.clone(); caches.open(C).then((c) => c.put(e.request, cl)); } return r; })));
});
