// Web Push without libraries: VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291 / RFC 8188) on WebCrypto.
// Delivery headers per RFC 8030: TTL, Urgency, Topic. See docs/NOTIFICATIONS.md.
//
//   sendToUser(raw, env, userId, payload, opts)  → every device of that user (pruned on 404/410, fails counted)
//   pushFor(raw, env, …)                         → the same, but checks the user's notification prefs + quiet hours first
//
// Everything here is best-effort: callers run it after the response (waitUntil) and never await it on the hot path.
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import * as t from "./db/schema";
import type { RawDB } from "./db";
import type { Env } from "./env";

type Bindings = Env["Bindings"];

// ---------------------------------------------------------------- payload + prefs (mirrored in src/lib/push.ts)

/** What the service worker receives (keep it small: push services cap at ~4 KB; no private data like journal / pain). */
export interface PushPayload {
  title: string;
  body: string;
  /** Hash route to open on tap, e.g. "#/chat/abc". */
  url: string;
  /** Same tag = replaces the previous notification on the device (collapse). */
  tag: string;
  kind: string;
  icon?: string;
  badge?: string;
  /** Re-alert (sound/vibrate) when replacing a notification with the same tag. */
  renotify?: boolean;
  ts?: number;
}

export type NotifyCat = "chat" | "friends" | "likes" | "comments" | "cheers" | "challenges" | "rest";
export const CATS: NotifyCat[] = ["chat", "friends", "likes", "comments", "cheers", "challenges", "rest"];

export interface NotifyPrefs {
  chat: boolean; friends: boolean; likes: boolean; comments: boolean; cheers: boolean; challenges: boolean; rest: boolean;
  /** Quiet hours: pushes are not sent between from and to (24h "HH:MM", in the user's tz). Rest timer is local → unaffected. */
  quiet: { on: boolean; from: string; to: string };
  /** IANA time zone of the user's phone (for quiet hours). */
  tz: string;
}
export const NOTIFY_DEFAULTS: NotifyPrefs = {
  chat: true, friends: true, likes: true, comments: true, cheers: true, challenges: true, rest: true,
  quiet: { on: false, from: "22:30", to: "07:30" }, tz: "Africa/Cairo",
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function mergeNotify(prefsJson: string | null | undefined): NotifyPrefs {
  let n: Partial<NotifyPrefs> = {};
  try { n = (JSON.parse(prefsJson || "{}") as { notify?: Partial<NotifyPrefs> }).notify ?? {}; } catch { /* bad json → defaults */ }
  return sanitizeNotify(n);
}

export function sanitizeNotify(n: Partial<NotifyPrefs> | null | undefined): NotifyPrefs {
  const out: NotifyPrefs = { ...NOTIFY_DEFAULTS, quiet: { ...NOTIFY_DEFAULTS.quiet } };
  if (!n || typeof n !== "object") return out;
  for (const k of CATS) if (typeof n[k] === "boolean") out[k] = n[k] as boolean;
  const q = n.quiet;
  if (q && typeof q === "object") {
    if (typeof q.on === "boolean") out.quiet.on = q.on;
    if (typeof q.from === "string" && HHMM.test(q.from)) out.quiet.from = q.from;
    if (typeof q.to === "string" && HHMM.test(q.to)) out.quiet.to = q.to;
  }
  if (typeof n.tz === "string" && n.tz.length < 64) {
    try { new Intl.DateTimeFormat("en", { timeZone: n.tz }); out.tz = n.tz; } catch { /* unknown zone */ }
  }
  return out;
}

/** Is `at` inside the quiet window (handles windows over midnight)? */
export function inQuiet(p: NotifyPrefs, at = Date.now()): boolean {
  if (!p.quiet.on || p.quiet.from === p.quiet.to) return false;
  let hm: string;
  try {
    hm = new Intl.DateTimeFormat("en-GB", { timeZone: p.tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  } catch { return false; }
  const { from, to } = p.quiet;
  return from < to ? hm >= from && hm < to : hm >= from || hm < to;
}

/** In-app notification kind (worker/friends.ts notify()) → prefs category. Unknown kinds don't push. */
export function catOf(kind: string): NotifyCat | null {
  if (kind === "friend_request" || kind === "friend_accept") return "friends";
  if (kind === "like") return "likes";
  if (kind === "comment") return "comments";
  if (kind === "cheer") return "cheers";
  if (kind.startsWith("challenge_")) return "challenges";
  if (kind === "message") return "chat";
  return null;
}

// ---------------------------------------------------------------- base64url + bytes

const enc = new TextEncoder();
export function b64u(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64u(s: string): Uint8Array<ArrayBuffer> {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(p);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
export async function sha256hex(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------- RFC 8291: aes128gcm encryption

/**
 * Encrypt `plaintext` for one subscription (p256dh = the browser's P-256 public key, 65 bytes uncompressed; auth = 16 bytes).
 * Output = the aes128gcm body: salt(16) | rs(4) | idlen(1) | keyid = our ephemeral public key(65) | ciphertext.
 * `salt`/`asKeys` are injectable only for test vectors.
 */
export async function encryptPayload(p256dh: string, auth: string, plaintext: Uint8Array<ArrayBuffer>, test?: { salt: Uint8Array<ArrayBuffer>; asKeys: CryptoKeyPair }) {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length < 16) throw new Error("bad subscription keys");
  const as = test?.asKeys ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", as.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, as.privateKey, 256));
  // HKDF (single 32-byte block, so Extract = HMAC(salt, ikm) and Expand = HMAC(prk, info | 0x01))
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);
  const salt = test?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  // single record: plaintext | 0x02 (last-record delimiter), no padding
  const record = concat(plaintext, new Uint8Array([2]));
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, record));
  const rs = 4096;
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  return concat(header, asPublic, ct);
}

// ---------------------------------------------------------------- RFC 8292: VAPID JWT (ES256)

let signKey: { pub: string; key: CryptoKey } | null = null;
const jwtCache = new Map<string, { jwt: string; exp: number }>();

async function vapidKey(env: Bindings): Promise<CryptoKey> {
  if (signKey && signKey.pub === env.VAPID_PUBLIC_KEY) return signKey.key;
  const pub = unb64u(env.VAPID_PUBLIC_KEY!);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY must be an uncompressed P-256 point (base64url)");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: env.VAPID_PRIVATE_KEY, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: false },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  signKey = { pub: env.VAPID_PUBLIC_KEY!, key };
  return key;
}

/** Signed JWT for one push service origin. Cached ~11 h (exp must be ≤ 24 h). */
export async function vapidJwt(env: Bindings, audience: string): Promise<string> {
  const nowS = Math.floor(Date.now() / 1000);
  const hit = jwtCache.get(audience);
  if (hit && hit.exp - nowS > 3600) return hit.jwt;
  const exp = nowS + 12 * 3600;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud: audience, exp, sub: env.VAPID_SUBJECT || "mailto:admin@example.com" })));
  // WebCrypto ECDSA returns r|s (IEEE P1363, 64 bytes) = exactly the JWS ES256 format
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await vapidKey(env), enc.encode(`${head}.${body}`));
  const jwt = `${head}.${body}.${b64u(sig)}`;
  jwtCache.set(audience, { jwt, exp });
  return jwt;
}

