// AI connector core: token crypto, which database a token lives in, the per-request user context, and an internal call
// into the app's own /api handlers (so MCP tools reuse exactly the numbers the app shows instead of re-implementing them).
import { drizzle } from "drizzle-orm/d1";
import { and, eq, isNull } from "drizzle-orm";
import * as t from "../db/schema";
import type { Env } from "../env";
import { resolveProgram, scopedDb, type DB, type RawDB } from "../db";
import { COOKIE, SUSPENDED, devUserToken, userToken } from "../auth";
import { registerCustom, type UserProgram } from "../../program/templates";
import type { Program } from "../../program";

export type Bindings = Env["Bindings"];

/** Token prefixes encode the database: real tokens never resolve in DEV and vice versa. */
export const PREFIX = { real: "ilm_", dev: "ilmdev_" } as const;
export const ACCESS_TTL = 3600_000; // 1 h
export const REFRESH_TTL = 30 * 86_400_000; // 30 days
export const CODE_TTL = 120_000; // authorization code: 2 min
export const CONNECT_TTL = 600_000; // connect code: 10 min
export const SCOPE = "iron-log";

const enc = new TextEncoder();
export const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function sha256hex(s: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function sha256b64url(s: string) {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}
export const randomToken = (dev: boolean) => `${dev ? PREFIX.dev : PREFIX.real}${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
export const randomId = (p: string) => `${p}${b64url(crypto.getRandomValues(new Uint8Array(12)))}`;
/** Which database a token belongs to (null = not one of ours). */
export const tokenDb = (tok: string): "real" | "dev" | null => (tok.startsWith(PREFIX.dev) ? "dev" : tok.startsWith(PREFIX.real) ? "real" : null);

export const dbOf = (env: Bindings, dev: boolean): RawDB => drizzle(dev ? env.DB_DEV : env.DB, { schema: t });
/** Lockouts / rate limits always live in the real database's login_attempts (same as the login screen). */
export const limitsDb = (env: Bindings) => drizzle(env.DB, { schema: t });

// ---------------------------------------------------------------- connect codes (8 chars, shown big in the app)

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function newConnectCode() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => ALPHA[x % 32]).join("");
}
export const normCode = (s: string) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const connectHash = (code: string) => sha256hex(`connect:${normCode(code)}`);

// ---------------------------------------------------------------- the user behind a bearer token

export interface Who {
  dev: boolean;
  userId: string;
  role: string;
  programId: string | null;
  prog: Program;
  grantId: string;
  clientId: string | null;
  /** "Claude", "ChatGPT" … shown in events and plan versions. */
  label: string;
  env: Bindings;
  ctx: ExecutionContext;
  origin: string;
}

/** Hono-like context for db()/rawDb() helpers. */
export const honoish = (w: Pick<Who, "env" | "dev" | "userId" | "role" | "programId" | "prog">) => ({
  env: w.env, var: { dev: w.dev, userId: w.userId, role: w.role, programId: w.programId, prog: w.prog } as Env["Variables"],
});

export const scoped = (w: Who): DB => scopedDb(w.dev ? w.env.DB_DEV : w.env.DB, w.userId, w.prog);
export const raw = (w: Pick<Who, "env" | "dev">): RawDB => dbOf(w.env, w.dev);

/** Bearer token → user. Null = invalid / expired / revoked / suspended (→ 401). Touches lastUsed at most every 5 min. */
export async function authenticate(env: Bindings, ctx: ExecutionContext, origin: string, bearer: string): Promise<Who | null> {
  const which = tokenDb(bearer);
  if (!which) return null;
  const dev = which === "dev";
  const d = dbOf(env, dev);
  const id = await sha256hex(bearer);
  const [tok] = await d.select().from(t.oauthTokens).where(and(eq(t.oauthTokens.id, id), eq(t.oauthTokens.kind, "access"), isNull(t.oauthTokens.revokedAt)));
  if (!tok || tok.expiresAt < Date.now()) return null;
  const [u] = await d.select({ id: t.users.id, role: t.users.role, programId: t.users.programId }).from(t.users).where(eq(t.users.id, tok.userId));
  if (!u || u.role === SUSPENDED) return null;
  if (!tok.usedAt || Date.now() - tok.usedAt > 300_000) {
    ctx.waitUntil(d.update(t.oauthTokens).set({ usedAt: Date.now() }).where(eq(t.oauthTokens.id, id)).then(() => undefined, () => undefined));
  }
  const prog = await resolveProgram(d, u);
  const custom = (prog as UserProgram).custom;
  if (custom?.length) registerCustom(custom);
  return { dev, userId: u.id, role: u.role, programId: u.programId, prog, grantId: tok.grantId ?? "", clientId: tok.clientId, label: tok.label ?? "AI app", env, ctx, origin };
}

/** Re-read the user's plan after a write that changed it (switch / fork / edit). */
export async function refreshWho(w: Who): Promise<Who> {
  const d = raw(w);
  const [u] = await d.select({ programId: t.users.programId }).from(t.users).where(eq(t.users.id, w.userId));
  const prog = await resolveProgram(d, u);
  const custom = (prog as UserProgram).custom;
  if (custom?.length) registerCustom(custom);
  return { ...w, programId: u?.programId ?? null, prog };
}

// ---------------------------------------------------------------- internal call into /api (same handlers the app uses)

let appFetch: ((req: Request, env: Bindings, ctx: ExecutionContext) => Response | Promise<Response>) | null = null;
/** worker/index.ts is imported lazily (it imports this module tree) — the handler is resolved on first use. */
async function app() {
  if (!appFetch) appFetch = (await import("../index")).default.fetch;
  return appFetch;
}

async function cookieFor(w: Who) {
  if (w.dev) {
    if (!w.env.DEV_PASSCODE) throw new Error("DEV mode is not configured on this server");
    return devUserToken(w.env, w.userId);
  }
  const [u] = await raw(w).select({ passHash: t.users.passHash }).from(t.users).where(eq(t.users.id, w.userId));
  if (!u) throw new Error("User not found");
  return userToken(w.env, w.userId, u.passHash);
}

/**
 * Calls the app's own API as this user (server-side only; the session value never leaves the Worker).
 * Every /api handler scopes its queries with db(c) → this user's rows only.
 */
export async function api<T = unknown>(w: Who, method: string, path: string, body?: unknown): Promise<T> {
  const f = await app();
  const req = new Request(`${w.origin}/api${path}`, {
    method,
    headers: { cookie: `${COOKIE}=${await cookieFor(w)}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const r = await f(req, w.env, w.ctx);
  const data = (await r.json().catch(() => null)) as T & { error?: string };
  if (!r.ok) throw new Error((data as { error?: string } | null)?.error ?? `${path} failed (${r.status})`);
  return data;
}

/** Event log row for every AI write: type ai_<tool>, data {client, …}. */
export async function logEvent(w: Who, tool: string, data: Record<string, unknown>) {
  await scoped(w).insert(t.events).values({ id: crypto.randomUUID(), userId: "", sessionId: null, type: `ai_${tool}`, data: JSON.stringify({ client: w.label, ...data }).slice(0, 4000), at: Date.now() });
}

export const today = () => new Date().toISOString().slice(0, 10);
