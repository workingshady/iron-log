// End-to-end test of the AI connector against a LOCAL dev server (DEV database only).
//   node scripts/test-mcp.mjs [http://localhost:5186]
// Flow: discovery → register → login (DEV) → connect code → authorize page + POST → token (PKCE) → initialize → tools/list
// → read tools → plan guard on the default plan → fork/update/versions/undo (dev_omar) → overrides/targets → session start
// consumes the override → isolation (omar's token never sees dev's data) → refresh rotation + reuse → revoke → 401.
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:5186";
const PASS = process.env.DEV_PASSCODE ?? "666666";
let fails = 0;
const ok = (cond, msg, extra) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) { fails++; if (extra !== undefined) console.log("      ", typeof extra === "string" ? extra.slice(0, 600) : JSON.stringify(extra).slice(0, 600)); } };
const b64u = (b) => Buffer.from(b).toString("base64url");

async function login(username) {
  const r = await fetch(`${BASE}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, passcode: PASS }) });
  const ck = r.headers.get("set-cookie")?.split(";")[0];
  if (!r.ok || !ck) throw new Error(`login ${username} failed ${r.status}`);
  return ck;
}
const apiAs = async (cookie, method, path, body) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};

async function connect(cookie, redirect = "https://claude.ai/api/mcp/auth_callback", clientName = "Claude") {
  const reg = await fetch(`${BASE}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: clientName, redirect_uris: [redirect], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
  const client = await reg.json();
  const code = (await apiAs(cookie, "POST", "/connect/code")).data;
  const verifier = b64u(crypto.randomBytes(32));
  const challenge = b64u(crypto.createHash("sha256").update(verifier).digest());
  const q = { client_id: client.client_id, redirect_uri: redirect, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "st-" + Date.now(), scope: "iron-log", resource: `${BASE}/mcp` };
  const page = await fetch(`${BASE}/oauth/authorize?${new URLSearchParams(q)}`);
  const html = await page.text();
  const post = await fetch(`${BASE}/oauth/authorize`, { method: "POST", redirect: "manual", body: new URLSearchParams({ ...q, code: code.code.slice(0, 4) + "-" + code.code.slice(4).toLowerCase(), action: "approve" }) });
  const loc = new URL(post.headers.get("location"));
  const tok = await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: loc.searchParams.get("code"), redirect_uri: redirect, client_id: client.client_id, code_verifier: verifier, resource: `${BASE}/mcp` }) });
  return { client, reg, code, page, html, post, loc, q, tok: await tok.json(), tokStatus: tok.status, verifier };
}

let rpcId = 1;
async function rpc(token, method, params, headers = {}) {
  const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }) });
  const text = await r.text();
  return { status: r.status, headers: r.headers, body: text ? JSON.parse(text) : null };
}
const call = async (token, name, args = {}) => {
  const r = await rpc(token, "tools/call", { name, arguments: args });
  const res = r.body?.result;
  const text = res?.content?.[0]?.text ?? JSON.stringify(r.body);
  const i = text.indexOf("\n\n");
  let data = null;
  try { data = i >= 0 ? JSON.parse(text.slice(i + 2)) : null; } catch { /* error text */ }
  return { isError: !!res?.isError, summary: i >= 0 ? text.slice(0, i) : text, data, text };
};

// ---------------------------------------------------------------- discovery
const prm = await (await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`)).json();
ok(prm.resource === `${BASE}/mcp` && prm.authorization_servers?.[0] === BASE, "PRM (path-suffixed) resource + AS", prm);
ok((await fetch(`${BASE}/.well-known/oauth-protected-resource`)).ok, "PRM root");
const asm = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
ok(asm.issuer === BASE && asm.code_challenge_methods_supported?.includes("S256") && asm.registration_endpoint, "AS metadata", asm);
ok((await fetch(`${BASE}/.well-known/openid-configuration`)).ok, "OIDC alias");
const un = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
ok(un.status === 401 && /resource_metadata="/.test(un.headers.get("www-authenticate") ?? ""), "401 + WWW-Authenticate", un.headers.get("www-authenticate"));
ok((await fetch(`${BASE}/mcp`)).status === 405, "GET /mcp → 405");
// (OPTIONS preflight is answered by Vite's own middleware in dev; check the CORS headers on real responses instead)
const corsGet = await fetch(`${BASE}/.well-known/oauth-authorization-server`, { headers: { origin: "https://claude.ai" } });
ok(corsGet.headers.get("access-control-allow-origin") === "*", "CORS header on metadata");
const badReg = await fetch(`${BASE}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }) });
ok(badReg.status === 400, "register rejects plain-http non-localhost redirect");