export const pushConfigured = (env: Bindings) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

// ---------------------------------------------------------------- sending

/** Only real push services (no SSRF via a made-up endpoint): FCM (+ legacy GCM jmtNN.google.com), Mozilla autopush, Apple, Microsoft WNS. */
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /^jmt\d+\.google\.com$/, /(^|\.)mozilla\.com$/, /(^|\.)mozaws\.net$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function okEndpoint(endpoint: string): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 1024) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch { return false; }
}

export interface SendOpts {
  /** Seconds the push service keeps it while the phone is offline. Chat: 1 day; likes: 3 days; test: 60 s. */
  ttl?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  /** Collapse key on the push service: a newer push with the same topic replaces an undelivered one. Hashed to ≤32 chars. */
  topic?: string;
}

type Sub = typeof t.pushSubs.$inferSelect;
export interface SendResult { id: string; status: number; ok: boolean; removed?: boolean }

/** One HTTP POST to the push service. Returns the status (0 = network error). */
export async function sendOne(env: Bindings, sub: Pick<Sub, "endpoint" | "p256dh" | "auth">, payload: PushPayload | Record<string, unknown>, opts: SendOpts = {}): Promise<number> {
  const body = await encryptPayload(sub.p256dh, sub.auth, new Uint8Array(enc.encode(JSON.stringify(payload))));
  const aud = new URL(sub.endpoint).origin;
  const headers: Record<string, string> = {
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(Math.max(0, Math.min(opts.ttl ?? 86400, 28 * 86400))),
    Urgency: opts.urgency ?? "normal",
    Authorization: `vapid t=${await vapidJwt(env, aud)}, k=${env.VAPID_PUBLIC_KEY}`,
  };
  if (opts.topic) headers.Topic = b64u((await crypto.subtle.digest("SHA-256", enc.encode(opts.topic))).slice(0, 24)); // 32 url-safe chars
  try {
    const r = await fetch(sub.endpoint, { method: "POST", headers, body });
    await r.body?.cancel();
    return r.status;
  } catch {
    return 0;
  }
}

