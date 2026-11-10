// Program data model. Everything the app shows comes from these shapes.
// To change the plan, edit program/versions/*.ts — never the UI.

/** How a set is measured. Decides which inputs the logger shows. */
export type Metric =
  | "weight_reps" // kg × reps (barbell, dumbbell, machine)
  | "reps" // bodyweight reps (optional extra kg)
  | "assist_reps" // band / machine assistance + reps
  | "time" // seconds held (optional extra kg)
  | "distance"; // meters carried + kg

export interface Exercise {
  key: string;
  name: string;
  metric: Metric;
  muscles: string;
  cues: string[];
  /** YouTube video id(s). Missing → the app shows a YouTube search link. */
  yt?: string | string[];
  /** Keys of exercises you can swap to (gym busy, pain, no equipment). */
  alts?: string[];
  /** Weight step for the +/- buttons (kg). Default 2.5. */
  step?: number;
  /** Reps are per side / per arm / per leg. */
  perSide?: boolean;
  /** Two dumbbells (one per hand): weight is entered PER HAND. */
  pair?: boolean;
}

/** One exercise inside a day, with its target. */
export interface Rx {
  ex: string;
  sets: number;
  /** Target reps: single number or [min, max] range (your margin). null = max reps. */
  reps?: number | [number, number] | null;
  seconds?: number;
  meters?: number;
  /** Reps in reserve target. */
  rir?: number | [number, number];
  /** Rest after this exercise's set, in seconds. 0 = go straight to the superset partner. */
  rest: number;
  /** Superset label, e.g. "A1", "A2". */
  tag?: string;
  /** Intensity technique / instruction, short. */
  tech?: string;
  /** Small-muscle finisher (grip, wrist, neck, push-up burnout): shown in its own block at the end, not a main exercise. */
  finisher?: boolean;
}

export interface DayPlan {
  key: string; // "D1"
  name: string; // "Push"
  focus: string;
  items: Rx[];
}

export interface WeekPlan {
  n: number;
  name: string;
  brief: string;
  days: DayPlan[];
}

export interface TestDef {
  key: string;
  name: string;
  unit: "reps" | "s" | "kg" | "cm";
}

export interface Program {
  id: string; // stable id, e.g. "ppl-arnold"
  version: string; // bump on every change: "1.0.0" → "1.1.0"
  name: string;
  /** Why this version exists — what changed and why (from the last review). */
  changelog: string;
  /** Day keys in training order; rest days are not listed. */
  order: string[];
  /** Weekday schedules. Index 0 = Sunday. Value = day key or "rest". */
  schedules: Record<string, string[]>;
  weeks: WeekPlan[];
  tests: TestDef[];
  rules: string[];
}

// ---------- tiny helpers so version files stay short and readable ----------

type RxOpts = Omit<Rx, "ex" | "sets" | "reps" | "seconds" | "meters">;

/**
 * rx("bench", "3x6", { rir: 3, rest: 150 })
 * Scheme forms: "3x6"  "3x8-12"  "2x20s"  "3x30m"  "2xmax"
 */
export function rx(ex: string, scheme: string, opts: Partial<RxOpts> = {}): Rx {
  const m = scheme.match(/^(\d+)x(.+)$/);
  if (!m) throw new Error(`Bad scheme "${scheme}" for ${ex}`);
  const sets = Number(m[1]);
  const t = m[2];
  const base: Rx = { ex, sets, rest: opts.rest ?? 90, ...opts };
  if (t === "max") return { ...base, reps: null };
  if (t.endsWith("s")) return { ...base, seconds: Number(t.slice(0, -1)) };
  if (t.endsWith("m")) return { ...base, meters: Number(t.slice(0, -1)) };
  if (t.includes("-")) {
    const [a, b] = t.split("-").map(Number);
    return { ...base, reps: [a, b] };
  }
  return { ...base, reps: Number(t) };
}
