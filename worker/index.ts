import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq, inArray, like, ne, sql } from "drizzle-orm";
import * as t from "./db/schema";
import type { Env } from "./env";
import { login, requireAuth } from "./auth";
import { CURRENT, EXERCISES, programVersionId } from "../program";
import { buildPlan } from "../shared/plan";
import { buildInsights, muscleSets } from "./insights";
import { seedDev } from "./devseed";
import { shownKg, totalKg } from "../shared/load";
import type {
  AppState, HistoryRow, PlanItem, ProgressData, ProgressPoint, Session, SessionBundle, SetLog, SlotInfo,
} from "../shared/api";

const app = new Hono<Env>().basePath("/api");
/** Real database, or the separate test database in DEV mode. */
const db = (c: { env: Env["Bindings"]; var: Env["Variables"] }) => drizzle(c.var.dev ? c.env.DB_DEV : c.env.DB, { schema: t });
type DB = ReturnType<typeof db>;

const now = () => Date.now();
const j = <T>(s: string | null | undefined): T | null => (s ? (JSON.parse(s) as T) : null);

// ---------------------------------------------------------------- helpers

function rowToSession(r: typeof t.sessions.$inferSelect): Session {
  return {
    id: r.id, programVersionId: r.programVersionId, week: r.week, dayKey: r.dayKey, dayName: r.dayName,
    status: r.status as Session["status"], kind: r.kind as Session["kind"], date: r.date,
    startedAt: r.startedAt, endedAt: r.endedAt, plan: j<PlanItem[]>(r.plan) ?? [], readiness: j(r.readiness),
    rpe: r.rpe, bodyweight: r.bodyweight, excuse: r.excuse, note: r.note,
  };
}

async function ensureVersion(d: DB) {
  const id = programVersionId(CURRENT);
  await d.insert(t.programVersions)
    .values({ id, name: CURRENT.name, changelog: CURRENT.changelog, snapshot: JSON.stringify({ ...CURRENT, exercises: EXERCISES }), firstSeenAt: now() })
    .onConflictDoNothing();
  return id;
}

async function slots(d: DB): Promise<SlotInfo[]> {
  const rows = await d.select({ week: t.sessions.week, dayKey: t.sessions.dayKey, status: t.sessions.status })
    .from(t.sessions)
    .where(and(like(t.sessions.programVersionId, `${CURRENT.id}@%`), inArray(t.sessions.status, ["done", "skipped"]), ne(t.sessions.kind, "extra")));
  const st = new Map(rows.map((r) => [`${r.week}-${r.dayKey}`, r.status as "done" | "skipped"]));
  const out: SlotInfo[] = [];
  for (const w of CURRENT.weeks)
    for (const key of CURRENT.order) {
      const d2 = w.days.find((x) => x.key === key);
      if (!d2) continue;
      out.push({ week: w.n, dayKey: key, dayName: d2.name, focus: d2.focus, items: d2.items.length, status: st.get(`${w.n}-${key}`) ?? "open" });
    }
  return out;
}

// ---------------------------------------------------------------- auth

app.post("/login", login);
app.use("*", async (c, next) => (c.req.path === "/api/login" ? next() : requireAuth(c, next)));
app.get("/me", (c) => c.json({ ok: true, dev: c.var.dev }));

/** DEV mode only: fill the test database with ~3 weeks of realistic dummy training. */
app.post("/dev/seed", async (c) => {
  if (!c.var.dev) return c.json({ error: "Only in DEV mode" }, 403);
  const n = await seedDev(db(c), c.req.query("today") ?? new Date().toISOString().slice(0, 10));
  return c.json({ ok: true, rows: n });
});

// ---------------------------------------------------------------- state

