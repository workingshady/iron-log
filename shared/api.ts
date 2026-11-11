// Shapes shared by the Worker (API) and the React app.
import type { Metric, Rx } from "../program/types";
import type { SetKind } from "./lists";

/** One exercise inside a session's plan (program Rx + exercise info, frozen at start). */
export interface PlanItem extends Rx {
  name: string;
  metric: Metric;
  muscles: string;
  cues: string[];
  yt: string[];
  alts: { key: string; name: string }[];
  step: number;
  perSide?: boolean;
  swappedFrom?: string;
  swapReason?: string;
  /** Suggested starting kg after a swap (from the swap ratio). */
  startKg?: number;
  skipped?: boolean;
}

export interface Readiness {
  sleep?: number;
  energy?: number;
  mood?: number;
  stress?: number;
  soreness?: number;
}

export interface Session {
  id: string;
  programVersionId: string;
  week: number;
  dayKey: string;
  dayName: string;
  status: "active" | "done" | "abandoned" | "missed" | "skipped";
  kind: "planned" | "picked" | "extra";
  date: string;
  startedAt: number | null;
  endedAt: number | null;
  plan: PlanItem[];
  readiness: Readiness | null;
  rpe: number | null;
  bodyweight: number | null;
  excuse: string | null;
  note: string | null;
}

export interface SetLog {
  id: string;
  sessionId: string;
  exKey: string;
  itemIdx: number;
  setNo: number;
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  meters: number | null;
  assist: string | null;
  rir: number | null;
  restBeforeS: number | null;
  doneAt: number;
  note: string | null;
  painArea: string | null;
  painLevel: number | null;
  swappedFrom: string | null;
  suggested?: string | null;
  pr?: number;
  strict?: number | null;
  /** "per_hand" | "total" for dumbbell pairs (see worker/db/schema.ts). */
  kgBasis?: string | null;
  /** Equipment actually used (EQUIP_USED id). Plate-loaded vs stack numbers aren't comparable. */
  equip?: string | null;
  deleted?: number;
}

export interface Best {
  e1rm: number; weightKg: number; reps: number; seconds: number;
  /** The set behind the record and when (added v2.4 — older clients ignore them). */
  at?: string; setKg?: number | null; setReps?: number | null;
  /** Best estimated max (or reps / seconds) in your FIRST session of this exercise → progress since you started. */
  start?: number; startDate?: string;
  /** Sessions with this exercise. */
  sessions?: number;
}
export interface Lifts {
  hist: Record<string, { date: string; sets: SetLog[]; effort?: string | null; joints?: string | null; sessionId: string }>;
  best: Record<string, Best>;
}

export interface SlotInfo {
  week: number;
  dayKey: string;
  dayName: string;
  focus: string;
  items: number;
  status: "done" | "skipped" | "open";
}

export interface AppState {
  program: { id: string; version: string; name: string; changelog: string; rules: string[] };
  /** The current month (block): plan position is counted inside it. */
  block?: { id: string; n: number; name: string; startDate: string; startVersion: string };
  weeks: { n: number; name: string; brief: string }[];
  slots: SlotInfo[];
  next: SlotInfo | null;
  active: { id: string; dayName: string; week: number; startedAt: number | null } | null;
  schedules: Record<string, string[]>;
  settings: Record<string, string>;
  tests: { key: string; name: string; unit: string }[];
  thisWeek: { done: number; missed: number; minutes: number };
}

export interface SessionBundle {
  session: Session;
  sets: SetLog[];
  /** Previous performance per exercise key (most recent finished session). */
  last: Record<string, { date: string; sets: SetLog[]; effort?: string | null; joints?: string | null }>;
  /** All-time bests per exercise (excluding this session) — for live PR detection. */
  best: Record<string, Best>;
  /** This session's per-exercise feedback, keyed `${sessionId}:${itemIdx}`. */
  feedback: Record<string, { effort: string | null; joints: string | null }>;
}

export interface HistoryRow {
  id: string;
  date: string;
  week: number;
  dayKey: string;
  dayName: string;
  status: Session["status"];
  kind: Session["kind"];
  startedAt: number | null;
  endedAt: number | null;
  excuse: string | null;
  note: string | null;
  rpe: number | null;
  sets: number;
  volume: number;
  pains: number;
  /** Exercises done in this session (for search). */
  exKeys?: string[];
  /** Month (block) and plan version this session belongs to. */
  blockId?: string | null; blockName?: string | null; version?: string;
}

export interface ProgressPoint {
  date: string;
  sessionId: string;
  bestWeight: number | null;
  bestReps: number | null;
  bestSeconds: number | null;
  bestMeters: number | null;
  e1rm: number | null;
  volume: number;
  sets: number;
}

export interface ProgressData {
  exercises: { exKey: string; name: string; metric: Metric; points: ProgressPoint[] }[];
  weeks: { start: string; sessions: number; missed: number; sets: number; volume: number; minutes: number }[];
  excuses: { excuse: string; n: number }[];
  pains: { date: string; exKey: string; area: string | null; level: number | null; note: string | null }[];
}

export interface DashboardData {
  days: Record<string, { status: string; sets: number; minutes: number; names: string[] }>;
  streak: number;
  bestStreak: number;
  adherence: number | null;
  creatine: { today: number; target: number; streak: number; days: Record<string, number> };
  body: { date: string; weightKg: number | null }[];
  cardioDays: Record<string, number>;
  cardioWeek: { sessions: number; minutes: number; kcal: number };
}

export interface CardioLog {
  id: string; date: string; protocol: string; status: "done" | "partial" | "skipped";
  startedAt: number | null; endedAt: number | null; minutes: number | null; distanceKm: number | null;
  kcalMachine: number | null; kcalEst: number | null; rpe: number | null; speedAdj: number | null; note: string | null; sessionId: string | null; createdAt?: number;
}

export interface InsightsData {
  insights: { tone: "good" | "warn" | "bad" | "info"; title: string; text: string }[];
  muscles: { groups: readonly string[]; weeks: { week: number; sets: Record<string, number>; ex: Record<string, number> }[] };
}

/** One "what goes with good sessions" comparison (worker/analytics.ts). An association, never proof. */
export interface AnalyticsLink {
  id: string;
  label: string;
  hi: { label: string; n: number; mean: number };
  lo: { label: string; n: number; mean: number };
  /** hi.mean − lo.mean */
  diff: number;
  /** "%" = session performance vs your own baseline · "reps" = reps lost to the next set at the same weight */
  unit: "%" | "reps";
  better: "higher" | "lower";
  /** |diff| > 2 × standard error of the difference: big enough to take seriously (still not proof). */
  clear: boolean;
}

/** GET /api/analytics: dashboard numbers by calendar week (formulas in worker/analytics.ts). */
export interface AnalyticsData {
  weeks: { start: string; sessions: number; missed: number; hardSets: number; tonnage: number; minutes: number | null; prs: number }[];
  muscles: { groups: string[]; small: string[]; weeks: { start: string; sets: Record<string, number> }[] };
  lifts: { exKey: string; name: string; pair: boolean; e1rm: number; best: number; change4w: number | null; sessions: number; last: string; points: { date: string; e1rm: number }[] }[];
  effort: { rir: number[]; logged: number; total: number };
  links: AnalyticsLink[];
  pending: { label: string; have: number; need: number }[];
  perfSessions: number;
  prs: { date: string; exKey: string; name: string; kg: number | null; reps: number | null; e1rm: number | null }[];
  adherence4w: number | null;
}
