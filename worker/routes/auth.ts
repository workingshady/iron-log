import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, gt, isNull, like, lt, or, sql } from "drizzle-orm";
import * as t from "../db/schema";
import type { Env } from "../env";
import type { RawDB } from "../db";
import {
  PASS_RE, clear, clientIp, devUserToken, fail, hashPass, isDevCookie, lockedFor, normUsername, noteLogin, realUser, safeEqual,
  setAuth, sign, tooMany, userToken, validUsername, type AuthDB,
} from "../auth";

// PUBLIC auth routes (no login needed). Mounted in worker/index.ts under /api BEFORE the auth middleware.
//   POST /api/signup                 invite + username + passcode → new member (real DB; DEV DB for DEV invites)
//   GET  /api/public/invite/:code    {valid, inviter} for the join screen
//   POST /api/auth/reset             username + one-time reset code (made by the owner) + new passcode
//   GET  /api/auth/providers         {google}
//   GET  /api/auth/google/start      ?mode=login|link|signup&invite=…  → Google (OAuth code flow + PKCE + state + nonce)
//   GET  /api/auth/google/callback   → verifies the id_token (RS256 / Google JWKS) → cookie → back to the app
export const authRoutes = new Hono<Env>();

const now = () => Date.now();
const DAY = 86_400_000;
const real = (c: Context<Env>) => drizzle(c.env.DB, { schema: t });
const devDb = (c: Context<Env>) => (c.env.DEV_PASSCODE ? drizzle(c.env.DB_DEV, { schema: t }) : null);

// ---------------------------------------------------------------- invite codes

/** 31 symbols: no 0/O, 1/I/L (easy to read out loud and type). */
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function randomCode(n = 8) {
  let out = "";
  while (out.length < n) {
    for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) {
      if (b < 248 && out.length < n) out += ALPHA[b % 31]; // 248 = 8 × 31 → no modulo bias
    }
  }
  return out;
}
/** User input → stored form: upper-case, no spaces/dashes, only the alphabet above. */
export const normCode = (s: unknown) => String(s ?? "").toUpperCase().replace(/[\s-]/g, "").slice(0, 16);
export const CODE_RE = /^[A-HJKMNP-Z2-9]{8}$/;
/** Reset codes live in `invites` too: code = "rst.<userId>.<sha256(code)>" (never listed as invites, single use, 24 h). */
export const RESET_PREFIX = "rst.";
export const sha256hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");

type Invite = typeof t.invites.$inferSelect;
const usable = (i: Invite | undefined, at = now()) => !!i && i.uses < i.maxUses && (i.expiresAt == null || i.expiresAt > at);

/** Find an invite: real DB first, then the DEV DB (DEV invites create DEV users). */
async function findInvite(c: Context<Env>, code: string) {
  if (!CODE_RE.test(code)) return null;
  const [r] = await real(c).select().from(t.invites).where(eq(t.invites.code, code));
  if (r) return { inv: r, d: real(c), dev: false };
  const dd = devDb(c);
  if (!dd) return null;
  const [x] = await dd.select().from(t.invites).where(eq(t.invites.code, code));
  return x ? { inv: x, d: dd, dev: true } : null;
}

/** Atomically take one use of an invite (false = used up / expired meanwhile). */
async function takeInvite(d: AuthDB, code: string) {
  const at = now();
  const r = await d.update(t.invites).set({ uses: sql`${t.invites.uses} + 1` })
    .where(and(eq(t.invites.code, code), lt(t.invites.uses, t.invites.maxUses), or(isNull(t.invites.expiresAt), gt(t.invites.expiresAt, at))))
    .returning({ code: t.invites.code });
  return r.length > 0;
}
const giveBack = (d: AuthDB, code: string) => d.update(t.invites).set({ uses: sql`max(${t.invites.uses} - 1, 0)` }).where(eq(t.invites.code, code));

async function inviterName(d: AuthDB, id: string) {
  const [u] = await d.select({ name: t.users.name, username: t.users.username }).from(t.users).where(eq(t.users.id, id));
  return u ? u.name || `@${u.username}` : null;
}

