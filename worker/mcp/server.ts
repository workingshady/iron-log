// MCP server over Streamable HTTP, written by hand (no SDK). Dual-era:
//  • legacy clients (protocol 2025-03-26 … 2025-11-25): initialize handshake, then requests; we run stateless
//    (no Mcp-Session-Id), answer with application/json, notifications → 202.
//  • modern clients (2026-07-28): every request carries _meta["io.modelcontextprotocol/protocolVersion"] and mirrored
//    headers (MCP-Protocol-Version, Mcp-Method, Mcp-Name), checked here; server/discover; results carry resultType.
// Auth: Bearer access token on every POST → one user (core.authenticate). Origin is validated (DNS-rebinding defence).
import type { Context } from "hono";
import type { Env } from "../env";
import { authenticate, type Who } from "./core";
import { CORS, originOf, prmUrl } from "./oauth";
import { PROMPTS } from "./prompts";
import { CHANGES_PLAN, TOOLS, ToolError, refreshWho } from "./tools";

const MODERN = ["2026-07-28"];
const LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SUPPORTED = [...MODERN, ...LEGACY];
const SERVER_INFO = { name: "Iron Log", title: "Iron Log", version: "1.0.0" };
const META_V = "io.modelcontextprotocol/protocolVersion";

export const INSTRUCTIONS = `Iron Log is the user's own strength-training log and plan (one user's data only).
Start with get_overview. Units: kg as shown in the app (dumbbell pairs PER HAND, barbells total incl. bar, machines = stack number); RIR = reps in reserve; sets kind N normal, W warm-up, D drop, F failure, R rest-pause.
Plans run in 4-week months: W1 ramp-in, W2 build (= the editable design week), W3 overload, W4 deload. A new version of the same plan keeps the month; a different plan id starts a new month at Week 1 (logs and weights always carry over).
Every plan change needs a short why and becomes a new version the user can undo (list_plan_versions, undo_plan_version). The built-in default plan can't be edited: use fork_plan first.
Coach like a careful human coach: base advice on the logged data, ask before big changes, take pain seriously (sharp pain = remove the movement), and don't punish a stressful week.`;

const CAPS = { tools: { listChanged: false }, prompts: { listChanged: false } };

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const isAllowedOrigin = (origin: string, self: string) =>
  origin === self || /^https:\/\/([a-z0-9-]+\.)*(claude\.ai|claude\.com|anthropic\.com|chatgpt\.com|openai\.com)$/.test(origin) ||
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

function corsFor(c: Context<Env>) {
  const o = c.req.header("origin");
  return o ? { ...CORS, "access-control-allow-origin": o, vary: "Origin" } : CORS;
}
const out = (c: Context<Env>, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...(body === null ? {} : { "content-type": "application/json" }), "cache-control": "no-store", ...corsFor(c), ...extra } });
const rpcErr = (id: Msg["id"], code: number, message: string, data?: unknown) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } });

export function unauthorized(c: Context<Env>, invalid: boolean) {
  const h = `Bearer resource_metadata="${prmUrl(c)}", scope="iron-log"${invalid ? ', error="invalid_token", error_description="The access token is missing, expired or revoked"' : ""}`;
  return out(c, rpcErr(null, -32001, "Unauthorized: connect Iron Log again (Account & security → Connect AI)."), 401, { "www-authenticate": h });
}

function toolResult(summary: string, data: unknown) {
  let text = `${summary}\n\n${JSON.stringify(data)}`;
  if (text.length > 120_000) text = `${text.slice(0, 120_000)}\n…(truncated: narrow the date range or use a limit)`;
  return { content: [{ type: "text", text }], isError: false };
}

async function handle(w: Who, m: Msg, modern: boolean): Promise<{ result?: unknown; error?: { code: number; message: string; data?: unknown }; status?: number } | null> {
  const p = m.params ?? {};
  switch (m.method) {
    case "initialize": {
      const want = String(p.protocolVersion ?? "");
      const v = LEGACY.includes(want) ? want : LEGACY[0];
      return { result: { protocolVersion: v, capabilities: CAPS, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS } };
    }
    case "server/discover":
      return { result: { supportedVersions: SUPPORTED, capabilities: CAPS, _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO }, instructions: INSTRUCTIONS, ttlMs: 3600_000, cacheScope: "private" } };
    case "ping":
      return { result: {} };
    case "tools/list":
      return { result: { tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) } };
    case "tools/call": {
      const tool = TOOLS.find((x) => x.name === p.name);
      if (!tool) return { error: { code: -32602, message: `Unknown tool: ${String(p.name)}` } };
      const args = (p.arguments && typeof p.arguments === "object" ? p.arguments : {}) as Record<string, unknown>;
      try {
        const r = await tool.run(w, args);
        return { result: toolResult(r.summary, r.data) };
      } catch (e) {
        const msg = e instanceof ToolError ? e.message : `Something went wrong: ${(e as Error)?.message ?? e}`;
        if (!(e instanceof ToolError)) console.error("mcp tool", tool.name, e);
        return { result: { content: [{ type: "text", text: msg }], isError: true } };
      } finally {
        if (CHANGES_PLAN.has(tool.name)) Object.assign(w, await refreshWho(w));
      }
    }
    case "prompts/list":
      return { result: { prompts: PROMPTS.map(({ name, title, description, arguments: a }) => ({ name, title, description, ...(a ? { arguments: a } : {}) })) } };
    case "prompts/get": {
      const pr = PROMPTS.find((x) => x.name === p.name);
      if (!pr) return { error: { code: -32602, message: `Unknown prompt: ${String(p.name)}` } };
      const a = Object.fromEntries(Object.entries((p.arguments ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]));
      return { result: { description: pr.description, messages: [{ role: "user", content: { type: "text", text: pr.text(a) } }] } };
    }
    case "resources/list":
      return { result: { resources: [] } };
    case "resources/templates/list":
      return { result: { resourceTemplates: [] } };
    case "logging/setLevel":
      return { result: {} };
    default:
      if (m.method?.startsWith("notifications/")) return null;
      return { error: { code: -32601, message: `Method not found: ${m.method}` }, status: modern ? 404 : 200 };
  }
}