app.get("/state", async (c) => {
  const d = db(c);
  await ensureVersion(d);
  const all = await slots(d);
  const active = await d.select().from(t.sessions).where(eq(t.sessions.status, "active")).orderBy(desc(t.sessions.createdAt)).limit(1);
  const settingsRows = await d.select().from(t.settings);
  const weekAgo = new Date(now() - 6 * 864e5).toISOString().slice(0, 10);
  const recent = await d.select().from(t.sessions).where(sql`${t.sessions.date} >= ${weekAgo}`);
  const body: AppState = {
    program: { id: CURRENT.id, version: CURRENT.version, name: CURRENT.name, changelog: CURRENT.changelog, rules: CURRENT.rules },
    weeks: CURRENT.weeks.map((w) => ({ n: w.n, name: w.name, brief: w.brief })),
    slots: all,
    next: all.find((s) => s.status === "open") ?? null,
    active: active[0] ? { id: active[0].id, dayName: active[0].dayName, week: active[0].week, startedAt: active[0].startedAt } : null,
    schedules: CURRENT.schedules,
    settings: Object.fromEntries(settingsRows.map((r) => [r.key, r.value])),
    tests: CURRENT.tests,
    thisWeek: {
      done: recent.filter((r) => r.status === "done").length,
      missed: recent.filter((r) => r.status === "missed").length,
      minutes: Math.round(recent.reduce((a, r) => a + (r.status === "done" && r.startedAt && r.endedAt ? r.endedAt - r.startedAt : 0), 0) / 60000),
    },
  };
  return c.json(body);
});

