// OAuth 2.1 authorization server + protected-resource metadata for the MCP endpoint.
//   RFC 9728  /.well-known/oauth-protected-resource[/mcp]       → resource = <origin>/mcp
//   RFC 8414  /.well-known/oauth-authorization-server[/mcp]      (+ openid-configuration aliases some clients probe)
//   RFC 7591  POST /oauth/register     public clients only (token_endpoint_auth_method "none"), rate-limited per IP
//   CIMD      https client_id URLs (OAuth Client ID Metadata Document draft) are fetched + validated on /authorize
//   GET/POST  /oauth/authorize          consent page; the user types a one-time CONNECT CODE from the app (proves intent)
//   POST      /oauth/token              authorization_code (+PKCE S256) | refresh_token (rotated, reuse → grant revoked)
//   RFC 7009  POST /oauth/revoke
// Tokens: "ilm_" (real DB) / "ilmdev_" (DEV DB) + 32 random bytes base64url; only SHA-256 hashes are stored.
import type { Context } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import * as t from "../db/schema";
import { clientIp } from "../auth";
import { clear, fail, lockedFor } from "../auth";
import type { Env } from "../env";
import {
  ACCESS_TTL, CODE_TTL, REFRESH_TTL, SCOPE, connectHash, dbOf, limitsDb, normCode, randomId, randomToken, sha256b64url, sha256hex, tokenDb,
  type Bindings,
} from "./core";
import { authorizePage, errorPage } from "./page";

type C = Context<Env>;
const now = () => Date.now();
export const originOf = (c: C) => new URL(c.req.url).origin;
export const resourceOf = (c: C) => `${originOf(c)}/mcp`;
export const prmUrl = (c: C) => `${originOf(c)}/.well-known/oauth-protected-resource/mcp`;

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, last-event-id",
  "access-control-expose-headers": "www-authenticate, mcp-session-id, mcp-protocol-version",
  "access-control-max-age": "86400",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...extra } });
const oerr = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);

// ---------------------------------------------------------------- metadata

export const protectedResource = (c: C) =>
  json({
    resource: resourceOf(c),
    authorization_servers: [originOf(c)],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Iron Log",
    resource_documentation: `${originOf(c)}/#/security`,
  }, 200, { "cache-control": "public, max-age=300" });

export const authServer = (c: C) => {
  const o = originOf(c);
  return json({
    issuer: o,
    authorization_endpoint: `${o}/oauth/authorize`,
    token_endpoint: `${o}/oauth/token`,
    registration_endpoint: `${o}/oauth/register`,
    revocation_endpoint: `${o}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE, "offline_access"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${o}/#/security`,
  }, 200, { "cache-control": "public, max-age=300" });
};

// ---------------------------------------------------------------- redirect URIs

/** https anywhere (no fragment), or http on a loopback host (RFC 8252 native apps). */
export function okRedirect(u: string) {
  try {
    const x = new URL(u);
    if (x.hash || x.username || x.password) return false;
    if (x.protocol === "https:") return true;
    return x.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(x.hostname);
  } catch {
    return false;
  }
}
const loopback = (x: URL) => x.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(x.hostname);
/** Exact match, except loopback redirects where the port may differ (RFC 8252 §7.3). */
export function redirectMatches(registered: string[], uri: string) {
  if (registered.includes(uri)) return true;
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (!loopback(u)) return false;
  return registered.some((r) => {
    try {
      const x = new URL(r);
      return loopback(x) && x.hostname === u.hostname && x.pathname === u.pathname && x.search === u.search;
    } catch { return false; }
  });
}

// ---------------------------------------------------------------- rate limit (login_attempts rows, own key prefix)

async function rateLimit(env: Bindings, key: string, max: number, windowMs: number) {
  const d = limitsDb(env);
  const [r] = await d.select().from(t.loginAttempts).where(eq(t.loginAttempts.key, key));
  const fresh = !r || now() - r.at > windowMs;
  const n = fresh ? 1 : r.fails + 1;
  const at = fresh ? now() : r.at;
  await d.insert(t.loginAttempts).values({ key, fails: n, until: null, at }).onConflictDoUpdate({ target: t.loginAttempts.key, set: { fails: n, until: null, at } });
  return n <= max;
}

