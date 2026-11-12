// Phone notifications on the client: permission, Web Push subscription, device list, prefs, local notifications.
// Server side: worker/push.ts + worker/routes/push.ts. Service worker: public/sw.js. Guide: docs/NOTIFICATIONS.md.
//
// Permission UX (web.dev): never ask on load. Ask after a meaningful action, behind a soft pre-prompt that says what
// you'll get (components/push/PushPrompt.tsx). The browser prompt only appears after the user taps "Turn on".

export type NotifyCat = "chat" | "friends" | "likes" | "comments" | "cheers" | "challenges" | "rest";
export interface NotifyPrefs {
  chat: boolean; friends: boolean; likes: boolean; comments: boolean; cheers: boolean; challenges: boolean; rest: boolean;
  quiet: { on: boolean; from: string; to: string };
  tz: string;
}
export interface PushDevice { id: string; ua: string | null; createdAt: number; lastOkAt: number | null; fails: number }

export const CAT_LABELS: { id: NotifyCat; label: string; hint: string }[] = [
  { id: "chat", label: "Messages", hint: "New chat messages (muted chats stay quiet)" },
  { id: "friends", label: "Friend requests", hint: "Requests and accepts" },
  { id: "cheers", label: "Cheers", hint: "When a friend cheers you on" },
  { id: "likes", label: "Likes", hint: "One per post, no re-alert" },
  { id: "comments", label: "Comments", hint: "On your posts" },
  { id: "challenges", label: "Challenges", hint: "Invites, joins, results" },
  { id: "rest", label: "Rest timer", hint: "“Rest over” when the screen is off or you're in another app" },
];

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${url}`, { method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? r.statusText);
  return j as T;
}

// ---------------------------------------------------------------- capability + state

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
export const isTwa = () => document.referrer.startsWith("android-app://");

/** Can this browser do Web Push right now? iOS: only from the Home Screen app (16.4+). */
export function pushSupport(): "ok" | "ios-install" | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS() && !isStandalone()) return "ios-install";
  return has ? "ok" : "unsupported";
}

export const permission = (): NotificationPermission | "unsupported" => ("Notification" in window ? Notification.permission : "unsupported");

/** Short device label for the device list. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? "Android" : isIOS() ? (/iPad/.test(ua) ? "iPad" : "iPhone") : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Device";
  if (isTwa()) return `${os} · Iron Log app`;
  const br = /EdgA?\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Browser";
  return `${os} · ${br}${isStandalone() ? " (installed)" : ""}`;
}

/** The service worker registration (registers /sw.js on demand: in dev the app doesn't register it on load). */
export async function swReg(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const r = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    return r;
  } catch {
    return null;
  }
}

export async function currentSub(): Promise<PushSubscription | null> {
  const r = await swReg();
  return r ? r.pushManager.getSubscription() : null;
}

/** Same id the server uses (sha-256 of the endpoint) → "this device" in the list. */
export async function subId(sub: PushSubscription | null): Promise<string | null> {
  if (!sub || !crypto.subtle) return null;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub.endpoint)));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4));
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
}
const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i]);

async function register(sub: PushSubscription) {
  const j = sub.toJSON();
  await call("POST", "/push/subscribe", { endpoint: j.endpoint, keys: j.keys, ua: deviceLabel() });
}

/**
 * Turn notifications on for this device. MUST be called from a tap (iOS needs the permission request inside the gesture,
 * so it's the very first await). Returns the final permission.
 */
export async function enablePush(): Promise<NotificationPermission | "unsupported"> {
  if (pushSupport() !== "ok") return "unsupported";
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") return perm;
  const { key } = await call<{ key: string | null }>("GET", "/push/key");
  if (!key) throw new Error("Notifications aren't set up on the server yet");
  const reg = await swReg();
  if (!reg) throw new Error("Service worker unavailable");
  const app = keyBytes(key);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, app)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: app });
  await register(sub);
  await syncLocalPrefs();
  return "granted";
}

/** Turn notifications off for THIS device only. */
export async function disablePush() {
  const sub = await currentSub();
  if (!sub) return;
  await call("DELETE", "/push/subscribe", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/**
 * Call once after login / app start (cheap): if this device already allowed notifications, make sure the server still has
 * its subscription (it may have been pruned, rotated, or the VAPID key changed). Never prompts.
 */
export async function syncPush() {
  try {
    if (pushSupport() !== "ok" || Notification.permission !== "granted") return;
    const sub = await currentSub();
    if (!sub) return;
    const { key } = await call<{ key: string | null }>("GET", "/push/key");
    if (key && !sameKey(sub.options.applicationServerKey, keyBytes(key))) { await enablePush(); return; }
    await register(sub);
    await syncLocalPrefs();
  } catch { /* offline: next start */ }
}

export const listDevices = () => call<{ devices: PushDevice[] }>("GET", "/push/devices").then((r) => r.devices);
export const removeDevice = (id: string) => call("DELETE", `/push/devices/${encodeURIComponent(id)}`);
export const sendTest = () => call<{ sent: number; results: { id: string; status: number; ok: boolean }[] }>("POST", "/push/test");

// ---------------------------------------------------------------- prefs (server: users.prefs.notify; rest flag mirrored locally)

const REST_KEY = "il_notify_rest";
export const getPrefs = () => call<{ prefs: NotifyPrefs }>("GET", "/push/prefs").then((r) => { mirror(r.prefs); return r.prefs; });
export const savePrefs = (p: Partial<NotifyPrefs>) => call<{ prefs: NotifyPrefs }>("PUT", "/push/prefs", { ...p, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }).then((r) => { mirror(r.prefs); return r.prefs; });
function mirror(p: NotifyPrefs) { try { localStorage.setItem(REST_KEY, p.rest ? "1" : "0"); } catch { /* private mode */ } }
async function syncLocalPrefs() { await getPrefs().catch(() => {}); }
const restAllowed = () => { try { return localStorage.getItem(REST_KEY) !== "0"; } catch { return true; } };

// ---------------------------------------------------------------- local notifications (rest timer)

/**
 * Show a notification from the page through the service worker (Android Chrome forbids `new Notification()`).
 * Only when permission is granted and the rest-timer toggle is on. Returns whether it was shown.
 */
export async function localNotify(n: { title: string; body: string; tag: string; url?: string; cat?: NotifyCat }): Promise<boolean> {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    if ((n.cat ?? "rest") === "rest" && !restAllowed()) return false;
    const reg = await swReg();
    if (!reg) return false;
    await reg.showNotification(n.title, {
      body: n.body, tag: n.tag, icon: "/icon-192.png", badge: "/icon-monochrome-512.png", requireInteraction: false,
      data: { url: n.url ?? location.hash ?? "#/", kind: "local" },
      // renotify + vibrate exist in Chrome but not in the TS lib types
      ...({ renotify: true, vibrate: [300, 150, 300] } as object),
    });
    return true;
  } catch {
    return false;
  }
}

export async function closeLocal(tag: string) {
  try { (await (await swReg())?.getNotifications({ tag }))?.forEach((x) => x.close()); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- soft prompt bookkeeping

const NUDGE_KEY = "il_push_nudge";
/** Show the soft pre-prompt? Only when the browser could still ask, and not dismissed in the last 14 days. */
export function shouldNudge(): boolean {
  if (pushSupport() !== "ok" || Notification.permission !== "default") return false;
  try { return Date.now() - Number(localStorage.getItem(NUDGE_KEY) ?? 0) > 14 * 86400_000; } catch { return false; }
}
export function snoozeNudge() { try { localStorage.setItem(NUDGE_KEY, String(Date.now())); } catch { /* ignore */ } }

// the service worker falls back to this when it can't navigate an uncontrolled window
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    const m = e.data as { type?: string; hash?: string } | null;
    if (m?.type === "nav" && typeof m.hash === "string" && m.hash.startsWith("#/")) location.hash = m.hash.slice(1);
  });
}
