// A plan "design" = one normal training week (days → exercises with sets / reps / RIR / rest).
// expand() turns it into a full 4-week Program with the same wave the owner's plan uses (program/versions/v2.ts):
//   W1 Ramp-in  sets −1 (when ≥3), RIR +1 on isolation      → find working weights
//   W2 Build    the design as written
//   W3 Overload +1 set on non-heavy work, RIR −1 (heavy never below 1, isolation 0-1)
//   W4 Deload   half the sets, RIR 3, top of the rep range with lighter weight (Bell 2023 deload consensus)
// Templates (program/templates/*.ts) and user programs (user_programs.json) are both written as designs, so the
// editor only ever edits ONE week and the periodisation stays correct.
import { EXERCISES } from "../exercises";
import { EX_GROUP, type Group } from "../groups";
import { EX_MUSCLES, MUSCLE_LABEL, type Muscle } from "../muscles";
import { validate } from "../index";
import type { DayPlan, Exercise, Metric, Program, Rx, TestDef, WeekPlan } from "../types";

export interface DItem {
  ex: string;
  /** Sets in a normal week (Week 2). */
  sets: number;
  reps?: number | [number, number] | null;
  seconds?: number;
  meters?: number;
  /** Base reps-in-reserve (Week 2). null = no RIR target (finishers, core holds). Default: heavy 2, others 1. */
  rir?: number | null;
  rest: number;
  /** Short coaching note. */
  tech?: string;
  /** Big compound: never below RIR 1, no extra set in Week 3. */
  heavy?: boolean;
  /** Small-muscle finisher shown at the end. */
  fin?: boolean;
  /** Superset label (A1/A2). */
  tag?: string;
}
export interface DDay { key: string; name: string; focus: string; items: DItem[] }
export interface Design { days: DDay[] }

export type Level = "beginner" | "intermediate" | "advanced";
export type Goal = "muscle" | "strength" | "general";
/** gym ⊇ dumbbells ⊇ bodyweight */
export type EquipLevel = "gym" | "dumbbells" | "bodyweight";

export interface TemplateMeta {
  id: string;
  name: string;
  split: string;
  days: number;
  levels: Level[];
  goals: Goal[];
  equipment: EquipLevel;
  /** Muscle groups that get extra work. */
  focus: Group[];
  /** One-line pitch. */
  blurb: string;
  /** Why this works (research, 2-4 short sentences). */
  why: string;
}

/** A user-made exercise, stored inside the program JSON (keys start with "c-"). */
export interface CustomEx {
  key: string;
  name: string;
  metric: Metric;
  group: Group;
  p: Muscle[];
  s?: Muscle[];
  cues?: string[];
  perSide?: boolean;
}

/** What user_programs.json holds: a normal Program (everything else in the app reads it) + the design it came from. */
export type UserProgram = Program & { design: Design; template?: string | null; custom?: CustomEx[] };

export interface Template { meta: TemplateMeta; design: Design; program: Program }

// ---------------------------------------------------------------- custom exercises

const CUSTOM_RE = /^c-[a-z0-9-]{1,80}$/;
/** Adds a program's custom exercises to the shared lookups (EXERCISES / EX_MUSCLES / EX_GROUP). Never overwrites a library key. */
export function registerCustom(list?: CustomEx[] | null) {
  for (const c of list ?? []) {
    if (!c || !CUSTOM_RE.test(c.key)) continue;
    const prev = EXERCISES[c.key] as (Exercise & { custom?: boolean }) | undefined;
    if (prev && !prev.custom) continue;
    const alts = Object.keys(EXERCISES).filter((k) => !k.startsWith("c-") && EX_GROUP[k] === c.group).slice(0, 3);
    const ex: Exercise & { custom: boolean } = {
      key: c.key, name: c.name, metric: c.metric, custom: true, perSide: c.perSide,
      muscles: [...c.p, ...(c.s ?? [])].map((m) => MUSCLE_LABEL[m] ?? m).join(", ") || c.group,
      cues: c.cues?.length ? c.cues : ["Full range, controlled", "Same form every set"],
      alts: alts.length >= 2 ? alts : ["pushup", "plank"],
    };
    EXERCISES[c.key] = ex;
    EX_MUSCLES[c.key] = { p: c.p.length ? c.p : ["abs"], s: c.s };
    EX_GROUP[c.key] = c.group;
  }
}

// ---------------------------------------------------------------- schedules

