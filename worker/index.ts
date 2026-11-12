import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq, inArray, like, ne, sql } from "drizzle-orm";
import * as t from "./db/schema";
import type { Env } from "./env";
import { db, rawDb, resolveProgram, scopedDb, type DB } from "./db";
import { authRoutes, seedAuth } from "./routes/auth";
import { accountRoutes, seedAccount } from "./routes/account";
import { socialRoutes, seedSocial } from "./routes/social";
import { chatRoutes, seedChat } from "./routes/chat";
import { programRoutes, seedPrograms } from "./routes/programs";
import { PASS_RE, USERNAME_RE, checkPass, hashPass, login, reissue, requireAuth, setup } from "./auth";
import { CURRENT, EXERCISES, programVersionId } from "../program";
import { buildPlan } from "../shared/plan";
import { buildInsights, muscleSets } from "./insights";
import { analyticsInsights, buildAnalytics } from "./analytics";
import { seedDev } from "./devseed";
import { shownKg, totalKg } from "../shared/load";
import type {
  AppState, HistoryRow, PlanItem, ProgressData, ProgressPoint, Session, SessionBundle, SetLog, SlotInfo,
} from "../shared/api";

const app = new Hono<Env>().basePath("/api");
// db(c) = the logged-in user's data only (see worker/db.ts). rawDb(c) = unscoped, for shared tables.

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
  const id = programVersionId(d.prog);
  await d.insert(t.programVersions)
    .values({ id, name: d.prog.name, changelog: d.prog.changelog, snapshot: JSON.stringify({ ...d.prog, exercises: EXERCISES }), firstSeenAt: now() })
    .onConflictDoNothing();
  return id;
}

// ---------------------------------------------------------------- blocks (months)

const isoToday = () => new Date().toISOString().slice(0, 10);

/** Starting baseline for a new block: best est. max per exercise so far + latest bodyweight. */
async function baselineNow(d: DB) {
  const { best } = await liftHistory(d, null);
  const [bw] = await d.select().from(t.body).where(sql`${t.body.weightKg} is not null`).orderBy(desc(t.body.date)).limit(1);
  return { bodyKg: bw?.weightKg ?? null, e1rm: Object.fromEntries(Object.entries(best).filter(([, b]) => b.e1rm > 0).map(([k, b]) => [k, b.e1rm])) };
}

/**
 * The active block. Edge cases handled:
 *  • none yet (fresh install, or right after a reset) → Month 1 starts today
 *  • the program id changed (a new program, not a new version of the same one) → close the old block, start a new one
 *  • a new VERSION of the same program does NOT start a new block (the month continues with the updated plan)
 */
async function activeBlock(d: DB, startDate?: string) {
  let [b] = await d.select().from(t.blocks).where(eq(t.blocks.status, "active")).orderBy(desc(t.blocks.n)).limit(1);
  if (b && b.programId !== d.prog.id) {
    await closeBlock(d, b, startDate ?? isoToday());
    b = undefined as unknown as typeof b;
  }
  if (!b) {
    const [last] = await d.select().from(t.blocks).orderBy(desc(t.blocks.n)).limit(1);
    const n = (last?.n ?? 0) + 1;
    const date = startDate ?? isoToday();
    const row = { id: `blk-${n}-${now().toString(36)}`, n, name: `Month ${n}`, programId: d.prog.id, startVersion: programVersionId(d.prog), startDate: date,
      endDate: null, status: "active", goal: null, notes: null, review: null, baseline: JSON.stringify(await baselineNow(d)), summary: null, createdAt: now(), updatedAt: now() };
    await d.insert(t.blocks).values(row);
    b = row as typeof b;
  }
  return b;
}

/** Live numbers for a block (also frozen into `summary` when it closes). */
async function blockStats(d: DB, b: typeof t.blocks.$inferSelect) {
  const sess = await d.select().from(t.sessions).where(eq(t.sessions.blockId, b.id));
  const ids = sess.map((x) => x.id);
  const sets = ids.length ? await d.select().from(t.sets).where(and(inArray(t.sets.sessionId, ids), eq(t.sets.deleted, 0))) : [];
  const done = sess.filter((x) => x.status === "done");
  const planned = (d.prog.weeks.length || 4) * d.prog.order.length;
  const counted = sess.filter((x) => x.kind !== "extra" && ["done", "missed", "skipped"].includes(x.status));
  const work = sets.filter((x) => x.kind !== "W");
  const mins = done.filter((x) => x.startedAt && x.endedAt).map((x) => (x.endedAt! - x.startedAt!) / 60000).filter((m) => m >= 5 && m <= 300);
  // est. max per exercise: first session in the block vs best in the block
  const e1 = (x: typeof sets[number]) => { const w = shownKg(x); return w && x.reps && x.reps <= 12 && x.strict !== 0 && (x.kind === "N" || x.kind === "F") ? Math.round(w * (1 + x.reps / 30) * 10) / 10 : 0; };
  const firstBy = new Map<string, number>(), bestBy = new Map<string, number>();
  const sessDate = new Map(sess.map((x) => [x.id, `${x.date}|${x.startedAt ?? 0}`]));
  const firstSess = new Map<string, string>();
  for (const x of [...sets].sort((a, z) => (sessDate.get(a.sessionId)! < sessDate.get(z.sessionId)! ? -1 : 1))) {
    const v = e1(x); if (!v) continue;
    if (!firstSess.has(x.exKey)) firstSess.set(x.exKey, x.sessionId);
    if (firstSess.get(x.exKey) === x.sessionId) firstBy.set(x.exKey, Math.max(firstBy.get(x.exKey) ?? 0, v));
    bestBy.set(x.exKey, Math.max(bestBy.get(x.exKey) ?? 0, v));
  }
  const lifts = [...bestBy.entries()].map(([k, best]) => ({ exKey: k, name: EXERCISES[k]?.name ?? k, start: firstBy.get(k) ?? best, best, pct: firstBy.get(k) ? Math.round(((best - firstBy.get(k)!) / firstBy.get(k)!) * 1000) / 10 : 0 }))
    .sort((a, z) => z.best - a.best);
  const end = b.endDate ?? isoToday();
  const bw = await d.select().from(t.body).where(and(sql`${t.body.date} >= ${b.startDate}`, sql`${t.body.date} <= ${end}`, sql`${t.body.weightKg} is not null`)).orderBy(t.body.date);
  const versions = [...new Set(sess.map((x) => x.programVersionId))].sort();
  return {
    sessions: { done: done.length, missed: sess.filter((x) => x.status === "missed").length, skipped: sess.filter((x) => x.status === "skipped").length, extra: sess.filter((x) => x.kind === "extra" && x.status === "done").length, planned },
    adherence: counted.length ? Math.round((counted.filter((x) => x.status === "done").length / counted.length) * 100) : null,
    progress: Math.round((done.filter((x) => x.kind !== "extra").length / planned) * 100),
    sets: work.filter((x) => x.kind === "N" || x.kind === "F").length,
    volume: Math.round(work.reduce((a, x) => a + totalKg(x) * (x.reps ?? 0), 0)),
    avgMinutes: mins.length ? Math.round(mins.reduce((a, m) => a + m, 0) / mins.length) : null,
    prs: sets.filter((x) => x.pr === 1).length,
    pains: sets.filter((x) => (x.painLevel ?? 0) > 0).length,
    bodyKg: { start: bw[0]?.weightKg ?? null, end: bw[bw.length - 1]?.weightKg ?? null },
    versions,
    lifts: lifts.slice(0, 12),
    weeksDone: [...new Set(done.map((x) => x.week))].sort(),
  };
}

