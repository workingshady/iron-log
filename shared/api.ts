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
  deleted?: number;
}

export interface Best { e1rm: number; weightKg: number; reps: number; seconds: number }
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