// ---------------------------------------------------------------- seed + connect as dev (owner, default plan)
const devCk = await login("dev");
const seed = await apiAs(devCk, "POST", "/dev/seed");
ok(seed.status === 200, "DEV seed", seed.data);
const devCk2 = await login("dev");
const A = await connect(devCk2);
ok(A.reg.status === 201 && A.client.token_endpoint_auth_method === "none", "DCR 201 public client", A.client);
ok(A.code.code?.length === 8 && A.code.mcpUrl === `${BASE}/mcp`, "connect code", A.code);
ok(A.page.status === 200 && A.html.includes("Connect Claude to Iron Log") && /frame-ancestors 'none'/.test(A.page.headers.get("content-security-policy") ?? ""), "authorize page (frame-ancestors none)");
ok(A.post.status === 302 && A.loc.searchParams.get("state") === A.q.state && A.loc.searchParams.get("code")?.startsWith("ilmdev_") && A.loc.searchParams.get("iss") === BASE, "authorize → redirect with code+state+iss (ilmdev_)", A.loc.toString());
ok(A.tokStatus === 200 && A.tok.access_token?.startsWith("ilmdev_") && A.tok.refresh_token && A.tok.expires_in === 3600, "token (PKCE) → access + refresh", A.tok);
const devTok = A.tok.access_token;

// code reuse revokes the grant; wrong connect code
const reuse = await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: A.loc.searchParams.get("code"), redirect_uri: A.q.redirect_uri, client_id: A.client.client_id, code_verifier: A.verifier }) });
ok(reuse.status === 400, "auth code reuse rejected");
ok((await rpc(devTok, "ping", {})).status === 401, "…and the whole grant is revoked after code reuse");
const B = await connect(await login("dev"));
const devTok2 = B.tok.access_token;
const wrong = await fetch(`${BASE}/oauth/authorize`, { method: "POST", redirect: "manual", body: new URLSearchParams({ ...B.q, code: "ZZZZZZZZ", action: "approve" }) });
ok(wrong.status === 400 && (await wrong.text()).includes("t right"), "wrong connect code → page error, no redirect");
const deny = await fetch(`${BASE}/oauth/authorize`, { method: "POST", redirect: "manual", body: new URLSearchParams({ ...B.q, code: "", action: "deny" }) });
ok(deny.status === 302 && new URL(deny.headers.get("location")).searchParams.get("error") === "access_denied", "Cancel → access_denied");
const noPkce = await fetch(`${BASE}/oauth/authorize?${new URLSearchParams({ ...B.q, code_challenge: "" })}`, { redirect: "manual" });
ok(noPkce.status === 302 && /invalid_request/.test(noPkce.headers.get("location") ?? ""), "authorize without PKCE → invalid_request");