// Index 0 = Sunday. Same preset names as the owner's plan so Settings → schedule and the week planner keep working.
const POS_A: Record<number, number[]> = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
const POS_B: Record<number, number[]> = { 1: [6], 2: [6, 2], 3: [6, 1, 3], 4: [6, 0, 2, 3], 5: [6, 0, 1, 3, 4], 6: [6, 0, 1, 2, 3, 4], 7: [6, 0, 1, 2, 3, 4, 5] };
export function schedulesFor(order: string[]): Record<string, string[]> {
  const mk = (pos: number[]) => { const w = Array(7).fill("rest"); pos.forEach((p, i) => (w[p] = order[i])); return w; };
  const n = Math.min(7, Math.max(1, order.length));
  return { "A (Mon start)": mk(POS_A[n]), "B (Sat start, Egypt weekend)": mk(POS_B[n]) };
}

// ---------------------------------------------------------------- expand

export const GENERIC_RULES = [
  "Every rep counts only with full range + control (≈2 s down).",
  "Hit the top of the rep range on all sets at the target RIR → add weight next time (the app suggests it).",
  "Big lifts never to failure — RIR 1-2 even in Week 3. Isolation can go close to failure in Week 3.",
  "Log the truth: real reps, real RIR. The plan adjusts to what you actually did.",
  "Missed a day → do the next session, don't double up. Sharp pain → stop, swap, log it.",
  "Week 4 is a deload: half the sets, lighter. Recover, then repeat the plan a little heavier.",
];
export const GENERIC_TESTS: TestDef[] = [
  { key: "pushups", name: "Push-ups (strict, max)", unit: "reps" },
  { key: "plank", name: "Plank", unit: "s" },
  { key: "dead_hang", name: "Dead hang", unit: "s" },
  { key: "pullups", name: "Strict pull-ups (attempt)", unit: "reps" },
];
const WEEKS = [
  { n: 1, name: "Ramp-in", brief: "One set fewer, 1 more rep in reserve. Find your working weights; every rep strict." },
  { n: 2, name: "Build", brief: "Full plan. Beat last week by a rep or a weight step." },
  { n: 3, name: "Overload", brief: "Hardest week: an extra set on smaller lifts, isolation close to failure. Big lifts stay at RIR 1." },
  { n: 4, name: "Deload", brief: "Half the sets, RIR 3, lighter weight. Recover, then start the next month a little heavier." },
];

const clampRir = (n: number) => Math.max(0, Math.min(5, n));
function weekRx(it: DItem, n: number): Rx {
  const metric = EXERCISES[it.ex]?.metric;
  const base = it.rir === undefined ? (it.fin || metric === "time" || metric === "distance" ? null : it.heavy ? 2 : 1) : it.rir;
  const s = Math.max(1, Math.round(it.sets));
  const sets = n === 1 ? (s >= 3 ? s - 1 : s) : n === 2 ? s : n === 3 ? s + (!it.heavy && !it.fin && s <= 4 ? 1 : 0) : Math.max(1, Math.ceil(s / 2));
  let rir: Rx["rir"];
  if (base != null && !it.fin) {
    if (n === 4) rir = 3;
    else if (n === 1) rir = it.heavy ? base : clampRir(base + 1);
    else if (n === 2) rir = base;
    else rir = it.heavy ? Math.max(1, base - 1) : base <= 1 ? [0, 1] : base - 1;
  }
  const reps = n === 4 && Array.isArray(it.reps) ? it.reps[1] : it.reps;
  const tech = n === 4 && !it.fin ? "Deload: smooth reps, leave 3 in the tank" : n === 3 && !it.heavy && !it.fin && base != null ? [it.tech, "Last set: close to failure"].filter(Boolean).join(" · ") : it.tech;
  const rx: Rx = { ex: it.ex, sets, rest: Math.max(0, Math.round(it.rest)) };
  if (reps !== undefined) rx.reps = reps;
  if (it.seconds != null) rx.seconds = it.seconds;
  if (it.meters != null) rx.meters = it.meters;
  if (rir !== undefined) rx.rir = rir;
  if (tech) rx.tech = tech;
  if (it.tag) rx.tag = it.tag;
  if (it.fin) rx.finisher = true;
  return rx;
}

export function expand(design: Design, head: { id: string; version: string; name: string; changelog?: string; rules?: string[]; tests?: TestDef[] }): Program {
  const order = design.days.map((d) => d.key);
  const weeks: WeekPlan[] = WEEKS.map((w) => ({
    ...w,
    days: design.days.map((d): DayPlan => ({ key: d.key, name: d.name, focus: d.focus, items: d.items.map((it) => weekRx(it, w.n)) })),
  }));
  return {
    id: head.id, version: head.version, name: head.name, changelog: head.changelog ?? "",
    order, schedules: schedulesFor(order), weeks, tests: head.tests ?? GENERIC_TESTS, rules: head.rules ?? GENERIC_RULES,
  };
}

// ---------------------------------------------------------------- volume + time

