// MCP tools: everything an AI coach needs to review ONE user's training and change their plan.
// Reads go through the app's own /api handlers (core.api → same numbers as the app, scoped to this user by db(c)).
// Plan writes create a new version with a why + snapshot (worker/mcp/plan.ts) so every change can be undone.
// Every write is logged as an event "ai_<tool>" with the client label.
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import * as t from "../db/schema";
import { CURRENT, EXERCISES, programVersionId, type Rx } from "../../program";
import { EX_GROUP, GROUPS } from "../../program/groups";
import { EX_MUSCLES, MUSCLE_LABEL, type Muscle } from "../../program/muscles";
import { EQUIP_LABEL, UNAVAILABLE, defaultRx, equipOf, kindOf, type Equip } from "../../program/bank";
import { HISTORY } from "../../program/history";
import { TEMPLATES, avgMinutes, fromTemplate, templateById, type CustomEx, type DItem, type Design } from "../../program/templates";
import { targetLabel } from "../../shared/plan";
import { recommend, type ExHistory } from "../../shared/recommend";
import { shownKg } from "../../shared/load";
import type { AnalyticsData, AppState, DashboardData, HistoryRow, InsightsData, Lifts, ProgressData, SessionBundle } from "../../shared/api";
import { api, logEvent, raw, refreshWho, scoped, today, type Who } from "./core";
import {
  buildProgram, checkRx, cleanCustom, cleanDesign, cleanItem, designFromProgram, isDefault, listVersions, ownProgram, parseProgram,
  restoreVersion, saveVersion, snapshotIfMissing, toRx, validate, type AiProgram, type Bump, type WeekEdits,
} from "./plan";
import { overrideKey, parseOverride, type Override } from "./override";

export class ToolError extends Error {}
type Json = Record<string, unknown>;
type Args = Record<string, unknown>;
export interface ToolResult { summary: string; data: unknown }
export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  run: (w: Who, a: Args) => Promise<ToolResult>;
}

// ---------------------------------------------------------------- small helpers

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (a: Args, k: string, max = 2000) => (typeof a[k] === "string" ? (a[k] as string).trim().slice(0, max) : "");
const numArg = (a: Args, k: string) => (typeof a[k] === "number" && Number.isFinite(a[k]) ? (a[k] as number) : typeof a[k] === "string" && (a[k] as string).trim() !== "" && Number.isFinite(Number(a[k])) ? Number(a[k]) : undefined);
const dateArg = (a: Args, k: string) => { const v = str(a, k, 10); if (v && !DATE.test(v)) throw new ToolError(`${k} must be YYYY-MM-DD`); return v || undefined; };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const inRange = (d: string, from?: string, to?: string) => (!from || d >= from) && (!to || d <= to);
const r1 = (n: number) => Math.round(n * 10) / 10;
const why = (a: Args) => { const s = str(a, "why", 500); if (!s) throw new ToolError("Give a short `why` (one line). It's saved with the change and shown to the user."); return s; };
const exName = (k: string) => EXERCISES[k]?.name ?? k;
const minutesOf = (s: { startedAt: number | null; endedAt: number | null }) => (s.startedAt && s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : null);
const j = <T>(s: string | null | undefined): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };

/** Custom exercises are registered isolate-wide, so only show/accept the ones in THIS user's plan. */
const ownCustom = (w: Who) => new Set(((w.prog as AiProgram).custom ?? []).map((c) => c.key));
const visibleEx = (w: Who) => { const own = ownCustom(w); return Object.values(EXERCISES).filter((e) => !(e as { custom?: boolean }).custom || own.has(e.key)); };

/** Exercise key from a key or a (partial) name. */
export function resolveEx(q: string, w: Who): string {
  const s = q.trim();
  if (!s) throw new ToolError("Name an exercise (key or name; search_exercises lists them).");
  const all = visibleEx(w);
  if (all.some((e) => e.key === s)) return s;
  const low = s.toLowerCase();
  const exact = all.filter((e) => e.name.toLowerCase() === low || e.key.toLowerCase() === low);
  if (exact.length === 1) return exact[0].key;
  const part = all.filter((e) => e.name.toLowerCase().includes(low) || e.key.toLowerCase().includes(low.replace(/\s+/g, "_")));
  if (part.length === 1) return part[0].key;
  if (!part.length) throw new ToolError(`No exercise matches "${s}". Use search_exercises.`);
  throw new ToolError(`"${s}" matches several exercises: ${part.slice(0, 8).map((e) => `${e.key} (${e.name})`).join(", ")}. Use the key.`);
}

const rxOut = (it: Rx) => ({ ex: it.ex, name: exName(it.ex), scheme: targetLabel(it), sets: it.sets, reps: it.reps, seconds: it.seconds, meters: it.meters, rir: it.rir, rest_s: it.rest, tag: it.tag, tech: it.tech, finisher: it.finisher || undefined });
const ditemOut = (it: DItem) => ({ ex: it.ex, name: exName(it.ex), sets: it.sets, reps: it.reps, seconds: it.seconds, meters: it.meters, rir: it.rir, rest: it.rest, tech: it.tech, heavy: it.heavy, fin: it.fin, tag: it.tag });

async function settingsLike(w: Who, prefixes: string[]) {
  const rows = await scoped(w).select().from(t.settings).where(or(...prefixes.map((p) => like(t.settings.key, `${p}%`))));
  return Object.fromEntries(rows.map((r) => [r.key, j<Json>(r.value) ?? r.value]));
}
async function putSetting(w: Who, key: string, value: string) {
  await scoped(w).insert(t.settings).values({ userId: "", key, value }).onConflictDoUpdate({ target: [t.settings.userId, t.settings.key], set: { value } });
}
async function hasActiveWorkout(w: Who) {
  const [s] = await scoped(w).select({ id: t.sessions.id }).from(t.sessions).where(eq(t.sessions.status, "active")).limit(1);
  return !!s;
}
async function myPlans(w: Who) {
  const rows = await raw(w).select().from(t.userPrograms).where(eq(t.userPrograms.userId, w.userId)).orderBy(desc(t.userPrograms.updatedAt));
  return rows.map((r) => ({ id: r.id, name: r.name, version: parseProgram(r.json)?.version ?? "?", active: r.id === w.programId, template: r.template }));
}

const DEFAULT_GUIDE = (w: Who) =>
  `You're on the built-in default plan "${w.prog.name}" (v${w.prog.version}). It's shared app data and can't be edited directly. ` +
  `Call fork_plan with from="current" to make your own editable copy (it becomes active; switching program id starts a new month at Week 1 — all logs, weights and recommendations carry over), then edit that.`;

async function requireUserPlan(w: Who) {
  if (!w.programId || isDefault(w.prog)) throw new ToolError(DEFAULT_GUIDE(w));
  const row = await ownProgram(raw(w), w.userId, w.programId);
  const prog = parseProgram(row?.json);
  if (!row || !prog?.design) throw new ToolError(DEFAULT_GUIDE(w));
  return { row, prog };
}

/** Readable list of what changed between two designs. */
function diffDesign(a: Design | undefined, b: Design): string[] {
  const out: string[] = [];
  const A = new Map((a?.days ?? []).map((d) => [d.key, d]));
  for (const d of b.days) {
    const o = A.get(d.key);
    if (!o) { out.push(`+ day ${d.key} ${d.name} (${d.items.length} exercises)`); continue; }
    if (o.name !== d.name) out.push(`${d.key}: renamed "${o.name}" → "${d.name}"`);
    const fmt = (x: DItem) => `${exName(x.ex)} ${x.sets}×${x.reps === null ? "max" : Array.isArray(x.reps) ? x.reps.join("-") : x.reps ?? (x.seconds ? `${x.seconds}s` : x.meters ? `${x.meters}m` : "")}${x.rir != null ? ` @${x.rir}` : ""} rest ${x.rest}s`;
    const before = o.items.map(fmt), after = d.items.map(fmt);
    if (before.join("|") !== after.join("|")) out.push(`${d.key} ${d.name}: ${before.filter((x) => !after.includes(x)).map((x) => `− ${x}`).concat(after.filter((x) => !before.includes(x)).map((x) => `+ ${x}`)).join("; ") || "order changed"}`);
  }
  for (const d of a?.days ?? []) if (!b.days.some((x) => x.key === d.key)) out.push(`− day ${d.key} ${d.name}`);
  return out;
}

