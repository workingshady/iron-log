import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as t from "./db/schema";
import type { Env } from "./env";

// Login = username + passcode (users table, real database). DEV_PASSCODE (username "dev" or empty) → test mode on DB_DEV.
// Passcodes are stored as PBKDF2-SHA256(passcode, salt + server pepper). Workers caps PBKDF2 at 100k iterations and the
// free plan has ~10 ms CPU, so we use 20k + a secret pepper (a leaked database alone can't be brute-forced) + lockouts.
// Cookie "u.<userId>.<hmac>" — the HMAC covers the stored hash, so changing the passcode logs every device out.

export const COOKIE = "il_auth";
const ITER = 20_000;
export const USERNAME_RE = /^[a-z0-9._]{3,30}$/;
export const PASS_RE = /^\d{6,12}$/;
/** Username rules: USERNAME_RE + no leading/trailing dot and no "..". Input is lower-cased and a leading @ removed first. */
export const normUsername = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/^@/, "");
export const validUsername = (u: string) => USERNAME_RE.test(u) && !/^[.]|[.]$|\.\./.test(u);
/** Accounts created with Google have no passcode yet: pass_hash starts with "!" (checkPass is always false for it). */
export const hasPasscode = (passHash: string) => passHash.startsWith("pbkdf2$");

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const pepper = (env: Env["Bindings"]) => env.AUTH_PEPPER || env.APP_PASSCODE || "iron-log";

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

async function pbkdf2(pass: string, salt: Uint8Array, iter: number, pep: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const s = new Uint8Array([...salt, ...enc.encode(pep)]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: s, iterations: iter }, key, 256));
}