/** Muscles shown in the weekly-volume chart, in body order. */
export const VOLUME_MUSCLES: Muscle[] = ["chest", "upper-back", "front-deltoids", "back-deltoids", "trapezius", "biceps", "triceps", "quadriceps", "hamstring", "gluteal", "calves", "abs"];

/** Fractional hard sets per muscle for one design week (primary = 1, secondary = ½; Pelland 2024). */
export function designVolume(design: Design): Partial<Record<Muscle, number>> {
  const out: Partial<Record<Muscle, number>> = {};
  for (const d of design.days)
    for (const it of d.items) {
      const m = EX_MUSCLES[it.ex];
      if (!m) continue;
      m.p.forEach((x) => (out[x] = (out[x] ?? 0) + it.sets));
      (m.s ?? []).forEach((x) => (out[x] = (out[x] ?? 0) + it.sets / 2));
    }
  return out;
}

/**
 * Weekly fractional sets → guidance band (Schoenfeld 2017, Pelland 2024: gains keep rising to ~10-20 hard sets/week, flatten above):
 *   big muscles   low <6 · minimum 6-10 · good 10-20 · high >20  (front+side delts >24: they also get every press)
 *   small muscles low <3 · minimum 3-6 · good 6-20 · high >20  (rear delts, traps, calves, abs, forearms, neck: lots of indirect work)
 */
export type Band = "low" | "min" | "good" | "high";
const SMALL_MUSCLES = new Set<Muscle>(["back-deltoids", "trapezius", "calves", "abs", "obliques", "forearm", "neck", "adductor", "abductors", "lower-back"]);
export function bandOf(sets: number, m?: Muscle): Band {
  const small = m ? SMALL_MUSCLES.has(m) : false;
  const [lo, mid, hi] = small ? [3, 6, 20] : m === "front-deltoids" ? [6, 10, 24] : [6, 10, 20];
  return sets < lo ? "low" : sets < mid ? "min" : sets > hi ? "high" : "good";
}
export const BAND_LABEL: Record<Band, string> = { low: "Too low", min: "Minimum", good: "Good", high: "High" };

/** Rough minutes for one day: ~45 s per set + the rest after it + ~8 min warm-up and set-up. */
export function dayMinutes(d: DDay): number {
  const s = d.items.reduce((a, it) => a + it.sets * (45 + it.rest), 0);
  return Math.round(s / 60 + 8);
}

// ---------------------------------------------------------------- validation (user programs)

/** Structural checks + the library check from program/index.ts validate(). Returns readable errors. */
export function validateUserProgram(p: UserProgram): string[] {
  const errs: string[] = [];
  const d = p.design;
  if (!p.name?.trim()) errs.push("Give the plan a name.");
  if (!d || !Array.isArray(d.days) || !d.days.length) return [...errs, "Add at least one training day."];
  if (d.days.length > 7) errs.push("At most 7 training days.");
  const keys = new Set<string>();
  d.days.forEach((day, i) => {
    const at = `Day ${i + 1}${day.name ? ` (${day.name})` : ""}`;
    if (!day.key || keys.has(day.key)) errs.push(`${at}: duplicate day id.`);
    keys.add(day.key);
    if (!day.name?.trim()) errs.push(`${at}: needs a name.`);
    if (!day.items?.length) errs.push(`${at}: add at least one exercise.`);
    (day.items ?? []).forEach((it) => {
      const nm = EXERCISES[it.ex]?.name ?? it.ex;
      if (!EXERCISES[it.ex]) { errs.push(`${at}: unknown exercise "${it.ex}" — swap it.`); return; }
      if (!(it.sets >= 1 && it.sets <= 10)) errs.push(`${at} · ${nm}: sets must be 1-10.`);
      if (Array.isArray(it.reps) && (it.reps[0] < 1 || it.reps[1] < it.reps[0] || it.reps[1] > 100)) errs.push(`${at} · ${nm}: rep range looks wrong.`);
      if (typeof it.reps === "number" && (it.reps < 1 || it.reps > 100)) errs.push(`${at} · ${nm}: reps must be 1-100.`);
      if (!(it.rest >= 0 && it.rest <= 600)) errs.push(`${at} · ${nm}: rest must be 0-600 s.`);
      if (it.rir != null && !(it.rir >= 0 && it.rir <= 5)) errs.push(`${at} · ${nm}: RIR must be 0-5.`);
    });
  });
  registerCustom(p.custom);
  // library check (same as `npm run check`); unknown exercises are already reported per day above
  errs.push(...validate(p).filter((e) => !/^W\d+ .*unknown exercise/.test(e)));
  return errs;
}

/** Fresh day key not used yet ("D1", "D2", …). */
export function nextDayKey(design: Design): string {
  for (let i = 1; ; i++) if (!design.days.some((d) => d.key === `D${i}`)) return `D${i}`;
}
