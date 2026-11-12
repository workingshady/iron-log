import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import type { Env } from "../env";
import * as t from "../db/schema";
import { db, rawDb, type RawDB } from "../db";
import { CURRENT, programVersionId, type Program } from "../../program";
import { GROUPS, type Group } from "../../program/groups";
import { MUSCLE_LABEL, type Muscle } from "../../program/muscles";
import {
  TEMPLATES, templateById, rankTemplates, fromTemplate, rebuild, registerCustom, validateUserProgram, designVolume, groupVolume, avgMinutes,
  type Answers, type CustomEx, type Design, type UserProgram,
} from "../../program/templates";

// Plan templates, user programs (pick / customise), custom exercises. Owned by the Programs agent.
// Mounted in worker/index.ts under /api. db(c) = the user's own data, rawDb(c) = shared tables (see worker/db.ts).
//
// A user program = one user_programs row; its json is a UserProgram (a normal Program + the editable one-week `design`
// + `custom` exercises). Program.id = the row id, so switching plans starts a new month (activeBlock() in worker/index.ts
// closes the old block when the program id changes) and every old session/log stays where it is. Saving an edit keeps
// the id and bumps the patch version → the month continues with the edited plan.
// users.programId null = the default plan (CURRENT) — the owner never needs a row here.
export const programRoutes = new Hono<Env>();

// Custom exercises live inside the program JSON. Put them into the shared lookups (EXERCISES / EX_MUSCLES / EX_GROUP)
// for every request of a user whose program has some, so session plans, swaps and stats can name them.
// Keys are "c-<user>-<slug>", never a library key, so nothing of the default plan can change.
programRoutes.use("*", async (c, next) => {
  const p = c.var.prog as UserProgram | undefined;
  if (p?.custom?.length) registerCustom(p.custom);
  return next();
});

const now = () => Date.now();
const MUSCLES = new Set(Object.keys(MUSCLE_LABEL));
const GROUP_SET = new Set<string>(GROUPS);
const METRICS = new Set(["weight_reps", "reps", "assist_reps", "time", "distance"]);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "ex";
const userSlug = (uid: string) => slug(uid).slice(0, 20);

/** Clean custom exercises from the client: only "c-<me>-…" keys, known muscles/groups/metrics, short strings. */
function cleanCustom(list: unknown, uid: string): CustomEx[] {
  if (!Array.isArray(list)) return [];
  const pre = `c-${userSlug(uid)}-`;
  const out: CustomEx[] = [];
  for (const x of list.slice(0, 50) as Partial<CustomEx>[]) {
    if (!x || typeof x.name !== "string" || !x.name.trim()) continue;
    const key = typeof x.key === "string" && x.key.startsWith(pre) && /^c-[a-z0-9-]{1,80}$/.test(x.key) ? x.key : `${pre}${slug(x.name)}-${crypto.randomUUID().slice(0, 4)}`;
    const p = (Array.isArray(x.p) ? x.p : []).filter((m) => MUSCLES.has(m)).slice(0, 4) as Muscle[];
    const s = (Array.isArray(x.s) ? x.s : []).filter((m) => MUSCLES.has(m) && !p.includes(m)).slice(0, 4) as Muscle[];
    out.push({
      key, name: x.name.trim().slice(0, 60), metric: METRICS.has(x.metric as string) ? x.metric! : "weight_reps",
      group: GROUP_SET.has(x.group as string) ? (x.group as Group) : "Core", p: p.length ? p : ["abs"], s: s.length ? s : undefined,
      cues: Array.isArray(x.cues) ? x.cues.filter((c) => typeof c === "string" && c.trim()).map((c) => c.slice(0, 120)).slice(0, 5) : undefined,
      perSide: !!x.perSide || undefined,
    });
  }
  return out;
}

