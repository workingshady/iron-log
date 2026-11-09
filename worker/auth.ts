import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Env } from "./env";

// Single-user passcode login. The passcode lives in a Cloudflare secret (APP_PASSCODE);
// the cookie holds an HMAC of it, so changing the passcode logs every device out.

const COOKIE = "il_auth";

async function token(passcode: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("iron-log:v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
  if (!real) return c.json({ error: "APP_PASSCODE secret is not set" }, 500);
  if (!passcode || !safeEqual(passcode, real)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return c.json({ error: "Wrong passcode" }, 401);
  }
  setCookie(c, COOKIE, await token(real), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return c.json({ ok: true });
}

export async function requireAuth(c: Context<Env>, next: Next) {
  const real = c.env.APP_PASSCODE;
  const got = getCookie(c, COOKIE);
  if (!real || !got || !safeEqual(got, await token(real))) return c.json({ error: "unauthorized" }, 401);
  await next();
}
