import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq, inArray, like, ne, sql } from "drizzle-orm";
import * as t from "./db/schema";
import type { Env } from "./env";
import { login, requireAuth } from "./auth";
import { CURRENT, EXERCISES, programVersionId } from "../program";
import { buildPlan } from "../shared/plan";
import type {
  AppState, HistoryRow, PlanItem, ProgressData, ProgressPoint, Session, SessionBundle, SetLog, SlotInfo,
} from "../shared/api";

const app = new Hono<Env>().basePath("/api");
const db = (c: { env: Env["Bindings"] }) => drizzle(c.env.DB, { schema: t });
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
app.get("/me", (c) => c.json({ ok: true }));

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
  return c.json({ session, sets, last } satisfies SessionBundle);
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
    vol: sql<number>`coalesce(sum(case when ${t.sets.kind} != 'W' then coalesce(${t.sets.weightKg},0) * coalesce(${t.sets.reps},0) else 0 end),0)`,
    pains: sql<number>`sum(case when ${t.sets.painLevel} > 0 then 1 else 0 end)`,
  }).from(t.sets).where(eq(t.sets.deleted, 0)).groupBy(t.sets.sessionId);
  const m = new Map(agg.map((a) => [a.sessionId, a]));
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
    const w = s.weightKg ?? 0, r = s.reps ?? 0;
    p.volume += w * r;
    if (s.weightKg != null && (p.bestWeight == null || s.weightKg > p.bestWeight)) p.bestWeight = s.weightKg;
    if (s.reps != null && (p.bestReps == null || s.reps > p.bestReps)) p.bestReps = s.reps;
    if (s.seconds != null && (p.bestSeconds == null || s.seconds > p.bestSeconds)) p.bestSeconds = s.seconds;
    if (s.meters != null && (p.bestMeters == null || s.meters > p.bestMeters)) p.bestMeters = s.meters;
    if (w > 0 && r > 0 && r <= 12) {
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
      w.volume += (s.weightKg ?? 0) * (s.reps ?? 0);
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

// ---------------------------------------------------------------- export (backup / analysis)

app.get("/export", async (c) => {
  const d = db(c);
  const [programVersions, sessions, sets, events, body, tests, journal, settings] = await Promise.all([
    d.select().from(t.programVersions), d.select().from(t.sessions), d.select().from(t.sets), d.select().from(t.events),
    d.select().from(t.body), d.select().from(t.tests), d.select().from(t.journal), d.select().from(t.settings),
  ]);
  c.header("Content-Disposition", `attachment; filename="iron-log-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json({ exportedAt: new Date().toISOString(), programVersions, sessions, sets, events, body, tests, journal, settings });
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

export default app;