async function usernameFree(d: AuthDB, username: string) {
  const [u] = await d.select({ id: t.users.id }).from(t.users).where(eq(t.users.username, username));
  return !u;
}

authRoutes.get("/public/invite/:code", async (c) => {
  const ip = clientIp(c);
  const key = [`inv-ip:${ip}`]; // separate from the login lockout: mistyped invites never lock you out of logging in
  const wait = await lockedFor(real(c), key);
  if (wait) return tooMany(c, wait);
  const code = normCode(c.req.param("code"));
  const f = await findInvite(c, code);
  if (!f || !usable(f.inv)) {
    await fail(real(c), key);
    return c.json({ valid: false, reason: f ? (f.inv.uses >= f.inv.maxUses ? "used" : "expired") : "unknown" });
  }
  return c.json({ valid: true, inviter: await inviterName(f.d, f.inv.createdBy), dev: f.dev || undefined, expiresAt: f.inv.expiresAt });
});

/** Username availability for the sign-up form (no lockout cost, but needs a plausible invite to stop username scraping). */
authRoutes.get("/public/username", async (c) => {
  const u = normUsername(c.req.query("u"));
  const f = await findInvite(c, normCode(c.req.query("invite")));
  if (!f || !usable(f.inv)) return c.json({ error: "invite needed" }, 403);
  if (!validUsername(u)) return c.json({ available: false, reason: "invalid" });
  return c.json({ available: await usernameFree(f.d, u) });
});

authRoutes.post("/signup", async (c) => {
  const b = await c.req.json<{ invite?: string; username?: string; passcode?: string; name?: string }>().catch(() => ({}) as Record<string, string>);
  const ip = clientIp(c);
  const keys = [`inv-ip:${ip}`];
  const wait = await lockedFor(real(c), keys);
  if (wait) return tooMany(c, wait);

  const code = normCode(b.invite);
  const f = await findInvite(c, code);
  if (!f || !usable(f.inv)) {
    await fail(real(c), keys);
    const error = f ? "This invite has been used up or expired. Ask for a new one." : "That invite code isn't valid. Check it, or ask for a new one.";
    return c.json({ error, field: "invite" }, 400);
  }
  const username = normUsername(b.username);
  if (!validUsername(username)) return c.json({ error: "Username: 3-30 characters: a-z, 0-9, . or _ (no dot at the start or end, no '..')", field: "username" }, 400);
  if (f.dev && !username.startsWith("dev_")) return c.json({ error: "DEV invite: the username must start with dev_", field: "username" }, 400);
  if (!f.dev && (username === "dev" || username.startsWith("dev_"))) return c.json({ error: "Usernames starting with dev_ are reserved", field: "username" }, 400);
  const passcode = String(b.passcode ?? "");
  if (!f.dev && !PASS_RE.test(passcode)) return c.json({ error: "Passcode: 6-12 digits", field: "passcode" }, 400);
  if (!(await usernameFree(f.d, username))) return c.json({ error: `@${username} is taken. Try another one.`, field: "username" }, 409);

  if (!(await takeInvite(f.d, code))) return c.json({ error: "This invite was just used up. Ask for a new one.", field: "invite" }, 409);
  const id = f.dev ? `dev-${crypto.randomUUID().slice(0, 8)}` : `usr-${crypto.randomUUID()}`;
  const passHash = f.dev ? "-" : await hashPass(passcode, c.env);
  const at = now();
  try {
    await f.d.insert(t.users).values({ id, username, name: String(b.name ?? "").trim().slice(0, 40) || null, bio: null, avatarId: null, passHash, role: "member", createdAt: at, updatedAt: at });
  } catch {
    await giveBack(f.d, code);
    return c.json({ error: `@${username} is taken. Try another one.`, field: "username" }, 409);
  }
  await clear(real(c), keys);
  if (f.dev) {
    setAuth(c, await devUserToken(c.env, id));
    return c.json({ ok: true, dev: true });
  }
  setAuth(c, await userToken(c.env, id, passHash));
  await noteLogin(f.d, id);
  return c.json({ ok: true, dev: false });
});

