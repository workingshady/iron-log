import { Hono } from "hono";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Env } from "../env";
import * as t from "../db/schema";
import { rawDb } from "../db";
import { CONNECT_TTL, connectHash, newConnectCode } from "../mcp/core";
import { listVersions, ownProgram, restoreVersion } from "../mcp/plan";

// Account side of the AI connector (cookie auth, mounted under /api in worker/index.ts):
//   POST   /api/connect/code            → one-time 8-char connect code (10 min) the user types on the OAuth page
//   GET    /api/connect/apps            → connected AI apps (one row per grant)
//   DELETE /api/connect/apps/:grantId   → disconnect (revokes every token of that grant)
//   GET    /api/connect/versions[?program=<id>]          → version history of my plan (who changed it and why)
//   POST   /api/connect/versions/restore {program, version} → restore an older version as a new one
// Everything lives in the database of the current mode (DEV logins → DB_DEV, so DEV tokens are "ilmdev_…").
export const connectRoutes = new Hono<Env>();
const now = () => Date.now();

connectRoutes.post("/connect/code", async (c) => {
  const d = rawDb(c);
  const uid = c.var.userId;
  if (!uid) return c.json({ error: "Log in first" }, 401);
  const recent = await d.select({ id: t.oauthTokens.id }).from(t.oauthTokens)
    .where(and(eq(t.oauthTokens.userId, uid), eq(t.oauthTokens.kind, "connect"), gt(t.oauthTokens.createdAt, now() - 3600_000)));
  if (recent.length >= 10) return c.json({ error: "Too many codes this hour. Use the newest one or wait a bit." }, 429);
  // only the newest code works
  await d.update(t.oauthTokens).set({ revokedAt: now() })
    .where(and(eq(t.oauthTokens.userId, uid), eq(t.oauthTokens.kind, "connect"), isNull(t.oauthTokens.usedAt), isNull(t.oauthTokens.revokedAt)));
  const code = newConnectCode();
  const expiresAt = now() + CONNECT_TTL;
  await d.insert(t.oauthTokens).values({ id: await connectHash(code), kind: "connect", userId: uid, expiresAt, createdAt: now() });
  return c.json({ code, expiresAt, mcpUrl: `${new URL(c.req.url).origin}/mcp`, dev: c.var.dev });
});

connectRoutes.get("/connect/apps", async (c) => {
  const d = rawDb(c);
  const rows = await d.select().from(t.oauthTokens)
    .where(and(eq(t.oauthTokens.userId, c.var.userId), inArray(t.oauthTokens.kind, ["access", "refresh"])))
    .orderBy(desc(t.oauthTokens.createdAt)).limit(500);
  const by = new Map<string, { grantId: string; label: string; clientId: string | null; connectedAt: number; lastUsedAt: number | null; active: boolean }>();
  for (const r of rows) {
    if (!r.grantId) continue;
    const g = by.get(r.grantId) ?? { grantId: r.grantId, label: r.label ?? "AI app", clientId: r.clientId, connectedAt: r.createdAt, lastUsedAt: null, active: false };
    g.connectedAt = Math.min(g.connectedAt, r.createdAt);
    const used = r.usedAt ?? (r.kind === "access" ? r.createdAt : null);
    if (used && (!g.lastUsedAt || used > g.lastUsedAt)) g.lastUsedAt = used;
    if (r.kind === "refresh" && !r.revokedAt && r.expiresAt > now()) g.active = true;
    by.set(r.grantId, g);
  }
  const apps = [...by.values()].filter((g) => g.active).sort((a, b) => (b.lastUsedAt ?? b.connectedAt) - (a.lastUsedAt ?? a.connectedAt));
  return c.json({ apps });
});

connectRoutes.delete("/connect/apps/:grantId", async (c) => {
  await rawDb(c).update(t.oauthTokens).set({ revokedAt: now() })
    .where(and(eq(t.oauthTokens.userId, c.var.userId), eq(t.oauthTokens.grantId, c.req.param("grantId")), isNull(t.oauthTokens.revokedAt)));
  return c.json({ ok: true });
});

async function planRow(c: { env: Env["Bindings"]; var: Env["Variables"] }, id?: string | null) {
  const d = rawDb(c);
  const pid = id || (await d.select({ p: t.users.programId }).from(t.users).where(eq(t.users.id, c.var.userId)))[0]?.p;
  return pid ? ownProgram(d, c.var.userId, pid) : null;
}

connectRoutes.get("/connect/versions", async (c) => {
  const row = await planRow(c, c.req.query("program"));
  if (!row) return c.json({ programId: null, versions: [], note: "You're on the built-in default plan; its history is in Plan → versions." });
  return c.json({ programId: row.id, name: row.name, versions: await listVersions(rawDb(c), row) });
});

connectRoutes.post("/connect/versions/restore", async (c) => {
  const b = await c.req.json<{ program?: string; version?: string }>().catch(() => ({} as { program?: string; version?: string }));
  const row = await planRow(c, b.program);
  if (!row || !b.version) return c.json({ error: "Pick a version" }, 400);
  const res = await restoreVersion(rawDb(c), c.var.userId, row, b.version, "", { by: "you" });
  if (!res.ok) return c.json({ error: res.errors[0], errors: res.errors }, 400);
  return c.json({ ok: true, version: res.program.version, restored: res.restored });
});
