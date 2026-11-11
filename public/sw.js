// Offline app shell + photo cache. Other API calls are never cached here (the app's outbox handles them).
const C = "iron-log-v3";
const PHOTOS = "il-photos-v1"; // /api/photos/<id>/img — immutable per id, so cache-first forever (trimmed to MAX)
const MAX = 600;
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(["/", "/icon.svg", "/manifest.webmanifest"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C && k !== PHOTOS).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

async function trim() {
  const c = await caches.open(PHOTOS);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX; i++) await c.delete(keys[i]); // oldest first
}

async function photo(req) {
  const c = await caches.open(PHOTOS);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok && r.status === 200) { await c.put(req, r.clone()); trim(); }
  return r;
}

// The page asks us to forget photos (logout, or one photo deleted)
self.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.type === "photos:clear") e.waitUntil(caches.delete(PHOTOS));
  if (m.type === "photos:forget" && m.id) e.waitUntil(caches.open(PHOTOS).then((c) => Promise.all([c.delete(`/api/photos/${m.id}/img`), c.delete(`/api/photos/${m.id}/img?s=t`)])));
});

self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (/^\/api\/photos\/[\w-]+\/img$/.test(u.pathname)) { e.respondWith(photo(e.request)); return; }
  if (u.pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate") {
    // network first so new deploys show up; fall back to cached shell offline
    e.respondWith(fetch(e.request).then((r) => { caches.open(C).then((c) => c.put("/", r.clone())); return r; }).catch(() => caches.match("/")));
    return;
  }
  // hashed assets: cache first
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const cl = r.clone(); caches.open(C).then((c) => c.put(e.request, cl)); } return r; })));
});