const MAX_FAILS = 8; // consecutive non-404/410 failures before a device is dropped

/** Push to every device of a user. Prunes gone subscriptions (404/410) and counts failures. */
export async function sendToUser(raw: RawDB, env: Bindings, userId: string, payload: PushPayload, opts: SendOpts = {}): Promise<SendResult[]> {
  if (!pushConfigured(env)) return [];
  const subs = await raw.select().from(t.pushSubs).where(eq(t.pushSubs.userId, userId));
  const full: PushPayload = { icon: "/icon-192.png", badge: "/icon-monochrome-512.png", ts: Date.now(), ...payload };
  full.title = full.title.slice(0, 80);
  full.body = full.body.slice(0, 240);
  return Promise.all(subs.map(async (s): Promise<SendResult> => {
    let status = 0;
    try { status = await sendOne(env, s, full, opts); } catch { status = -1; }
    const ok = status >= 200 && status < 300;
    if (status === 404 || status === 410) {
      await raw.delete(t.pushSubs).where(eq(t.pushSubs.id, s.id)).catch(() => {});
      return { id: s.id, status, ok, removed: true };
    }
    if (ok) await raw.update(t.pushSubs).set({ lastOkAt: Date.now(), fails: 0 }).where(eq(t.pushSubs.id, s.id)).catch(() => {});
    else if (s.fails + 1 >= MAX_FAILS) { await raw.delete(t.pushSubs).where(eq(t.pushSubs.id, s.id)).catch(() => {}); return { id: s.id, status, ok, removed: true }; }
    else await raw.update(t.pushSubs).set({ fails: sql`${t.pushSubs.fails} + 1` }).where(eq(t.pushSubs.id, s.id)).catch(() => {});
    return { id: s.id, status, ok };
  }));
}

/** Push if the user allows this category right now (prefs + quiet hours). Never throws. */
export async function pushFor(raw: RawDB, env: Bindings, userId: string, cat: NotifyCat, payload: PushPayload, opts: SendOpts = {}) {
  try {
    if (!pushConfigured(env)) return;
    const [u] = await raw.select({ prefs: t.users.prefs }).from(t.users).where(eq(t.users.id, userId));
    if (!u) return;
    const p = mergeNotify(u.prefs);
    if (!p[cat] || inQuiet(p)) return;
    await sendToUser(raw, env, userId, payload, opts);
  } catch (e) {
    console.warn("push failed", (e as Error).message);
  }
}

// ---------------------------------------------------------------- texts for in-app notification kinds

const who = (a: { name: string | null; username: string } | undefined) => a?.name?.trim() || (a ? `@${a.username}` : "Someone");

/** Phone text for a worker/friends.ts notify() row. Short, no private data. */
export function payloadFor(n: { kind: string; refId?: string | null }, actor?: { name: string | null; username: string }): (PushPayload & { opts: SendOpts }) | null {
  const a = who(actor);
  const ref = n.refId ?? "";
  const day = 86400;
  switch (n.kind) {
    case "friend_request": return { kind: n.kind, title: "Friend request", body: `${a} wants to be friends`, url: "#/friends", tag: `frq-${actor?.username ?? ref}`, opts: { ttl: 7 * day, topic: `frq-${ref}` } };
    case "friend_accept": return { kind: n.kind, title: "New friend", body: `${a} accepted your friend request`, url: actor ? `#/u/${actor.username}` : "#/friends", tag: `fra-${ref}`, opts: { ttl: 3 * day } };
    // likes: one notification per post on the phone (tag), newest liker wins; quiet (no re-alert)
    case "like": return { kind: n.kind, title: "New like", body: `${a} liked your post`, url: "#/notifications", tag: `like-${ref}`, opts: { ttl: 3 * day, urgency: "low", topic: `like-${ref}` } };
    case "comment": return { kind: n.kind, title: "New comment", body: `${a} commented on your post`, url: "#/notifications", tag: `cm-${ref}`, renotify: true, opts: { ttl: 3 * day, topic: `cm-${ref}` } };
    case "cheer": return { kind: n.kind, title: "Cheer 💪", body: `${a} cheered you on`, url: "#/compete", tag: `cheer-${actor?.username ?? ""}`, opts: { ttl: day, topic: `cheer-${actor?.username ?? ""}` } };
    case "challenge_invite": return { kind: n.kind, title: "Challenge", body: `${a} invited you to a challenge`, url: "#/compete", tag: `ch-${ref}`, renotify: true, opts: { ttl: 3 * day } };
    case "challenge_join": return { kind: n.kind, title: "Challenge", body: `${a} joined your challenge`, url: "#/compete", tag: `ch-${ref}`, opts: { ttl: day, urgency: "low", topic: `chj-${ref}` } };
    case "challenge_won": return { kind: n.kind, title: "You won 🏆", body: "Challenge finished: you came out on top", url: "#/compete", tag: `ch-${ref}`, renotify: true, opts: { ttl: 3 * day } };
    case "challenge_done": return { kind: n.kind, title: "Challenge finished", body: "See how everyone did", url: "#/compete", tag: `ch-${ref}`, opts: { ttl: 3 * day, urgency: "low" } };
    default: return null;
  }
}