async function closeBlock(d: DB, b: typeof t.blocks.$inferSelect, endDate: string) {
  const summary = await blockStats(d, { ...b, endDate });
  await d.update(t.blocks).set({ status: "done", endDate, summary: JSON.stringify(summary), updatedAt: now() }).where(eq(t.blocks.id, b.id));
}

async function slots(d: DB): Promise<SlotInfo[]> {
  // plan position counts only this block's sessions → the same program can be repeated month after month
  const blk = await activeBlock(d);
  const rows = await d.select({ week: t.sessions.week, dayKey: t.sessions.dayKey, status: t.sessions.status })
    .from(t.sessions)
    .where(and(eq(t.sessions.blockId, blk.id), like(t.sessions.programVersionId, `${d.prog.id}@%`), inArray(t.sessions.status, ["done", "skipped"]), ne(t.sessions.kind, "extra")));
  const st = new Map(rows.map((r) => [`${r.week}-${r.dayKey}`, r.status as "done" | "skipped"]));
  const out: SlotInfo[] = [];
  for (const w of d.prog.weeks)
    for (const key of d.prog.order) {
      const d2 = w.days.find((x) => x.key === key);
      if (!d2) continue;
      out.push({ week: w.n, dayKey: key, dayName: d2.name, focus: d2.focus, items: d2.items.length, status: st.get(`${w.n}-${key}`) ?? "open" });
    }
  return out;
}

// ---------------------------------------------------------------- auth

app.post("/login", login);
app.route("/", authRoutes); // public: /api/signup, /api/auth/* (Google) …
const PUBLIC = (p: string) => p === "/api/login" || p === "/api/signup" || p.startsWith("/api/auth/") || p.startsWith("/api/public/");
app.use("*", async (c, next) => (PUBLIC(c.req.path) ? next() : requireAuth(c, next)));
app.use("*", async (c, next) => {
  if (c.var.programId) c.set("prog", await resolveProgram(rawDb(c), { programId: c.var.programId }));
  return next();
});
app.get("/me", async (c) => {
  const u = await profileOf(c);
  return c.json({ ok: true, dev: c.var.dev, setup: !c.var.dev && !u, user: u ? { id: u.id, username: u.username, name: u.name, avatarId: u.avatarId, role: u.role } : null });
});
app.post("/setup", setup);
app.route("/", accountRoutes);
app.route("/", socialRoutes);
app.route("/", chatRoutes);
app.route("/", programRoutes);