export async function hashPass(pass: string, env: Env["Bindings"]) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${await pbkdf2(pass, salt, ITER, pepper(env))}`;
}

export async function checkPass(pass: string, stored: string, env: Env["Bindings"]) {
  const [alg, iter, salt, want] = stored.split("$");
  if (alg !== "pbkdf2" || !salt || !want) return false;
  const got = await pbkdf2(pass, Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), Number(iter), pepper(env));
  return safeEqual(got, want);
}

/** HMAC-SHA256 with the server pepper (signs short-lived cookies such as the Google sign-in state). */
export const sign = (env: Env["Bindings"], msg: string) => hmac(pepper(env), msg);

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const userToken = async (env: Env["Bindings"], id: string, passHash: string) => `u.${id}.${await hmac(pepper(env), `user:${id}:${passHash}`)}`;
/** Old single DEV cookie (= user "dev"). */
const devToken = async (env: Env["Bindings"]) => `dev.${await hmac(env.DEV_PASSCODE!, "iron-log:dev:v1")}`;
/** DEV cookie for one test user in the DEV database (dev, dev_omar, dev_sara …). */
export const devUserToken = async (env: Env["Bindings"], id: string) => `dev.${id}.${await hmac(env.DEV_PASSCODE!, `iron-log:dev:v2:${id}`)}`;
/** Pre-username cookie (passcode only). Still accepted once, then swapped for a user cookie. */
const legacyToken = async (env: Env["Bindings"]) => hmac(env.APP_PASSCODE, "iron-log:v1");

export function setAuth(c: Context<Env>, value: string) {
  setCookie(c, COOKIE, value, { httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

// ---- lockout: 5 free tries, then 1 min, 2, 4 … up to 24 h, per username and per IP
const FREE = 5;
export type AuthDB = ReturnType<typeof drizzle<typeof t>>;
/** ms until these keys are unlocked (0 = free). Keys: "ip:<addr>", "u:<username>", or your own prefix. */
export async function lockedFor(d: ReturnType<typeof drizzle<typeof t>>, keys: string[]) {
  const now = Date.now();
  let wait = 0;
  for (const k of keys) {
    const [r] = await d.select().from(t.loginAttempts).where(eq(t.loginAttempts.key, k));
    if (r?.until && r.until > now) wait = Math.max(wait, r.until - now);
  }
  return wait;
}
export async function fail(d: ReturnType<typeof drizzle<typeof t>>, keys: string[]) {
  const now = Date.now();
  for (const k of keys) {
    const [r] = await d.select().from(t.loginAttempts).where(eq(t.loginAttempts.key, k));
    const fails = (r && now - r.at < 24 * 3600_000 ? r.fails : 0) + 1;
    const until = fails > FREE ? now + Math.min(24 * 3600_000, 60_000 * 2 ** (fails - FREE - 1)) : null;
    await d.insert(t.loginAttempts).values({ key: k, fails, until, at: now }).onConflictDoUpdate({ target: t.loginAttempts.key, set: { fails, until, at: now } });
  }
}
export const clear = (d: ReturnType<typeof drizzle<typeof t>>, keys: string[]) => Promise.all(keys.map((k) => d.delete(t.loginAttempts).where(eq(t.loginAttempts.key, k))));

export async function login(c: Context<Env>) {
  const body = await c.req.json<{ username?: string; passcode?: string }>().catch(() => ({}) as { username?: string; passcode?: string });
  const username = String(body.username ?? "").trim().toLowerCase().replace(/^@/, "");
  const passcode = String(body.passcode ?? "").trim();
  const d = drizzle(c.env.DB, { schema: t });
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const keys = [`ip:${ip}`, ...(username ? [`u:${username}`] : [])];

  const wait = await lockedFor(d, keys);
  if (wait) return tooMany(c, wait);

  // DEV / test mode
  const dev = c.env.DEV_PASSCODE;
  if (dev && (!username || username === "dev" || username.startsWith("dev_")) && safeEqual(passcode, dev)) {
    const dd = drizzle(c.env.DB_DEV, { schema: t });
    const [du] = await dd.select({ id: t.users.id }).from(t.users).where(eq(t.users.username, username || "dev"));
    await clear(d, keys);
    setAuth(c, du ? await devUserToken(c.env, du.id) : await devToken(c.env));
    return c.json({ ok: true, dev: true });
  }

  const [any] = await d.select({ id: t.users.id }).from(t.users).limit(1);
  if (!any && c.env.APP_PASSCODE && safeEqual(passcode, c.env.APP_PASSCODE)) {
    // first run after the update: old passcode → app asks you to create a username + passcode
    await clear(d, keys);
    setAuth(c, await legacyToken(c.env));
    return c.json({ ok: true, dev: false, setup: true });
  }
  if (!username || !passcode) return c.json({ error: "Enter your username and passcode" }, 400);
  const [u] = await d.select().from(t.users).where(eq(t.users.username, username));
  // same work either way (unknown user / Google-only account without a passcode)
  const ok = u && hasPasscode(u.passHash) ? await checkPass(passcode, u.passHash, c.env) : (await hashPass(passcode, c.env), false);
  if (!u || !ok) {
    await fail(d, keys);
    await new Promise((r) => setTimeout(r, 400));
    return c.json({ error: "Wrong username or passcode" }, 401);
  }
  await clear(d, keys);
  setAuth(c, await userToken(c.env, u.id, u.passHash));
  await noteLogin(d, u.id);
  return c.json({ ok: true, dev: false });
}

/** 429 with the wait in seconds (body + Retry-After header) so the login screen can show a countdown. */
export function tooMany(c: Context<Env>, waitMs: number) {
  const s = Math.ceil(waitMs / 1000);
  c.header("Retry-After", String(s));
  return c.json({ error: `Too many tries. Wait ${s < 120 ? `${s} s` : `${Math.ceil(s / 60)} min`}.`, retryAfter: s }, 429);
}

export const clientIp = (c: Context<Env>) => c.req.header("cf-connecting-ip") ?? "local";

/** Remember the last two sign-ins per user (shown on the Security page). Stored in login_attempts under "last:<id>" / "prev:<id>"
 *  (no schema change; fails = 0 and until = null, so these rows never lock anything). */
export async function noteLogin(d: AuthDB, userId: string) {
  const [last] = await d.select().from(t.loginAttempts).where(eq(t.loginAttempts.key, `last:${userId}`));
  const now = Date.now();
  const up = (key: string, at: number) => d.insert(t.loginAttempts).values({ key, fails: 0, until: null, at }).onConflictDoUpdate({ target: t.loginAttempts.key, set: { at, fails: 0, until: null } });
  if (last) await up(`prev:${userId}`, last.at);
  await up(`last:${userId}`, now);
}

/** Who is logged in (real database only), for public routes that need it (Google "link"). Null for DEV / legacy / no cookie. */
export async function realUser(c: Context<Env>) {
  const got = getCookie(c, COOKIE);
  if (!got?.startsWith("u.")) return null;
  const id = got.split(".")[1] ?? "";
  const [u] = await drizzle(c.env.DB, { schema: t }).select().from(t.users).where(eq(t.users.id, id));
  return u && safeEqual(got, await userToken(c.env, u.id, u.passHash)) ? u : null;
}

/** True when the request carries a valid DEV cookie (any DEV user). */
export async function isDevCookie(c: Context<Env>) {
  const got = getCookie(c, COOKIE);
  if (!got?.startsWith("dev.") || !c.env.DEV_PASSCODE) return false;
  const parts = got.split(".");
  return parts.length === 3 ? safeEqual(got, await devUserToken(c.env, parts[1])) : safeEqual(got, await devToken(c.env));
}

/** Re-issue the cookie after a passcode change (the old one stops working everywhere else). */
export async function reissue(c: Context<Env>, id: string, passHash: string) {
  setAuth(c, await userToken(c.env, id, passHash));
}

/** One-time: the owner (logged in with the old passcode) creates the first account. Refused once any account exists. */
export async function setup(c: Context<Env>) {
  if (c.var.dev || c.var.userId) return c.json({ error: "Already set up" }, 409);
  const d = drizzle(c.env.DB, { schema: t });
  const [any] = await d.select({ id: t.users.id }).from(t.users).limit(1);
  if (any) return c.json({ error: "Already set up" }, 409);
  const b = await c.req.json<{ username?: string; passcode?: string; name?: string }>();
  const username = String(b.username ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!validUsername(username)) return c.json({ error: "Username: 3-30 letters, numbers, . or _" }, 400);
  if (!PASS_RE.test(String(b.passcode ?? ""))) return c.json({ error: "Passcode: 6-12 digits" }, 400);
  const id = `usr-${crypto.randomUUID()}`;
  const passHash = await hashPass(String(b.passcode), c.env);
  const at = Date.now();
  await d.insert(t.users).values({ id, username, name: b.name?.trim().slice(0, 40) || null, bio: null, avatarId: null, passHash, role: "owner", createdAt: at, updatedAt: at });
  setAuth(c, await userToken(c.env, id, passHash));
  return c.json({ ok: true });
}

export async function requireAuth(c: Context<Env>, next: Next) {
  const got = getCookie(c, COOKIE);
  if (!got) return c.json({ error: "unauthorized" }, 401);
  const who = { id: t.users.id, passHash: t.users.passHash, role: t.users.role, programId: t.users.programId };
  if (got.startsWith("dev.")) {
    if (!c.env.DEV_PASSCODE) return c.json({ error: "unauthorized" }, 401);
    const parts = got.split(".");
    let id = "dev";
    if (parts.length === 3) {
      if (!safeEqual(got, await devUserToken(c.env, parts[1]))) return c.json({ error: "unauthorized" }, 401);
      id = parts[1];
    } else if (!safeEqual(got, await devToken(c.env))) return c.json({ error: "unauthorized" }, 401);
    const [u] = await drizzle(c.env.DB_DEV, { schema: t }).select(who).from(t.users).where(eq(t.users.id, id));
    c.set("dev", true);
    c.set("userId", id);
    c.set("role", u?.role ?? "owner");
    c.set("programId", u?.programId ?? null);
    return next();
  }
  const d = drizzle(c.env.DB, { schema: t });
  if (got.startsWith("u.")) {
    const id = got.split(".")[1] ?? "";
    const [u] = await d.select(who).from(t.users).where(eq(t.users.id, id));
    if (!u || !safeEqual(got, await userToken(c.env, u.id, u.passHash))) return c.json({ error: "unauthorized" }, 401);
    c.set("dev", false);
    c.set("userId", u.id);
    c.set("role", u.role);
    c.set("programId", u.programId);
    return next();
  }
  // legacy passcode-only cookie → upgrade to the (single) owner account
  if (c.env.APP_PASSCODE && safeEqual(got, await legacyToken(c.env))) {
    const [u] = await d.select(who).from(t.users).orderBy(t.users.createdAt).limit(1);
    if (!u) {
      // no account yet: only /me and /setup are allowed until the owner creates one
      if (!["/api/me", "/api/setup"].includes(c.req.path)) return c.json({ error: "unauthorized", setup: true }, 401);
      c.set("dev", false);
      c.set("userId", "");
      return next();
    }
    setAuth(c, await userToken(c.env, u.id, u.passHash));
    c.set("dev", false);
    c.set("userId", u.id);
    c.set("role", u.role);
    c.set("programId", u.programId);
    return next();
  }
  return c.json({ error: "unauthorized" }, 401);
}