// ---------------------------------------------------------------- list edits (shared by edit_day and customize_next_workout)

type Item = DItem | Rx;
interface Op { op: string; exercise?: unknown; position?: unknown; new_exercise?: unknown; sets?: unknown; reps?: unknown; rir?: unknown; rest?: unknown; tech?: unknown; seconds?: unknown; meters?: unknown; tag?: unknown; heavy?: unknown; finisher?: unknown }

function findIdx(items: Item[], ref: unknown, w: Who): number {
  if (typeof ref === "number" || (typeof ref === "string" && /^\d+$/.test(ref.trim()))) {
    const i = Number(ref) - 1;
    if (i < 0 || i >= items.length) throw new ToolError(`Position ${ref} doesn't exist (1-${items.length}).`);
    return i;
  }
  const key = resolveEx(String(ref ?? ""), w);
  const i = items.findIndex((x) => x.ex === key);
  if (i < 0) throw new ToolError(`${exName(key)} isn't in this day. It has: ${items.map((x, n) => `${n + 1}. ${x.ex}`).join(", ")}`);
  return i;
}

function patchFields(o: Op): Partial<DItem> & { rir?: unknown; finisher?: boolean } {
  const p: Partial<DItem> & { rir?: unknown; finisher?: boolean } = {};
  if (o.sets !== undefined) p.sets = Number(o.sets);
  if (o.reps !== undefined) p.reps = o.reps as DItem["reps"];
  if (o.rir !== undefined) p.rir = o.rir as number | null;
  if (o.rest !== undefined) p.rest = Number(o.rest);
  if (o.tech !== undefined) p.tech = typeof o.tech === "string" ? o.tech : undefined;
  if (o.seconds !== undefined) p.seconds = Number(o.seconds);
  if (o.meters !== undefined) p.meters = Number(o.meters);
  if (o.tag !== undefined) p.tag = typeof o.tag === "string" ? o.tag : undefined;
  if (o.heavy !== undefined) p.heavy = !!o.heavy;
  if (o.finisher !== undefined) { p.fin = !!o.finisher; p.finisher = !!o.finisher; }
  return p;
}

/** Applies add/remove/replace/update/move ops. `mk` turns a loose item into the list's type (DItem for designs, Rx for one week). */
function applyOps<T extends Item>(w: Who, start: T[], ops: Op[], mk: (x: Partial<DItem> & { rir?: unknown; finisher?: boolean }) => T): { items: T[]; log: string[] } {
  const items = [...start];
  const log: string[] = [];
  if (!Array.isArray(ops) || !ops.length) throw new ToolError("Give at least one op.");
  for (const o of ops.slice(0, 30)) {
    const op = String(o?.op ?? "");
    if (op === "add") {
      const key = resolveEx(String(o.new_exercise ?? o.exercise ?? ""), w);
      if (UNAVAILABLE.has(key)) log.push(`note: ${exName(key)} needs equipment this gym may not have`);
      const base = defaultRx(key);
      const it = mk({ ...base, rir: Array.isArray(base.rir) ? base.rir[0] : base.rir, ...patchFields(o), ex: key });
      const pos = numArg(o as unknown as Args, "position");
      const at = pos == null ? items.length : Math.max(0, Math.min(items.length, pos - 1));
      items.splice(at, 0, it);
      log.push(`added ${exName(key)} at ${at + 1}`);
    } else if (op === "remove") {
      const i = findIdx(items, o.exercise ?? o.position, w);
      log.push(`removed ${exName(items[i].ex)}`);
      items.splice(i, 1);
    } else if (op === "replace") {
      const i = findIdx(items, o.exercise ?? o.position, w);
      const key = resolveEx(String(o.new_exercise ?? ""), w);
      const old = items[i];
      const sameMetric = EXERCISES[old.ex]?.metric === EXERCISES[key]?.metric;
      const base = sameMetric ? { ...old } : (() => { const d = defaultRx(key); return { ...d, rir: Array.isArray(d.rir) ? d.rir[0] : d.rir, rest: old.rest }; })();
      items[i] = mk({ ...(base as Partial<DItem>), ...patchFields(o), ex: key });
      log.push(`replaced ${exName(old.ex)} → ${exName(key)}`);
    } else if (op === "update") {
      const i = findIdx(items, o.exercise ?? o.position, w);
      items[i] = mk({ ...(items[i] as Partial<DItem>), ...patchFields(o) });
      log.push(`updated ${exName(items[i].ex)}: ${targetLabel(toRx(items[i] as Partial<DItem>))}, rest ${items[i].rest}s`);
    } else if (op === "move") {
      const i = findIdx(items, o.exercise, w);
      const pos = numArg(o as unknown as Args, "position");
      if (pos == null) throw new ToolError("move needs a position (1-based).");
      const [it] = items.splice(i, 1);
      items.splice(Math.max(0, Math.min(items.length, pos - 1)), 0, it);
      log.push(`moved ${exName(it.ex)} to ${pos}`);
    } else throw new ToolError(`Unknown op "${op}". Use add, remove, replace, update or move.`);
  }
  return { items, log };
}

const OPS_SCHEMA = {
  type: "array",
  description: "Edits in order. exercise = the existing item (exercise key/name or 1-based position). add/replace use new_exercise. Unset fields keep their value (add uses sensible defaults for the exercise).",
  items: {
    type: "object",
    properties: {
      op: { type: "string", enum: ["add", "remove", "replace", "update", "move"] },
      exercise: { type: ["string", "integer"], description: "Existing item: exercise key/name or 1-based position" },
      new_exercise: { type: "string", description: "add/replace: exercise key or name" },
      position: { type: "integer", description: "add/move: 1-based target position" },
      sets: { type: "integer", minimum: 1, maximum: 10 },
      reps: { description: "Number, [min,max] range, \"8-12\", or null = max reps" },
      rir: { type: ["number", "null"], description: "Reps in reserve target 0-5 (null = none, e.g. holds)" },
      rest: { type: "integer", description: "Rest after each set, seconds (0-600)" },
      seconds: { type: "integer" }, meters: { type: "integer" },
      tech: { type: "string", description: "Short coaching note shown with the exercise" },
      tag: { type: "string", description: "Superset label like A1/A2" },
      heavy: { type: "boolean", description: "Big compound: never below RIR 1, no extra set in the overload week" },
      finisher: { type: "boolean" },
    },
    required: ["op"],
  },
};

// ---------------------------------------------------------------- tool definitions

