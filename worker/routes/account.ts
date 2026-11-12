import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, like, lt, not } from "drizzle-orm";
import * as t from "../db/schema";
import type { Env } from "../env";
import { rawDb, type RawDB } from "../db";
import { PASS_RE, checkPass, clientIp, fail, clear, hasPasscode, hashPass, lockedFor, reissue, tooMany } from "../auth";
import { CODE_RE, RESET_PREFIX, normCode, randomCode, sha256hex } from "./auth";

// Logged-in account routes (mounted after the auth middleware):
//   GET    /api/account                     my sign-in methods, last login
//   POST   /api/account/passcode            change (needs current) or set (Google-only accounts) → cookie re-issued
//   POST   /api/account/logout-others       rotate the hash → every other device is logged out (needs current passcode)
//   DELETE /api/account/google              unlink Google (refused without a passcode)
//   GET/POST /api/invites, DELETE /api/invites/:code
//   GET    /api/account/members             owner only: people on this app (no secrets)
//   POST   /api/account/reset-code          owner only: one-time 24 h reset code for a member's passcode
export const accountRoutes = new Hono<Env>();

const now = () => Date.now();
const DAY = 86_400_000;
const INVITE_DAYS = 7;
const MAX_ACTIVE_INVITES = 20;

type C = Context<Env>;
const me = async (c: C) => {
  const [u] = await rawDb(c).select().from(t.users).where(eq(t.users.id, c.var.userId));
  return u;
};
const noDev = (c: C) => (c.var.dev ? c.json({ error: "Not available in DEV mode (test users log in with the DEV passcode)." }, 403) : null);

/** Check the current passcode with the same lockout as the login screen (so a stolen cookie can't brute-force it). */
async function verifyCurrent(c: C, u: typeof t.users.$inferSelect, current: unknown) {
  const d = rawDb(c);
  const keys = [`u:${u.username}`, `ip:${clientIp(c)}`];
  const wait = await lockedFor(d, keys);
  if (wait) return tooMany(c, wait);
  if (!(await checkPass(String(current ?? ""), u.passHash, c.env))) {
    await fail(d, keys);
    return c.json({ error: "Current passcode is wrong", field: "current" }, 401);
  }
  await clear(d, keys);
  return null;
}

accountRoutes.get("/account", async (c) => {
  const u = await me(c);
  if (!u) return c.json({ error: "not found" }, 404);
  const d = rawDb(c);
  const [last, prev] = await Promise.all([`last:${u.id}`, `prev:${u.id}`].map((k) => d.select({ at: t.loginAttempts.at }).from(t.loginAttempts).where(eq(t.loginAttempts.key, k)).then((r) => r[0]?.at ?? null)));
  return c.json({
    dev: c.var.dev,
    username: u.username,
    name: u.name,
    role: u.role,
    hasPasscode: !c.var.dev && hasPasscode(u.passHash),
    google: { available: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET) && !c.var.dev, linked: !!u.googleSub, email: u.email },
    lastLogin: last,
    previousLogin: prev,
    createdAt: u.createdAt,
  });
});

accountRoutes.post("/account/passcode", async (c) => {
  const blocked = noDev(c);
  if (blocked) return blocked;
  const b = await c.req.json<{ current?: string; next?: string }>().catch(() => ({}) as { current?: string; next?: string });
  const u = await me(c);
  if (!u) return c.json({ error: "not found" }, 404);
  if (hasPasscode(u.passHash)) {
    const bad = await verifyCurrent(c, u, b.current);
    if (bad) return bad;
  }
  if (!PASS_RE.test(String(b.next ?? ""))) return c.json({ error: "New passcode: 6-12 digits", field: "next" }, 400);
  const passHash = await hashPass(String(b.next), c.env);
  await rawDb(c).update(t.users).set({ passHash, updatedAt: now() }).where(eq(t.users.id, u.id));
  await reissue(c, u.id, passHash);
  return c.json({ ok: true });
});

/** "Log out everywhere else": same passcode, new salt → new hash → every other cookie stops matching. This device stays in. */
accountRoutes.post("/account/logout-others", async (c) => {
  const blocked = noDev(c);
  if (blocked) return blocked;
  const b = await c.req.json<{ current?: string }>().catch(() => ({}) as { current?: string });
  const u = await me(c);
  if (!u) return c.json({ error: "not found" }, 404);
  let passHash: string;
  if (hasPasscode(u.passHash)) {
    const bad = await verifyCurrent(c, u, b.current);
    if (bad) return bad;
    passHash = await hashPass(String(b.current), c.env);
  } else {
    passHash = `!google:${randomCode(16)}`;
  }
  await rawDb(c).update(t.users).set({ passHash, updatedAt: now() }).where(eq(t.users.id, u.id));
  await reissue(c, u.id, passHash);
  return c.json({ ok: true });
});

