import { Hono, type Context } from "hono";
import { and, asc, eq } from "drizzle-orm";
import * as t from "../db/schema";
import type { Env } from "../env";
import { rawDb } from "../db";
import { mergeNotify, okEndpoint, pushConfigured, sanitizeNotify, sendToUser, sha256hex, unb64u, type NotifyPrefs } from "../push";

// Phone notifications (Web Push): subscribe / unsubscribe / devices / test / prefs. Mounted under /api after auth.
// push_subscriptions is a shared table (not scoped by db(c)) → every query filters by the logged-in user explicitly.
export const pushRoutes = new Hono<Env>();
type C = Context<Env>;

const MAX_DEVICES = 10;
const uid = (c: C) => c.var.userId;
const err = (c: C, error: string, status: 400 | 403 | 404 | 503 = 400) => c.json({ error }, status);
async function body<T>(c: C): Promise<T | null> {
  try { return (await c.req.json()) as T; } catch { return null; }
}

/** The VAPID public key the browser needs for pushManager.subscribe (applicationServerKey). */
pushRoutes.get("/push/key", (c) => c.json({ key: c.env.VAPID_PUBLIC_KEY ?? null, configured: pushConfigured(c.env) }));

/** Save this device's subscription (idempotent: id = sha-256 of the endpoint; a shared phone moves to whoever subscribed last). */
pushRoutes.post("/push/subscribe", async (c) => {
  if (!pushConfigured(c.env)) return err(c, "Push isn't set up on the server", 503);
  const b = await body<{ endpoint?: string; keys?: { p256dh?: string; auth?: string }; ua?: string }>(c);
  const endpoint = b?.endpoint ?? "";
  const p256dh = b?.keys?.p256dh ?? "";
  const auth = b?.keys?.auth ?? "";
  if (!okEndpoint(endpoint)) return err(c, "Unknown push service");
  try {
    const k = unb64u(p256dh), a = unb64u(auth);
    if (k.length !== 65 || k[0] !== 4 || a.length !== 16) throw 0;
  } catch { return err(c, "bad keys"); }
  const ua = typeof b?.ua === "string" ? b.ua.replace(/[^\w ·().,/+-]/g, "").slice(0, 60) : null;
  const raw = rawDb(c);
  const id = await sha256hex(endpoint);
  const now = Date.now();
  await raw.insert(t.pushSubs).values({ id, userId: uid(c), endpoint, p256dh, auth, ua, createdAt: now, lastOkAt: null, fails: 0 })
    .onConflictDoUpdate({ target: t.pushSubs.id, set: { userId: uid(c), p256dh, auth, ua, fails: 0 } });
  // keep the newest MAX_DEVICES
  const all = await raw.select({ id: t.pushSubs.id }).from(t.pushSubs).where(eq(t.pushSubs.userId, uid(c))).orderBy(asc(t.pushSubs.createdAt));
  for (const old of all.slice(0, Math.max(0, all.length - MAX_DEVICES))) await raw.delete(t.pushSubs).where(eq(t.pushSubs.id, old.id));
  return c.json({ ok: true, id });
});

/** Forget this device (body {endpoint}) — called when the user turns notifications off here. */
pushRoutes.delete("/push/subscribe", async (c) => {
  const b = await body<{ endpoint?: string }>(c);
  if (!b?.endpoint) return err(c, "endpoint required");
  await rawDb(c).delete(t.pushSubs).where(and(eq(t.pushSubs.id, await sha256hex(b.endpoint)), eq(t.pushSubs.userId, uid(c))));
  return c.json({ ok: true });
});

/** My devices (no endpoints / keys sent back). */
pushRoutes.get("/push/devices", async (c) => {
  const rows = await rawDb(c).select({ id: t.pushSubs.id, ua: t.pushSubs.ua, createdAt: t.pushSubs.createdAt, lastOkAt: t.pushSubs.lastOkAt, fails: t.pushSubs.fails })
    .from(t.pushSubs).where(eq(t.pushSubs.userId, uid(c))).orderBy(asc(t.pushSubs.createdAt));
  return c.json({ devices: rows });
});

pushRoutes.delete("/push/devices/:id", async (c) => {
  await rawDb(c).delete(t.pushSubs).where(and(eq(t.pushSubs.id, c.req.param("id")), eq(t.pushSubs.userId, uid(c))));
  return c.json({ ok: true });
});

/** Send a test notification to all my devices (or one: ?id=). Awaited so the UI can show the result. */
pushRoutes.post("/push/test", async (c) => {
  if (!pushConfigured(c.env)) return err(c, "Push isn't set up on the server", 503);
  const raw = rawDb(c);
  const only = c.req.query("id");
  const res = await sendToUser(raw, c.env, uid(c), {
    kind: "test", title: "Iron Log", body: "Notifications work 💪 You'll get pinged for messages, cheers and more.", url: "#/settings", tag: "test",
  }, { ttl: 120, urgency: "high" });
  const results = only ? res.filter((r) => r.id === only) : res;
  return c.json({ sent: results.filter((r) => r.ok).length, results });
});

/** Notification prefs = users.prefs.notify (other keys in prefs are kept). */
pushRoutes.get("/push/prefs", async (c) => {
  const [u] = await rawDb(c).select({ prefs: t.users.prefs }).from(t.users).where(eq(t.users.id, uid(c)));
  return c.json({ prefs: mergeNotify(u?.prefs) });
});

pushRoutes.put("/push/prefs", async (c) => {
  const b = await body<Partial<NotifyPrefs>>(c);
  if (!b || typeof b !== "object") return err(c, "bad body");
  const raw = rawDb(c);
  const [u] = await raw.select({ prefs: t.users.prefs }).from(t.users).where(eq(t.users.id, uid(c)));
  if (!u) return err(c, "no profile", 404);
  let all: Record<string, unknown> = {};
  try { all = JSON.parse(u.prefs || "{}") ?? {}; } catch { /* reset broken json */ }
  const cur = mergeNotify(u.prefs);
  const next = sanitizeNotify({ ...cur, ...b, quiet: { ...cur.quiet, ...(b.quiet ?? {}) } });
  await raw.update(t.users).set({ prefs: JSON.stringify({ ...all, notify: next }), updatedAt: Date.now() }).where(eq(t.users.id, uid(c)));
  return c.json({ prefs: next });
});