// ---------------------------------------------------------------- clients (DCR + CIMD), stored in the real DB

type Client = { id: string; name: string; redirectUris: string[] };

export async function register(c: C) {
  if (!(await rateLimit(c.env, `mcpreg:${clientIp(c)}`, 20, 3600_000))) return oerr("slow_down", "Too many registrations from this address. Try again in an hour.", 429);
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b || typeof b !== "object") return oerr("invalid_client_metadata", "Body must be JSON client metadata (RFC 7591).");
  const uris = Array.isArray(b.redirect_uris) ? (b.redirect_uris as unknown[]).filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 10) return oerr("invalid_redirect_uri", "Give 1-10 redirect_uris.");
  const bad = uris.find((u) => !okRedirect(u) || u.length > 500);
  if (bad) return oerr("invalid_redirect_uri", `Redirect URI must be https, or http on localhost: ${bad}`);
  const gt = Array.isArray(b.grant_types) ? (b.grant_types as string[]) : ["authorization_code", "refresh_token"];
  if (gt.some((g) => !["authorization_code", "refresh_token"].includes(g))) return oerr("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported.");
  const rt = Array.isArray(b.response_types) ? (b.response_types as string[]) : ["code"];
  if (rt.some((r) => r !== "code")) return oerr("invalid_client_metadata", "Only response_type code is supported.");
  const name = (typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim() : "AI app").slice(0, 80);
  const id = randomId("ilc_");
  const at = now();
  await limitsDb(c.env).insert(t.oauthClients).values({ id, name, redirectUris: JSON.stringify(uris), createdAt: at });
  // public client: whatever auth method was asked for, the issued one is "none" (RFC 7591 §3.2.1 lets the server replace it)
  return json({
    client_id: id, client_id_issued_at: Math.floor(at / 1000), client_name: name, redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none",
    ...(typeof b.scope === "string" ? { scope: SCOPE } : {}),
  }, 201);
}