/** Forgot passcode: the owner made a one-time reset code for this username (Security page). */
authRoutes.post("/auth/reset", async (c) => {
  const b = await c.req.json<{ username?: string; code?: string; passcode?: string }>().catch(() => ({}) as Record<string, string>);
  const username = normUsername(b.username);
  const d = real(c);
  const keys = [`ip:${clientIp(c)}`, ...(username ? [`u:${username}`] : [])];
  const wait = await lockedFor(d, keys);
  if (wait) return tooMany(c, wait);
  if (!PASS_RE.test(String(b.passcode ?? ""))) return c.json({ error: "New passcode: 6-12 digits", field: "passcode" }, 400);
  const [u] = await d.select().from(t.users).where(eq(t.users.username, username));
  const code = normCode(b.code);
  const key = u && CODE_RE.test(code) ? `${RESET_PREFIX}${u.id}.${await sha256hex(code)}` : "";
  if (!u || !key || !(await takeInvite(d, key))) {
    await fail(d, keys);
    await new Promise((r) => setTimeout(r, 400));
    return c.json({ error: "Wrong username or reset code (or it expired). Ask the owner for a new one." }, 401);
  }
  await d.delete(t.invites).where(like(t.invites.code, `${RESET_PREFIX}${u.id}.%`)); // one reset → all pending codes for this user are void
  const passHash = await hashPass(String(b.passcode), c.env);
  await d.update(t.users).set({ passHash, updatedAt: now() }).where(eq(t.users.id, u.id));
  await clear(d, keys);
  setAuth(c, await userToken(c.env, u.id, passHash)); // every other device is logged out (cookie covers the hash)
  await noteLogin(d, u.id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- Sign in with Google
// Authorization-code flow (server side, confidential client) + PKCE (S256) + state + nonce.
// The state/nonce/verifier travel in a short-lived HttpOnly cookie, HMAC-signed so mode/invite/user can't be tampered with.
// The id_token signature is verified with WebCrypto (RS256) against Google's JWKS, then iss/aud/exp/iat/nonce/email_verified.

const G_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const G_TOKEN = "https://oauth2.googleapis.com/token";
const G_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const G_ISS = ["https://accounts.google.com", "accounts.google.com"];
const G_COOKIE = "il_g";
const G_PATH = "/api/auth/google";

const googleOn = (env: Env["Bindings"]) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

authRoutes.get("/auth/providers", (c) => c.json({ google: googleOn(c.env) }));

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (ch) => ch.charCodeAt(0));
const rand = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const utf8 = (b: Uint8Array) => new TextDecoder().decode(b);

type Mode = "login" | "link" | "signup";
type GState = { s: string; n: string; v: string; m: Mode; i?: string; u?: string; at: number };

/** Where to send the browser back to. Errors use a short code (the app maps it to a message), never free text: no phishing via links. */
function back(c: Context<Env>, mode: Mode, err?: string, ok?: string) {
  const page = mode === "link" || ok === "welcome" ? "#/security" : "#/"; // new Google users land where they can set a passcode
  const q = err ? `?auth_error=${encodeURIComponent(err)}` : ok ? `?auth=${encodeURIComponent(ok)}` : "";
  return c.redirect(`/${q}${page}`, 302);
}

authRoutes.get("/auth/google/start", async (c) => {
  const m = (["login", "link", "signup"].includes(c.req.query("mode") ?? "") ? c.req.query("mode") : "login") as Mode;
  if (!googleOn(c.env)) return back(c, m, "google_off");
  if (await isDevCookie(c)) return back(c, m, "google_dev");
  const st: GState = { s: rand(), n: rand(), v: rand(48), m, at: now() };
  if (m === "link") {
    const u = await realUser(c);
    if (!u) return back(c, "login", "login_first");
    st.u = u.id;
  }
  if (m === "signup") {
    const code = normCode(c.req.query("invite"));
    const [inv] = CODE_RE.test(code) ? await real(c).select().from(t.invites).where(eq(t.invites.code, code)) : [];
    if (!usable(inv)) return back(c, m, "invite_invalid");
    st.i = code;
  }
  const payload = b64url(new TextEncoder().encode(JSON.stringify(st)));
  setCookie(c, G_COOKIE, `${payload}.${await sign(c.env, `g:${payload}`)}`, {
    httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Lax", path: G_PATH, maxAge: 600,
  });
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(st.v))));
  const q = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(c), response_type: "code", scope: "openid email profile",
    state: st.s, nonce: st.n, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  });
  return c.redirect(`${G_AUTH}?${q}`, 302);
});

