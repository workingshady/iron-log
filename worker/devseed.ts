// DEV mode only: training-data generator for the test database.
//  • seedDev(d)  = wipe ONE test user's personal rows (called per user by POST /api/dev/seed before the other seeds).
//  • genTraining = 6-8 weeks of realistic, per-person training that follows the person's own program (used by devseed-rich.ts):
//    double progression with stalls, RIR mostly 1-3, warm-ups, drop/failure sets, real rest times, PR flags that really
//    beat the previous best, `suggested` JSON, equip, kgBasis, cheated sets, pain notes, swaps, feedback, missed/skipped
//    days with excuses, readiness + RPE, body logs, creatine, cardio/football, tests, two blocks (Month 1 done, Month 2 active).
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as t from "./db/schema";
import type { RawDB } from "./db";
import { EXERCISES } from "../program/exercises";
import { STARTER } from "../program/starters";
import { equipOf } from "../program/bank";
import { EX_GROUP } from "../program/groups";
import type { Program } from "../program/types";
import { programVersionId } from "../program";
import { buildPlan, toItem } from "../shared/plan";
import { basisFor, loadOf, totalKg } from "../shared/load";
import type { PlanItem } from "../shared/api";

type DB = DrizzleD1Database<typeof t>;

/** Wipe the scoped user's personal rows (DEV database only; d is scoped to one test user). The rich seed refills everything. */
export async function seedDev(d: DB, _today: string): Promise<number> {
  await d.batch([d.delete(t.sets), d.delete(t.sessions), d.delete(t.events), d.delete(t.body), d.delete(t.tests), d.delete(t.journal), d.delete(t.intake),
    d.delete(t.feedback), d.delete(t.cardio), d.delete(t.settings), d.delete(t.blocks), d.delete(t.photos)]);
  return 0;
}

// ---------------------------------------------------------------- helpers

/** Insert many rows with one bound parameter per chunk (json_each) → few D1 queries, no 100-parameter limit. */
export async function bulk(raw: RawDB, table: SQLiteTable, rows: object[], chunk = 120) {
  if (!rows.length) return;
  const cols = Object.entries(getTableColumns(table));
  const name = getTableName(table);
  const list = cols.map(([, c]) => `"${c.name}"`).join(", ");
  const sel = cols.map(([, c]) => `json_extract(value, '$.${c.name}')`).join(", ");
  const d1 = (raw as unknown as { $client: D1Database }).$client;
  const q = `insert into "${name}" (${list}) select ${sel} from json_each(?)`;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const json = JSON.stringify(rows.slice(i, i + chunk).map((r) => Object.fromEntries(cols.map(([k, c]) => {
      const v = (r as Record<string, unknown>)[k];
      return [c.name, v ?? (c.hasDefault && typeof c.default !== "function" ? c.default : null)];
    }))));
    stmts.push(d1.prepare(q).bind(json));
  }
  for (let i = 0; i < stmts.length; i += 20) await d1.batch(stmts.slice(i, i + 20));
}

export function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    chance: (p: number) => next() < p,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    noise: (amp: number) => (next() * 2 - 1) * amp,
  };
}
export type Rng = ReturnType<typeof rng>;

export const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dowOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
/** Cairo local time → UTC ms (UTC+3). */
export const at = (date: string, h: number, m = 0) => Date.parse(`${date}T00:00:00Z`) + ((h - 3) * 60 + m) * 60e3;
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const e1rm = (kg: number, reps: number) => kg * (1 + reps / 30);

// starting-ratio gaps in STARTER (× bench est. max)
const EXTRA_RATIO: Record<string, number> = { bench: 1, cable_crunch: 0.45, neutral_pulldown: 0.75, lean_lateral: 0.08, kelso_shrug: 0.25, wrist_curl: 0.3 };
const BIG = new Set(["bench", "squat", "rdl", "bb_row", "ohp", "leg_press", "hip_thrust", "incline_db", "db_bench", "pulldown", "deadlift", "close_grip_bench"]);
const ISO_DROP = new Set(["db_lateral", "lean_lateral", "cable_lateral", "pushdown", "leg_extension", "pec_deck", "incline_curl", "hammer_curl", "preacher_curl", "ez_curl", "db_curl", "rear_delt_fly", "seated_leg_curl", "leg_curl"]);
const CHEATY = new Set(["ez_curl", "db_curl", "hammer_curl", "db_lateral", "lean_lateral", "preacher_curl", "bb_row", "machine_shrug", "incline_curl"]);