// ---------------------------------------------------------------- MCP basics
const init = await rpc(devTok2, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
ok(init.body?.result?.protocolVersion === "2025-06-18" && init.body.result.serverInfo?.name === "Iron Log" && init.body.result.capabilities?.tools, "initialize", init.body);
ok((await rpc(devTok2, "notifications/initialized", undefined).catch(() => ({ status: 0 }))).status, "initialized notification sent");
const notif = await fetch(`${BASE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${devTok2}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
ok(notif.status === 202, "notification → 202");
ok((await rpc(devTok2, "ping", {})).body?.result !== undefined, "ping");
const tl = await rpc(devTok2, "tools/list", {});
const names = tl.body?.result?.tools?.map((x) => x.name) ?? [];
ok(names.length >= 25 && names.includes("update_plan") && tl.body.result.tools.find((x) => x.name === "get_overview").annotations.readOnlyHint === true && tl.body.result.tools.find((x) => x.name === "undo_plan_version").annotations.readOnlyHint === false, `tools/list (${names.length} tools)`, names);
const pl = await rpc(devTok2, "prompts/list", {});
ok(pl.body?.result?.prompts?.length >= 4, "prompts/list");
const pg = await rpc(devTok2, "prompts/get", { name: "fewer_days", arguments: { days: "3" } });
ok(/3 days a week/.test(pg.body?.result?.messages?.[0]?.content?.text ?? ""), "prompts/get");
const badOrigin = await fetch(`${BASE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${devTok2}`, "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
ok(badOrigin.status === 403, "bad Origin → 403");
// modern (2026-07-28) request style
const modern = await fetch(`${BASE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${devTok2}`, "content-type": "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": "server/discover" }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "server/discover", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } } }) });
const mj = await modern.json();
ok(modern.status === 200 && mj.result?.resultType === "complete" && mj.result.supportedVersions?.includes("2026-07-28"), "modern server/discover", mj);
const mm = await fetch(`${BASE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${devTok2}`, "content-type": "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" }, body: JSON.stringify({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "get_overview", _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } }) });
ok(mm.status === 400 && (await mm.json()).error?.code === -32020, "modern header mismatch → 400 -32020");
const batch = await fetch(`${BASE}/mcp`, { method: "POST", headers: { authorization: `Bearer ${devTok2}`, "content-type": "application/json" }, body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 2, method: "ping" }]) });
const bj = await batch.json();
ok(Array.isArray(bj) && bj.length === 2, "batch (2025-03-26) → 2 responses");

// ---------------------------------------------------------------- read tools (dev)
const ov = await call(devTok2, "get_overview");
ok(!ov.isError && ov.data?.plan?.id && ov.data.month, "get_overview: " + ov.summary, ov.text);
const ls = await call(devTok2, "list_sessions", { limit: 5 });
ok(!ls.isError && Array.isArray(ls.data) && ls.data.length > 0, "list_sessions: " + ls.summary, ls.text);
const gs = await call(devTok2, "get_session", { id: "latest" });
ok(!gs.isError && gs.data?.exercises?.length > 0 && gs.data.exercises.some((e) => e.sets.length), "get_session latest: " + gs.summary, gs.text);
const devSessionId = gs.data?.id;
const eh = await call(devTok2, "get_exercise_history", { exercise: gs.data?.exercises?.find((e) => e.sets.length)?.ex ?? "bench" });
ok(!eh.isError && eh.data?.app_recommendation, "get_exercise_history: " + eh.summary, eh.text);
for (const [name, args] of [["get_progress", {}], ["get_body_and_habits", {}], ["get_cardio", {}], ["get_tests", {}], ["get_journal", {}], ["get_journal", { include_notes: true }], ["get_months", {}], ["get_plan", { week: 2 }], ["list_plan_versions", {}], ["search_exercises", { group: "Chest", equipment: "dumbbell" }], ["list_templates", {}], ["list_templates", { id: "ul4" }]]) {
  const r = await call(devTok2, name, args);
  ok(!r.isError && r.data != null, `${name}${Object.keys(args).length ? " " + JSON.stringify(args) : ""}: ${r.summary}`, r.text);
}
const amb = await call(devTok2, "get_exercise_history", { exercise: "curl" });
ok(amb.isError && /several/.test(amb.text), "ambiguous exercise name → helpful error");

// ---------------------------------------------------------------- default plan guard (dev is on the built-in plan)
const guard = await call(devTok2, "update_plan", { why: "test", name: "X" });
ok(guard.isError && /fork_plan/.test(guard.text), "update_plan refused on the built-in default plan", guard.text);
const guard2 = await call(devTok2, "edit_day", { day: "D1", why: "test", ops: [{ op: "remove", exercise: 1 }] });
ok(guard2.isError && /fork_plan/.test(guard2.text), "edit_day refused on the default plan");
const devPlanBefore = (await apiAs(devCk2, "GET", "/programs/current")).data;
ok(devPlanBefore.default === true, "dev still on the default plan (nothing changed)");

// targets + one-workout override on the default plan (allowed: settings only)
const tg = await call(devTok2, "set_exercise_target", { exercise: "bench", kg: 62.5, reps: 6, why: "test target" });
ok(!tg.isError && tg.data?.kg === 62.5, "set_exercise_target: " + tg.summary, tg.text);
const st0 = (await apiAs(devCk2, "GET", "/state")).data;
ok(JSON.parse(st0.settings["target:bench"]).kg === 62.5, "target stored in settings target:bench");
const cn = await call(devTok2, "customize_next_workout", { why: "short on time", name: "Short day", ops: [{ op: "remove", exercise: 1 }, { op: "update", exercise: 1, sets: 2 }] });
ok(!cn.isError && cn.data?.items?.length > 0, "customize_next_workout: " + cn.summary, cn.text);
// start that session through the app API → the override is the plan and is consumed
const nxt = st0.next;
const sid = crypto.randomUUID();
const startR = await apiAs(devCk2, "POST", "/sessions", { id: sid, week: nxt.week, dayKey: nxt.dayKey, kind: "planned", date: new Date().toISOString().slice(0, 10), tz: "UTC", startedAt: Date.now() });
const sess = (await apiAs(devCk2, "GET", `/sessions/${sid}`)).data;
ok(startR.status === 200 && sess.session.dayName === "Short day" && sess.session.plan.length === cn.data.items.length && sess.session.plan[0].sets === 2, "session start uses the override", { plan: sess?.session?.plan?.map((p) => `${p.ex} ${p.sets}`), want: cn.data.items.map((p) => `${p.ex} ${p.sets}`) });
const st1 = (await apiAs(devCk2, "GET", "/state")).data;
ok(!Object.keys(st1.settings).some((k) => k.startsWith("override:")), "override consumed after start");
await apiAs(devCk2, "DELETE", `/sessions/${sid}`);
await call(devTok2, "set_exercise_target", { exercise: "bench", clear: true, why: "cleanup" });

// write tools that are fine on any plan
const jn = await call(devTok2, "add_journal_note", { text: "AI test note", mood: 4 });
ok(!jn.isError, "add_journal_note: " + jn.summary, jn.text);
const lb = await call(devTok2, "log_body", { date: "2026-01-02", weightKg: 80.4, sleepH: 7.5 });
ok(!lb.isError, "log_body: " + lb.summary, lb.text);
const mr = await call(devTok2, "write_month_review", { review: "## Test review\nAll good.", mode: "replace" });
ok(!mr.isError, "write_month_review: " + mr.summary, mr.text);
const blocks = (await apiAs(devCk2, "GET", "/blocks")).data;
ok(blocks.some((b) => b.review?.includes("Test review")), "review visible in /api/blocks");

// ---------------------------------------------------------------- dev_omar: own plan → update / versions / undo
const omarCk = await login("dev_omar");
const O = await connect(omarCk, "https://chatgpt.com/connector_platform_oauth_redirect", "ChatGPT");
const omTok = O.tok.access_token;
ok(O.tokStatus === 200 && omTok?.startsWith("ilmdev_"), "omar connected (ChatGPT redirect)");
const op = await call(omTok, "get_plan");
ok(!op.isError && op.data?.editable === true && op.data.design, "omar get_plan: " + op.summary, op.text);
const v0 = op.data.version;
const d1 = op.data.design.days[0];
const up = await call(omTok, "update_plan", { why: "rename for test", bump: "minor", name: "Omar UL (AI test)" });
ok(!up.isError && up.data?.version !== v0, "update_plan: " + up.summary, up.text);
const ed = await call(omTok, "edit_day", { day: d1.key, why: "more back", ops: [{ op: "add", new_exercise: "face_pull", sets: 3, reps: [12, 15], rest: 60 }, { op: "update", exercise: 1, sets: 4 }] });
ok(!ed.isError && ed.data?.day?.items?.some((i) => i.ex === "face_pull"), "edit_day (all weeks): " + ed.summary, ed.text);
const edw = await call(omTok, "edit_day", { day: d1.key, week: 4, why: "lighter deload", ops: [{ op: "remove", exercise: "face_pull" }] });
ok(!edw.isError && !edw.data?.day?.items?.some((i) => i.ex === "face_pull"), "edit_day (week 4 only): " + edw.summary, edw.text);
const bad = await call(omTok, "edit_day", { day: d1.key, why: "x", ops: [{ op: "update", exercise: 1, sets: 99 }] });
ok(bad.isError && /sets must be 1-10/.test(bad.text), "invalid edit rejected by validateUserProgram", bad.text);
const cx = await call(omTok, "add_custom_exercise", { name: "Zercher Carry Thing", group: "Core", primary: ["abs"], metric: "distance", why: "user asked" });
ok(!cx.isError && cx.data?.key?.startsWith("c-dev-omar-"), "add_custom_exercise: " + cx.summary, cx.text);
const devSee = await call(devTok2, "search_exercises", { query: "zercher carry thing" });
ok(!devSee.isError && devSee.data.length === 0, "dev can't see omar's custom exercise in search_exercises", devSee.text);
const vs = await call(omTok, "list_plan_versions");
ok(!vs.isError && vs.data.versions.length >= 4 && vs.data.versions.some((v) => v.by === "ChatGPT"), "list_plan_versions: " + vs.summary, vs.data?.versions);
const cur = vs.data.versions.find((v) => v.current).version;
const un2 = await call(omTok, "undo_plan_version", { why: "test undo" });
ok(!un2.isError && un2.data?.restored && un2.data.version !== cur, "undo_plan_version (previous): " + un2.summary, un2.text);
const un3 = await call(omTok, "undo_plan_version", { version: v0, why: "back to original" });
const after = await call(omTok, "get_plan", { week: 2 });
ok(!un3.isError && after.data?.design?.days?.[0]?.items?.length === d1.items.length, "undo to the original version restores the design: " + un3.summary, un3.text);
const appV = (await apiAs(omarCk, "GET", "/connect/versions")).data;
ok(appV.versions?.length >= 6, `app /connect/versions lists ${appV.versions?.length} versions`);
const rest = await apiAs(omarCk, "POST", "/connect/versions/restore", { version: up.data.version });
ok(rest.status === 200, "app restore endpoint", rest.data);

// fork from a template without activating, then switch back
const fk = await call(omTok, "fork_plan", { from: "fb3", activate: false, why: "try full body" });
ok(!fk.isError && fk.data?.program_id && fk.data.active === false, "fork_plan template (not active): " + fk.summary, fk.text);

// ---------------------------------------------------------------- isolation
const omSess = await call(omTok, "get_session", { id: devSessionId });
ok(omSess.isError, "omar can't read dev's session by id", omSess.text);
const omSessions = await call(omTok, "list_sessions", { limit: 200 });
const devSessions = await call(devTok2, "list_sessions", { limit: 200 });
const devIds = new Set(devSessions.data.map((s) => s.id));
ok(omSessions.data.every((s) => !devIds.has(s.id)), "omar's list_sessions has none of dev's sessions");
const omJ = await call(omTok, "get_journal", { limit: 300 });
ok(!omJ.data.some((x) => x.text === "AI test note"), "omar can't see dev's journal note");
const omMonths = await call(omTok, "write_month_review", { block_id: blocks[0].id, review: "hack" });
ok(omMonths.isError, "omar can't write dev's month review", omMonths.text);
const omSwitch = await call(omTok, "switch_plan", { program_id: "up-dev-sara-fb3", why: "steal" });
ok(omSwitch.isError, "omar can't switch to sara's plan", omSwitch.text);
const devV = await call(devTok2, "list_plan_versions");
ok(devV.data.default_plan === true, "dev's versions unaffected (still default plan)");
const apps = (await apiAs(omarCk, "GET", "/connect/apps")).data;
ok(apps.apps?.length >= 1 && apps.apps[0].label === "ChatGPT", "connected apps list (omar)", apps);
const devApps = (await apiAs(devCk2, "GET", "/connect/apps")).data;
ok(devApps.apps.every((a) => !apps.apps.some((b) => b.grantId === a.grantId)), "connected apps are per user");

// ---------------------------------------------------------------- refresh rotation, reuse, revoke
const refresh = async (rt) => { const r = await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: O.client.client_id }) }); return { status: r.status, body: await r.json() }; };
const r1 = await refresh(O.tok.refresh_token);
ok(r1.status === 200 && r1.body.refresh_token !== O.tok.refresh_token, "refresh → new access + rotated refresh");
ok((await rpc(r1.body.access_token, "ping", {})).status === 200, "new access token works");
const r2 = await refresh(O.tok.refresh_token);
ok(r2.status === 400 && r2.body.error === "invalid_grant", "old refresh token reuse → invalid_grant");
ok((await rpc(r1.body.access_token, "ping", {})).status === 401, "reuse revoked the whole grant (new access token dead too)");
// a fresh connection, then revoke via RFC 7009 and via the app's Disconnect
const O2 = await connect(await login("dev_omar"));
const rv = await fetch(`${BASE}/oauth/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: O2.tok.refresh_token }) });
ok(rv.status === 200, "revoke → 200");
const after401 = await rpc(O2.tok.access_token, "tools/list", {});
ok(after401.status === 401 && /invalid_token/.test(after401.headers.get("www-authenticate") ?? ""), "after revoke → 401 invalid_token");
const O3 = await connect(await login("dev_omar"));
const apps3 = (await apiAs(omarCk, "GET", "/connect/apps")).data.apps;
await apiAs(omarCk, "DELETE", `/connect/apps/${apps3[0].grantId}`);
ok((await rpc(O3.tok.access_token, "ping", {})).status === 401, "Disconnect in the app → 401");
const realTry = await rpc(O3.tok.access_token.replace("ilmdev_", "ilm_"), "ping", {});
ok(realTry.status === 401, "a DEV token with the real prefix doesn't resolve in the real DB");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