/** Keep only the fields a design may have (no surprises in stored JSON). */
function cleanDesign(d: unknown): Design {
  const days = Array.isArray((d as Design)?.days) ? (d as Design).days.slice(0, 7) : [];
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    days: days.map((day, i) => ({
      key: typeof day?.key === "string" && /^[A-Za-z0-9_-]{1,12}$/.test(day.key) ? day.key : `D${i + 1}`,
      name: String(day?.name ?? "").slice(0, 40),
      focus: String(day?.focus ?? "").slice(0, 80),
      items: (Array.isArray(day?.items) ? day.items : []).slice(0, 20).map((it) => {
        const reps = it.reps === null ? null : Array.isArray(it.reps) && it.reps.length === 2 ? [Math.round(Number(it.reps[0])), Math.round(Number(it.reps[1]))] as [number, number] : num(it.reps);
        const o: Design["days"][number]["items"][number] = { ex: String(it.ex ?? ""), sets: Math.round(Number(it.sets) || 0), rest: Math.round(Number(it.rest) || 0) };
        if (reps !== undefined) o.reps = reps;
        if (num(it.seconds) != null) o.seconds = num(it.seconds);
        if (num(it.meters) != null) o.meters = num(it.meters);
        if (it.rir === null) o.rir = null; else if (num(it.rir) != null) o.rir = num(it.rir);
        if (typeof it.tech === "string" && it.tech.trim()) o.tech = it.tech.trim().slice(0, 160);
        if (it.heavy) o.heavy = true;
        if (it.fin) o.fin = true;
        if (typeof it.tag === "string" && /^[A-Z][0-9]$/.test(it.tag)) o.tag = it.tag;
        return o;
      }),
    })),
  };
}

const parse = (json: string): UserProgram | null => { try { return JSON.parse(json) as UserProgram; } catch { return null; } };
const summary = (r: typeof t.userPrograms.$inferSelect, activeId: string | null) => {
  const p = parse(r.json);
  return { id: r.id, name: r.name, template: r.template, active: r.id === activeId, days: p?.design?.days.length ?? p?.order.length ?? 0,
    version: p?.version ?? "1.0.0", minutes: p?.design ? avgMinutes(p.design) : null, dayNames: p?.design?.days.map((d) => d.name) ?? [], updatedAt: r.updatedAt };
};

async function myProgramId(c: { env: Env["Bindings"]; var: Env["Variables"] }) {
  const [u] = await rawDb(c).select({ programId: t.users.programId }).from(t.users).where(eq(t.users.id, c.var.userId));
  return u?.programId ?? null;
}
async function ownRow(c: { env: Env["Bindings"]; var: Env["Variables"] }, id: string) {
  const [r] = await rawDb(c).select().from(t.userPrograms).where(and(eq(t.userPrograms.id, id), eq(t.userPrograms.userId, c.var.userId)));
  return r ?? null;
}
async function hasActiveWorkout(c: { env: Env["Bindings"]; var: Env["Variables"] }) {
  const [s] = await db(c).select({ id: t.sessions.id }).from(t.sessions).where(eq(t.sessions.status, "active")).limit(1);
  return !!s;
}
/** Only ever MY OWN users row. */
const setMyProgram = (c: { env: Env["Bindings"]; var: Env["Variables"] }, programId: string | null) =>
  rawDb(c).update(t.users).set({ programId, updatedAt: now() }).where(eq(t.users.id, c.var.userId));

// ---------------------------------------------------------------- templates