app.put("/settings/:key", async (c) => {
  const { value } = await c.req.json<{ value: string }>();
  await db(c).insert(t.settings).values({ key: c.req.param("key"), value }).onConflictDoUpdate({ target: t.settings.key, set: { value } });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- sessions

/** Start a session. kind: planned (next in order) · picked (out of order) · extra (bonus, doesn't fill a slot). */
app.post("/sessions", async (c) => {
  const b = await c.req.json<{ id: string; week: number; dayKey: string; kind: Session["kind"]; date: string; tz: string; readiness?: object; startedAt: number }>();
  const d = db(c);
  const pv = await ensureVersion(d);
  const plan = buildPlan(CURRENT, b.week, b.dayKey);
  await d.insert(t.sessions).values({
    id: b.id, programVersionId: pv, week: b.week, dayKey: b.dayKey, dayName: plan.name, status: "active", kind: b.kind,
    date: b.date, startedAt: b.startedAt, plan: JSON.stringify(plan.items), readiness: b.readiness ? JSON.stringify(b.readiness) : null,
    tz: b.tz, createdAt: now(), updatedAt: now(),
  }).onConflictDoNothing();
  return c.json({ id: b.id });
});

/** Log a missed day (excuse). Does NOT advance the plan — the same session stays next. */
app.post("/missed", async (c) => {
  const b = await c.req.json<{ id: string; week: number; dayKey: string; date: string; excuse: string; note?: string; tz: string; skip?: boolean }>();
  const d = db(c);
  const pv = await ensureVersion(d);
  const plan = buildPlan(CURRENT, b.week, b.dayKey);
  await d.insert(t.sessions).values({
    id: b.id, programVersionId: pv, week: b.week, dayKey: b.dayKey, dayName: plan.name, status: b.skip ? "skipped" : "missed",
    kind: "planned", date: b.date, plan: "[]", excuse: b.excuse, note: b.note ?? null, tz: b.tz, createdAt: now(), updatedAt: now(),
  }).onConflictDoNothing();
  return c.json({ ok: true });
});

app.get("/sessions/:id", async (c) => {
  const d = db(c);
  const id = c.req.param("id");
  const [row] = await d.select().from(t.sessions).where(eq(t.sessions.id, id));
  if (!row) return c.json({ error: "not found" }, 404);
  const session = rowToSession(row);
  const sets = (await d.select().from(t.sets).where(and(eq(t.sets.sessionId, id), eq(t.sets.deleted, 0))).orderBy(t.sets.doneAt)) as SetLog[];

  // last time per exercise (from other finished sessions)
  const keys = [...new Set(session.plan.map((p) => p.ex))];
  const last: SessionBundle["last"] = {};
  if (keys.length) {
    const prev = await d.select({ s: t.sets, date: t.sessions.date })
      .from(t.sets).innerJoin(t.sessions, eq(t.sets.sessionId, t.sessions.id))
      .where(and(inArray(t.sets.exKey, keys), ne(t.sets.sessionId, id), eq(t.sets.deleted, 0), inArray(t.sessions.status, ["done", "abandoned"])))
      .orderBy(desc(t.sets.doneAt)).limit(400);
    for (const { s, date } of prev) {
      const cur = last[s.exKey];
      if (!cur) last[s.exKey] = { date, sets: [s as SetLog] };
      else if (cur.sets[0].sessionId === s.sessionId) cur.sets.unshift(s as SetLog);
    }
  }
  const lifts = await liftHistory(d, keys, id);
  for (const k of keys) if (last[k] && lifts.hist[k]) Object.assign(last[k], { effort: lifts.hist[k].effort, joints: lifts.hist[k].joints });
  const fb = await d.select().from(t.feedback).where(eq(t.feedback.sessionId, id));
  return c.json({ session, sets, last, best: lifts.best, feedback: Object.fromEntries(fb.map((f) => [f.id, { effort: f.effort, joints: f.joints }])) } satisfies SessionBundle);
});

app.patch("/sessions/:id", async (c) => {
  const b = await c.req.json<Partial<Session>>();
  const patch: Partial<typeof t.sessions.$inferInsert> = { updatedAt: now() };
  if (b.status) patch.status = b.status;
  if (b.endedAt !== undefined) patch.endedAt = b.endedAt;
  if (b.startedAt !== undefined) patch.startedAt = b.startedAt;
  if (b.plan) patch.plan = JSON.stringify(b.plan);
  if (b.readiness !== undefined) patch.readiness = b.readiness ? JSON.stringify(b.readiness) : null;
  if (b.rpe !== undefined) patch.rpe = b.rpe;
  if (b.bodyweight !== undefined) patch.bodyweight = b.bodyweight;
  if (b.note !== undefined) patch.note = b.note;
  if (b.excuse !== undefined) patch.excuse = b.excuse;
  if (b.date !== undefined) patch.date = b.date;
  await db(c).update(t.sessions).set(patch).where(eq(t.sessions.id, c.req.param("id")));
  return c.json({ ok: true });
});

app.delete("/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const d = db(c);
  await d.batch([d.delete(t.sets).where(eq(t.sets.sessionId, id)), d.delete(t.sessions).where(eq(t.sessions.id, id))]);
  return c.json({ ok: true });
});

/** Most recent finished session per exercise (+ its feedback) and all-time bests. Used for recommendations and PRs. */
async function liftHistory(d: DB, keys: string[] | null, excludeSession = "") {
  const rows = await d.select({ s: t.sets, date: t.sessions.date })
    .from(t.sets).innerJoin(t.sessions, eq(t.sets.sessionId, t.sessions.id))
    .where(and(eq(t.sets.deleted, 0), ne(t.sets.sessionId, excludeSession), inArray(t.sessions.status, ["done", "abandoned"]), ...(keys ? [inArray(t.sets.exKey, keys.length ? keys : ["-"])] : [])))
    .orderBy(desc(t.sets.doneAt));
  const hist: Record<string, { date: string; sets: SetLog[]; effort?: string | null; joints?: string | null; sessionId: string }> = {};
  const best: Record<string, { e1rm: number; weightKg: number; reps: number; seconds: number }> = {};
  for (const { s, date } of rows) {
    if (s.kind === "W") continue;
    const h = hist[s.exKey];
    if (!h) hist[s.exKey] = { date, sets: [s as SetLog], sessionId: s.sessionId };
    else if (h.sessionId === s.sessionId) h.sets.unshift(s as SetLog);
    if (s.strict === 0 || s.kind === "D" || s.kind === "R") continue; // records only from honest straight sets
    const b = (best[s.exKey] ??= { e1rm: 0, weightKg: 0, reps: 0, seconds: 0 });
    const w = shownKg(s);
    if (w && s.reps && s.reps <= 12) b.e1rm = Math.max(b.e1rm, Math.round(w * (1 + s.reps / 30) * 10) / 10);
    b.weightKg = Math.max(b.weightKg, w ?? 0);
    b.reps = Math.max(b.reps, s.reps ?? 0);
    b.seconds = Math.max(b.seconds, s.seconds ?? 0);
  }
  const sids = [...new Set(Object.values(hist).map((h) => h.sessionId))];
  if (sids.length) {
    const fb = await d.select().from(t.feedback).where(inArray(t.feedback.sessionId, sids));
    for (const f of fb) {
      const h = hist[f.exKey];
      if (h && h.sessionId === f.sessionId) { h.effort = f.effort; h.joints = f.joints; }
    }
  }
  return { hist, best };
}

app.get("/lifts", async (c) => c.json(await liftHistory(db(c), null)));

app.put("/feedback/:id", async (c) => {
  const b = await c.req.json<{ sessionId: string; exKey: string; effort?: string | null; joints?: string | null }>();
  const row = { id: c.req.param("id"), sessionId: b.sessionId, exKey: b.exKey, effort: b.effort ?? null, joints: b.joints ?? null, at: now() };
  await db(c).insert(t.feedback).values(row).onConflictDoUpdate({ target: t.feedback.id, set: { effort: row.effort, joints: row.joints, at: row.at } });
  return c.json({ ok: true });
});

/** Last performance for one exercise (used right after a swap). */
app.get("/last/:exKey", async (c) => {
  const d = db(c);
  const rows = await d.select({ s: t.sets, date: t.sessions.date })
    .from(t.sets).innerJoin(t.sessions, eq(t.sets.sessionId, t.sessions.id))
    .where(and(eq(t.sets.exKey, c.req.param("exKey")), eq(t.sets.deleted, 0), ne(t.sets.sessionId, c.req.query("not") ?? "")))
    .orderBy(desc(t.sets.doneAt)).limit(30);
  if (!rows.length) return c.json(null);
  const sid = rows[0].s.sessionId;
  return c.json({ date: rows[0].date, sets: rows.filter((r) => r.s.sessionId === sid).map((r) => r.s).reverse() });
});

app.get("/exercises", (c) => c.json(Object.values(EXERCISES).map((e) => ({ key: e.key, name: e.name, metric: e.metric }))));

// ---------------------------------------------------------------- sets & events

app.put("/sets/:id", async (c) => {
  const s = await c.req.json<SetLog>();
  const row = { ...s, id: c.req.param("id"), deleted: s.deleted ?? 0, updatedAt: now() };
  const { id: _id, ...upd } = row;
  await db(c).insert(t.sets).values(row).onConflictDoUpdate({ target: t.sets.id, set: upd });
  return c.json({ ok: true });
});

app.post("/events", async (c) => {
  const list = await c.req.json<{ id: string; sessionId?: string; type: string; data?: unknown; at: number }[]>();
  const d = db(c);
  const rows = list.map((e) => ({ id: e.id, sessionId: e.sessionId ?? null, type: e.type, data: e.data === undefined ? null : JSON.stringify(e.data), at: e.at }));
  for (let i = 0; i < rows.length; i += 15) await d.insert(t.events).values(rows.slice(i, i + 15)).onConflictDoNothing();
  return c.json({ ok: true, n: rows.length });
});

// ---------------------------------------------------------------- history & progress

app.get("/history", async (c) => {
  const d = db(c);
  const rows = await d.select().from(t.sessions).orderBy(desc(t.sessions.date), desc(t.sessions.createdAt)).limit(Number(c.req.query("limit") ?? 200));
  const agg = await d.select({
    sessionId: t.sets.sessionId,
    n: sql<number>`count(*)`,
    vol: sql<number>`0`,
    pains: sql<number>`sum(case when ${t.sets.painLevel} > 0 then 1 else 0 end)`,
  }).from(t.sets).where(eq(t.sets.deleted, 0)).groupBy(t.sets.sessionId);
  const m = new Map(agg.map((a) => [a.sessionId, a]));
  const volRows = await d.select({ sessionId: t.sets.sessionId, exKey: t.sets.exKey, weightKg: t.sets.weightKg, kgBasis: t.sets.kgBasis, reps: t.sets.reps, kind: t.sets.kind })
    .from(t.sets).where(eq(t.sets.deleted, 0));
  for (const v of volRows) {
    const a = m.get(v.sessionId);
    if (a && v.kind !== "W") a.vol += totalKg(v) * (v.reps ?? 0);
  }
  const out: HistoryRow[] = rows.map((r) => ({
    id: r.id, date: r.date, week: r.week, dayKey: r.dayKey, dayName: r.dayName, status: r.status as HistoryRow["status"],
    kind: r.kind as HistoryRow["kind"], startedAt: r.startedAt, endedAt: r.endedAt, excuse: r.excuse, note: r.note, rpe: r.rpe,
    sets: m.get(r.id)?.n ?? 0, volume: Math.round(m.get(r.id)?.vol ?? 0), pains: m.get(r.id)?.pains ?? 0,
  }));
  return c.json(out);
});

app.get("/progress", async (c) => {
  const d = db(c);
  const rows = await d.select({ s: t.sets, date: t.sessions.date, week: t.sessions.week })
    .from(t.sets).innerJoin(t.sessions, eq(t.sets.sessionId, t.sessions.id))
    .where(and(eq(t.sets.deleted, 0), inArray(t.sessions.status, ["done", "abandoned", "active"])))
    .orderBy(t.sets.doneAt);
  const sess = await d.select().from(t.sessions);

  const byEx = new Map<string, Map<string, ProgressPoint>>();
  const pains: ProgressData["pains"] = [];
  for (const { s, date } of rows) {
    if (s.painLevel) pains.push({ date, exKey: s.exKey, area: s.painArea, level: s.painLevel, note: s.note });
    if (s.kind === "W") continue;
    const ex = byEx.get(s.exKey) ?? new Map<string, ProgressPoint>();
    byEx.set(s.exKey, ex);
    const p = ex.get(s.sessionId) ?? { date, sessionId: s.sessionId, bestWeight: null, bestReps: null, bestSeconds: null, bestMeters: null, e1rm: null, volume: 0, sets: 0 };
    ex.set(s.sessionId, p);
    p.sets++;
    const w = shownKg(s) ?? 0, r = s.reps ?? 0;
    p.volume += totalKg(s) * r;
    if (w && (p.bestWeight == null || w > p.bestWeight)) p.bestWeight = w;
    if (s.reps != null && (p.bestReps == null || s.reps > p.bestReps)) p.bestReps = s.reps;
    if (s.seconds != null && (p.bestSeconds == null || s.seconds > p.bestSeconds)) p.bestSeconds = s.seconds;
    if (s.meters != null && (p.bestMeters == null || s.meters > p.bestMeters)) p.bestMeters = s.meters;
    if (w > 0 && r > 0 && r <= 12 && s.strict !== 0 && s.kind !== "D" && s.kind !== "R") {
      const e = Math.round(w * (1 + r / 30) * 10) / 10; // Epley
      if (p.e1rm == null || e > p.e1rm) p.e1rm = e;
    }
  }

  const weeks = new Map<number, ProgressData["weeks"][number]>();
  for (const r of sess) {
    const w = weeks.get(r.week) ?? { start: `W${r.week}`, sessions: 0, missed: 0, sets: 0, volume: 0, minutes: 0 };
    weeks.set(r.week, w);
    if (r.status === "done") {
      w.sessions++;
      if (r.startedAt && r.endedAt) w.minutes += Math.round((r.endedAt - r.startedAt) / 60000);
    }
    if (r.status === "missed") w.missed++;
  }
  for (const { s, week } of rows) {
    const w = weeks.get(week);
    if (w && s.kind !== "W") {
      w.sets++;
      w.volume += totalKg(s) * (s.reps ?? 0);
    }
  }
  const exc = new Map<string, number>();
  for (const r of sess) if (r.excuse) exc.set(r.excuse, (exc.get(r.excuse) ?? 0) + 1);

  const out: ProgressData = {
    exercises: [...byEx.entries()]
      .map(([exKey, m]) => ({ exKey, name: EXERCISES[exKey]?.name ?? exKey, metric: EXERCISES[exKey]?.metric ?? "weight_reps", points: [...m.values()] }))
      .sort((a, b) => b.points.length - a.points.length),
    weeks: [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([, w]) => ({ ...w, volume: Math.round(w.volume) })),
    excuses: [...exc.entries()].map(([excuse, n]) => ({ excuse, n })).sort((a, b) => b.n - a.n),
    pains: pains.reverse().slice(0, 50),
  };
  return c.json(out);
});

// ---------------------------------------------------------------- body, tests, journal

app.get("/body", async (c) => c.json(await db(c).select().from(t.body).orderBy(desc(t.body.date)).limit(120)));
app.put("/body/:date", async (c) => {
  const b = await c.req.json<Partial<typeof t.body.$inferInsert>>();
  const row = { ...b, date: c.req.param("date"), updatedAt: now() };
  const { date: _d, ...upd } = row;
  await db(c).insert(t.body).values(row).onConflictDoUpdate({ target: t.body.date, set: upd });
  return c.json({ ok: true });
});

app.get("/tests", async (c) => c.json(await db(c).select().from(t.tests).orderBy(desc(t.tests.date))));
app.post("/tests", async (c) => {
  const b = await c.req.json<typeof t.tests.$inferInsert>();
  await db(c).insert(t.tests).values({ ...b, createdAt: now() }).onConflictDoNothing();
  return c.json({ ok: true });
});
app.delete("/tests/:id", async (c) => {
  await db(c).delete(t.tests).where(eq(t.tests.id, c.req.param("id")));
  return c.json({ ok: true });
});

app.get("/journal", async (c) => c.json(await db(c).select().from(t.journal).orderBy(desc(t.journal.createdAt)).limit(200)));
app.post("/journal", async (c) => {
  const b = await c.req.json<typeof t.journal.$inferInsert>();
  await db(c).insert(t.journal).values({ ...b, createdAt: now() }).onConflictDoNothing();
  return c.json({ ok: true });
});
app.delete("/journal/:id", async (c) => {
  await db(c).delete(t.journal).where(eq(t.journal.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- intake (creatine…)

app.get("/intake", async (c) => {
  const item = c.req.query("item") ?? "creatine";
  const since = c.req.query("since") ?? "0000";
  return c.json(await db(c).select().from(t.intake).where(and(eq(t.intake.item, item), sql`${t.intake.date} >= ${since}`)).orderBy(desc(t.intake.at)));
});
app.post("/intake", async (c) => {
  const b = await c.req.json<typeof t.intake.$inferInsert>();
  if (!(b.amount > 0 && b.amount <= 50)) return c.json({ error: "amount must be 0-50" }, 400);
  await db(c).insert(t.intake).values(b).onConflictDoNothing();
  return c.json({ ok: true });
});
app.put("/intake/:id", async (c) => {
  const b = await c.req.json<{ amount?: number; at?: number; date?: string }>();
  if (b.amount != null && !(b.amount > 0 && b.amount <= 50)) return c.json({ error: "amount must be 0-50" }, 400);
  const patch: Partial<typeof t.intake.$inferInsert> = {};
  if (b.amount != null) patch.amount = b.amount;
  if (b.at != null) patch.at = b.at;
  if (b.date) patch.date = b.date;
  await db(c).update(t.intake).set(patch).where(eq(t.intake.id, c.req.param("id")));
  return c.json({ ok: true });
});
app.delete("/intake/:id", async (c) => {
  await db(c).delete(t.intake).where(eq(t.intake.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- cardio

app.get("/cardio", async (c) => c.json(await db(c).select().from(t.cardio).orderBy(desc(t.cardio.date), desc(t.cardio.createdAt)).limit(200)));
app.put("/cardio/:id", async (c) => {
  const b = await c.req.json<Partial<typeof t.cardio.$inferInsert>>();
  if (b.status === "skipped") {
    // a skip is once per day per protocol: ignore repeat taps instead of storing duplicates
    const dup = await db(c).select({ id: t.cardio.id }).from(t.cardio)
      .where(and(eq(t.cardio.date, b.date!), eq(t.cardio.protocol, b.protocol!), eq(t.cardio.status, "skipped"), ne(t.cardio.id, c.req.param("id")))).limit(1);
    if (dup.length) return c.json({ ok: true, duplicate: true });
  }
  if (b.minutes != null && (b.minutes < 0 || b.minutes > 300)) return c.json({ error: "minutes 0-300" }, 400);
  const row = { ...b, id: c.req.param("id"), date: b.date!, protocol: b.protocol!, status: b.status ?? "done", createdAt: b.createdAt ?? now() };
  const { id: _i, ...upd } = row;
  await db(c).insert(t.cardio).values(row).onConflictDoUpdate({ target: t.cardio.id, set: upd });
  return c.json({ ok: true });
});
app.delete("/cardio/:id", async (c) => {
  await db(c).delete(t.cardio).where(eq(t.cardio.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- dashboard

app.get("/dashboard", async (c) => {
  const d = db(c);
  const today = c.req.query("today") ?? new Date().toISOString().slice(0, 10);
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 182 * 864e5).toISOString().slice(0, 10);
  const [sess, setAgg, cre, bodyRows, settingsRows, car] = await Promise.all([
    d.select().from(t.sessions).where(sql`${t.sessions.date} >= ${since}`).orderBy(t.sessions.date, t.sessions.createdAt),
    d.select({ sessionId: t.sets.sessionId, n: sql<number>`count(*)` }).from(t.sets).where(and(eq(t.sets.deleted, 0), ne(t.sets.kind, "W"))).groupBy(t.sets.sessionId),
    d.select({ date: t.intake.date, g: sql<number>`sum(${t.intake.amount})` }).from(t.intake).where(and(eq(t.intake.item, "creatine"), sql`${t.intake.date} >= ${since}`)).groupBy(t.intake.date),
    d.select({ date: t.body.date, weightKg: t.body.weightKg }).from(t.body).where(sql`${t.body.date} >= ${since} and ${t.body.weightKg} is not null`).orderBy(t.body.date),
    d.select().from(t.settings),
    d.select().from(t.cardio).where(sql`${t.cardio.date} >= ${since}`),
  ]);
  const setN = new Map(setAgg.map((a) => [a.sessionId, a.n]));
  const days: Record<string, { status: string; sets: number; minutes: number; names: string[] }> = {};
  const rank = { done: 4, abandoned: 3, active: 2, missed: 1, skipped: 1 } as Record<string, number>;
  for (const r of sess) {
    const x = (days[r.date] ??= { status: "", sets: 0, minutes: 0, names: [] });
    if ((rank[r.status] ?? 0) > (rank[x.status] ?? 0)) x.status = r.status;
    x.sets += setN.get(r.id) ?? 0;
    if (r.startedAt && r.endedAt) x.minutes += Math.round((r.endedAt - r.startedAt) / 60000);
    x.names.push(r.status === "missed" || r.status === "skipped" ? `${r.dayName} (missed)` : r.dayName);
  }
  // Forgiving streak: finished workouts in a row. Planned rest and sickness don't break it
  // (harsh resets make people quit — keep loss aversion, add grace). Adherence % never resets.
  let streak = 0, best = 0, run = 0, done = 0, missed = 0;
  for (const r of sess) {
    if (r.status === "done") { run++; done++; best = Math.max(best, run); }
    else if (r.status === "missed" || r.status === "skipped") {
      missed++;
      if (r.excuse !== "planned" && r.excuse !== "sick") run = 0;
    }
  }
  streak = run;
  const adherence = done + missed ? Math.round((done / (done + missed)) * 100) : null;
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
  const target = Number(settings.creatineTarget ?? 5);
  const creMap = Object.fromEntries(cre.map((x) => [x.date, Math.round(x.g * 10) / 10]));
  let creStreak = 0;
  for (let i = 0; i < 400; i++) {
    const day = new Date(Date.parse(`${today}T12:00:00Z`) - i * 864e5).toISOString().slice(0, 10);
    if ((creMap[day] ?? 0) >= target) creStreak++;
    else if (i > 0) break; // today not taken yet doesn't break the streak
  }
  const weekAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 6 * 864e5).toISOString().slice(0, 10);
  const cardioDays = Object.fromEntries(car.filter((x) => x.status !== "skipped").map((x) => [x.date, Math.round(x.minutes ?? 0)]));
  const cardioWeek = { sessions: car.filter((x) => x.date >= weekAgo && x.status !== "skipped").length, minutes: Math.round(car.filter((x) => x.date >= weekAgo && x.status !== "skipped").reduce((a, x) => a + (x.minutes ?? 0), 0)), kcal: car.filter((x) => x.date >= weekAgo).reduce((a, x) => a + (x.kcalMachine ?? x.kcalEst ?? 0), 0) };
  return c.json({ days, cardioDays, cardioWeek, streak, bestStreak: best, adherence, creatine: { today: creMap[today] ?? 0, target, streak: creStreak, days: creMap }, body: bodyRows });
});

// ---------------------------------------------------------------- insights & muscle volume

app.get("/insights", async (c) => {
  const d = db(c);
  const today = c.req.query("today") ?? new Date().toISOString().slice(0, 10);
  const [sess, sets, body, intake, st] = await Promise.all([
    d.select().from(t.sessions), d.select().from(t.sets).where(eq(t.sets.deleted, 0)), d.select().from(t.body),
    d.select().from(t.intake).where(eq(t.intake.item, "creatine")), d.select().from(t.settings).where(eq(t.settings.key, "creatineTarget")),
  ]);
  return c.json({
    insights: buildInsights(sess, sets, body, intake, Number(st[0]?.value ?? 5), today),
    muscles: muscleSets(sess.filter((s) => s.status !== "missed"), sets),
  });
});

// ---------------------------------------------------------------- plan vs actual

/** Per session and exercise: what the app recommended (stored on each set) vs what was actually done. */
app.get("/targets", async (c) => {
  const d = db(c);
  const sess = await d.select().from(t.sessions).where(inArray(t.sessions.status, ["done", "abandoned"])).orderBy(desc(t.sessions.date), desc(t.sessions.createdAt)).limit(30);
  if (!sess.length) return c.json([]);
  const rows = await d.select().from(t.sets).where(and(inArray(t.sets.sessionId, sess.map((x) => x.id)), eq(t.sets.deleted, 0))).orderBy(t.sets.doneAt);
  const out = sess.map((x) => {
    const plan = (j<PlanItem[]>(x.plan) ?? []);
    const items = plan.map((it, i) => {
      const ss = rows.filter((r) => r.sessionId === x.id && r.itemIdx === i);
      const work = ss.filter((r) => r.kind === "N" || r.kind === "F");
      const sug = j<{ weightKg: number | null; reps: number | null; seconds: number | null; kind: string }>(work[0]?.suggested ?? ss[0]?.suggested ?? null);
      const shown = work.map((r) => ({ kg: shownKg(r), reps: r.reps, seconds: r.seconds, rir: r.rir, strict: r.strict }));
      const topKg = Math.max(0, ...shown.map((r) => r.kg ?? 0)) || null;
      const atTop = shown.filter((r) => (r.kg ?? 0) === (topKg ?? 0));
      const avgReps = atTop.length ? atTop.reduce((a, r) => a + (r.reps ?? 0), 0) / atTop.length : null;
      let verdict: "first" | "beat" | "hit" | "close" | "missed" | "skipped" = "first";
      if (it.skipped || !work.length) verdict = "skipped";
      else if (sug?.weightKg != null && topKg != null) {
        const wDiff = topKg - sug.weightKg, rDiff = (avgReps ?? 0) - (sug.reps ?? 0);
        verdict = wDiff > 0.01 || (Math.abs(wDiff) < 0.01 && rDiff >= 1) ? "beat" : Math.abs(wDiff) < 0.01 && rDiff > -0.5 ? "hit" : (Math.abs(wDiff) < 0.01 && rDiff >= -1.5) ? "close" : "missed";
      } else if (sug?.reps != null && avgReps != null && sug.kind !== "start") verdict = avgReps >= sug.reps ? "hit" : "missed";
      return {
        exKey: it.ex, name: it.name, target: { sets: it.sets, reps: it.reps ?? null, rir: it.rir ?? null }, suggested: sug,
        done: shown, topKg, avgReps: avgReps == null ? null : Math.round(avgReps * 10) / 10, sets: work.length, verdict,
        cheated: work.filter((r) => r.strict === 0).length, notes: ss.filter((r) => r.note).map((r) => r.note as string),
      };
    });
    return { id: x.id, date: x.date, week: x.week, dayName: x.dayName, items };
  });
  return c.json(out);
});

// ---------------------------------------------------------------- reset & logout

/** Wipe ALL tracked data. Body must be {confirm: "DELETE"}. Program versions are re-created automatically. */
app.post("/reset", async (c) => {
  const { confirm } = await c.req.json<{ confirm?: string }>();
  if (confirm !== "DELETE") return c.json({ error: 'Send {"confirm":"DELETE"}' }, 400);
  const d = db(c);
  await d.batch([
    d.delete(t.sets), d.delete(t.sessions), d.delete(t.events), d.delete(t.body), d.delete(t.tests),
    d.delete(t.journal), d.delete(t.intake), d.delete(t.settings), d.delete(t.programVersions), d.delete(t.feedback), d.delete(t.cardio),
  ]);
  return c.json({ ok: true });
});

app.post("/logout", (c) => {
  c.header("Set-Cookie", "il_auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- export (backup / analysis)

app.get("/export", async (c) => {
  const d = db(c);
  const [programVersions, sessions, sets, events, body, tests, journal, settings, intake, feedback, cardio] = await Promise.all([
    d.select().from(t.programVersions), d.select().from(t.sessions), d.select().from(t.sets), d.select().from(t.events),
    d.select().from(t.body), d.select().from(t.tests), d.select().from(t.journal), d.select().from(t.settings), d.select().from(t.intake), d.select().from(t.feedback), d.select().from(t.cardio),
  ]);
  c.header("Content-Disposition", `attachment; filename="iron-log-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json({ exportedAt: new Date().toISOString(), programVersions, sessions, sets, events, body, tests, journal, settings, intake, feedback, cardio });
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

export default app;