const redirectUri = (c: Context<Env>) => `${new URL(c.req.url).origin}${G_PATH}/callback`;

async function readState(c: Context<Env>): Promise<GState | null> {
  const raw = getCookie(c, G_COOKIE);
  setCookie(c, G_COOKIE, "", { path: G_PATH, maxAge: 0, httpOnly: true, sameSite: "Lax", secure: new URL(c.req.url).protocol === "https:" }); // single use
  if (!raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac || !safeEqual(mac, await sign(c.env, `g:${payload}`))) return null;
  try {
    const st = JSON.parse(utf8(unb64url(payload))) as GState;
    return now() - st.at < 10 * 60_000 ? st : null;
  } catch {
    return null;
  }
}

// JWKS cache (per isolate). Google rotates keys roughly weekly; an unknown kid forces a refresh.
let jwks: { keys: (JsonWebKey & { kid: string })[]; until: number } | null = null;
async function googleKey(kid: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!jwks || jwks.until < now() || attempt === 1) {
      const r = await fetch(G_JWKS);
      if (!r.ok) throw new Error("jwks");
      const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get("cache-control") ?? "")?.[1] ?? 3600);
      jwks = { keys: ((await r.json()) as { keys: (JsonWebKey & { kid: string })[] }).keys, until: now() + Math.min(maxAge, 86_400) * 1000 };
    }
    const k = jwks.keys.find((x) => x.kid === kid);
    if (k) return crypto.subtle.importKey("jwk", k, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  }
  throw new Error("kid");
}

type Claims = { iss: string; aud: string; sub: string; exp: number; iat: number; nonce?: string; email?: string; email_verified?: boolean | string; name?: string; given_name?: string };