/** GET /api/programs/templates[?days=4&minutes=60&goal=muscle&level=beginner&equipment=gym&focus=Chest,Back] */
programRoutes.get("/programs/templates", (c) => {
  const q = c.req.query();
  const base = TEMPLATES.map((x) => ({ meta: x.meta, minutes: avgMinutes(x.design), volume: designVolume(x.design), groups: groupVolume(x.design) }));
  if (!q.days) return c.json({ templates: base });
  const a: Answers = {
    days: Math.max(1, Math.min(7, Number(q.days) || 3)),
    minutes: Math.max(20, Math.min(180, Number(q.minutes) || 60)),
    goal: (["muscle", "strength", "general"].includes(q.goal) ? q.goal : "muscle") as Answers["goal"],
    level: (["beginner", "intermediate", "advanced"].includes(q.level) ? q.level : "beginner") as Answers["level"],
    equipment: (["gym", "dumbbells", "bodyweight"].includes(q.equipment) ? q.equipment : "gym") as Answers["equipment"],
    focus: (q.focus ?? "").split(",").filter((g) => GROUP_SET.has(g)) as Group[],
  };
  const ranked = rankTemplates(a);
  return c.json({ answers: a, templates: ranked.map((r) => ({ ...base.find((b) => b.meta.id === r.meta.id)!, score: r.score, reasons: r.reasons, fit: r.fit })) });
});

programRoutes.get("/programs/templates/:id", (c) => {
  const x = templateById(c.req.param("id"));
  return x ? c.json(x) : c.json({ error: "No such template" }, 404);
});

// ---------------------------------------------------------------- the user's program

/** GET /api/programs/current → the program this user trains (default = CURRENT, byte-for-byte). */
programRoutes.get("/programs/current", (c) => {
  const p: Program = c.var.prog ?? CURRENT;
  const isDefault = !c.var.programId || p === CURRENT;
  return c.json({ default: isDefault, programId: isDefault ? null : c.var.programId, versionId: programVersionId(p), program: p });
});

/** GET /api/programs → my saved plans + which one is active. */
programRoutes.get("/programs", async (c) => {
  const active = await myProgramId(c);
  const rows = await rawDb(c).select().from(t.userPrograms).where(eq(t.userPrograms.userId, c.var.userId)).orderBy(desc(t.userPrograms.updatedAt));
  return c.json({ activeId: active, default: { id: CURRENT.id, name: CURRENT.name, version: CURRENT.version, days: CURRENT.order.length }, plans: rows.map((r) => summary(r, active)) });
});

programRoutes.get("/programs/:id", async (c) => {
  const r = await ownRow(c, c.req.param("id"));
  if (!r) return c.json({ error: "Not found" }, 404);
  const p = parse(r.json);
  if (!p) return c.json({ error: "Broken plan" }, 500);
  registerCustom(p.custom);
  return c.json({ ...summary(r, await myProgramId(c)), program: p });
});

/** POST /api/programs {template, name?, activate?} | {from: <my plan id>, name?} → a new plan owned by me. */
programRoutes.post("/programs", async (c) => {
  const b = await c.req.json<{ template?: string; from?: string; name?: string; activate?: boolean }>().catch(() => ({} as { template?: string; from?: string; name?: string; activate?: boolean }));
  const id = `up-${crypto.randomUUID().slice(0, 12)}`;
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
  let prog: UserProgram;
  if (b.from) {
    const src = await ownRow(c, b.from);
    const sp = src && parse(src.json);
    if (!sp?.design) return c.json({ error: "Plan to copy not found" }, 404);
    registerCustom(sp.custom);
    prog = { ...rebuild({ id }, { name: name || `${sp.name} (copy)`.slice(0, 60), design: sp.design, template: sp.template ?? null, custom: sp.custom }), version: "1.0.0" };
  } else {
    const tpl = templateById(b.template ?? "");
    if (!tpl) return c.json({ error: "Pick a template" }, 400);
    prog = fromTemplate(tpl, id, name);
  }
  const errs = validateUserProgram(prog);
  if (errs.length) return c.json({ error: errs[0], errors: errs }, 400);
  if (b.activate && (await hasActiveWorkout(c))) return c.json({ error: "Finish or discard the workout in progress first" }, 409);
  await rawDb(c).insert(t.userPrograms).values({ id, userId: c.var.userId, name: prog.name, template: prog.template ?? null, json: JSON.stringify(prog), createdAt: now(), updatedAt: now() });
  if (b.activate) await setMyProgram(c, id);
  return c.json({ ok: true, id, active: !!b.activate });
});