/** CIMD: client_id is an https URL serving {client_id, client_name, redirect_uris}. Local http only when this server is local (tests). */
function cimdUrl(id: string, selfOrigin: string) {
  try {
    const u = new URL(id);
    const localSelf = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(selfOrigin);
    if (u.protocol === "https:" && u.pathname.length > 1 && !/^(localhost|127\.|10\.|192\.168\.|\[)/.test(u.hostname) && !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return u;
    if (localSelf && u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname) && u.pathname.length > 1) return u;
  } catch { /* not a URL */ }
  return null;
}

async function fetchCimd(u: URL): Promise<Client | string> {
  let r: Response;
  try {
    r = await fetch(u.toString(), { redirect: "manual", headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
  } catch {
    return "Couldn't fetch the client's metadata document.";
  }
  if (r.status !== 200) return `Client metadata document returned HTTP ${r.status}.`;
  const text = await r.text();
  if (text.length > 20_000) return "Client metadata document is too large.";
  let m: { client_id?: unknown; client_name?: unknown; redirect_uris?: unknown };
  try { m = JSON.parse(text); } catch { return "Client metadata document is not JSON."; }
  if (m.client_id !== u.toString()) return "client_id in the metadata document doesn't match its URL.";
  const uris = Array.isArray(m.redirect_uris) ? m.redirect_uris.filter((x): x is string => typeof x === "string" && okRedirect(x)) : [];
  if (!uris.length) return "Client metadata document has no valid redirect_uris.";
  return { id: u.toString(), name: (typeof m.client_name === "string" && m.client_name.trim() ? m.client_name.trim() : u.hostname).slice(0, 80), redirectUris: uris.slice(0, 20) };
}

export async function getClient(env: Bindings, id: string, selfOrigin: string, wantRedirect?: string): Promise<Client | string> {
  if (!id) return "Missing client_id.";
  const d = limitsDb(env);
  const [row] = await d.select().from(t.oauthClients).where(eq(t.oauthClients.id, id));
  const cached = row ? { id: row.id, name: row.name ?? "AI app", redirectUris: JSON.parse(row.redirectUris) as string[] } : null;
  const u = cimdUrl(id, selfOrigin);
  if (!u) return cached ?? "Unknown client. Remove the connector and add it again.";
  // CIMD: cached for a day, refetched when stale or when a new redirect URI shows up
  if (cached && row && now() - row.createdAt < 86_400_000 && (!wantRedirect || redirectMatches(cached.redirectUris, wantRedirect))) return cached;
  const got = await fetchCimd(u);
  if (typeof got === "string") return cached && !wantRedirect ? cached : got;
  await d.insert(t.oauthClients).values({ id: got.id, name: got.name, redirectUris: JSON.stringify(got.redirectUris), createdAt: now() })
    .onConflictDoUpdate({ target: t.oauthClients.id, set: { name: got.name, redirectUris: JSON.stringify(got.redirectUris), createdAt: now() } });
  return got;
}

/** Friendly label for the Connected apps list. */
export function labelFor(client: Client, redirect: string) {
  const host = (() => { try { return new URL(redirect).hostname; } catch { return ""; } })();
  if (/(^|\.)claude\.(ai|com)$/.test(host) || /claude/i.test(client.name)) return "Claude";
  if (/(^|\.)(chatgpt\.com|openai\.com)$/.test(host) || /chatgpt|openai/i.test(client.name)) return "ChatGPT";
  return client.name || host || "AI app";
}

// ---------------------------------------------------------------- authorize

type AuthReq = { client_id: string; redirect_uri: string; response_type: string; code_challenge: string; code_challenge_method: string; state: string; scope: string; resource: string };
const FIELDS: (keyof AuthReq)[] = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"];

function sameResource(a: string, b: string) {
  try {
    const x = new URL(a), y = new URL(b);
    const norm = (u: URL) => `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
    return !x.hash && (norm(x) === norm(y) || norm(x) === `${y.protocol}//${y.host}`); // the MCP URL, or the bare origin
  } catch {
    return false;
  }
}

function redirectWith(uri: string, params: Record<string, string>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

/** Validates the request. Before redirect_uri is trusted → an error PAGE; after → error redirect to the client. */
async function check(c: C, q: AuthReq): Promise<{ client: Client } | Response> {
  const client = await getClient(c.env, q.client_id, originOf(c), q.redirect_uri);
  if (typeof client === "string") return html(errorPage("This app isn't registered", client), 400);
  if (!q.redirect_uri || !redirectMatches(client.redirectUris, q.redirect_uri)) return html(errorPage("Wrong return address", "The app's redirect_uri isn't one it registered. Remove the connector and add it again."), 400);
  const bounce = (error: string, d: string) => c.redirect(redirectWith(q.redirect_uri, { error, error_description: d, state: q.state, iss: originOf(c) }), 302);
  if (q.response_type !== "code") return bounce("unsupported_response_type", "response_type must be code");
  if (!q.code_challenge || q.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(q.code_challenge)) return bounce("invalid_request", "PKCE with code_challenge_method=S256 is required");
  if (q.resource && !sameResource(q.resource, resourceOf(c))) return bounce("invalid_target", `resource must be ${resourceOf(c)}`);
  return { client };
}

const html = (body: string, status = 200, formTarget?: string) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'${formTarget ? ` ${formTarget}` : ""}; frame-ancestors 'none'; base-uri 'none'`,
    },
  });
const redirectOrigin = (u: string) => { try { const x = new URL(u); return loopback(x) ? `${x.protocol}//${x.hostname}:*` : x.origin; } catch { return ""; } };

export async function authorizeGet(c: C) {
  const q = Object.fromEntries(FIELDS.map((k) => [k, c.req.query(k) ?? ""])) as AuthReq;
  const ok = await check(c, q);
  if (ok instanceof Response) return ok;
  return html(authorizePage({ q, clientName: labelFor(ok.client, q.redirect_uri), redirectHost: new URL(q.redirect_uri).host }), 200, redirectOrigin(q.redirect_uri));
}

export async function authorizePost(c: C) {
  const f = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
  const q = Object.fromEntries(FIELDS.map((k) => [k, typeof f[k] === "string" ? (f[k] as string) : ""])) as AuthReq;
  const ok = await check(c, q);
  if (ok instanceof Response) return ok;
  const label = labelFor(ok.client, q.redirect_uri);
  const back = (params: Record<string, string>) => c.redirect(redirectWith(q.redirect_uri, { ...params, state: q.state, iss: originOf(c) }), 302);
  if (f.action === "deny") return back({ error: "access_denied", error_description: "You cancelled the connection." });

  const page = (error: string) => html(authorizePage({ q, clientName: label, redirectHost: new URL(q.redirect_uri).host, error }), 400, redirectOrigin(q.redirect_uri));
  const lim = limitsDb(c.env);
  const keys = [`mcpcode:${clientIp(c)}`];
  const wait = await lockedFor(lim, keys);
  if (wait) return page(`Too many wrong codes. Wait ${Math.ceil(wait / 60000)} min and try again.`);
  const code = normCode(String(f.code ?? ""));
  if (code.length !== 8) return page("The connect code has 8 letters and numbers.");

  // the code says which database (real or DEV) the account lives in
  const hash = await connectHash(code);
  let dev = false;
  let d = dbOf(c.env, false);
  let [row] = await d.select().from(t.oauthTokens).where(and(eq(t.oauthTokens.id, hash), eq(t.oauthTokens.kind, "connect")));
  if (!row && c.env.DB_DEV) {
    d = dbOf(c.env, true);
    [row] = await d.select().from(t.oauthTokens).where(and(eq(t.oauthTokens.id, hash), eq(t.oauthTokens.kind, "connect")));
    dev = !!row;
  }
  if (!row || row.usedAt || row.revokedAt || row.expiresAt < now()) {
    await fail(lim, keys);
    return page(row && row.expiresAt < now() ? "That code expired. Make a new one in Iron Log." : "That code isn't right (or was already used). Make a new one in Iron Log.");
  }
  // single use, atomically
  const used = await d.update(t.oauthTokens).set({ usedAt: now(), revokedAt: now() }).where(and(eq(t.oauthTokens.id, hash), isNull(t.oauthTokens.usedAt))).returning({ id: t.oauthTokens.id });
  if (!used.length) return page("That code was just used. Make a new one in Iron Log.");
  await clear(lim, keys);

  const authCode = randomToken(dev);
  await d.insert(t.oauthTokens).values({
    id: await sha256hex(authCode), kind: "code", userId: row.userId, clientId: ok.client.id, grantId: randomId("g_"), scope: SCOPE,
    codeChallenge: q.code_challenge, redirectUri: q.redirect_uri, label, expiresAt: now() + CODE_TTL, createdAt: now(),
  });
  await lim.update(t.oauthClients).set({ lastUsedAt: now() }).where(eq(t.oauthClients.id, ok.client.id));
  return back({ code: authCode });
}

// ---------------------------------------------------------------- token

async function readForm(c: C): Promise<Record<string, string>> {
  const ct = c.req.header("content-type") ?? "";
  if (ct.includes("application/json")) {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    return Object.fromEntries(Object.entries(b).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  const b = await c.req.parseBody().catch(() => ({}));
  return Object.fromEntries(Object.entries(b).filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

async function issue(d: ReturnType<typeof dbOf>, dev: boolean, base: { userId: string; clientId: string | null; grantId: string; label: string | null }) {
  const access = randomToken(dev), refresh = randomToken(dev);
  const at = now();
  await d.insert(t.oauthTokens).values([
    { id: await sha256hex(access), kind: "access", ...base, scope: SCOPE, expiresAt: at + ACCESS_TTL, createdAt: at },
    { id: await sha256hex(refresh), kind: "refresh", ...base, scope: SCOPE, expiresAt: at + REFRESH_TTL, createdAt: at },
  ]);
  return json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope: SCOPE });
}

const revokeGrant = (d: ReturnType<typeof dbOf>, grantId: string | null) =>
  grantId ? d.update(t.oauthTokens).set({ revokedAt: now() }).where(and(eq(t.oauthTokens.grantId, grantId), isNull(t.oauthTokens.revokedAt))) : Promise.resolve();

export async function token(c: C) {
  const f = await readForm(c);
  const gt = f.grant_type;
  if (f.resource && !sameResource(f.resource, resourceOf(c))) return oerr("invalid_target", `resource must be ${resourceOf(c)}`);
  if (gt === "authorization_code") {
    const which = tokenDb(f.code ?? "");
    if (!which) return oerr("invalid_grant", "Unknown authorization code.");
    const dev = which === "dev";
    const d = dbOf(c.env, dev);
    const id = await sha256hex(f.code);
    const [row] = await d.select().from(t.oauthTokens).where(and(eq(t.oauthTokens.id, id), eq(t.oauthTokens.kind, "code")));
    if (!row) return oerr("invalid_grant", "Unknown authorization code.");
    if (row.usedAt) { await revokeGrant(d, row.grantId); return oerr("invalid_grant", "Authorization code was already used; the connection was revoked for safety."); }
    if (row.expiresAt < now()) return oerr("invalid_grant", "Authorization code expired. Connect again.");
    if (f.client_id && f.client_id !== row.clientId) return oerr("invalid_grant", "Code was issued to another client.");
    if (!f.redirect_uri || f.redirect_uri !== row.redirectUri) return oerr("invalid_grant", "redirect_uri doesn't match the authorization request.");
    if (!f.code_verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(f.code_verifier) || (await sha256b64url(f.code_verifier)) !== row.codeChallenge) return oerr("invalid_grant", "PKCE code_verifier doesn't match.");
    const claimed = await d.update(t.oauthTokens).set({ usedAt: now() }).where(and(eq(t.oauthTokens.id, id), isNull(t.oauthTokens.usedAt))).returning({ id: t.oauthTokens.id });
    if (!claimed.length) { await revokeGrant(d, row.grantId); return oerr("invalid_grant", "Authorization code was already used."); }
    return issue(d, dev, { userId: row.userId, clientId: row.clientId, grantId: row.grantId!, label: row.label });
  }
  if (gt === "refresh_token") {
    const which = tokenDb(f.refresh_token ?? "");
    if (!which) return oerr("invalid_grant", "Unknown refresh token.");
    const dev = which === "dev";
    const d = dbOf(c.env, dev);
    const id = await sha256hex(f.refresh_token);
    const [row] = await d.select().from(t.oauthTokens).where(and(eq(t.oauthTokens.id, id), eq(t.oauthTokens.kind, "refresh")));
    if (!row) return oerr("invalid_grant", "Unknown refresh token.");
    if (row.revokedAt) {
      // a rotated (old) refresh token came back → possible theft: end the whole connection (OAuth 2.1 §4.3.1)
      await revokeGrant(d, row.grantId);
      return oerr("invalid_grant", "Refresh token was already used or revoked. Connect again from Iron Log.");
    }
    if (row.expiresAt < now()) return oerr("invalid_grant", "Refresh token expired. Connect again.");
    if (f.client_id && f.client_id !== row.clientId) return oerr("invalid_grant", "Token was issued to another client.");
    const [u] = await d.select({ role: t.users.role }).from(t.users).where(eq(t.users.id, row.userId));
    if (!u || u.role === "suspended") return oerr("invalid_grant", "This account can't connect right now.");
    const rotated = await d.update(t.oauthTokens).set({ revokedAt: now(), usedAt: now() }).where(and(eq(t.oauthTokens.id, id), isNull(t.oauthTokens.revokedAt))).returning({ id: t.oauthTokens.id });
    if (!rotated.length) { await revokeGrant(d, row.grantId); return oerr("invalid_grant", "Refresh token was already used."); }
    return issue(d, dev, { userId: row.userId, clientId: row.clientId, grantId: row.grantId!, label: row.label });
  }
  return oerr("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

/** RFC 7009: always 200. A refresh token ends the whole connection; an access token only itself. */
export async function revoke(c: C) {
  const f = await readForm(c);
  const tok = f.token ?? "";
  const which = tokenDb(tok);
  if (which) {
    const d = dbOf(c.env, which === "dev");
    const id = await sha256hex(tok);
    const [row] = await d.select().from(t.oauthTokens).where(eq(t.oauthTokens.id, id));
    if (row && (row.kind === "access" || row.kind === "refresh")) {
      if (row.kind === "refresh") await revokeGrant(d, row.grantId);
      else await d.update(t.oauthTokens).set({ revokedAt: now() }).where(eq(t.oauthTokens.id, id));
    }
  }
  return new Response(null, { status: 200, headers: { ...CORS, "cache-control": "no-store" } });
}
