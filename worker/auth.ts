import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Env } from "./env";

// Passcode login. APP_PASSCODE → your real data. DEV_PASSCODE → test mode on a separate database (DB_DEV).
// The cookie holds an HMAC of the passcode + mode, so changing a passcode logs those devices out.

const COOKIE = "il_auth";

async function token(passcode: string, mode: "real" | "dev"): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(mode === "dev" ? "iron-log:dev:v1" : "iron-log:v1"));
  return (mode === "dev" ? "dev." : "") + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function login(c: Context<Env>) {
  const { passcode } = await c.req.json<{ passcode?: string }>();
  const real = c.env.APP_PASSCODE;
  const dev = c.env.DEV_PASSCODE;
  if (!real) return c.json({ error: "APP_PASSCODE secret is not set" }, 500);
  let mode: "real" | "dev" | null = null;
  if (passcode && safeEqual(passcode, real)) mode = "real";
  else if (passcode && dev && safeEqual(passcode, dev)) mode = "dev";
  if (!mode) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return c.json({ error: "Wrong passcode" }, 401);
  }
  setCookie(c, COOKIE, await token(mode === "dev" ? dev! : real, mode), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return c.json({ ok: true, dev: mode === "dev" });
}

export async function requireAuth(c: Context<Env>, next: Next) {
  const got = getCookie(c, COOKIE);
  if (!got) return c.json({ error: "unauthorized" }, 401);
  if (got.startsWith("dev.")) {
    const dev = c.env.DEV_PASSCODE;
    if (!dev || !safeEqual(got, await token(dev, "dev"))) return c.json({ error: "unauthorized" }, 401);
    c.set("dev", true);
  } else {
    const real = c.env.APP_PASSCODE;
    if (!real || !safeEqual(got, await token(real, "real"))) return c.json({ error: "unauthorized" }, 401);
    c.set("dev", false);
  }
  await next();
}
