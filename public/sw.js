// Offline app shell + photo cache. Other API calls are never cached here (the app's outbox handles them).
const C = "iron-log-v3";
const PHOTOS = "il-photos-v1"; // /api/photos/<id>/img — immutable per id, so cache-first forever (trimmed to MAX)
const MAX = 600;
const DEV_HOST = location.hostname === "localhost" || location.hostname === "127.0.0.1";
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
  if (DEV_HOST) return; // local dev (Vite): never cache modules; the worker is registered there only to test notifications
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

// ---------------------------------------------------------------- notifications (Web Push, see docs/NOTIFICATIONS.md)
// Payload from worker/push.ts: {title, body, url: "#/…", tag, kind, icon, badge, renotify, ts}

const ICON = "/icon-192.png";
const BADGE = "/icon-monochrome-512.png";

/** Is a window of the app visible and already showing this hash route? (then a chat push would be noise) */
async function visibleOn(url) {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return wins.some((w) => w.visibilityState === "visible" && w.focused !== false && new URL(w.url).hash === url);
}

async function showPush(d) {
  const tag = d.tag || "iron-log";
  let body = d.body || "";
  let title = d.title || "Iron Log";
  // chat: stack the last few lines of the same conversation into one notification
  if (d.kind === "message") {
    const old = (await self.registration.getNotifications({ tag }))[0];
    const lines = [...((old && old.data && old.data.lines) || []), body].slice(-4);
    const n = ((old && old.data && old.data.n) || 0) + 1;
    old && old.close();
    return self.registration.showNotification(n > 1 ? `${title} (${n})` : title, {
      body: lines.join("\n"), tag, renotify: d.renotify !== false, icon: d.icon || ICON, badge: d.badge || BADGE, timestamp: d.ts || Date.now(),
      data: { url: d.url || "#/chats", lines, n, kind: d.kind },
    });
  }
  return self.registration.showNotification(title, {
    body, tag, renotify: !!d.renotify, icon: d.icon || ICON, badge: d.badge || BADGE, timestamp: d.ts || Date.now(),
    data: { url: d.url || "#/notifications", kind: d.kind },
  });
}

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    // the chat is open on screen: the live socket already shows the message (Chrome allows no notification while visible)
    if (d.kind === "message" && d.url && (await visibleOn(d.url))) return;
    await showPush(d);
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || "#/";
  const target = new URL("/" + (hash.startsWith("#") ? hash : "#" + hash), self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => new URL(c.url).origin === self.location.origin);
    if (w) {
      // same document, new hash → no reload; the app's hash router picks it up
      try { await w.focus(); } catch { /* not allowed */ }
      try { await w.navigate(target); } catch { w.postMessage({ type: "nav", hash }); }
      return;
    }
    await self.clients.openWindow(target);
  })());
});

// the push service rotated/expired the subscription: re-subscribe with the same key and tell the server
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    try {
      const old = e.oldSubscription;
      let key = old && old.options && old.options.applicationServerKey;
      if (!key) { const r = await fetch("/api/push/key", { credentials: "include" }); key = (await r.json()).key; }
      const sub = e.newSubscription || (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      const j = sub.toJSON();
      await fetch("/api/push/subscribe", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys, ua: "renewed" }) });
      if (old) await fetch("/api/push/subscribe", { method: "DELETE", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: old.endpoint }) });
    } catch { /* next app open re-syncs (src/lib/push.ts) */ }
  })());
});

// local notifications from the page (rest timer): the page asks, we show (works from a hidden tab on Android)
self.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.type === "notify" && m.title) e.waitUntil(showPush({ ...m, kind: m.kind || "local" }));
});