const RO = (title: string) => ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const WR = (title: string, destructive = false, idempotent = false) => ({ title, readOnlyHint: false, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: false });
const obj = (properties: Json, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const RANGE = { from: { type: "string", description: "YYYY-MM-DD (inclusive)" }, to: { type: "string", description: "YYYY-MM-DD (inclusive)" } };
const WHY = { why: { type: "string", description: "One line: why this change (shown to the user in the plan's version history)" } };
const BUMP = { bump: { type: "string", enum: ["patch", "minor"], description: "patch = small tweak (default), minor = bigger change" } };

export const TOOLS: Tool[] = [
  // ============================================================ read
  {
    name: "get_overview", title: "Training overview",
    description: "Start here. Profile, current plan + version, current month (block), next session, this week, streak & adherence, recent PRs, top insights, active AI targets/overrides.",
    inputSchema: obj({}), annotations: RO("Training overview"),
    async run(w) {
      const st = await api<AppState>(w, "GET", "/state");
      const [dash, ins, an, prof] = await Promise.all([
        api<DashboardData & { cardioWeek: unknown }>(w, "GET", `/dashboard?today=${today()}`), api<InsightsData>(w, "GET", `/insights?today=${today()}`),
        api<AnalyticsData>(w, "GET", `/analytics?today=${today()}`), api<Json>(w, "GET", "/profile").catch(() => null),
      ]);
      const ai = Object.fromEntries(Object.entries(st.settings).filter(([k]) => k.startsWith("target:") || k.startsWith("override:")).map(([k, v]) => [k, j(v) ?? v]));
      const data = {
        today: today(),
        profile: prof ? { username: prof.username, name: prof.name, since: (prof.stats as Json)?.since, workouts: (prof.stats as Json)?.workouts, prs: (prof.stats as Json)?.prs } : null,
        plan: { ...st.program, default: !w.programId, editable: !!w.programId },
        month: st.block, weeks: st.weeks,
        next: st.next, active_workout: st.active,
        position: { done: st.slots.filter((s) => s.status === "done").length, skipped: st.slots.filter((s) => s.status === "skipped").length, total: st.slots.length },
        this_week: st.thisWeek, cardio_week: (dash as unknown as { cardioWeek: unknown }).cardioWeek,
        streak: dash.streak, best_streak: dash.bestStreak, adherence_pct: dash.adherence, adherence_4w_pct: an.adherence4w,
        creatine: { today_g: dash.creatine.today, target_g: dash.creatine.target, streak_days: dash.creatine.streak },
        bodyweight_latest: dash.body[dash.body.length - 1] ?? null,
        recent_prs: an.prs.slice(0, 6),
        insights: ins.insights.slice(0, 8),
        schedule: st.settings.schedule ?? null,
        ai_targets_and_overrides: ai,
      };
      const nx = st.next ? `next: W${st.next.week} ${st.next.dayName}` : "plan finished for this month";
      return { summary: `${st.program.name} v${st.program.version} · ${st.block?.name ?? "month"} · ${nx} · streak ${dash.streak} · adherence ${dash.adherence ?? "–"}%`, data };
    },
  },
  {
    name: "list_sessions", title: "List workouts",
    description: "Workouts (done, missed, skipped, abandoned) in a date range, newest first, each with a short summary: sets, volume, minutes, RPE, pain count, exercises, excuse/note.",
    inputSchema: obj({ ...RANGE, status: { type: "string", enum: ["done", "missed", "skipped", "abandoned", "active"] }, limit: { type: "integer", minimum: 1, maximum: 200, description: "Default 30" } }),
    annotations: RO("List workouts"),
    async run(w, a) {
      const from = dateArg(a, "from"), to = dateArg(a, "to");
      const rows = await api<HistoryRow[]>(w, "GET", "/history?limit=1000");
      const list = rows.filter((r) => inRange(r.date, from, to) && (!a.status || r.status === a.status)).slice(0, Math.min(200, numArg(a, "limit") ?? 30));
      const data = list.map((r) => ({
        id: r.id, date: r.date, week: r.week, day: r.dayKey, name: r.dayName, status: r.status, kind: r.kind, minutes: minutesOf(r), rpe: r.rpe,
        sets: r.sets, volume_kg: r.volume, pains: r.pains, excuse: r.excuse, note: r.note, month: r.blockName, version: r.version,
        exercises: (r.exKeys ?? []).map(exName),
      }));
      return { summary: `${data.length} sessions${from || to ? ` (${from ?? "…"} → ${to ?? "…"})` : ""}`, data };
    },
  },
  {
    name: "get_session", title: "Workout details",
    description: "One workout in full: every set (kg as shown in the app — per hand for dumbbell pairs — reps, RIR, rest taken, set kind, notes, pain, strict form, PR) next to the app's suggested weight/reps, the planned target, per-exercise feedback (effort/joints), readiness and RPE. id = a session id or \"latest\".",
    inputSchema: obj({ id: { type: "string", description: "Session id, or \"latest\" for the last finished workout" } }, ["id"]),
    annotations: RO("Workout details"),
    async run(w, a) {
      let id = str(a, "id", 80);
      if (!id || id === "latest") {
        const rows = await api<HistoryRow[]>(w, "GET", "/history?limit=50");
        id = rows.find((r) => r.status === "done" || r.status === "abandoned")?.id ?? "";
        if (!id) throw new ToolError("No finished workouts yet.");
      }
      const b = await api<SessionBundle>(w, "GET", `/sessions/${encodeURIComponent(id)}`).catch(() => { throw new ToolError(`No session ${id} (list_sessions shows ids).`); });
      const s = b.session;
      const KIND: Record<string, string> = { N: "normal", W: "warm-up", D: "drop", F: "failure", R: "rest-pause" };
      const setOut = (x: SessionBundle["sets"][number]) => ({
        n: x.setNo, kind: KIND[x.kind] ?? x.kind, kg: shownKg(x), reps: x.reps, seconds: x.seconds, meters: x.meters, assist: x.assist, rir: x.rir,
        rest_before_s: x.restBeforeS, strict: x.strict == null ? undefined : x.strict === 1, pr: x.pr ? true : undefined, note: x.note ?? undefined,
        pain: x.painArea ? `${x.painArea} (${["", "mild", "moderate", "sharp"][x.painLevel ?? 1]})` : undefined,
        suggested: j(x.suggested ?? null) ?? undefined, equip: x.equip ?? undefined, swapped_from: x.swappedFrom ?? undefined,
      });
      const items = s.plan.map((it, i) => ({
        idx: i + 1, ex: it.ex, name: it.name, target: targetLabel(it), rest_s: it.rest, tech: it.tech, skipped: it.skipped || undefined,
        swapped_from: it.swappedFrom ? exName(it.swappedFrom) : undefined, swap_reason: it.swapReason,
        feedback: b.feedback[`${s.id}:${i}`] ?? undefined,
        previous: b.last[it.ex] ? { date: b.last[it.ex].date, sets: b.last[it.ex].sets.filter((x) => x.kind !== "W").map((x) => `${shownKg(x) ?? "BW"}×${x.reps ?? x.seconds ?? "–"}${x.rir != null ? ` @${x.rir}` : ""}`) } : undefined,
        sets: b.sets.filter((x) => x.itemIdx === i).map(setOut),
      }));
      const extra = b.sets.filter((x) => x.itemIdx >= s.plan.length).map((x) => ({ ex: x.exKey, name: exName(x.exKey), ...setOut(x) }));
      const work = b.sets.filter((x) => x.kind !== "W");
      const data = {
        id: s.id, date: s.date, week: s.week, day: s.dayKey, name: s.dayName, status: s.status, kind: s.kind, version: s.programVersionId,
        minutes: minutesOf(s), rpe: s.rpe, readiness: s.readiness, bodyweight: s.bodyweight, excuse: s.excuse, note: s.note,
        exercises: items, ...(extra.length ? { extra_sets: extra } : {}),
      };
      return { summary: `${s.date} W${s.week} ${s.dayName} · ${s.status} · ${work.length} work sets · ${minutesOf(s) ?? "?"} min · RPE ${s.rpe ?? "–"}`, data };
    },
  },
  {
    name: "get_exercise_history", title: "Exercise history",
    description: "One exercise over time: every session's sets, estimated max (e1RM, Epley) trend, all-time best, the app's last suggestion vs what was done, and the app's NEXT recommendation (plus any AI target that overrides it).",
    inputSchema: obj({ exercise: { type: "string", description: "Exercise key or name" }, limit: { type: "integer", description: "Sessions, newest first (default 15, max 60)" } }, ["exercise"]),
    annotations: RO("Exercise history"),
    async run(w, a) {
      const ex = resolveEx(str(a, "exercise", 80), w);
      const d = scoped(w);
      const rows = await d.select({ s: t.sets, date: t.sessions.date, week: t.sessions.week, day: t.sessions.dayName, status: t.sessions.status })
        .from(t.sets).innerJoin(t.sessions, eq(t.sets.sessionId, t.sessions.id))
        .where(and(eq(t.sets.exKey, ex), eq(t.sets.deleted, 0), inArray(t.sessions.status, ["done", "abandoned", "active"])))
        .orderBy(desc(t.sets.doneAt)).limit(1500);
      const by = new Map<string, { date: string; week: number; day: string; sets: typeof rows }>();
      for (const r of rows) { const g = by.get(r.s.sessionId) ?? { date: r.date, week: r.week, day: r.day, sets: [] }; g.sets.push(r); by.set(r.s.sessionId, g); }
      const fbs = by.size ? await d.select().from(t.feedback).where(and(eq(t.feedback.exKey, ex), inArray(t.feedback.sessionId, [...by.keys()].slice(0, 90)))) : [];
      const sessions = [...by.entries()].slice(0, Math.min(60, numArg(a, "limit") ?? 15)).map(([sid, g]) => {
        const sets = [...g.sets].reverse();
        const e1 = Math.max(0, ...sets.filter((x) => (x.s.kind === "N" || x.s.kind === "F") && x.s.strict !== 0 && x.s.reps && x.s.reps <= 12).map((x) => { const kg = shownKg(x.s); return kg ? kg * (1 + x.s.reps! / 30) : 0; }));
        const fb = fbs.find((f) => f.sessionId === sid);
        return {
          session: sid, date: g.date, week: g.week, day: g.day, e1rm: e1 ? r1(e1) : null,
          sets: sets.map((x) => `${x.s.kind !== "N" ? `${x.s.kind}:` : ""}${shownKg(x.s) ?? "BW"}×${x.s.reps ?? (x.s.seconds ? `${x.s.seconds}s` : "–")}${x.s.rir != null ? ` @${x.s.rir}` : ""}${x.s.painLevel ? ` pain:${x.s.painArea}${x.s.painLevel}` : ""}${x.s.strict === 0 ? " (cheated)" : ""}`),
          suggested: j(sets.find((x) => x.s.kind === "N" || x.s.kind === "F")?.s.suggested ?? null),
          feedback: fb ? { effort: fb.effort, joints: fb.joints } : undefined,
          notes: sets.filter((x) => x.s.note).map((x) => x.s.note),
        };
      });
      // the next time it's planned (or its first place in the plan), and the app's recommendation for it
      const st = await api<AppState>(w, "GET", "/state");
      const lifts = await api<Lifts>(w, "GET", "/lifts");
      const order = st.slots.filter((s) => s.status === "open");
      let rx: Rx | undefined, where: string | undefined, deload = false;
      for (const s of [...order, ...st.slots]) {
        const wk = w.prog.weeks.find((x) => x.n === s.week);
        const it = wk?.days.find((x) => x.key === s.dayKey)?.items.find((x) => x.ex === ex);
        if (it) { rx = it; where = `W${s.week} ${s.dayName}`; deload = /deload/i.test(wk!.name); break; }
      }
      const rec = recommend(ex, rx ?? defaultRx(ex), lifts.hist as Record<string, ExHistory>, { deload, step: EXERCISES[ex]?.step });
      const tgt = (await settingsLike(w, [`target:${ex}`]))[`target:${ex}`] ?? null;
      const best = lifts.best[ex];
      const data = {
        ex, name: exName(ex), metric: EXERCISES[ex]?.metric, unit: EXERCISES[ex]?.pair ? "kg per hand (dumbbell pair)" : "kg as shown in the app",
        best: best ? { e1rm: best.e1rm, top_kg: best.weightKg, top_reps: best.reps, top_seconds: best.seconds, set: best.setKg != null ? `${best.setKg}×${best.setReps}` : null, on: best.at, first: best.start, first_date: best.startDate, sessions: best.sessions } : null,
        next_planned: where ? { where, target: rx ? targetLabel(rx) : null } : "not in the current plan",
        app_recommendation: rec, ai_target: tgt,
        sessions,
      };
      return { summary: `${exName(ex)} · ${by.size} sessions · best e1RM ${best?.e1rm || "–"} · next: ${rec.weightKg ?? "?"} kg × ${rec.reps ?? rec.seconds ?? "?"} (${rec.kind})${tgt ? " · AI target set" : ""}`, data };
    },
  },
  {
    name: "get_progress", title: "Progress & volume",
    description: "Strength trends (e1RM per lift with 4-week change), hard sets per muscle group per calendar week (fractional: primary 1, secondary ½), weekly sessions/missed/tonnage/minutes, RIR mix, adherence, 'what goes with good workouts' associations, excuses and recent pain flags.",
    inputSchema: obj({ weeks: { type: "integer", minimum: 1, maximum: 12, description: "Calendar weeks to return (default 8)" }, week_start: { type: "integer", minimum: 0, maximum: 6, description: "Weekday weeks start on, 0 = Sunday (default 6 = Saturday, the Egypt weekend)" } }),
    annotations: RO("Progress & volume"),
    async run(w, a) {
      const n = Math.min(12, numArg(a, "weeks") ?? 8);
      const ws = numArg(a, "week_start") ?? 6;
      const [an, pr, ins] = await Promise.all([api<AnalyticsData>(w, "GET", `/analytics?today=${today()}&ws=${ws}`), api<ProgressData>(w, "GET", "/progress"), api<InsightsData>(w, "GET", `/insights?today=${today()}`)]);
      const data = {
        weeks: an.weeks.slice(-n),
        hard_sets_per_muscle: an.muscles.weeks.slice(-n).map((x) => ({ start: x.start, sets: Object.fromEntries(Object.entries(x.sets).filter(([, v]) => v > 0).map(([k, v]) => [k, r1(v)])) })),
        small_groups_note: `Small groups (${an.muscles.small.join(", ")}) need fewer direct sets; 10-20/week is the target for the others.`,
        lifts: an.lifts.slice(0, 20).map((l) => ({ ex: l.exKey, name: l.name, e1rm: l.e1rm, best: l.best, change_4w_pct: l.change4w, sessions: l.sessions, last: l.last, recent: l.points.slice(-6) })),
        effort_rir_mix: { counts_rir0_to_5plus: an.effort.rir, logged: an.effort.logged, work_sets: an.effort.total },
        adherence_4w_pct: an.adherence4w,
        associations: an.links.filter((l) => l.clear).slice(0, 6),
        plan_week_muscles: ins.muscles.weeks.slice(-4),
        excuses: pr.excuses, recent_pain: pr.pains.slice(0, 15),
      };
      const last = an.weeks[an.weeks.length - 1];
      return { summary: `${n} weeks · this week ${last?.sessions ?? 0} sessions, ${last?.hardSets ?? 0} hard sets · adherence 4w ${an.adherence4w ?? "–"}% · ${an.lifts.length} lifts tracked`, data };
    },
  },
  {
    name: "get_body_and_habits", title: "Body & habits",
    description: "Daily body logs (weight, waist, sleep, protein, steps, water, energy, note) and creatine grams per day. Default: last 30 days.",
    inputSchema: obj(RANGE), annotations: RO("Body & habits"),
    async run(w, a) {
      const to = dateArg(a, "to") ?? today(), from = dateArg(a, "from") ?? addDays(to, -29);
      const [body, cre] = await Promise.all([api<Json[]>(w, "GET", "/body"), api<{ date: string; amount: number }[]>(w, "GET", `/intake?item=creatine&since=${from}`)]);
      const days = body.filter((b) => inRange(String(b.date), from, to)).map(({ userId: _u, updatedAt: _t, ...b }) => b);
      const creatine: Record<string, number> = {};
      for (const x of cre) if (inRange(x.date, from, to)) creatine[x.date] = r1((creatine[x.date] ?? 0) + x.amount);
      const ws = days.map((d) => d.weightKg as number | null).filter((x): x is number => x != null);
      return { summary: `${days.length} body logs ${from} → ${to}${ws.length ? ` · weight ${ws[ws.length - 1]} → ${ws[0]} kg` : ""} · creatine on ${Object.keys(creatine).length} days`, data: { from, to, days, creatine_g_per_day: creatine } };
    },
  },
  {
    name: "get_cardio", title: "Cardio",
    description: "Cardio sessions (treadmill protocols, football games): minutes, distance, kcal, RPE, speed adjustment, notes. Default: last 60 days.",
    inputSchema: obj(RANGE), annotations: RO("Cardio"),
    async run(w, a) {
      const to = dateArg(a, "to") ?? today(), from = dateArg(a, "from") ?? addDays(to, -59);
      const rows = (await api<Json[]>(w, "GET", "/cardio")).filter((x) => inRange(String(x.date), from, to)).map(({ userId: _u, ...x }) => x);
      return { summary: `${rows.length} cardio entries ${from} → ${to}`, data: rows };
    },
  },
  {
    name: "get_tests", title: "Fitness tests",
    description: "Fitness test results over time (pull-ups, dead hang, plank, push-ups …) and the tests this plan defines.",
    inputSchema: obj({}), annotations: RO("Fitness tests"),
    async run(w) {
      const rows = (await api<Json[]>(w, "GET", "/tests")).map(({ userId: _u, createdAt: _c, ...x }) => x);
      return { summary: `${rows.length} test results`, data: { defined: w.prog.tests, results: rows } };
    },
  },
  {
    name: "get_journal", title: "Journal",
    description: "The user's own journal (life context, how training felt) with mood 1-5 and tags. include_notes=true also returns set/workout/cardio/body notes. Private data: use it to understand bad weeks, never to judge.",
    inputSchema: obj({ ...RANGE, tag: { type: "string" }, include_notes: { type: "boolean" }, limit: { type: "integer", description: "Default 50" } }),
    annotations: RO("Journal"),
    async run(w, a) {
      const from = dateArg(a, "from"), to = dateArg(a, "to"), tag = str(a, "tag", 40).toLowerCase();
      const lim = Math.min(300, numArg(a, "limit") ?? 50);
      if (a.include_notes) {
        const notes = (await api<Json[]>(w, "GET", "/notes")).filter((n) => inRange(String(n.date), from, to) && (!tag || String(n.tag ?? "").toLowerCase().includes(tag))).slice(0, lim).map(({ photos: _p, link: _l, ...n }) => n);
        return { summary: `${notes.length} notes`, data: notes };
      }
      const rows = (await api<Json[]>(w, "GET", "/journal")).filter((x) => inRange(String(x.date), from, to) && (!tag || String(x.tags ?? "").toLowerCase().includes(tag))).slice(0, lim)
        .map((x) => ({ id: x.id, date: x.date, mood: x.mood, tags: x.tags, text: x.text }));
      return { summary: `${rows.length} journal entries`, data: rows };
    },
  },
  {
    name: "get_months", title: "Months (blocks)",
    description: "Training months (blocks): dates, plan version at the start, goal, notes, the written month review, and stats (adherence, sets, volume, PRs, pains, bodyweight start→end, top lifts start→best). Pass id for one month with its sessions.",
    inputSchema: obj({ id: { type: "string" } }), annotations: RO("Months"),
    async run(w, a) {
      const id = str(a, "id", 80);
      if (id) {
        const b = await api<Json>(w, "GET", `/blocks/${encodeURIComponent(id)}`).catch(() => { throw new ToolError(`No month ${id}.`); });
        const { userId: _u, live: _l, ...rest } = b;
        return { summary: `${b.name} · ${b.status}`, data: rest };
      }
      const rows = await api<Json[]>(w, "GET", "/blocks");
      const data = rows.map(({ userId: _u, ...b }) => b);
      return { summary: `${rows.length} months · current: ${rows.find((b) => b.status === "active")?.name ?? "–"}`, data };
    },
  },
  {
    name: "get_plan", title: "Current plan",
    description: "The plan this user trains: id, version, why (changelog), rules, schedules, the editable one-week design (user plans), every week (W1 ramp-in, W2 build, W3 overload, W4 deload) with each day's exercises, one-week edits, custom exercises, saved plans, and active AI targets / next-workout overrides.",
    inputSchema: obj({ week: { type: "integer", description: "Only this week (1-4)" } }), annotations: RO("Current plan"),
    async run(w, a) {
      const p = w.prog as AiProgram;
      const wk = numArg(a, "week");
      const data = {
        id: p.id, version: p.version, version_id: programVersionId(p), name: p.name, why: p.changelog, default_plan: !w.programId, editable: !!w.programId && !!p.design,
        rules: p.rules, order: p.order, schedules: p.schedules,
        design: p.design ? { note: "The editable week (= Week 2). Weeks 1/3/4 are generated from it.", days: p.design.days.map((d) => ({ key: d.key, name: d.name, focus: d.focus, items: d.items.map(ditemOut) })) } : undefined,
        weeks: p.weeks.filter((x) => !wk || x.n === wk).map((x) => ({ n: x.n, name: x.name, brief: x.brief, days: x.days.map((d) => ({ key: d.key, name: d.name, focus: d.focus, items: d.items.map(rxOut) })), extras: x.extras?.map((d) => ({ key: d.key, name: d.name, items: d.items.map(rxOut) })) })),
        week_edits: p.weekEdits, custom_exercises: p.custom,
        my_plans: await myPlans(w),
        ai_targets_and_overrides: await settingsLike(w, ["target:", "override:"]),
      };
      return { summary: `${p.name} v${p.version} · ${p.order.length} days/week · ${w.programId ? "your own plan (editable)" : "built-in default plan (fork_plan to edit)"}`, data };
    },
  },
  {
    name: "list_plan_versions", title: "Plan versions",
    description: "Version history of the current plan: version, date, why, who changed it (you / the AI app). Any older version of a user plan can be restored with undo_plan_version.",
    inputSchema: obj({}), annotations: RO("Plan versions"),
    async run(w) {
      if (!w.programId) {
        const h = HISTORY.filter((x) => x.id.startsWith(`${w.prog.id}@`)).slice(0, 15).map((x) => ({ version: x.version, date: x.date, title: x.title, why: x.why, changes: x.changes }));
        return { summary: `Built-in plan ${w.prog.name}: ${h.length} versions (read-only; fork_plan to make your own)`, data: { default_plan: true, versions: h } };
      }
      const row = await ownProgram(raw(w), w.userId, w.programId);
      if (!row) throw new ToolError("Plan not found.");
      const v = await listVersions(raw(w), row);
      return { summary: `${row.name}: ${v.length} versions, current v${v.find((x) => x.current)?.version}`, data: { program_id: row.id, versions: v.map(({ id: _i, at: _a, ...x }) => x) } };
    },
  },
  {
    name: "search_exercises", title: "Search exercises",
    description: "Exercise library + the user's custom exercises. Filter by text, muscle group, muscle or equipment. Returns keys to use in plan edits, with a sensible default prescription.",
    inputSchema: obj({
      query: { type: "string" }, group: { type: "string", enum: [...GROUPS] }, muscle: { type: "string", enum: Object.keys(MUSCLE_LABEL) },
      equipment: { type: "string", enum: Object.keys(EQUIP_LABEL) }, limit: { type: "integer", description: "Default 25, max 100" },
    }),
    annotations: RO("Search exercises"),
    async run(w, a) {
      const q = str(a, "query", 60).toLowerCase(), g = str(a, "group", 40), m = str(a, "muscle", 40), eq2 = str(a, "equipment", 20) as Equip | "";
      const list = visibleEx(w).filter((e) => {
        if (q && !(e.name.toLowerCase().includes(q) || e.key.includes(q.replace(/\s+/g, "_")) || e.muscles.toLowerCase().includes(q))) return false;
        if (g && EX_GROUP[e.key] !== g) return false;
        if (m && !(EX_MUSCLES[e.key]?.p ?? []).includes(m as Muscle) && !(EX_MUSCLES[e.key]?.s ?? []).includes(m as Muscle)) return false;
        if (eq2 && equipOf(e.key) !== eq2) return false;
        return true;
      }).slice(0, Math.min(100, numArg(a, "limit") ?? 25));
      const data = list.map((e) => ({
        key: e.key, name: e.name, metric: e.metric, group: EX_GROUP[e.key], equipment: equipOf(e.key), kind: kindOf(e.key), muscles: e.muscles,
        per_side: e.perSide || undefined, dumbbell_pair: e.pair || undefined, custom: (e as { custom?: boolean }).custom || undefined,
        unavailable_in_owner_gym: UNAVAILABLE.has(e.key) || undefined, default: targetLabel(defaultRx(e.key)), alts: e.alts,
      }));
      return { summary: `${data.length} exercises`, data };
    },
  },
  {
    name: "list_templates", title: "Plan templates",
    description: "Built-in plan templates (2-6 days: full body, upper/lower, PPL, PHUL, bro split …) with who they suit and why. Pass id for the full one-week design.",
    inputSchema: obj({ id: { type: "string" } }), annotations: RO("Plan templates"),
    async run(_w, a) {
      const id = str(a, "id", 40);
      if (id) {
        const x = templateById(id);
        if (!x) throw new ToolError(`No template ${id}. Templates: ${TEMPLATES.map((t2) => t2.meta.id).join(", ")}`);
        return { summary: `${x.meta.name} · ${x.meta.days} days`, data: { meta: x.meta, minutes: avgMinutes(x.design), design: x.design.days.map((d) => ({ key: d.key, name: d.name, focus: d.focus, items: d.items.map(ditemOut) })) } };
      }
      return { summary: `${TEMPLATES.length} templates`, data: TEMPLATES.map((x) => ({ ...x.meta, minutes: avgMinutes(x.design), day_names: x.design.days.map((d) => d.name) })) };
    },
  },

  // ============================================================ write: plan
  {
    name: "update_plan", title: "Update plan",
    description: "Save a new version of the user's own plan: replace the one-week design (Week 2; Weeks 1/3/4 are generated from it: ramp-in, overload, deload), rename it, set rules, or custom exercises. Validated; same program id so the month continues. Refused on the built-in default plan (fork_plan first). For small edits prefer edit_day.",
    inputSchema: obj({
      ...WHY, ...BUMP, name: { type: "string" },
      design: { type: "object", description: "{days:[{key:\"D1\",name,focus,items:[{ex,sets,reps,rir,rest,tech?,heavy?,fin?,tag?,seconds?,meters?}]}]} — the full week; get_plan shows the current one" },
      rules: { type: "array", items: { type: "string" } },
      custom: { type: "array", description: "Full list of custom exercises (see add_custom_exercise for the fields)", items: { type: "object" } },
    }, ["why"]),
    annotations: WR("Update plan"),
    async run(w, a) {
      const reason = why(a);
      const { row, prog } = await requireUserPlan(w);
      if (a.design === undefined && a.name === undefined && a.rules === undefined && a.custom === undefined) throw new ToolError("Nothing to change: pass design, name, rules or custom.");
      const design = a.design === undefined ? prog.design : cleanDesign(a.design);
      const custom = a.custom === undefined ? prog.custom ?? [] : cleanCustom(a.custom, w.userId);
      const rules = Array.isArray(a.rules) ? (a.rules as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 300)).slice(0, 20) : prog.rules;
      const res = await saveVersion(raw(w), w.userId, row, { name: str(a, "name", 60) || prog.name, design, custom, rules, weekEdits: prog.weekEdits }, reason, (a.bump === "minor" ? "minor" : "patch") as Bump, { by: "ai", client: w.label });
      if (!res.ok) throw new ToolError(`Not saved:\n- ${res.errors.slice(0, 12).join("\n- ")}`);
      const changes = diffDesign(prog.design, res.program.design);
      await logEvent(w, "update_plan", { program: row.id, from: res.from, to: res.program.version, why: reason, changes: changes.slice(0, 20) });
      return { summary: `Saved ${res.program.name} v${res.from} → v${res.program.version}. Undo with undo_plan_version.`, data: { program_id: row.id, version: res.program.version, previous: res.from, changes } };
    },
  },
  {
    name: "edit_day", title: "Edit a training day",
    description: "Add / remove / replace / update / reorder exercises (sets, reps, RIR, rest, notes) in one day of the user's own plan, and rename it. Without `week` it changes the day in every week (the 4-week wave is regenerated). With `week` (1-4) it changes only that week's version of the day. Creates a new plan version (undo-able). For one workout only, use customize_next_workout.",
    inputSchema: obj({
      day: { type: "string", description: "Day key (D1) or name (Push)" }, week: { type: "integer", minimum: 1, maximum: 4 },
      ops: OPS_SCHEMA, rename: { type: "string" }, focus: { type: "string" }, ...WHY, ...BUMP,
    }, ["day", "why"]),
    annotations: WR("Edit a training day"),
    async run(w, a) {
      const reason = why(a);
      const { row, prog } = await requireUserPlan(w);
      const q = str(a, "day", 40).toLowerCase();
      const day = prog.design.days.find((d) => d.key.toLowerCase() === q) ?? prog.design.days.find((d) => d.name.toLowerCase() === q) ?? prog.design.days.find((d) => d.name.toLowerCase().includes(q));
      if (!day) throw new ToolError(`No day "${a.day}". Days: ${prog.design.days.map((d) => `${d.key} ${d.name}`).join(", ")}`);
      const week = numArg(a, "week");
      const design: Design = JSON.parse(JSON.stringify(prog.design));
      const dd = design.days.find((d) => d.key === day.key)!;
      if (str(a, "rename", 40)) dd.name = str(a, "rename", 40);
      if (str(a, "focus", 80)) dd.focus = str(a, "focus", 80);
      let log: string[] = [];
      const weekEdits: WeekEdits = JSON.parse(JSON.stringify(prog.weekEdits ?? {}));
      if (Array.isArray(a.ops) && a.ops.length) {
        if (week) {
          const cur = prog.weeks.find((x) => x.n === week)?.days.find((d) => d.key === day.key)?.items ?? [];
          const r = applyOps<Rx>(w, cur, a.ops as Op[], (x) => toRx(x));
          (weekEdits[String(week)] ??= {})[day.key] = r.items;
          log = r.log.map((l) => `W${week}: ${l}`);
        } else {
          const r = applyOps<DItem>(w, dd.items, a.ops as Op[], (x) => cleanItem(x as Partial<DItem>));
          dd.items = r.items;
          log = r.log;
          // a whole-plan change to this day supersedes older one-week edits of it
          for (const wk of Object.values(weekEdits)) delete wk[day.key];
        }
      } else if (!str(a, "rename", 40) && !str(a, "focus", 80)) throw new ToolError("Nothing to change: pass ops, rename or focus.");
      const res = await saveVersion(raw(w), w.userId, row, { name: prog.name, design, custom: prog.custom ?? [], rules: prog.rules, weekEdits }, reason, (a.bump === "minor" ? "minor" : "patch") as Bump, { by: "ai", client: w.label });
      if (!res.ok) throw new ToolError(`Not saved:\n- ${res.errors.slice(0, 12).join("\n- ")}`);
      await logEvent(w, "edit_day", { program: row.id, day: day.key, week: week ?? null, from: res.from, to: res.program.version, why: reason, changes: log });
      const shown = res.program.weeks.find((x) => x.n === (week ?? 2))?.days.find((d) => d.key === day.key);
      return { summary: `${dd.name}${week ? ` (week ${week} only)` : ""}: ${log.join("; ") || "renamed"} · v${res.from} → v${res.program.version}`, data: { version: res.program.version, previous: res.from, changes: log, day: shown ? { key: shown.key, name: shown.name, week: week ?? 2, items: shown.items.map(rxOut) } : null } };
    },
  },
  {
    name: "fork_plan", title: "Make my own plan",
    description: "Create the user's own editable plan and (by default) switch to it. from: \"current\" (copy the plan they train now — for the built-in default plan its Week 2 becomes the editable week and the standard 4-week wave is generated), \"default\" (the built-in plan), or a template id (list_templates). Switching program id starts a new month at Week 1; all logs, weights and recommendations stay (they follow the exercise).",
    inputSchema: obj({ from: { type: "string", description: "\"current\", \"default\" or a template id" }, name: { type: "string" }, activate: { type: "boolean", description: "Default true" }, ...WHY }, ["from", "why"]),
    annotations: WR("Make my own plan"),
    async run(w, a) {
      const reason = why(a);
      const from = str(a, "from", 40) || "current";
      const id = `up-${crypto.randomUUID().slice(0, 12)}`;
      let prog: AiProgram;
      const stub = (src: { rules: string[]; tests: AiProgram["tests"]; template?: string | null }) => ({ id, version: "1.0.0", rules: src.rules, tests: src.tests, template: src.template ?? null }) as AiProgram;
      let note = "";
      if (from === "current" && w.programId && !isDefault(w.prog)) {
        const src = w.prog as AiProgram;
        prog = buildProgram(stub(src), { name: str(a, "name", 60) || `${src.name} (copy)`.slice(0, 60), design: src.design, custom: cleanCustom(src.custom, w.userId), rules: src.rules, weekEdits: src.weekEdits }, "1.0.0", reason);
      } else if (from === "current" || from === "default") {
        prog = buildProgram(stub({ rules: CURRENT.rules, tests: CURRENT.tests, template: null }), { name: str(a, "name", 60) || `${CURRENT.name} (mine)`.slice(0, 60), design: designFromProgram(CURRENT), custom: [], rules: CURRENT.rules }, "1.0.0", reason);
        note = `Built from Week 2 of ${CURRENT.name} v${CURRENT.version}; weeks 1/3/4 now follow the standard wave (ramp-in −1 set, overload +1 set, deload half sets).${CURRENT.weeks.some((x) => x.extras?.length) ? " Optional extra sessions of the built-in plan are not part of the copy." : ""}`;
      } else {
        const tpl = templateById(from);
        if (!tpl) throw new ToolError(`Unknown source "${from}". Use "current", "default" or a template id: ${TEMPLATES.map((x) => x.meta.id).join(", ")}`);
        prog = { ...fromTemplate(tpl, id, str(a, "name", 60)), changelog: reason };
      }
      const errs = validate(prog);
      if (errs.length) throw new ToolError(`Couldn't build the plan:\n- ${errs.slice(0, 10).join("\n- ")}`);
      const d = raw(w);
      const at = Date.now();
      await d.insert(t.userPrograms).values({ id, userId: w.userId, name: prog.name, template: prog.template ?? null, json: JSON.stringify(prog), createdAt: at, updatedAt: at });
      await snapshotIfMissing(d, prog, { why: reason, by: "ai", client: w.label, at });
      let active = a.activate !== false;
      if (active && (await hasActiveWorkout(w))) { active = false; note += " Not activated: a workout is in progress — finish it, then call switch_plan."; }
      if (active) await d.update(t.users).set({ programId: id, updatedAt: at }).where(eq(t.users.id, w.userId));
      await logEvent(w, "fork_plan", { from, program: id, activated: active, why: reason });
      return { summary: `Created "${prog.name}" (${id}) v1.0.0${active ? " and switched to it: a new month starts at Week 1, all logs and weights carry over" : ""}.${note ? ` ${note}` : ""}`, data: { program_id: id, name: prog.name, active, note: note.trim() || undefined, days: prog.design.days.map((x) => `${x.key} ${x.name}`) } };
    },
  },
  {
    name: "switch_plan", title: "Switch plan",
    description: "Train another of the user's saved plans (get_plan → my_plans). A different program id starts a new month at Week 1; old logs stay. Refused while a workout is in progress.",
    inputSchema: obj({ program_id: { type: "string" }, ...WHY }, ["program_id", "why"]),
    annotations: WR("Switch plan", false, true),
    async run(w, a) {
      const reason = why(a);
      const row = await ownProgram(raw(w), w.userId, str(a, "program_id", 80));
      if (!row) throw new ToolError(`Not one of your plans. Yours: ${(await myPlans(w)).map((p) => `${p.id} (${p.name})`).join(", ") || "none"}`);
      if (await hasActiveWorkout(w)) throw new ToolError("A workout is in progress. Finish or discard it first.");
      await raw(w).update(t.users).set({ programId: row.id, updatedAt: Date.now() }).where(eq(t.users.id, w.userId));
      await logEvent(w, "switch_plan", { program: row.id, why: reason });
      return { summary: `Now training "${row.name}". A new month starts at Week 1.`, data: { program_id: row.id } };
    },
  },
  {
    name: "use_default_plan", title: "Back to the default plan",
    description: "Switch back to the built-in default plan. Saved plans are kept. A new month starts at Week 1.",
    inputSchema: obj({ ...WHY }, ["why"]), annotations: WR("Back to the default plan", false, true),
    async run(w, a) {
      const reason = why(a);
      if (!w.programId) return { summary: "Already on the default plan.", data: { program_id: null } };
      if (await hasActiveWorkout(w)) throw new ToolError("A workout is in progress. Finish or discard it first.");
      await raw(w).update(t.users).set({ programId: null, updatedAt: Date.now() }).where(eq(t.users.id, w.userId));
      await logEvent(w, "use_default_plan", { from: w.programId, why: reason });
      return { summary: `Back on ${CURRENT.name} v${CURRENT.version}. A new month starts at Week 1.`, data: { program_id: null } };
    },
  },
  {
    name: "add_custom_exercise", title: "Add a custom exercise",
    description: "Add an exercise the library doesn't have to the user's own plan (it never touches the shared library). Returns its key for edit_day / update_plan. New plan version.",
    inputSchema: obj({
      name: { type: "string" }, metric: { type: "string", enum: ["weight_reps", "reps", "assist_reps", "time", "distance"] },
      group: { type: "string", enum: [...GROUPS] }, primary: { type: "array", items: { type: "string", enum: Object.keys(MUSCLE_LABEL) } },
      secondary: { type: "array", items: { type: "string", enum: Object.keys(MUSCLE_LABEL) } }, cues: { type: "array", items: { type: "string" } },
      per_side: { type: "boolean" }, ...WHY,
    }, ["name", "group", "primary", "why"]),
    annotations: WR("Add a custom exercise"),
    async run(w, a) {
      const reason = why(a);
      const { row, prog } = await requireUserPlan(w);
      const name = str(a, "name", 60);
      if (!name) throw new ToolError("Give the exercise a name.");
      const lib = visibleEx(w).find((e) => e.name.toLowerCase() === name.toLowerCase());
      if (lib) throw new ToolError(`${(lib as { custom?: boolean }).custom ? "Your plan" : "The library"} already has ${lib.name} (key ${lib.key}). Use that key.`);
      const custom = cleanCustom([...(prog.custom ?? []), { name, metric: a.metric, group: a.group, p: a.primary, s: a.secondary, cues: a.cues, perSide: a.per_side } as Partial<CustomEx>], w.userId);
      const added = custom.find((c) => !(prog.custom ?? []).some((o) => o.key === c.key))!;
      const res = await saveVersion(raw(w), w.userId, row, { name: prog.name, design: prog.design, custom, rules: prog.rules, weekEdits: prog.weekEdits }, reason, "patch", { by: "ai", client: w.label });
      if (!res.ok) throw new ToolError(res.errors.join("; "));
      await logEvent(w, "add_custom_exercise", { key: added.key, name, why: reason });
      return { summary: `Added ${added.name} (key ${added.key}) to your plan's exercises · v${res.program.version}. Use edit_day to put it in a day.`, data: added };
    },
  },
  {
    name: "undo_plan_version", title: "Undo a plan change",
    description: "Restore an older version of the user's plan (default: the one before the current). The restore is saved as a NEW version, so nothing is lost and it can be undone again.",
    inputSchema: obj({ version: { type: "string", description: "e.g. \"1.0.3\" (list_plan_versions); default = the previous one" }, ...WHY }, ["why"]),
    annotations: WR("Undo a plan change"),
    async run(w, a) {
      const reason = why(a);
      const { row } = await requireUserPlan(w);
      const res = await restoreVersion(raw(w), w.userId, row, str(a, "version", 20) || null, reason, { by: "ai", client: w.label });
      if (!res.ok) throw new ToolError(res.errors.join("; "));
      await logEvent(w, "undo_plan_version", { program: row.id, restored: res.restored, from: res.from, to: res.program.version, why: reason });
      return { summary: `Restored v${res.restored} as v${res.program.version} (was v${res.from}).`, data: { version: res.program.version, restored: res.restored, previous: res.from } };
    },
  },

  // ============================================================ write: weights & next workout
  {
    name: "set_exercise_target", title: "Set a target weight",
    description: "Set the working weight / reps (or hold seconds) the app recommends for an exercise, overriding its automatic recommendation until `until` (inclusive) or until cleared. kg is in the unit the app shows (PER HAND for dumbbell pairs, total incl. bar for barbells, the stack number for machines). Works on any plan, including the default one.",
    inputSchema: obj({
      exercise: { type: "string" }, kg: { type: ["number", "null"] }, reps: { type: ["integer", "null"] }, seconds: { type: ["integer", "null"] },
      until: { type: "string", description: "YYYY-MM-DD, last day it applies (default: 14 days)" }, clear: { type: "boolean", description: "Remove the target" }, ...WHY,
    }, ["exercise", "why"]),
    annotations: WR("Set a target weight", false, true),
    async run(w, a) {
      const reason = why(a);
      const ex = resolveEx(str(a, "exercise", 80), w);
      const key = `target:${ex}`;
      if (a.clear) {
        await scoped(w).delete(t.settings).where(eq(t.settings.key, key));
        await logEvent(w, "set_exercise_target", { ex, clear: true, why: reason });
        return { summary: `Cleared the target for ${exName(ex)}; the app's own recommendation is back.`, data: { ex, cleared: true } };
      }
      const kg = numArg(a, "kg"), reps = numArg(a, "reps"), seconds = numArg(a, "seconds");
      if (kg == null && reps == null && seconds == null) throw new ToolError("Give kg, reps or seconds (or clear: true).");
      if (kg != null && !(kg >= 0 && kg <= 400)) throw new ToolError("kg must be 0-400.");
      if (reps != null && !(reps >= 1 && reps <= 100)) throw new ToolError("reps must be 1-100.");
      if (seconds != null && !(seconds >= 1 && seconds <= 3600)) throw new ToolError("seconds must be 1-3600.");
      const until = dateArg(a, "until") ?? addDays(today(), 14);
      const v = { kg: kg ?? null, reps: reps == null ? null : Math.round(reps), seconds: seconds == null ? null : Math.round(seconds), why: reason, until, by: w.label, at: Date.now() };
      await putSetting(w, key, JSON.stringify(v));
      await logEvent(w, "set_exercise_target", { ex, ...v });
      const unit = EXERCISES[ex]?.pair ? " per hand" : "";
      return { summary: `${exName(ex)}: ${kg != null ? `${kg} kg${unit}` : ""}${reps != null ? ` × ${reps}` : ""}${seconds != null ? ` ${seconds}s` : ""} until ${until} (shown in the workout instead of the app's suggestion).`, data: { ex, ...v } };
    },
  },
  {
    name: "customize_next_workout", title: "Adjust the next workout",
    description: "One-time change to a single upcoming workout (default: the next one in the plan). Pass `ops` (same as edit_day, applied to that day's plan) or `items` (the full exercise list). Used once when that workout starts; the plan itself doesn't change. clear=true removes it.",
    inputSchema: obj({
      week: { type: "integer" }, day: { type: "string", description: "Day key; default = next session" }, ops: OPS_SCHEMA,
      items: { type: "array", description: "Full list [{ex,sets,reps,rir,rest,tech?,seconds?,meters?,tag?}]", items: { type: "object" } },
      name: { type: "string", description: "Optional title, e.g. \"Push (short, 45 min)\"" }, clear: { type: "boolean" }, ...WHY,
    }, ["why"]),
    annotations: WR("Adjust the next workout", false, true),
    async run(w, a) {
      const reason = why(a);
      const st = await api<AppState>(w, "GET", "/state");
      let week = numArg(a, "week"), dayKey = str(a, "day", 12);
      if (!week || !dayKey) {
        if (!st.next) throw new ToolError("No open session left this month; give week and day.");
        week ??= st.next.week;
        dayKey ||= st.next.dayKey;
      }
      const wk = w.prog.weeks.find((x) => x.n === week);
      const day = wk?.days.find((d) => d.key === dayKey || d.name.toLowerCase() === dayKey.toLowerCase());
      if (!wk || !day) throw new ToolError(`No day ${dayKey} in week ${week}. Days: ${w.prog.order.join(", ")}`);
      const key = overrideKey(week, day.key);
      if (a.clear) {
        await scoped(w).delete(t.settings).where(eq(t.settings.key, key));
        await logEvent(w, "customize_next_workout", { week, day: day.key, clear: true, why: reason });
        return { summary: `Removed the one-time change for W${week} ${day.name}.`, data: { week, day: day.key, cleared: true } };
      }
      const existing = parseOverride((await scoped(w).select().from(t.settings).where(eq(t.settings.key, key)))[0]?.value);
      let items: Rx[];
      let log: string[] = [];
      if (Array.isArray(a.items) && a.items.length) {
        items = (a.items as Partial<DItem>[]).map((x) => toRx({ ...x, ex: resolveEx(String(x.ex ?? ""), w) }));
        log = ["replaced the whole exercise list"];
      } else if (Array.isArray(a.ops) && a.ops.length) {
        const r = applyOps<Rx>(w, existing?.items ?? day.items, a.ops as Op[], (x) => toRx(x));
        items = r.items; log = r.log;
      } else throw new ToolError("Pass ops or items (or clear: true).");
      const errs = checkRx(items, `W${week} ${day.name}`, (w.prog as AiProgram).custom);
      if (errs.length) throw new ToolError(errs.join("\n"));
      const o: Override = { name: str(a, "name", 60) || existing?.name || undefined, items, why: reason, by: w.label, at: Date.now() };
      await putSetting(w, key, JSON.stringify(o));
      await logEvent(w, "customize_next_workout", { week, day: day.key, why: reason, changes: log });
      const activeHere = st.active && st.active.week === week && st.active.dayName === day.name;
      return {
        summary: `W${week} ${o.name ?? day.name}: ${log.join("; ")}. Applies once, when that workout starts.${activeHere ? " (This workout is already in progress, so it applies the next time this day starts.)" : ""}`,
        data: { week, day: day.key, name: o.name ?? day.name, items: items.map(rxOut) },
      };
    },
  },

  // ============================================================ write: notes & logs
  {
    name: "write_month_review", title: "Write the month review",
    description: "Write (or append to) the review of a training month, shown in the app under Months. Markdown. Default: the current month.",
    inputSchema: obj({ block_id: { type: "string" }, review: { type: "string" }, mode: { type: "string", enum: ["replace", "append"], description: "Default replace" } }, ["review"]),
    annotations: WR("Write the month review", false, true),
    async run(w, a) {
      const text = str(a, "review", 20000);
      if (!text) throw new ToolError("Write the review text.");
      const blocks = await api<Json[]>(w, "GET", "/blocks");
      const id = str(a, "block_id", 80);
      const b = id ? blocks.find((x) => x.id === id) : blocks.find((x) => x.status === "active") ?? blocks[0];
      if (!b) throw new ToolError(`No month ${id}. Months: ${blocks.map((x) => `${x.id} (${x.name})`).join(", ")}`);
      const review = a.mode === "append" && b.review ? `${b.review}\n\n${text}` : text;
      await api(w, "PUT", `/blocks/${encodeURIComponent(String(b.id))}`, { review });
      await logEvent(w, "write_month_review", { block: b.id, chars: review.length });
      return { summary: `Saved the review for ${b.name} (${review.length} chars).`, data: { block_id: b.id, name: b.name } };
    },
  },
  {
    name: "add_journal_note", title: "Add a journal note",
    description: "Add an entry to the user's journal (tagged \"ai\"), e.g. a check-in summary or advice to remember.",
    inputSchema: obj({ text: { type: "string" }, date: { type: "string" }, tags: { type: "string", description: "Comma-separated" }, mood: { type: "integer", minimum: 1, maximum: 5 } }, ["text"]),
    annotations: WR("Add a journal note"),
    async run(w, a) {
      const text = str(a, "text", 10000);
      if (!text) throw new ToolError("Write the note text.");
      const date = dateArg(a, "date") ?? today();
      const tags = [...new Set(["ai", ...str(a, "tags", 180).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)])].join(",");
      const id = `ai-${crypto.randomUUID()}`;
      await api(w, "POST", "/journal", { id, date, text, tags, mood: numArg(a, "mood") ?? null });
      await logEvent(w, "add_journal_note", { id, date });
      return { summary: `Journal note saved for ${date}.`, data: { id, date, tags } };
    },
  },
  {
    name: "log_body", title: "Log body & habits",
    description: "Log or update one day's body/habit numbers (only the fields given change): weight kg, waist cm, sleep h, protein g, steps, water L, energy 1-5, note.",
    inputSchema: obj({ date: { type: "string" }, weightKg: { type: "number" }, waistCm: { type: "number" }, sleepH: { type: "number" }, proteinG: { type: "integer" }, steps: { type: "integer" }, waterL: { type: "number" }, energy: { type: "integer", minimum: 1, maximum: 5 }, note: { type: "string" } }, ["date"]),
    annotations: WR("Log body & habits", false, true),
    async run(w, a) {
      const date = dateArg(a, "date");
      if (!date) throw new ToolError("date is required (YYYY-MM-DD).");
      const lim: Record<string, [number, number]> = { weightKg: [25, 300], waistCm: [40, 200], sleepH: [0, 16], proteinG: [0, 500], steps: [0, 100000], waterL: [0, 15], energy: [1, 5] };
      const body: Json = {};
      for (const [k, [lo, hi]] of Object.entries(lim)) {
        const v = numArg(a, k);
        if (v === undefined) continue;
        if (!(v >= lo && v <= hi)) throw new ToolError(`${k} must be ${lo}-${hi}.`);
        body[k] = v;
      }
      if (str(a, "note", 1000)) body.note = str(a, "note", 1000);
      if (!Object.keys(body).length) throw new ToolError("Give at least one value.");
      await api(w, "PUT", `/body/${date}`, body);
      await logEvent(w, "log_body", { date, ...body });
      return { summary: `Logged ${Object.keys(body).join(", ")} for ${date}.`, data: { date, ...body } };
    },
  },
];

/** Plan-changing tools re-read the user's plan before the next call. */
export const CHANGES_PLAN = new Set(["update_plan", "edit_day", "fork_plan", "switch_plan", "use_default_plan", "add_custom_exercise", "undo_plan_version"]);
export { refreshWho };