const b64dec = (v: string) => { const m = /^=\?base64\?(.*)\?=$/.exec(v); if (!m) return v; try { return new TextDecoder().decode(Uint8Array.from(atob(m[1]), (ch) => ch.charCodeAt(0))); } catch { return "\u0000"; } };

export async function mcpPost(c: Context<Env>) {
  const origin = c.req.header("origin");
  if (origin && !isAllowedOrigin(origin, originOf(c))) return out(c, rpcErr(null, -32000, "Origin not allowed"), 403);

  const auth = c.req.header("authorization") ?? "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  if (!bearer) return unauthorized(c, false);
  const who = await authenticate(c.env, c.executionCtx as unknown as ExecutionContext, originOf(c), bearer);
  if (!who) return unauthorized(c, true);

  let body: unknown;
  try { body = await c.req.json(); } catch { return out(c, rpcErr(null, -32700, "Parse error: body must be JSON-RPC"), 400); }
  const headerV = c.req.header("mcp-protocol-version");

  const one = async (m: Msg): Promise<{ resp: unknown | null; status: number }> => {
    if (!m || typeof m !== "object" || m.jsonrpc !== "2.0" || typeof m.method !== "string") {
      // a JSON-RPC response from the client (we never ask it anything) → ignore
      if (m && typeof m === "object" && ("result" in m || "error" in m)) return { resp: null, status: 202 };
      return { resp: rpcErr(m?.id, -32600, "Invalid request"), status: 400 };
    }
    const metaV = (m.params?._meta as Record<string, unknown> | undefined)?.[META_V];
    const modern = typeof metaV === "string";
    if (modern) {
      if (!SUPPORTED.includes(metaV) || !MODERN.includes(metaV)) return { resp: rpcErr(m.id, -32022, "Unsupported protocol version", { supported: SUPPORTED, requested: metaV }), status: 400 };
      if (headerV !== metaV) return { resp: rpcErr(m.id, -32020, `Header mismatch: MCP-Protocol-Version '${headerV ?? ""}' vs body '${metaV}'`), status: 400 };
      const hm = c.req.header("mcp-method");
      if (hm !== m.method) return { resp: rpcErr(m.id, -32020, `Header mismatch: Mcp-Method '${hm ?? ""}' vs body '${m.method}'`), status: 400 };
      if (["tools/call", "prompts/get", "resources/read"].includes(m.method)) {
        const nameV = String(m.params?.name ?? m.params?.uri ?? "");
        const hn = c.req.header("mcp-name");
        if (hn == null || b64dec(hn) !== nameV) return { resp: rpcErr(m.id, -32020, `Header mismatch: Mcp-Name vs body '${nameV}'`), status: 400 };
      }
      if (m.method === "initialize") return { resp: rpcErr(m.id, -32601, "initialize is not used with protocol 2026-07-28"), status: 404 };
    } else if (headerV && !SUPPORTED.includes(headerV)) {
      return { resp: rpcErr(m.id, -32600, `Unsupported MCP-Protocol-Version ${headerV}. Supported: ${SUPPORTED.join(", ")}`), status: 400 };
    }
    const r = await handle(who, m, modern);
    if (r === null || m.id === undefined) return { resp: null, status: 202 }; // notification
    if (r.error) return { resp: rpcErr(m.id, r.error.code, r.error.message, r.error.data), status: r.status ?? 200 };
    const result = modern && r.result && typeof r.result === "object" ? { resultType: "complete", ...(r.result as object) } : r.result;
    return { resp: { jsonrpc: "2.0", id: m.id, result }, status: 200 };
  };

  if (Array.isArray(body)) {
    // JSON-RPC batch (protocol 2025-03-26). Later versions send one message per POST.
    if (!body.length) return out(c, rpcErr(null, -32600, "Empty batch"), 400);
    const res: unknown[] = [];
    for (const m of body.slice(0, 20)) { const r = await one(m as Msg); if (r.resp) res.push(r.resp); }
    return res.length ? out(c, res) : out(c, null, 202);
  }
  const r = await one(body as Msg);
  return r.resp ? out(c, r.resp, r.status) : out(c, null, 202);
}

export const mcpOther = (c: Context<Env>) => out(c, rpcErr(null, -32000, "Method not allowed: POST JSON-RPC to /mcp (no SSE stream)"), 405, { allow: "POST, OPTIONS" });
export const preflight = (c: Context<Env>) => new Response(null, { status: 204, headers: corsFor(c) });