/** DEV mode only: fill the test database with ~3 weeks of realistic dummy training. */
app.post("/dev/seed", async (c) => {
  if (!c.var.dev) return c.json({ error: "Only in DEV mode" }, 403);
  const today = c.req.query("today") ?? new Date().toISOString().slice(0, 10);
  const raw = rawDb(c); // DEV database only (c.var.dev)
  // test people: you (dev) + two friends — log in as any of them with the DEV passcode
  const people = [
    { id: "dev", username: "dev", name: "Test user", bio: "DEV mode · dummy data", role: "owner" },
    { id: "dev-omar", username: "dev_omar", name: "Omar Test", bio: "Leg day enjoyer · 4-day upper/lower", role: "member" },
    { id: "dev-sara", username: "dev_sara", name: "Sara Test", bio: "Pull-ups > everything", role: "member" },
  ];
  for (const u of people)
    await raw.insert(t.users).values({ ...u, avatarId: null, passHash: "-", createdAt: now(), updatedAt: now() })
      .onConflictDoUpdate({ target: t.users.id, set: { username: u.username, name: u.name, bio: u.bio, role: u.role } });
  let n = 0;
  for (const u of people) {
    const d = scopedDb(c.env.DB_DEV, u.id, CURRENT);
    n += await seedDev(d, today);
    // link the dummy sessions to a fresh Month 1 (same as the real data migration)
    await d.delete(t.blocks);
    const [first] = await d.select({ date: t.sessions.date }).from(t.sessions).orderBy(t.sessions.date).limit(1);
    const blk = await activeBlock(d, first?.date);
    await d.update(t.sessions).set({ blockId: blk.id }).where(sql`${t.sessions.blockId} is null`);
  }
  const ids = { dev: "dev", omar: "dev-omar", sara: "dev-sara" };
  for (const f of [seedAuth, seedAccount, seedPrograms, seedSocial, seedChat]) await f(raw, ids);
  return c.json({ ok: true, rows: n, users: people.map((u) => u.username) });
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
  const blk = await activeBlock(d);
  const body: AppState = {
    program: { id: d.prog.id, version: d.prog.version, name: d.prog.name, changelog: d.prog.changelog, rules: d.prog.rules },
    block: { id: blk.id, n: blk.n, name: blk.name, startDate: blk.startDate, startVersion: blk.startVersion },
    weeks: d.prog.weeks.map((w) => ({ n: w.n, name: w.name, brief: w.brief })),
    slots: all,
    next: all.find((s) => s.status === "open") ?? null,
    active: active[0] ? { id: active[0].id, dayName: active[0].dayName, week: active[0].week, startedAt: active[0].startedAt } : null,
    schedules: d.prog.schedules,
    settings: Object.fromEntries(settingsRows.map((r) => [r.key, r.value])),
    tests: d.prog.tests,
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
  await db(c).insert(t.settings).values({ userId: "", key: c.req.param("key"), value }).onConflictDoUpdate({ target: [t.settings.userId, t.settings.key], set: { value } });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- sessions

/** Start a session. kind: planned (next in order) · picked (out of order) · extra (bonus, doesn't fill a slot). */
app.post("/sessions", async (c) => {
  const b = await c.req.json<{ id: string; week: number; dayKey: string; kind: Session["kind"]; date: string; tz: string; readiness?: object; startedAt: number }>();
  const d = db(c);
  const pv = await ensureVersion(d);
  const plan = buildPlan(d.prog, b.week, b.dayKey);
  const blk = await activeBlock(d, b.date);
  await d.insert(t.sessions).values({
    id: b.id, programVersionId: pv, blockId: blk.id, week: b.week, dayKey: b.dayKey, dayName: plan.name, status: "active", kind: b.kind,
    date: b.date, startedAt: b.startedAt, plan: JSON.stringify(plan.items), readiness: b.readiness ? JSON.stringify(b.readiness) : null,
    tz: b.tz, createdAt: now(), updatedAt: now(),
  }).onConflictDoNothing();
  return c.json({ id: b.id });
});

// ---------------------------------------------------------------- months (blocks)

/** All months, newest first, with live numbers (closed months use their frozen summary). */
app.get("/blocks", async (c) => {
  const d = db(c);
  await activeBlock(d);
  const rows = await d.select().from(t.blocks).orderBy(desc(t.blocks.n));
  const out = [];
  for (const b of rows) out.push({ ...b, baseline: j(b.baseline), summary: undefined, stats: b.status === "done" && b.summary ? j(b.summary) : await blockStats(d, b) });
  return c.json(out);
});

app.get("/blocks/:id", async (c) => {
  const d = db(c);
  const [b] = await d.select().from(t.blocks).where(eq(t.blocks.id, c.req.param("id")));
  if (!b) return c.json({ error: "not found" }, 404);
  const sessions = await d.select().from(t.sessions).where(eq(t.sessions.blockId, b.id)).orderBy(t.sessions.date, t.sessions.createdAt);
  return c.json({ ...b, baseline: j(b.baseline), summary: undefined, stats: b.status === "done" && b.summary ? j(b.summary) : await blockStats(d, b), live: await blockStats(d, b),
    sessions: sessions.map((x) => ({ id: x.id, date: x.date, week: x.week, dayName: x.dayName, status: x.status, kind: x.kind, version: x.programVersionId })) });
});

/** Goal / notes / review text for a month. */
app.put("/blocks/:id", async (c) => {
  const b = await c.req.json<{ goal?: string | null; notes?: string | null; review?: string | null; name?: string }>();
  const patch: Partial<typeof t.blocks.$inferInsert> = { updatedAt: now() };
  for (const k of ["goal", "notes", "review", "name"] as const) if (b[k] !== undefined) (patch as Record<string, unknown>)[k] = b[k];
  await db(c).update(t.blocks).set(patch).where(eq(t.blocks.id, c.req.param("id")));
  return c.json({ ok: true });
});

/**
 * Finish this month and start the next one (plan goes back to Week 1, history and weights carry over).
 * Refused while a workout is in progress. The closed month gets a frozen summary snapshot.
 */
app.post("/blocks/next", async (c) => {
  const d = db(c);
  const body = await c.req.json<{ date?: string; notes?: string }>().catch(() => ({} as { date?: string; notes?: string }));
  const [act] = await d.select().from(t.sessions).where(eq(t.sessions.status, "active")).limit(1);
  if (act) return c.json({ error: "Finish or abandon the workout in progress first." }, 409);
  const date = body.date ?? isoToday();
  const cur = await activeBlock(d, date);
  if (body.notes) await d.update(t.blocks).set({ notes: body.notes }).where(eq(t.blocks.id, cur.id));
  await closeBlock(d, cur, date);
  const next = await activeBlock(d, date);
  return c.json({ closed: cur.id, started: next.id, n: next.n });
});

/** Log a missed day (excuse). Does NOT advance the plan — the same session stays next. */
app.post("/missed", async (c) => {
  const b = await c.req.json<{ id: string; week: number; dayKey: string; date: string; excuse: string; note?: string; tz: string; skip?: boolean; kind?: "planned" | "extra" }>();
  const d = db(c);
  const pv = await ensureVersion(d);
  const plan = buildPlan(d.prog, b.week, b.dayKey);
  const blk = await activeBlock(d, b.date);
  await d.insert(t.sessions).values({
    id: b.id, programVersionId: pv, blockId: blk.id, week: b.week, dayKey: b.dayKey, dayName: plan.name, status: b.skip ? "skipped" : "missed",
    kind: b.kind === "extra" ? "extra" : "planned", date: b.date, plan: "[]", excuse: b.excuse, note: b.note ?? null, tz: b.tz, createdAt: now(), updatedAt: now(),
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
  const best: Record<string, import("../shared/api").Best & { _dates?: Set<string> }> = {};
  for (const { s, date } of rows) {
    if (s.kind === "W") continue;
    const h = hist[s.exKey];
    if (!h) hist[s.exKey] = { date, sets: [s as SetLog], sessionId: s.sessionId };
    else if (h.sessionId === s.sessionId) h.sets.unshift(s as SetLog);
    if (s.strict === 0 || s.kind === "D" || s.kind === "R") continue; // records only from honest straight sets
    const b = (best[s.exKey] ??= { e1rm: 0, weightKg: 0, reps: 0, seconds: 0, _dates: new Set() });
    const w = shownKg(s);
    b._dates!.add(date);
    const e = w && s.reps && s.reps <= 12 ? Math.round(w * (1 + s.reps / 30) * 10) / 10 : 0;
    // the headline value of this set (est. max for weighted, else reps or seconds) — for "where it started"
    const val = e || (s.seconds ?? 0) || (w ? 0 : s.reps ?? 0);
    // rows come newest first: a strictly-better set wins; ties keep the EARLIER date (first time you hit it)
    const prevHead = b.e1rm || b.seconds || b.reps;
    if (e > b.e1rm || (e && e === b.e1rm)) { b.e1rm = e; b.at = date; b.setKg = w; b.setReps = s.reps; }
    else if (!e && !b.e1rm && val && val >= prevHead) { b.at = date; b.setKg = w ?? null; b.setReps = s.reps ?? null; }
    b.weightKg = Math.max(b.weightKg, w ?? 0);
    b.reps = Math.max(b.reps, s.reps ?? 0);
    b.seconds = Math.max(b.seconds, s.seconds ?? 0);
    if (val && (!b.startDate || date < b.startDate)) { b.startDate = date; b.start = val; }
    else if (val && date === b.startDate) b.start = Math.max(b.start ?? 0, val);
  }
  for (const b of Object.values(best)) { b.sessions = b._dates?.size ?? 0; delete b._dates; }

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
  const exOf = new Map<string, Set<string>>();
  for (const v of volRows) {
    const a = m.get(v.sessionId);
    if (a && v.kind !== "W") a.vol += totalKg(v) * (v.reps ?? 0);
    if (!exOf.has(v.sessionId)) exOf.set(v.sessionId, new Set());
    exOf.get(v.sessionId)!.add(v.exKey);
  }
  const blockName = new Map((await d.select({ id: t.blocks.id, name: t.blocks.name }).from(t.blocks)).map((b) => [b.id, b.name]));
  const out: HistoryRow[] = rows.map((r) => ({
    id: r.id, date: r.date, week: r.week, dayKey: r.dayKey, dayName: r.dayName, status: r.status as HistoryRow["status"],
    kind: r.kind as HistoryRow["kind"], startedAt: r.startedAt, endedAt: r.endedAt, excuse: r.excuse, note: r.note, rpe: r.rpe,
    sets: m.get(r.id)?.n ?? 0, volume: Math.round(m.get(r.id)?.vol ?? 0), pains: m.get(r.id)?.pains ?? 0,
    exKeys: [...(exOf.get(r.id) ?? [])],
    blockId: r.blockId, blockName: r.blockId ? blockName.get(r.blockId) ?? null : null, version: r.programVersionId,
  }));
  return c.json(out);
});

/** Everything that happened on one date: workouts (with sets per exercise), cardio, creatine, body log, journal, notes. */
app.get("/day/:date", async (c) => {
  const d = db(c);
  const date = c.req.param("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "bad date" }, 400);
  const [sess, cardio, intake, body, journal] = await Promise.all([
    d.select().from(t.sessions).where(eq(t.sessions.date, date)).orderBy(t.sessions.createdAt),
    d.select().from(t.cardio).where(eq(t.cardio.date, date)),
    d.select().from(t.intake).where(eq(t.intake.date, date)).orderBy(t.intake.at),
    d.select().from(t.body).where(eq(t.body.date, date)),
    d.select().from(t.journal).where(eq(t.journal.date, date)).orderBy(t.journal.createdAt),
  ]);
  const ids = sess.map((x) => x.id);
  const sets = ids.length ? await d.select().from(t.sets).where(and(inArray(t.sets.sessionId, ids), eq(t.sets.deleted, 0))).orderBy(t.sets.doneAt) : [];
  return c.json({
    date,
    sessions: sess.map((x) => {
      const plan = j<PlanItem[]>(x.plan) ?? [];
      const ss = sets.filter((y) => y.sessionId === x.id);
      const byEx = [...new Set(ss.map((y) => y.itemIdx))].map((i) => {
        const list = ss.filter((y) => y.itemIdx === i && y.kind !== "W");
        return { exKey: list[0]?.exKey ?? plan[i]?.ex, name: plan[i]?.name ?? EXERCISES[list[0]?.exKey ?? ""]?.name ?? "?", sets: list.map((y) => ({ kg: shownKg(y), reps: y.reps, seconds: y.seconds, kind: y.kind, rir: y.rir })), notes: list.filter((y) => y.note).map((y) => y.note as string), pain: list.some((y) => (y.painLevel ?? 0) > 0) };
      }).filter((e) => e.sets.length);
      return { id: x.id, dayName: x.dayName, week: x.week, status: x.status, kind: x.kind, excuse: x.excuse, note: x.note, rpe: x.rpe,
        minutes: x.startedAt && x.endedAt ? Math.round((x.endedAt - x.startedAt) / 60000) : null,
        volume: Math.round(ss.filter((y) => y.kind !== "W").reduce((a, y) => a + totalKg(y) * (y.reps ?? 0), 0)), exercises: byEx };
    }),
    cardio: cardio.map((x) => ({ id: x.id, protocol: x.protocol, status: x.status, minutes: x.minutes, kcal: x.kcalEst, note: x.note })),
    creatine: { grams: intake.filter((x) => x.item === "creatine").reduce((a, x) => a + x.amount, 0), entries: intake.filter((x) => x.item === "creatine").map((x) => ({ amount: x.amount, at: x.at })) },
    body: body[0] ?? null,
    journal: journal.map((x) => ({ id: x.id, text: x.text, tags: x.tags, mood: x.mood })),
  });
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

// ---------------------------------------------------------------- notes (everything you wrote, one feed)
/** All notes from everywhere: journal, set notes, workout notes, cardio, body, tests. Newest first. */
app.get("/notes", async (c) => {
  const d = db(c);
  const [jr, st, ss, ca, bo, te] = await Promise.all([
    d.select().from(t.journal).orderBy(desc(t.journal.createdAt)).limit(500),
    d.select({ id: t.sets.id, note: t.sets.note, exKey: t.sets.exKey, at: t.sets.doneAt, sessionId: t.sets.sessionId, kg: t.sets.weightKg, reps: t.sets.reps, painArea: t.sets.painArea, painLevel: t.sets.painLevel, date: t.sessions.date, dayName: t.sessions.dayName })
      .from(t.sets).innerJoin(t.sessions, eq(t.sets.sessionId, t.sessions.id))
      .where(and(eq(t.sets.deleted, 0), sql`(${t.sets.note} is not null and ${t.sets.note} != '') or ${t.sets.painArea} is not null or ${t.sets.id} in (select ref_id from photos where ref_kind = 'set')`)).orderBy(desc(t.sets.doneAt)).limit(500),
    d.select().from(t.sessions).where(sql`${t.sessions.note} is not null and ${t.sessions.note} != ''`).orderBy(desc(t.sessions.date)).limit(300),
    d.select().from(t.cardio).where(sql`${t.cardio.note} is not null and ${t.cardio.note} != ''`).orderBy(desc(t.cardio.date)).limit(300),
    d.select().from(t.body).where(sql`${t.body.note} is not null and ${t.body.note} != ''`).orderBy(desc(t.body.date)).limit(300),
    d.select().from(t.tests).where(sql`${t.tests.note} is not null and ${t.tests.note} != ''`).limit(300),
  ]);
  type N = { id: string; kind: "journal" | "set" | "workout" | "cardio" | "body" | "test"; date: string; at: number; text: string; tag?: string | null; mood?: number | null; title?: string; link?: string; pain?: string | null };
  const out: N[] = [
    ...jr.map((x) => ({ id: x.id, kind: "journal" as const, date: x.date, at: x.createdAt, text: x.text, tag: x.tags, mood: x.mood })),
    ...st.map((x) => ({ id: x.id, kind: "set" as const, date: x.date, at: x.at, text: x.note ?? "", title: `${EXERCISES[x.exKey]?.name ?? x.exKey}${x.kg != null || x.reps != null ? ` · ${x.kg ?? "BW"}×${x.reps ?? "–"}` : ""}`, link: `/s/${x.sessionId}`, pain: x.painArea ? `${x.painArea} ${["", "mild", "moderate", "sharp"][x.painLevel ?? 1]}` : null })),
    ...ss.map((x) => ({ id: x.id, kind: "workout" as const, date: x.date, at: x.endedAt ?? x.startedAt ?? x.createdAt, text: x.note ?? "", title: `W${x.week} · ${x.dayName}`, link: `/s/${x.id}` })),
    ...ca.map((x) => ({ id: x.id, kind: "cardio" as const, date: x.date, at: x.endedAt ?? x.createdAt, text: x.note ?? "", title: x.protocol === "football" ? "Football" : "Cardio" })),
    ...bo.map((x) => ({ id: x.date, kind: "body" as const, date: x.date, at: x.updatedAt, text: x.note ?? "", title: x.weightKg ? `${x.weightKg} kg` : "Body" })),
    ...te.map((x) => ({ id: x.id, kind: "test" as const, date: x.date, at: x.createdAt, text: x.note ?? "", title: `${x.testKey.replace(/_/g, " ")} ${x.value} ${x.unit}` })),
  ];
  out.sort((a, b) => (b.date === a.date ? b.at - a.at : b.date < a.date ? -1 : 1));
  const ph = await d.select(photoMeta).from(t.photos).where(inArray(t.photos.refKind, ["set", "journal"])).orderBy(t.photos.createdAt).limit(2000);
  const by = new Map<string, typeof ph>();
  ph.forEach((p) => p.refId && by.set(p.refId, [...(by.get(p.refId) ?? []), p]));
  return c.json(out.map((n) => (by.has(n.id) && (n.kind === "set" || n.kind === "journal") ? { ...n, photos: by.get(n.id) } : n)));
});

// ---------------------------------------------------------------- photos
// Guards: only JPEG/PNG/WebP data URLs, ≤1.2 MB full + small thumb, ids/dates validated, caption ≤ 500 chars, 3,000 photos max
// (the UI compresses to ~250 KB, so that stays well under the 500 MB D1 free limit).
// Images are immutable per id → cached forever by the browser and the service worker (no re-download).

const photoMeta = { id: t.photos.id, refKind: t.photos.refKind, refId: t.photos.refId, exKey: t.photos.exKey, sessionId: t.photos.sessionId,
  date: t.photos.date, caption: t.photos.caption, w: t.photos.w, h: t.photos.h, bytes: t.photos.bytes, createdAt: t.photos.createdAt, visibility: t.photos.visibility };
const REF_KINDS = ["set", "exercise", "journal", "session", "progress", "avatar", "other"];
const ID_RE = /^[\w-]{6,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dataUrlRe = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

/** Photo list (metadata only). Filters: ?ref=<id> · ?ex=<exKey> · ?session=<id> · ?kinds=progress,set · none = newest 500. */
app.get("/photos", async (c) => {
  const d = db(c);
  const { ref, ex, session, kinds } = c.req.query();
  const ks = (kinds ?? "").split(",").filter((k) => REF_KINDS.includes(k));
  const where = ref ? eq(t.photos.refId, ref) : ex ? eq(t.photos.exKey, ex) : session ? eq(t.photos.sessionId, session) : ks.length ? inArray(t.photos.refKind, ks) : undefined;
  const notChat = sql`coalesce(${t.photos.refId}, '') not like 'chat:%'`; // chat images live in conversations, not your grid
  const q = d.select(photoMeta).from(t.photos);
  return c.json(await q.where(where ? and(where, notChat) : notChat).orderBy(desc(t.photos.date), desc(t.photos.createdAt)).limit(500));
});

/** The image (?s=t → small thumbnail when there is one). Private (auth cookie) and immutable → cached for a year. */
app.get("/photos/:id/img", async (c) => {
  const id = c.req.param("id");
  const small = c.req.query("s") === "t";
  const etag = `"${id}${small ? "-t" : ""}"`;
  const head = { "cache-control": "private, max-age=31536000, immutable", etag };
  if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers: head });
  const [p] = await db(c)
    .select({ data: small ? sql<string>`coalesce(${t.photos.thumb}, ${t.photos.data})` : t.photos.data, mime: t.photos.mime, thumb: sql<number>`${t.photos.thumb} is not null` })
    .from(t.photos).where(eq(t.photos.id, id));
  if (!p) return c.json({ error: "not found" }, 404);
  const bin = Uint8Array.from(atob(p.data), (ch) => ch.charCodeAt(0));
  return new Response(bin, { headers: { ...head, "content-type": small && p.thumb ? "image/jpeg" : p.mime, "content-length": String(bin.length) } });
});

app.post("/photos", async (c) => {
  const b = await c.req.json<{ id: string; refKind: string; refId?: string | null; exKey?: string | null; sessionId?: string | null; date: string; caption?: string | null; dataUrl: string; thumbUrl?: string | null; w?: number; h?: number }>();
  const m = dataUrlRe.exec(b.dataUrl ?? "");
  if (!m) return c.json({ error: "Not an image (JPEG, PNG or WebP)" }, 400);
  if (!ID_RE.test(b.id ?? "")) return c.json({ error: "bad id" }, 400);
  if (!DATE_RE.test(b.date ?? "")) return c.json({ error: "bad date" }, 400);
  if (!REF_KINDS.includes(b.refKind)) return c.json({ error: "bad refKind" }, 400);
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > 1_200_000) return c.json({ error: "Photo too large (max ~1.2 MB after compression)" }, 413);
  const th = b.thumbUrl ? dataUrlRe.exec(b.thumbUrl) : null;
  if (th && th[2].length > 120_000) return c.json({ error: "Thumbnail too large" }, 413);
  const d = db(c);
  const [{ n }] = await d.select({ n: sql<number>`count(*)` }).from(t.photos);
  if (n >= 3000) return c.json({ error: "Photo limit reached (3,000). Delete old ones first." }, 507);
  const caption = b.caption?.trim().slice(0, 500) || null;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 && x < 10000 ? Math.round(x) : null);
  await d.insert(t.photos).values({
    id: b.id, refKind: b.refKind, refId: b.refId?.slice(0, 120) ?? null, exKey: b.exKey?.slice(0, 80) ?? null, sessionId: b.sessionId?.slice(0, 80) ?? null,
    date: b.date, caption, mime: m[1], w: num(b.w), h: num(b.h), bytes, data: m[2], thumb: th ? th[2] : null, createdAt: now(),
  }).onConflictDoNothing();
  return c.json({ ok: true, id: b.id, bytes });
});

/** Edit caption and/or date (for progress photos taken on another day). */
app.put("/photos/:id", async (c) => {
  const b = await c.req.json<{ caption?: string | null; date?: string }>();
  const set: Partial<typeof t.photos.$inferInsert> = {};
  if ("caption" in b) set.caption = b.caption?.trim().slice(0, 500) || null;
  if (b.date) {
    if (!DATE_RE.test(b.date)) return c.json({ error: "bad date" }, 400);
    set.date = b.date;
  }
  if (!Object.keys(set).length) return c.json({ ok: true });
  await db(c).update(t.photos).set(set).where(eq(t.photos.id, c.req.param("id")));
  return c.json({ ok: true });
});

app.delete("/photos/:id", async (c) => {
  const id = c.req.param("id");
  const d = db(c);
  await d.batch([d.delete(t.photos).where(eq(t.photos.id, id)), d.update(t.users).set({ avatarId: null }).where(eq(t.users.avatarId, id))]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- profile (Instagram-style: avatar, name, @username, bio)

async function profileOf(c: { env: Env["Bindings"]; var: Env["Variables"] }) {
  const d = db(c);
  if (!c.var.userId) return null;
  const [u] = await d.select().from(t.users).where(eq(t.users.id, c.var.userId));
  if (u || !c.var.dev) return u ?? null;
  // DEV mode: a throwaway profile in the test database
  const dev = { id: "dev", username: "dev", name: "Test user", bio: "DEV mode · dummy data", avatarId: null, passHash: "-", role: "owner", email: null, googleSub: null, privacy: null, prefs: null, programId: null, lastSeenAt: null, createdAt: now(), updatedAt: now() };
  await d.insert(t.users).values(dev).onConflictDoNothing();
  return dev;
}

app.get("/profile", async (c) => {
  const u = await profileOf(c);
  if (!u) return c.json({ error: "no profile" }, 404);
  const d = db(c);
  const [[w], [p], [pr], [first]] = await Promise.all([
    d.select({ n: sql<number>`count(*)` }).from(t.sessions).where(eq(t.sessions.status, "done")),
    d.select({ n: sql<number>`count(*)` }).from(t.photos).where(ne(t.photos.refKind, "avatar")),
    d.select({ n: sql<number>`count(*)` }).from(t.sets).where(and(eq(t.sets.pr, 1), eq(t.sets.deleted, 0))),
    d.select({ date: t.sessions.date }).from(t.sessions).where(eq(t.sessions.status, "done")).orderBy(t.sessions.date).limit(1),
  ]);
  const { passHash: _ph, ...pub } = u;
  return c.json({ ...pub, stats: { workouts: w.n, photos: p.n, prs: pr.n, since: first?.date ?? null } });
});

app.get("/users/check", async (c) => {
  const u = (c.req.query("u") ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!USERNAME_RE.test(u) || /^[.]|[.]$|\.\./.test(u)) return c.json({ available: false, reason: "3-30 letters, numbers, . or _" });
  const [x] = await db(c).select({ id: t.users.id }).from(t.users).where(eq(t.users.username, u));
  return c.json({ available: !x || x.id === c.var.userId, reason: x && x.id !== c.var.userId ? "Taken" : null });
});

app.put("/profile", async (c) => {
  const b = await c.req.json<{ username?: string; name?: string | null; bio?: string | null; avatarId?: string | null }>();
  const u = await profileOf(c);
  if (!u) return c.json({ error: "no profile" }, 404);
  const set: Partial<typeof t.users.$inferInsert> = { updatedAt: now() };
  if (b.username !== undefined) {
    const n = b.username.trim().toLowerCase().replace(/^@/, "");
    if (!USERNAME_RE.test(n) || /^[.]|[.]$|\.\./.test(n)) return c.json({ error: "Username: 3-30 letters, numbers, . or _ (no dot at the start/end)" }, 400);
    const [x] = await db(c).select({ id: t.users.id }).from(t.users).where(eq(t.users.username, n));
    if (x && x.id !== u.id) return c.json({ error: "That username is taken" }, 409);
    set.username = n;
  }
  if (b.name !== undefined) set.name = b.name?.trim().slice(0, 40) || null;
  if (b.bio !== undefined) set.bio = b.bio?.trim().slice(0, 150) || null;
  if (b.avatarId !== undefined) {
    if (b.avatarId) {
      const [ph] = await db(c).select({ id: t.photos.id }).from(t.photos).where(eq(t.photos.id, b.avatarId));
      if (!ph) return c.json({ error: "photo not found" }, 400);
    }
    set.avatarId = b.avatarId || null;
  }
  await db(c).update(t.users).set(set).where(eq(t.users.id, u.id));
  return c.json({ ok: true });
});

/** Change passcode: needs the current one. Other devices are logged out (their cookie no longer matches). */
app.post("/profile/passcode", async (c) => {
  if (c.var.dev) return c.json({ error: "Not in DEV mode" }, 403);
  const b = await c.req.json<{ current?: string; next?: string }>();
  const [u] = await db(c).select().from(t.users).where(eq(t.users.id, c.var.userId));
  if (!u || !(await checkPass(String(b.current ?? ""), u.passHash, c.env))) return c.json({ error: "Current passcode is wrong" }, 401);
  if (!PASS_RE.test(String(b.next ?? ""))) return c.json({ error: "New passcode: 6-12 digits" }, 400);
  const passHash = await hashPass(String(b.next), c.env);
  await db(c).update(t.users).set({ passHash, updatedAt: now() }).where(eq(t.users.id, u.id));
  await reissue(c, u.id, passHash);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- voice → text (Whisper on Workers AI)
// Body = the recorded audio (webm/ogg/mp4/wav). ?lang=auto|ar|en. The prompt is mixed Egyptian Arabic + gym English,
// which nudges Whisper to keep English gym words in English inside Arabic sentences (code-switching).
const MIXED_PROMPT = "تمرين النهارده: bench press 60 kg، 3 sets of 8. الكتف الشمال واجعني شوية في الـ incline. RIR 2, lat pulldown كان heavy. Slept 6 hours, تعبان شوية.";
app.post("/transcribe", async (c) => {
  if (!c.env.AI) return c.json({ error: "Voice-to-text isn't set up on the server." }, 501);
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (buf.byteLength < 800) return c.json({ error: "Recording too short." }, 400);
  if (buf.byteLength > 4_000_000) return c.json({ error: "Recording too long (max ~3 min)." }, 413);
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const lang = c.req.query("lang");
  try {
    const r = (await c.env.AI.run("@cf/openai/whisper-large-v3-turbo", {
      audio: btoa(bin),
      task: "transcribe",
      vad_filter: true,
      initial_prompt: lang === "en" ? "Bench press 60 kg, 3 sets of 8, RIR 2. Left shoulder a bit tight." : MIXED_PROMPT,
      ...(lang === "ar" || lang === "en" ? { language: lang } : {}),
    } as never)) as { text?: string; transcription_info?: { language?: string; duration?: number } };
    let text = (r.text ?? "").replace(/\s+/g, " ").trim();
    if (text && (MIXED_PROMPT.includes(text) || text.includes("الكتف الشمال واجعني شوية في الـ incline"))) text = ""; // Whisper echoing the hint on near-silence
    if (!/[؀-ۿ]/.test(text)) text = text.replace(/،/g, ",").replace(/؟/g, "?"); // English-only: no Arabic punctuation from the prompt
    return c.json({ text, lang: r.transcription_info?.language ?? null, seconds: r.transcription_info?.duration ?? null });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    return c.json({ error: /limit|quota|429|capacity/i.test(msg) ? "Daily free voice limit reached — type or use the keyboard mic." : "Couldn't transcribe — try again or type it." }, 502);
  }
});

// ---------------------------------------------------------------- body, tests, journal

app.get("/body", async (c) => c.json(await db(c).select().from(t.body).orderBy(desc(t.body.date)).limit(120)));
app.put("/body/:date", async (c) => {
  const b = await c.req.json<Partial<typeof t.body.$inferInsert>>();
  const row = { ...b, userId: "", date: c.req.param("date"), updatedAt: now() }; // userId stamped by db()
  const { date: _d, userId: _u, ...upd } = row;
  await db(c).insert(t.body).values(row).onConflictDoUpdate({ target: [t.body.userId, t.body.date], set: upd });
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
  const b = await c.req.json<{ id?: string; date?: string; text?: string; tags?: string | null; mood?: number | null }>();
  if (!b.id || !/^[\w-]{6,64}$/.test(b.id) || !/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "")) return c.json({ error: "bad entry" }, 400);
  const mood = typeof b.mood === "number" && b.mood >= 1 && b.mood <= 5 ? Math.round(b.mood) : null;
  await db(c).insert(t.journal).values({ id: b.id, date: b.date!, text: String(b.text ?? "").slice(0, 10000), tags: b.tags?.slice(0, 200) ?? null, mood, createdAt: now() }).onConflictDoNothing();
  return c.json({ ok: true });
});
app.put("/journal/:id", async (c) => {
  const b = await c.req.json<{ text?: string; tags?: string | null; date?: string; mood?: number | null }>();
  const patch: Partial<typeof t.journal.$inferInsert> = {};
  if (typeof b.text === "string" && b.text.trim()) patch.text = b.text.trim();
  if (b.tags !== undefined) patch.tags = b.tags;
  if (b.date) patch.date = b.date;
  if (b.mood !== undefined) patch.mood = b.mood == null ? null : Math.min(5, Math.max(1, Math.round(b.mood)));
  if (Object.keys(patch).length) await db(c).update(t.journal).set(patch).where(eq(t.journal.id, c.req.param("id")));
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
/** Game-day ids are built from the date ("football-2026-11-12"). The owner keeps that (existing rows); everyone else gets
 *  their user id in it so two people logging a game on the same day never share an id. */
const cardioId = (c: { var: Env["Variables"] }, id: string) =>
  c.var.role !== "owner" && /^football-\d{4}-\d{2}-\d{2}$/.test(id) ? `football-${c.var.userId}-${id.slice(9)}` : id;

app.put("/cardio/:id", async (c) => {
  const b = await c.req.json<Partial<typeof t.cardio.$inferInsert>>();
  if (b.status === "skipped") {
    // a skip is once per day per protocol: ignore repeat taps instead of storing duplicates
    const dup = await db(c).select({ id: t.cardio.id }).from(t.cardio)
      .where(and(eq(t.cardio.date, b.date!), eq(t.cardio.protocol, b.protocol!), eq(t.cardio.status, "skipped"), ne(t.cardio.id, cardioId(c, c.req.param("id"))))).limit(1);
    if (dup.length) return c.json({ ok: true, duplicate: true });
  }
  if (b.minutes != null && (b.minutes < 0 || b.minutes > 300)) return c.json({ error: "minutes 0-300" }, 400);
  const row = { ...b, id: cardioId(c, c.req.param("id")), date: b.date!, protocol: b.protocol!, status: b.status ?? "done", createdAt: b.createdAt ?? now() };
  const { id: _i, ...upd } = row;
  await db(c).insert(t.cardio).values(row).onConflictDoUpdate({ target: t.cardio.id, set: upd });
  return c.json({ ok: true });
});
app.delete("/cardio/:id", async (c) => {
  await db(c).delete(t.cardio).where(eq(t.cardio.id, cardioId(c, c.req.param("id"))));
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
  const [journal, cardio] = await Promise.all([d.select({ date: t.journal.date, mood: t.journal.mood }).from(t.journal), d.select({ date: t.cardio.date, protocol: t.cardio.protocol, status: t.cardio.status }).from(t.cardio)]);
  const creTarget = Number(st[0]?.value ?? 5);
  const a = buildAnalytics({ sessions: sess, sets, body, intake, journal, cardio, creTarget }, today, 1);
  return c.json({
    insights: [...buildInsights(sess, sets, body, intake, creTarget, today), ...analyticsInsights(a)],
    muscles: muscleSets(sess.filter((s) => s.status !== "missed"), sets),
  });
});

/** Dashboard analytics by calendar week (`ws` = weekday the week starts on, 0 = Sun). Formulas: worker/analytics.ts. */
app.get("/analytics", async (c) => {
  const d = db(c);
  const today = c.req.query("today") ?? new Date().toISOString().slice(0, 10);
  const ws = Math.min(6, Math.max(0, Number(c.req.query("ws") ?? 1) || 0));
  const [sessions, sets, body, intake, journal, cardio, st] = await Promise.all([
    d.select().from(t.sessions), d.select().from(t.sets).where(eq(t.sets.deleted, 0)),
    d.select({ date: t.body.date, sleepH: t.body.sleepH }).from(t.body),
    d.select({ date: t.intake.date, amount: t.intake.amount }).from(t.intake).where(eq(t.intake.item, "creatine")),
    d.select({ date: t.journal.date, mood: t.journal.mood }).from(t.journal),
    d.select({ date: t.cardio.date, protocol: t.cardio.protocol, status: t.cardio.status }).from(t.cardio),
    d.select().from(t.settings).where(eq(t.settings.key, "creatineTarget")),
  ]);
  return c.json(buildAnalytics({ sessions, sets, body, intake, journal, cardio, creTarget: Number(st[0]?.value ?? 5) }, today, ws));
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
        // judged against YOUR target range, not just its top: in range at the suggested weight = hit
        const bottom = it.reps == null ? null : Array.isArray(it.reps) ? it.reps[0] : it.reps;
        const step = EXERCISES[it.ex]?.pair ? 2.5 : EXERCISES[it.ex]?.step ?? 2.5;
        const sameW = Math.abs(wDiff) < 0.01;
        const inRange = bottom == null || (avgReps ?? 0) >= bottom - 0.25;
        verdict = wDiff > 0.01 && inRange ? "beat" : sameW && rDiff >= 1 ? "beat" : sameW && (rDiff > -0.5 || inRange) ? "hit"
          : (sameW && (avgReps ?? 0) >= (bottom ?? 0) - 1.5) || (wDiff < 0 && wDiff >= -step - 0.01 && inRange) || (wDiff > 0.01 && !inRange) ? "close" : "missed";
      } else if (EXERCISES[it.ex]?.metric === "time") {
        // holds: judged on seconds (old suggestions without seconds = baseline)
        const secs = work.map((r) => r.seconds ?? 0), avgS = secs.reduce((p, c) => p + c, 0) / (secs.length || 1);
        const goal = sug?.seconds ?? it.seconds ?? null;
        verdict = goal == null || sug?.kind === "start" ? "first" : avgS >= goal + 3 ? "beat" : avgS >= goal - 0.5 ? "hit" : avgS >= goal * 0.85 ? "close" : "missed";
      } else if (sug?.reps != null && avgReps != null && sug.kind !== "start") {
        const all = work.map((r) => r.reps ?? 0), avgAll = all.reduce((p, c) => p + c, 0) / (all.length || 1);
        verdict = avgAll >= sug.reps + 1 ? "beat" : avgAll >= sug.reps - 0.5 ? "hit" : avgAll >= sug.reps - 2 ? "close" : "missed";
      }
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
    d.delete(t.journal), d.delete(t.intake), d.delete(t.settings), d.delete(t.programVersions), d.delete(t.feedback), d.delete(t.cardio), d.delete(t.blocks), d.delete(t.photos),
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
export { ChatRoom } from "./chat";