/** Phone push for an in-app notification row (called from worker/friends.ts notify(), after the response). */
export async function pushForNotification(raw: RawDB, env: Bindings, n: { userId: string; kind: string; actorId?: string | null; refId?: string | null }) {
  const cat = catOf(n.kind);
  if (!cat || !pushConfigured(env)) return;
  let actor: { name: string | null; username: string } | undefined;
  if (n.actorId) [actor] = await raw.select({ name: t.users.name, username: t.users.username }).from(t.users).where(eq(t.users.id, n.actorId));
  const p = payloadFor(n, actor);
  if (!p) return;
  const { opts, ...payload } = p;
  await pushFor(raw, env, n.userId, cat, payload, opts);
}

/** Run after the response when inside a Worker request; fire-and-forget elsewhere (scripts/tests). */
export function later(p: Promise<unknown>, waitUntil?: (p: Promise<unknown>) => void) {
  const safe = p.catch((e) => console.warn("push job failed", (e as Error)?.message));
  try { if (waitUntil) waitUntil(safe); } catch { /* outside a request */ }
}

// ---------------------------------------------------------------- chat

/**
 * New chat message → push to every other member (not muted, not blocked, chat pref on).
 * One notification per conversation on the phone (tag + Topic = conversation): the service worker stacks the last lines.
 * Only the first unread message in a burst alerts; follow-ups within 60 s update the notification silently.
 * The service worker skips showing it when that chat is open and visible on the device.
 */
export async function pushChatMessage(raw: RawDB, env: Bindings, m: { id: string; convId: string; senderId: string; kind: string; text: string | null; createdAt: number }) {
  if (!pushConfigured(env)) return;
  const [conv] = await raw.select({ kind: t.conversations.kind, title: t.conversations.title }).from(t.conversations).where(eq(t.conversations.id, m.convId));
  if (!conv) return;
  const members = await raw.select({ userId: t.conversationMembers.userId, muted: t.conversationMembers.muted, lastReadAt: t.conversationMembers.lastReadAt })
    .from(t.conversationMembers).where(eq(t.conversationMembers.convId, m.convId));
  const to = members.filter((x) => x.userId !== m.senderId && !x.muted);
  if (!to.length) return;
  const [sender] = await raw.select({ name: t.users.name, username: t.users.username }).from(t.users).where(eq(t.users.id, m.senderId));
  const name = who(sender);
  const preview = m.kind === "text" ? (m.text ?? "").replace(/\s+/g, " ").slice(0, 140)
    : m.kind === "image" ? `📷 Photo${m.text ? ` · ${m.text.slice(0, 100)}` : ""}`
    : m.kind === "voice" ? "🎤 Voice message" : m.kind === "sticker" ? "Sticker" : "New message";
  const group = conv.kind === "group";
  // previous message in this chat: was it recent? (burst → silent update)
  const [prev] = await raw.select({ at: t.messages.createdAt }).from(t.messages)
    .where(and(eq(t.messages.convId, m.convId), lt(t.messages.createdAt, m.createdAt))).orderBy(desc(t.messages.createdAt)).limit(1);
  // a block (either way) silences pushes; inline query so this file has no runtime deps (testable in Node)
  const blocked = await raw.select({ a: t.friendships.requesterId, b: t.friendships.addresseeId }).from(t.friendships)
    .where(and(eq(t.friendships.status, "blocked"), or(eq(t.friendships.requesterId, m.senderId), eq(t.friendships.addresseeId, m.senderId))));
  const blockedIds = new Set(blocked.map((x) => (x.a === m.senderId ? x.b : x.a)));
  await Promise.all(to.map(async (r) => {
    if (blockedIds.has(r.userId)) return;
    const burst = !!prev && m.createdAt - prev.at < 60_000 && (r.lastReadAt ?? 0) < prev.at;
    await pushFor(raw, env, r.userId, "chat", {
      kind: "message", title: group ? conv.title || "Group chat" : name, body: group ? `${name}: ${preview}` : preview,
      url: `#/chat/${m.convId}`, tag: `chat-${m.convId}`, renotify: !burst,
    }, { ttl: 86400, urgency: "high", topic: `chat-${m.convId}` });
  }));
}
