import { Hono } from "hono";
import type { Env } from "../env";
import { authServer, authorizeGet, authorizePost, protectedResource, register, revoke, token } from "../mcp/oauth";
import { mcpOther, mcpPost, preflight } from "../mcp/server";

// AI connector: MCP server (Streamable HTTP) + OAuth 2.1 (DCR/CIMD, PKCE) with one-time connect codes. Owned by the MCP agent.
// PUBLIC routes (bearer-token auth, not cookies): /.well-known/*, /mcp, /oauth/*. Mounted at the ROOT, before /api.
// Docs for users: docs/AI_CONNECT.md. Account side (connect codes, connected apps, plan versions): worker/routes/connect.ts.
export const mcpRoutes = new Hono<Env>();

// RFC 9728 protected resource metadata (root + path-suffixed form for the /mcp resource)
for (const p of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) mcpRoutes.get(p, protectedResource);
// RFC 8414 (+ the OIDC-style paths some clients probe; issuer = origin, so all point to the same document)
for (const p of ["/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/mcp", "/.well-known/openid-configuration", "/.well-known/openid-configuration/mcp", "/mcp/.well-known/openid-configuration", "/mcp/.well-known/oauth-authorization-server"])
  mcpRoutes.get(p, authServer);

mcpRoutes.post("/oauth/register", register);
mcpRoutes.get("/oauth/authorize", authorizeGet);
mcpRoutes.post("/oauth/authorize", authorizePost);
mcpRoutes.post("/oauth/token", token);
mcpRoutes.post("/oauth/revoke", revoke);

mcpRoutes.post("/mcp", mcpPost);
mcpRoutes.post("/mcp/", mcpPost);
mcpRoutes.get("/mcp", mcpOther);
mcpRoutes.delete("/mcp", mcpOther);
mcpRoutes.options("*", preflight);

mcpRoutes.notFound((c) => c.json({ error: "not found" }, 404));
mcpRoutes.onError((err, c) => {
  console.error("mcp", err);
  return c.json({ error: "server_error", error_description: "Something went wrong on the Iron Log server." }, 500);
});