/** PUT /api/programs/:id {name, design, custom?} → validated save (same id, version +0.0.1). */
programRoutes.put("/programs/:id", async (c) => {
  const r = await ownRow(c, c.req.param("id"));
  const old = r && parse(r.json);
  if (!r || !old) return c.json({ error: "Not found" }, 404);
  const b = await c.req.json<{ name?: string; design?: Design; custom?: CustomEx[] }>().catch(() => ({} as { name?: string; design?: Design; custom?: CustomEx[] }));
  const custom = cleanCustom(b.custom ?? old.custom, c.var.userId);
  registerCustom(custom);
  const prog = rebuild(old, { name: String(b.name ?? old.name).trim().slice(0, 60), design: cleanDesign(b.design ?? old.design), template: old.template ?? r.template, custom });
  const errs = validateUserProgram(prog);
  if (errs.length) return c.json({ error: errs[0], errors: errs }, 400);
  await rawDb(c).update(t.userPrograms).set({ name: prog.name, json: JSON.stringify(prog), updatedAt: now() })
    .where(and(eq(t.userPrograms.id, r.id), eq(t.userPrograms.userId, c.var.userId)));
  return c.json({ ok: true, id: r.id, version: prog.version });
});

/** POST /api/programs/:id/activate → train this plan from now on (old logs stay; a new month starts). */
programRoutes.post("/programs/:id/activate", async (c) => {
  const r = await ownRow(c, c.req.param("id"));
  if (!r) return c.json({ error: "Not found" }, 404);
  if (await hasActiveWorkout(c)) return c.json({ error: "Finish or discard the workout in progress first" }, 409);
  await setMyProgram(c, r.id);
  return c.json({ ok: true, active: r.id });
});

/** POST /api/programs/default → back to the default plan (users.programId = null). */
programRoutes.post("/programs/default", async (c) => {
  if (await hasActiveWorkout(c)) return c.json({ error: "Finish or discard the workout in progress first" }, 409);
  await setMyProgram(c, null);
  return c.json({ ok: true, active: null });
});

/** DELETE /api/programs/:id → removes the plan; if it was active you go back to the default plan. Logs are kept. */
programRoutes.delete("/programs/:id", async (c) => {
  const r = await ownRow(c, c.req.param("id"));
  if (!r) return c.json({ error: "Not found" }, 404);
  const active = (await myProgramId(c)) === r.id;
  if (active && (await hasActiveWorkout(c))) return c.json({ error: "Finish or discard the workout in progress first" }, 409);
  if (active) await setMyProgram(c, null);
  await rawDb(c).delete(t.userPrograms).where(and(eq(t.userPrograms.id, r.id), eq(t.userPrograms.userId, c.var.userId)));
  return c.json({ ok: true, wasActive: active });
});

/** DEV seed hook: called by POST /api/dev/seed after the dev users exist. users = { dev, omar, sara } ids. */
export async function seedPrograms(raw: RawDB, users: Record<string, string>) {
  const plans: [string | undefined, string][] = [[users.omar, "ul4"], [users.sara, "fb3"]];
  for (const [uid, tplId] of plans) {
    const tpl = templateById(tplId);
    if (!uid || !tpl) continue;
    const id = `up-${uid}-${tplId}`;
    const prog = fromTemplate(tpl, id);
    await raw.insert(t.userPrograms).values({ id, userId: uid, name: prog.name, template: tplId, json: JSON.stringify(prog), createdAt: now(), updatedAt: now() })
      .onConflictDoUpdate({ target: t.userPrograms.id, set: { name: prog.name, json: JSON.stringify(prog), updatedAt: now() } });
    await raw.update(t.users).set({ programId: id }).where(eq(t.users.id, uid));
  }
  if (users.dev) await raw.update(t.users).set({ programId: null }).where(eq(t.users.id, users.dev));
}