/** Verify a Google id_token: RS256 signature (JWKS) + iss + aud + exp/iat + nonce + verified email. Throws on any problem. */
export async function verifyIdToken(token: string, clientId: string, nonce: string): Promise<Claims> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("format");
  const header = JSON.parse(utf8(unb64url(h))) as { alg: string; kid: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("alg");
  const key = await googleKey(header.kid);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64url(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("signature");
  const cl = JSON.parse(utf8(unb64url(p))) as Claims;
  const sec = Math.floor(now() / 1000);
  if (!G_ISS.includes(cl.iss)) throw new Error("iss");
  if (cl.aud !== clientId) throw new Error("aud");
  if (!(cl.exp > sec - 60) || !(cl.iat < sec + 300)) throw new Error("exp");
  if (!cl.nonce || !safeEqual(cl.nonce, nonce)) throw new Error("nonce");
  if (!cl.sub || !(cl.email_verified === true || cl.email_verified === "true")) throw new Error("email");
  return cl;
}

/** Unique username from an email ("Omar.Hassan+gym@gmail.com" → "omar.hassan", then "omar.hassan2" …). */
async function usernameFromEmail(d: AuthDB, email: string) {
  let base = email.split("@")[0].split("+")[0].toLowerCase().replace(/[^a-z0-9._]/g, "").replace(/\.{2,}/g, ".").replace(/^[.]+|[.]+$/g, "").slice(0, 24);
  if (base === "dev" || base.startsWith("dev_")) base = `x${base}`;
  if (base.length < 3) base = `${base}lifter`.slice(0, 24);
  for (let i = 0; i < 50; i++) {
    const u = i ? `${base}${i + 1}` : base;
    if (validUsername(u) && (await usernameFree(d, u))) return u;
  }
  return `lifter${randomCode(6).toLowerCase()}`;
}

authRoutes.get("/auth/google/callback", async (c) => {
  const st = await readState(c);
  const mode: Mode = st?.m ?? "login";
  if (!googleOn(c.env)) return back(c, mode, "google_off");
  if (!st || !safeEqual(c.req.query("state") ?? "", st.s)) return back(c, mode, "state");
  const gErr = c.req.query("error");
  if (gErr) return back(c, mode, gErr === "access_denied" ? "cancelled" : "google_error");
  const code = c.req.query("code");
  if (!code) return back(c, mode, "google_error");

  const d = real(c);
  const keys = [`ip:${clientIp(c)}`];
  const wait = await lockedFor(d, keys);
  if (wait) return back(c, mode, "locked");

  let cl: Claims;
  try {
    const r = await fetch(G_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: c.env.GOOGLE_CLIENT_ID!, client_secret: c.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(c), grant_type: "authorization_code", code_verifier: st.v }),
    });
    const tok = (await r.json()) as { id_token?: string; error?: string };
    if (!r.ok || !tok.id_token) throw new Error(tok.error ?? "token");
    cl = await verifyIdToken(tok.id_token, c.env.GOOGLE_CLIENT_ID!, st.n);
  } catch (e) {
    console.warn("google sign-in failed:", (e as Error).message);
    await fail(d, keys);
    return back(c, mode, "verify");
  }
  const email = cl.email?.toLowerCase().slice(0, 200) ?? null;
  const [owner] = await d.select().from(t.users).where(eq(t.users.googleSub, cl.sub));

  if (mode === "link") {
    const me = await realUser(c);
    if (!me || me.id !== st.u) return back(c, "login", "login_first");
    if (owner && owner.id !== me.id) return back(c, mode, "google_taken");
    await d.update(t.users).set({ googleSub: cl.sub, email, updatedAt: now() }).where(eq(t.users.id, me.id));
    return back(c, mode, undefined, "linked");
  }

  if (owner) {
    // login (or "sign up" with a Google account that already has an Iron Log account → just log in)
    await clear(d, keys);
    if (email && email !== owner.email) await d.update(t.users).set({ email }).where(eq(t.users.id, owner.id));
    setAuth(c, await userToken(c.env, owner.id, owner.passHash));
    await noteLogin(d, owner.id);
    return back(c, mode);
  }
  if (mode === "login") return back(c, mode, "no_account");

  // signup with an invite
  if (!st.i || !(await takeInvite(d, st.i))) return back(c, mode, "invite_invalid");
  const id = `usr-${crypto.randomUUID()}`;
  const at = now();
  const passHash = `!google:${rand(12)}`; // no passcode yet: passcode login impossible until they set one in Security
  try {
    const username = await usernameFromEmail(d, email ?? "lifter");
    await d.insert(t.users).values({
      id, username, name: (cl.name ?? cl.given_name ?? "").trim().slice(0, 40) || null, bio: null, avatarId: null,
      passHash, email, googleSub: cl.sub, role: "member", createdAt: at, updatedAt: at,
    });
  } catch {
    await giveBack(d, st.i);
    return back(c, mode, "signup_failed");
  }
  await clear(d, keys);
  setAuth(c, await userToken(c.env, id, passHash));
  await noteLogin(d, id);
  return back(c, mode, undefined, "welcome");
});

/** DEV seed hook: a reusable DEV invite (DEVTEST7) so the join screen can be tried: #/join/DEVTEST7 (usernames dev_…). */
export async function seedAuth(raw: RawDB, users: Record<string, string>) {
  const at = now();
  await raw.insert(t.invites).values({ code: "DEVTEST7", createdBy: users.dev, maxUses: 50, uses: 0, expiresAt: at + 30 * DAY, createdAt: at })
    .onConflictDoUpdate({ target: t.invites.code, set: { uses: 0, maxUses: 50, expiresAt: at + 30 * DAY } });
}