export interface PainSpec { ex: string; area: string; level: number; note: string; week?: number }
export interface SwapSpec { from: string; to: string; reason: string; p: number }
export interface Persona {
  uid: string;
  prog: Program;
  /** days of history (today excluded) */
  days: number;
  trainDow: number[];
  hour: number;
  bench: number; // bench est. 1RM (kg)
  factor: (ex: string, group: string | undefined) => number;
  growth: number; // est.-max growth per week (fraction)
  stall: string[];
  /** Returns an excuse id when the planned session is missed that day, "skip:<excuse>" when skipped, else null. */
  miss: (date: string, dow: number, r: Rng, n: number) => string | null;
  rirBias: number; // + = sandbagging, − = grinds
  cheat: number;
  drops: number;
  pains: PainSpec[];
  swaps: SwapSpec[];
  setNotes: string[];
  sessionNotes: string[];
  equip?: Record<string, string>;
  bodyReps: Record<string, number>; // base max reps for bodyweight moves
  holdS: number; // base dead hang / plank seconds
  minutesPerSet: number;
  rpeBase: number;
  readiness: { sleep: number; energy: number; mood: number; stress: number; soreness: number };
  body: { kg0: number; kg1: number; waist0: number; waist1: number; sleep: number; protein: number; steps: number; water: number; rate: number; notes: [number, string][] };
  creatine: { g: number; rate: number } | null;
  cardio: (date: string, dow: number, dayKey: string | null, r: Rng) => Partial<typeof t.cardio.$inferInsert> | null;
  tests: [number, string, number, string?][]; // [daysBack, key, value, note]
  journal: [number, string, string, number][]; // [daysBack, text, tags, mood]
}

type Row<T extends SQLiteTable> = T["$inferInsert"];
export interface Training {
  sessions: Row<typeof t.sessions>[];
  sets: Row<typeof t.sets>[];
  feedback: Row<typeof t.feedback>[];
  events: Row<typeof t.events>[];
  body: Row<typeof t.body>[];
  intake: Row<typeof t.intake>[];
  cardio: Row<typeof t.cardio>[];
  tests: Row<typeof t.tests>[];
  journal: Row<typeof t.journal>[];
  blocks: Row<typeof t.blocks>[];
}

interface ExState { e0: number; w: number | null; lastReps: number | null; lastTop: number | null; low: number; sessions: number }