accountRoutes.delete("/account/google", async (c) => {
  const blocked = noDev(c);
  if (blocked) return blocked;
  const u = await me(c);
  if (!u) return c.json({ error: "not found" }, 404);
  if (!hasPasscode(u.passHash)) return c.json({ error: "Set a passcode first, otherwise you couldn't log in any more." }, 409);
  await rawDb(c).update(t.users).set({ googleSub: null, email: null, updatedAt: now() }).where(eq(t.users.id, u.id));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- invites

const notReset = not(like(t.invites.code, `${RESET_PREFIX}%`));

accountRoutes.get("/invites", async (c) => {
  const rows = await rawDb(c).select().from(t.invites)
    .where(and(eq(t.invites.createdBy, c.var.userId), notReset)).orderBy(desc(t.invites.createdAt));
  const at = now();
  return c.json({
    invites: rows.map((r) => ({
      code: r.code, uses: r.uses, maxUses: r.maxUses, expiresAt: r.expiresAt, createdAt: r.createdAt,
      active: r.uses < r.maxUses && (r.expiresAt == null || r.expiresAt > at),
    })),
  });
});

accountRoutes.post("/invites", async (c) => {
  const b = await c.req.json<{ maxUses?: number }>().catch(() => ({}) as { maxUses?: number });
  const maxUses = Math.round(Number(b.maxUses ?? 1));
  if (!(maxUses >= 1 && maxUses <= 10)) return c.json({ error: "Max uses: 1-10" }, 400);
  const d = rawDb(c);
  const at = now();
  // tidy: invites that ended more than 30 days ago
  await d.delete(t.invites).where(and(eq(t.invites.createdBy, c.var.userId), notReset, lt(t.invites.expiresAt, at - 30 * DAY)));
  const mine = await d.select().from(t.invites).where(and(eq(t.invites.createdBy, c.var.userId), notReset));
  if (mine.filter((r) => r.uses < r.maxUses && (r.expiresAt ?? Infinity) > at).length >= MAX_ACTIVE_INVITES)
    return c.json({ error: `You have ${MAX_ACTIVE_INVITES} open invites. Revoke one first.` }, 429);
  for (let i = 0; i < 5; i++) {
    const code = randomCode(8);
    try {
      await d.insert(t.invites).values({ code, createdBy: c.var.userId, maxUses, uses: 0, expiresAt: at + INVITE_DAYS * DAY, createdAt: at });
      return c.json({ code, maxUses, uses: 0, expiresAt: at + INVITE_DAYS * DAY, createdAt: at, active: true });
    } catch {
      /* collision: try another */
    }
  }
  return c.json({ error: "Couldn't make a code, try again" }, 500);
});

accountRoutes.delete("/invites/:code", async (c) => {
  const code = normCode(c.req.param("code"));
  if (!CODE_RE.test(code)) return c.json({ error: "bad code" }, 400);
  await rawDb(c).delete(t.invites).where(and(eq(t.invites.code, code), eq(t.invites.createdBy, c.var.userId)));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- owner: members + passcode reset codes

const ownerOnly = (c: C) => (c.var.role === "owner" ? null : c.json({ error: "Only the owner can do this" }, 403));

accountRoutes.get("/account/members", async (c) => {
  const blocked = ownerOnly(c);
  if (blocked) return blocked;
  const d = rawDb(c);
  const rows = await d.select({ id: t.users.id, username: t.users.username, name: t.users.name, role: t.users.role, passHash: t.users.passHash, googleSub: t.users.googleSub, createdAt: t.users.createdAt })
    .from(t.users).orderBy(t.users.createdAt);
  const pending = rows.length
    ? await d.select({ code: t.invites.code, expiresAt: t.invites.expiresAt, uses: t.invites.uses }).from(t.invites).where(like(t.invites.code, `${RESET_PREFIX}%`))
    : [];
  const at = now();
  return c.json({
    members: rows.map((r) => ({
      id: r.id, username: r.username, name: r.name, role: r.role, createdAt: r.createdAt, me: r.id === c.var.userId,
      hasPasscode: hasPasscode(r.passHash), google: !!r.googleSub, // booleans only: never hashes, ids from Google or emails
      resetPending: pending.some((p) => p.code.startsWith(`${RESET_PREFIX}${r.id}.`) && p.uses === 0 && (p.expiresAt ?? 0) > at),
    })),
  });
});

accountRoutes.post("/account/reset-code", async (c) => {
  const blocked = ownerOnly(c) ?? noDev(c);
  if (blocked) return blocked;
  const b = await c.req.json<{ userId?: string }>().catch(() => ({}) as { userId?: string });
  const d = rawDb(c);
  const [u] = await d.select({ id: t.users.id, username: t.users.username, role: t.users.role }).from(t.users).where(eq(t.users.id, String(b.userId ?? "")));
  if (!u) return c.json({ error: "No such member" }, 404);
  if (u.id === c.var.userId || u.role === "owner") return c.json({ error: "Change your own passcode above." }, 400);
  const code = randomCode(8);
  const at = now();
  await d.delete(t.invites).where(like(t.invites.code, `${RESET_PREFIX}${u.id}.%`)); // only the newest code works
  await d.insert(t.invites).values({ code: `${RESET_PREFIX}${u.id}.${await sha256hex(code)}`, createdBy: c.var.userId, maxUses: 1, uses: 0, expiresAt: at + DAY, createdAt: at });
  return c.json({ code, username: u.username, expiresAt: at + DAY });
});

accountRoutes.delete("/account/reset-code/:userId", async (c) => {
  const blocked = ownerOnly(c);
  if (blocked) return blocked;
  await rawDb(c).delete(t.invites).where(like(t.invites.code, `${RESET_PREFIX}${c.req.param("userId").replace(/[%_]/g, "")}.%`));
  return c.json({ ok: true });
});

/** DEV seed hook: one active + one used-up invite from "dev", so the Security page has something to show. */
export async function seedAccount(raw: RawDB, users: Record<string, string>) {
  const at = now();
  await raw.delete(t.invites).where(inArray(t.invites.code, ["DEVA2B3C", "DEVUSED9"]));
  await raw.insert(t.invites).values([
    { code: "DEVA2B3C", createdBy: users.dev, maxUses: 3, uses: 1, expiresAt: at + 5 * DAY, createdAt: at - 2 * DAY },
    { code: "DEVUSED9", createdBy: users.dev, maxUses: 1, uses: 1, expiresAt: at + 3 * DAY, createdAt: at - 4 * DAY },
  ]);
}