/** Generate one person's training history. Pure (no DB): returns rows, the caller bulk-inserts them. */
export function genTraining(p: Persona, today: string): Training {
  const r = rng(`train-${p.uid}`);
  const out: Training = { sessions: [], sets: [], feedback: [], events: [], body: [], intake: [], cardio: [], tests: [], journal: [], blocks: [] };
  const uid = p.uid;
  let n = 0;
  const id = (k: string) => `${uid}-${k}-${(++n).toString(36)}`;
  const pv = programVersionId(p.prog);
  const start = addDays(today, -p.days);

  // ---- body first (sessions read bodyweight + sleep from it)
  const bodyBy = new Map<string, Row<typeof t.body>>();
  const creatineDays = new Set<string>();
  for (let i = 0; i <= p.days; i++) {
    const date = addDays(start, i);
    const f = i / p.days;
    const dow = dowOf(date);
    if (p.creatine && r.chance(p.creatine.rate)) {
      creatineDays.add(date);
      out.intake.push({ id: id("i"), userId: uid, date, item: "creatine", amount: p.creatine.g, unit: "g", at: at(date, r.int(7, 10), r.int(0, 59)) });
    }
    if (!r.chance(p.body.rate) && i !== p.days) continue;
    const weekend = dow === 5 || dow === 6;
    const sleep = Math.round(clamp(p.body.sleep + (weekend ? 0.7 : 0) + r.noise(1.1), 4.5, 9.5) * 4) / 4;
    const row: Row<typeof t.body> = {
      userId: uid, date,
      weightKg: Math.round((p.body.kg0 + (p.body.kg1 - p.body.kg0) * f + Math.sin(i / 2.3) * 0.25 + r.noise(0.35)) * 10) / 10,
      waistCm: dow === 5 ? Math.round((p.body.waist0 + (p.body.waist1 - p.body.waist0) * f + r.noise(0.4)) * 10) / 10 : null,
      sleepH: sleep,
      proteinG: Math.round(p.body.protein + r.noise(p.body.protein * 0.15)),
      steps: Math.round(p.body.steps + r.noise(p.body.steps * 0.35)),
      creatine: creatineDays.has(date) ? 1 : 0,
      waterL: Math.round((p.body.water + r.noise(0.6)) * 10) / 10,
      energy: clamp(Math.round(2 + (sleep - 5) * 0.8 + r.noise(0.8)), 1, 5),
      note: null, updatedAt: at(date, 22),
    };
    bodyBy.set(date, row);
    out.body.push(row);
  }
  for (const [back, note] of p.body.notes) { const b = bodyBy.get(addDays(today, -back)); if (b) b.note = note; }

  // ---- slots + blocks
  const slotList = p.prog.weeks.flatMap((w) => p.prog.order.filter((k) => w.days.some((d) => d.key === k)).map((k) => ({ week: w.n, dayKey: k })));
  let blockN = 1, slot = 0;
  const newBlock = (date: string) => {
    const b: Row<typeof t.blocks> = { id: `${uid}-blk-${blockN}`, userId: uid, n: blockN, name: `Month ${blockN}`, programId: p.prog.id, startVersion: pv, startDate: date, endDate: null,
      status: "active", goal: null, notes: null, review: null, baseline: null, summary: null, createdAt: at(date, 8), updatedAt: at(date, 8) };
    out.blocks.push(b);
    return b;
  };
  let block = newBlock(start);

  const st = new Map<string, ExState>();
  const best = new Map<string, { e: number; reps: number; sec: number }>();
  const stateOf = (ex: string) => {
    let s = st.get(ex);
    if (!s) {
      const ratio = EXTRA_RATIO[ex] ?? STARTER[ex] ?? 0.3;
      s = { e0: p.bench * ratio * p.factor(ex, EX_GROUP[ex]), w: null, lastReps: null, lastTop: null, low: 0, sessions: 0 };
      st.set(ex, s);
    }
    return s;
  };
  const stepOf = (ex: string) => EXERCISES[ex]?.step ?? 2.5;
  const equipFor = (ex: string) => {
    if (p.equip?.[ex]) return p.equip[ex];
    const e = equipOf(ex), l = loadOf(ex);
    return e === "machine" ? "stack" : e === "cable" ? "cable" : l === "ez" ? "ez" : e === "barbell" ? "barbell" : e === "dumbbell" ? "dumbbell" : e === "bodyweight" ? "bodyweight" : "other";
  };

  let doneCount = 0;
  for (let i = 0; i < p.days; i++) {
    const date = addDays(start, i);
    const dow = dowOf(date);
    const trains = p.trainDow.includes(dow);
    const weekIdx = Math.floor(i / 7);
    // cardio on any day (football, intervals, walks)
    const cur = slotList[slot];
    const cardio = p.cardio(date, dow, trains ? cur?.dayKey ?? null : null, r);
    if (!trains || !cur) {
      if (cardio) out.cardio.push({ id: cardio.protocol === "football" ? `football-${uid}-${date}` : id("c"), userId: uid, date, createdAt: at(date, 21), ...cardio, status: cardio.status ?? "done" } as Row<typeof t.cardio>);
      continue;
    }
    const ex = p.miss(date, dow, r, doneCount);
    const plan = buildPlan(p.prog, cur.week, cur.dayKey);
    if (ex) {
      const skip = ex.startsWith("skip:");
      const excuse = skip ? ex.slice(5) : ex;
      const notes: Record<string, string> = { work: "Late meeting, no gym", family: "Family dinner — عزومة", tired: "Dead after work", busy: "No time today", sick: "Fever, staying home 🤒", sport: "Played football yesterday, legs gone", travel: "Out of town", sleep: "Slept 4 h", motivation: "Couldn't get myself to go", sore: "Still very sore", gym: "Gym closed for maintenance" };
      out.sessions.push({ id: id("s"), userId: uid, programVersionId: pv, blockId: block.id, week: cur.week, dayKey: cur.dayKey, dayName: plan.name, status: skip ? "skipped" : "missed", kind: "planned",
        date, plan: "[]", excuse, note: notes[excuse] ?? null, tz: "Africa/Cairo", createdAt: at(date, 21, 30), updatedAt: at(date, 21, 30) });
      out.events.push({ id: id("e"), userId: uid, sessionId: null, type: skip ? "session_skip" : "session_missed", data: JSON.stringify({ week: cur.week, dayKey: cur.dayKey, excuse }), at: at(date, 21, 30) });
      if (skip) slot++;
      if (cardio) out.cardio.push({ id: cardio.protocol === "football" ? `football-${uid}-${date}` : id("c"), userId: uid, date, createdAt: at(date, 21), ...cardio, status: cardio.status ?? "done" } as Row<typeof t.cardio>);
    } else {
      doneCount++;
      genSession(date, cur.week, cur.dayKey, plan.name, plan.items, weekIdx, cardio);
      slot++;
    }
    // block finished → close it, start the next month tomorrow
    if (slot >= slotList.length) {
      block.status = "done";
      block.endDate = date;
      block.updatedAt = at(date, 22);
      blockN++;
      slot = 0;
      block = newBlock(addDays(date, 1));
    }
  }

  function genSession(date: string, week: number, dayKey: string, dayName: string, items0: PlanItem[], weekIdx: number, cardio: Partial<typeof t.cardio.$inferInsert> | null) {
    const sid = id("s");
    const body = bodyBy.get(date) ?? bodyBy.get(addDays(date, -1));
    const sleepQ = body?.sleepH ? clamp(Math.round((body.sleepH - 4) / 1.0), 1, 5) : p.readiness.sleep;
    const rd = {
      sleep: sleepQ, energy: clamp(Math.round(p.readiness.energy + (sleepQ - 3) * 0.4 + r.noise(1)), 1, 5), mood: clamp(Math.round(p.readiness.mood + r.noise(1)), 1, 5),
      stress: clamp(Math.round(p.readiness.stress + r.noise(1.2)), 1, 5), soreness: clamp(Math.round(p.readiness.soreness + r.noise(1.2)), 1, 5),
    };
    const form = 1 + ((rd.sleep + rd.energy) / 2 - 3) * 0.012 + r.noise(0.012);
    const deload = /deload/i.test(p.prog.weeks.find((w) => w.n === week)?.name ?? "");
    // swaps (gym busy, pain …)
    const items = items0.map((it) => {
      const sw = p.swaps.find((s) => s.from === it.ex && EXERCISES[s.to]);
      if (sw && r.chance(sw.p)) {
        const { name: _n, metric: _m, muscles: _mu, cues: _c, yt: _y, alts: _a, step: _s, perSide: _p, ...rx } = it;
        const ni: PlanItem = { ...toItem(sw.to, { ...rx }), swappedFrom: it.ex, swapReason: sw.reason };
        return ni;
      }
      return it;
    });
    const hour = p.hour + r.int(-1, 1);
    let time = at(date, hour, r.int(0, 50));
    const startedAt = time;
    out.events.push({ id: id("e"), userId: uid, sessionId: sid, type: "session_start", data: JSON.stringify({ week, dayKey, kind: "planned" }), at: time });
    time += r.int(4, 9) * 60e3; // changing, warm-up walk
    let first = true;
    let prevRest = 90;
    let hardSets = 0;
    let warmed = false; // warm-up sets before the first big lift only
    const sessSets: Row<typeof t.sets>[] = [];
    items.forEach((it, idx) => {
      const e = EXERCISES[it.ex];
      if (!e) return;
      if (it.swappedFrom) out.events.push({ id: id("e"), userId: uid, sessionId: sid, type: "ex_swap", data: JSON.stringify({ from: it.swappedFrom, to: it.ex, reason: it.swapReason }), at: time });
      const s = stateOf(it.ex);
      if (s.sessions < 2 && it.yt.length && r.chance(0.4)) out.events.push({ id: id("e"), userId: uid, sessionId: sid, type: "video_open", data: JSON.stringify({ ex: it.ex }), at: time });
      const step = stepOf(it.ex);
      const bot = it.reps == null ? null : Array.isArray(it.reps) ? it.reps[0] : it.reps;
      const top = it.reps == null ? null : Array.isArray(it.reps) ? it.reps[1] : it.reps;
      const rirT = it.rir == null ? 2 : Array.isArray(it.rir) ? r.int(it.rir[0], it.rir[1]) : it.rir;
      const weeks = (Date.parse(date) - Date.parse(start)) / (7 * 864e5);
      const stalled = p.stall.includes(it.ex) && weeks > 2.5;
      const eNow = s.e0 * (1 + p.growth * (stalled ? 2.5 + (weeks - 2.5) * 0.15 : weeks)) * form;
      const basis = basisFor(it.ex);
      const equip = equipFor(it.ex);
      const pain = p.pains.find((x) => x.ex === it.ex && (x.week == null || x.week === weekIdx));
      let minRir = 9;
      let painHit = false;
      const add = (row: Partial<Row<typeof t.sets>> & { kind: string; setNo: number }, restS: number | null, workS: number) => {
        time += ((restS ?? 0) + workS) * 1000;
        const full: Row<typeof t.sets> = { id: id("x"), userId: uid, sessionId: sid, exKey: it.ex, itemIdx: idx, kgBasis: null, equip, deleted: 0, pr: 0, strict: 1, swappedFrom: it.swappedFrom ?? null,
          restBeforeS: restS, doneAt: time, updatedAt: time, target: JSON.stringify({ sets: it.sets, reps: it.reps ?? null, seconds: it.seconds ?? null, rir: it.rir ?? null }), ...row };
        // PR check exactly like the app: vs all-time best + earlier sets today (needs history)
        if (full.kind !== "W") {
          const b = best.get(it.ex);
          const kg = full.weightKg ?? null, reps = full.reps ?? null;
          if (b) {
            if (kg && reps && reps <= 12 && b.e > 0 && e1rm(kg, reps) > b.e + 0.05 && full.strict !== 0) full.pr = 1;
            else if (e.metric !== "weight_reps" && reps && b.reps > 0 && reps > b.reps) full.pr = 1;
            else if (full.seconds && b.sec > 0 && full.seconds > b.sec) full.pr = 1;
          }
          const nb = b ?? { e: 0, reps: 0, sec: 0 };
          if (kg && reps && reps <= 12 && full.strict !== 0) nb.e = Math.max(nb.e, e1rm(kg, reps));
          if (reps) nb.reps = Math.max(nb.reps, reps);
          if (full.seconds) nb.sec = Math.max(nb.sec, full.seconds);
          best.set(it.ex, nb);
          if (full.pr) out.events.push({ id: id("e"), userId: uid, sessionId: sid, type: "pr", data: JSON.stringify({ ex: it.ex, kg, reps, seconds: full.seconds ?? null }), at: time });
          if (full.kind === "N" || full.kind === "F") hardSets++;
        }
        sessSets.push(full);
        out.sets.push(full);
      };
      const restFor = () => { const v = first ? null : Math.max(20, Math.round(prevRest + r.noise(25) + 15)); first = false; return v; };

      if (e.metric === "weight_reps" || e.metric === "distance") {
        if (s.w == null) s.w = roundTo(eNow / (1 + ((top ?? 10) + rirT + 1) / 30), step);
        let planned = deload ? roundTo(s.w * 0.85, step) : s.w;
        const sugKind = s.sessions === 0 ? "start" : deload ? "deload" : s.lastTop != null && top != null && s.lastTop >= top ? "up" : s.low >= 2 ? "down" : "hold";
        const suggested = JSON.stringify({ weightKg: planned, reps: s.lastReps == null || top == null ? top : clamp(s.lastReps + 1, bot ?? 1, top), seconds: null, kind: sugKind });
        // sometimes the person goes their own way
        if (!deload && s.sessions > 1 && r.chance(0.07)) planned = roundTo(planned + (r.chance(0.6) ? step : -step), step);
        // warm-ups for the big first lifts
        if (BIG.has(it.ex) && !warmed && e.metric === "weight_reps" && planned >= 30) {
          warmed = true;
          const bar = loadOf(it.ex) === "barbell" ? 20 : step;
          for (const [pct, reps] of planned >= 80 ? [[0.45, 8], [0.65, 5], [0.82, 2]] : [[0.5, 8], [0.75, 4]]) {
            add({ setNo: 0, kind: "W", weightKg: Math.max(bar, roundTo(planned * pct, step)), reps, rir: null, kgBasis: basis, suggested: null }, restFor() ?? null, 25);
            prevRest = 60;
          }
        }
        let firstReps: number | null = null, minReps = 99;
        for (let k = 1; k <= it.sets; k++) {
          const fat = 1 - 0.025 * (k - 1);
          const possible = Math.max(1, Math.floor(30 * ((eNow * fat) / planned - 1)));
          const want = clamp(rirT + Math.round(p.rirBias + r.noise(0.6)) + (k === it.sets && !deload ? -1 : 0), 0, 4);
          let reps = e.metric === "distance" ? 0 : top == null ? Math.max(1, possible - 1) : clamp(possible - want, 1, top + (r.chance(0.08) ? 1 : 0));
          if (bot != null && reps < bot) reps = Math.max(1, Math.min(bot, possible - (r.chance(0.5) ? 1 : 0))); // pushes closer to failure to reach the range
          const rir = e.metric === "distance" ? null : clamp(possible - reps, 0, 4);
          const cheated = CHEATY.has(it.ex) && r.chance(p.cheat);
          if (cheated) reps += 1;
          const isPain = !!pain && !painHit && k === 2 && r.chance(0.5);
          if (isPain) painHit = true;
          const note = isPain ? pain!.note : r.chance(0.025) ? r.pick(p.setNotes) : null;
          const failure = k === it.sets && ISO_DROP.has(it.ex) && !deload && r.chance(0.08);
          if (e.metric !== "distance") { minReps = Math.min(minReps, reps); if (k === 1) firstReps = reps; }
          add({
            setNo: k, kind: failure ? "F" : "N", weightKg: planned, reps: e.metric === "distance" ? null : reps, meters: e.metric === "distance" ? (it.meters ?? 30) + (r.chance(0.3) ? 10 : 0) : null,
            rir: failure ? 0 : rir, kgBasis: basis, suggested, strict: cheated ? 0 : 1, note, painArea: isPain ? pain!.area : null, painLevel: isPain ? pain!.level : null,
          }, restFor(), e.metric === "distance" ? 45 : Math.round(reps * p.minutesPerSet));
          if (rir != null) minRir = Math.min(minRir, failure ? 0 : rir);
          prevRest = it.rest || 20;
        }
        // drop set after the last set of an isolation move
        if (ISO_DROP.has(it.ex) && !deload && r.chance(p.drops)) {
          add({ setNo: it.sets + 1, kind: "D", weightKg: Math.max(step, roundTo(planned * 0.72, step)), reps: r.int(7, 12), rir: 0, kgBasis: basis, suggested: null }, r.int(8, 15), 30);
        }
        // double progression for next time
        if (!deload && e.metric === "weight_reps" && top != null) {
          s.lastReps = firstReps;
          s.lastTop = firstReps;
          if (firstReps != null && firstReps >= top && minReps >= (bot ?? 1)) s.w = roundTo(s.w + step, step);
          else if (bot != null && minReps < bot - 1) { s.low++; if (s.low >= 2) { s.w = roundTo(s.w - step, step); s.low = 0; } }
          else s.low = 0;
        }
        if (e.metric === "distance" && !deload && s.sessions % 3 === 2) s.w = roundTo(s.w + step, step);
      } else if (e.metric === "reps" || e.metric === "assist_reps") {
        const base = (p.bodyReps[it.ex] ?? 12) * (1 + p.growth * 1.6 * ((Date.parse(date) - Date.parse(start)) / (7 * 864e5)));
        for (let k = 1; k <= it.sets; k++) {
          const max = Math.max(1, Math.round(base * (1 - 0.12 * (k - 1)) + r.noise(1.5)));
          const reps = top == null ? max : clamp(max - 2, Math.max(1, (bot ?? top) - 2), top);
          add({ setNo: k, kind: "N", weightKg: null, reps, rir: top == null ? 0 : clamp(max - reps, 0, 4), suggested: JSON.stringify({ weightKg: null, reps: top ?? s.lastReps ?? reps, seconds: null, kind: s.sessions ? "hold" : "start" }) }, restFor(), reps * 2);
          prevRest = it.rest || 30;
          s.lastReps = reps;
        }
      } else if (e.metric === "time") {
        const base = p.holdS * (1 + p.growth * 1.8 * ((Date.parse(date) - Date.parse(start)) / (7 * 864e5)));
        for (let k = 1; k <= it.sets; k++) {
          const sec = Math.max(10, Math.round((base * (1 - 0.1 * (k - 1)) + r.noise(4)) / 1));
          add({ setNo: k, kind: "N", weightKg: null, reps: null, seconds: sec, rir: null, suggested: JSON.stringify({ weightKg: null, reps: null, seconds: it.seconds ?? 30, kind: s.sessions ? "hold" : "start" }) }, restFor(), sec);
          prevRest = it.rest || 45;
        }
      }
      s.sessions++;
      if (r.chance(0.04)) out.events.push({ id: id("e"), userId: uid, sessionId: sid, type: "rest_skip", data: JSON.stringify({ ex: it.ex }), at: time });
      // feedback after the last set (people skip it ~35% of the time)
      if (r.chance(0.65)) {
        const effort = minRir >= 3 ? "easy" : minRir === 0 ? (r.chance(0.3) ? "too_much" : "hard") : r.chance(0.15) ? "hard" : "right";
        out.feedback.push({ id: `${sid}:${idx}`, userId: uid, sessionId: sid, exKey: it.ex, effort, joints: painHit ? (pain!.level >= 2 ? "pain" : "achy") : r.chance(0.04) ? "achy" : "fine", at: time + 20e3 });
      }
    });
    const endedAt = time + r.int(2, 6) * 60e3;
    const rpe = clamp(Math.round(p.rpeBase + (week === 3 ? 0.7 : 0) - (/deload/i.test(dayName) ? 1 : 0) + (3 - rd.energy) * 0.3 + r.noise(0.8)), 5, 10);
    const minutes = Math.round((endedAt - startedAt) / 60000);
    out.events.push({ id: id("e"), userId: uid, sessionId: sid, type: "session_finish", data: JSON.stringify({ minutes, rpe, sets: hardSets }), at: endedAt });
    out.sessions.push({
      id: sid, userId: uid, programVersionId: pv, blockId: block.id, week, dayKey, dayName, status: "done", kind: "planned", date, startedAt, endedAt, plan: JSON.stringify(items),
      readiness: JSON.stringify(rd), rpe, bodyweight: body?.weightKg ?? null, excuse: null, note: r.chance(0.2) ? r.pick(p.sessionNotes) : null, tz: "Africa/Cairo", createdAt: startedAt, updatedAt: endedAt,
    });
    if (cardio) out.cardio.push({ id: cardio.protocol === "football" ? `football-${uid}-${date}` : id("c"), userId: uid, date, sessionId: cardio.protocol === "football" ? null : sid,
      startedAt: endedAt + 3 * 60e3, endedAt: endedAt + (3 + (cardio.minutes ?? 20)) * 60e3, createdAt: endedAt, ...cardio, status: cardio.status ?? "done" } as Row<typeof t.cardio>);
  }

  // ---- tests + journal
  for (const [back, key, value, note] of p.tests) {
    const unit = p.prog.tests.find((x) => x.key === key)?.unit ?? (key === "dead_hang" || key === "plank" || key === "hollow" ? "s" : "reps");
    out.tests.push({ id: id("t"), userId: uid, date: addDays(today, -back), testKey: key, value, unit, note: note ?? null, createdAt: at(addDays(today, -back), 20) });
  }
  for (const [back, text, tags, mood] of p.journal) {
    const date = addDays(today, -back);
    const s = out.sessions.find((x) => x.date === date && x.status === "done");
    out.journal.push({ id: id("j"), userId: uid, date, text, tags, mood, sessionId: s?.id ?? null, createdAt: at(date, 22, r.int(0, 50)) });
  }

  // ---- block baseline + closed-block summary (same shape as worker/index.ts blockStats)
  for (const b of out.blocks) {
    const sess = out.sessions.filter((x) => x.blockId === b.id);
    const ids = new Set(sess.map((x) => x.id));
    const sets = out.sets.filter((x) => ids.has(x.sessionId) && !x.deleted);
    const work = sets.filter((x) => x.kind !== "W");
    const done = sess.filter((x) => x.status === "done");
    const counted = sess.filter((x) => ["done", "missed", "skipped"].includes(x.status));
    const planned = p.prog.weeks.length * p.prog.order.length;
    const mins = done.map((x) => (x.endedAt! - x.startedAt!) / 60000);
    const firstBy = new Map<string, number>(), bestBy = new Map<string, number>(), firstSess = new Map<string, string>();
    for (const x of work) {
      const v = x.weightKg && x.reps && x.reps <= 12 && x.strict !== 0 && (x.kind === "N" || x.kind === "F") ? Math.round(x.weightKg * (1 + x.reps / 30) * 10) / 10 : 0;
      if (!v) continue;
      if (!firstSess.has(x.exKey)) firstSess.set(x.exKey, x.sessionId);
      if (firstSess.get(x.exKey) === x.sessionId) firstBy.set(x.exKey, Math.max(firstBy.get(x.exKey) ?? 0, v));
      bestBy.set(x.exKey, Math.max(bestBy.get(x.exKey) ?? 0, v));
    }
    const bw = out.body.filter((x) => x.weightKg != null && x.date >= b.startDate && x.date <= (b.endDate ?? today));
    const lifts = [...bestBy.entries()].map(([k, bst]) => ({ exKey: k, name: EXERCISES[k]?.name ?? k, start: firstBy.get(k) ?? bst, best: bst, pct: firstBy.get(k) ? Math.round(((bst - firstBy.get(k)!) / firstBy.get(k)!) * 1000) / 10 : 0 })).sort((a, z) => z.best - a.best);
    b.baseline ??= JSON.stringify({ bodyKg: bw[0]?.weightKg ?? p.body.kg0, e1rm: {} });
    if (b.status === "done") {
      b.summary = JSON.stringify({
        sessions: { done: done.length, missed: sess.filter((x) => x.status === "missed").length, skipped: sess.filter((x) => x.status === "skipped").length, extra: 0, planned },
        adherence: counted.length ? Math.round((done.length / counted.length) * 100) : null,
        progress: Math.round((done.length / planned) * 100),
        sets: work.filter((x) => x.kind === "N" || x.kind === "F").length,
        volume: Math.round(work.reduce((a, x) => a + totalKg({ exKey: x.exKey, weightKg: x.weightKg ?? null, kgBasis: x.kgBasis }) * (x.reps ?? 0), 0)),
        avgMinutes: mins.length ? Math.round(mins.reduce((a, m) => a + m, 0) / mins.length) : null,
        prs: sets.filter((x) => x.pr === 1).length,
        pains: sets.filter((x) => (x.painLevel ?? 0) > 0).length,
        bodyKg: { start: bw[0]?.weightKg ?? null, end: bw[bw.length - 1]?.weightKg ?? null },
        versions: [pv], lifts: lifts.slice(0, 12), weeksDone: [...new Set(done.map((x) => x.week))].sort(),
      });
      // month 2 starts from month 1's bests
      const next = out.blocks.find((x) => x.n === b.n + 1);
      if (next) next.baseline = JSON.stringify({ bodyKg: bw[bw.length - 1]?.weightKg ?? null, e1rm: Object.fromEntries(lifts.map((l) => [l.exKey, l.best])) });
    }
  }
  return out;
}
