// How weight is entered for each kind of equipment — one place for the whole app.
//
//  barbell  Olympic bar (default 20 kg): enter the TOTAL incl. the bar, or type plates per side.
//  ez       EZ / curl bar (default 10 kg; 5-14 kg in the wild — set yours in Settings): total incl. the bar.
//  pair     two dumbbells: kg PER HAND. Sets logged before v2.2 were both dumbbells added (kgBasis "total") → halved.
//  single   one dumbbell / kettlebell: the number on it.
//  stack    machine or cable: the number on the stack / pin.
//  body     bodyweight (optional extra kg).
// Logged numbers are never rewritten; kgBasis only explains how a number was entered.
import { EXERCISES, PAIRS } from "../program/exercises";
import type { SetLog } from "./api";

export type Load = "barbell" | "ez" | "pair" | "single" | "stack" | "body";

const BARBELL = new Set(["bench", "close_grip_bench", "squat", "rdl", "bb_row", "ohp", "bb_shrug", "hip_thrust"]);
const EZ = new Set(["ez_curl", "reverse_curl"]);
const SINGLE = new Set(["goblet_squat", "db_pullover", "db_row", "oh_tri_ext", "wrist_curl", "rev_wrist_curl", "wrist_roller"]);

export function loadOf(exKey: string): Load {
  if (PAIRS.has(exKey)) return "pair";
  if (BARBELL.has(exKey)) return "barbell";
  if (EZ.has(exKey)) return "ez";
  if (SINGLE.has(exKey)) return "single";
  const m = EXERCISES[exKey]?.metric;
  if (m === "reps" || m === "assist_reps" || m === "time") return "body";
  return "stack";
}

/** Bar weights (Settings → Equipment). */
export interface Bars { barKg: number; ezKg: number }
export const DEFAULT_BARS: Bars = { barKg: 20, ezKg: 10 };
export function barsFrom(settings?: Record<string, string> | null): Bars {
  const n = (v: string | undefined, d: number) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);
  return { barKg: n(settings?.barKg, 20), ezKg: n(settings?.ezKg, 10) };
}
export const barOf = (exKey: string, b: Bars) => (loadOf(exKey) === "ez" ? b.ezKg : loadOf(exKey) === "barbell" ? b.barKg : 0);

/** Short label for the kg input. */
export function kgLabel(exKey: string, b: Bars): string {
  switch (loadOf(exKey)) {
    case "pair": return "kg per hand";
    case "barbell": return `kg total (bar ${b.barKg})`;
    case "ez": return `kg total (EZ bar ${b.ezKg})`;
    case "single": return "kg (one dumbbell)";
    case "stack": return "kg on stack";
    default: return "+kg";
  }
}

/** One-line help shown under the input. */
export function kgHelp(exKey: string, b: Bars): string {
  switch (loadOf(exKey)) {
    case "pair": return "Type ONE dumbbell's weight (two 20 kg dumbbells → 20).";
    case "barbell": return `Bar + both sides. 20 kg plate each side on a ${b.barKg} kg bar → ${b.barKg + 40}. Or tap "per side".`;
    case "ez": return `EZ bar + both sides. 5 kg each side on a ${b.ezKg} kg bar → ${b.ezKg + 10}. Change the bar weight in Settings.`;
    case "single": return "The number on the dumbbell (or cable stack if you used a rope).";
    case "stack": return "The number on the pin / stack.";
    default: return "";
  }
}

type S = Pick<SetLog, "exKey" | "weightKg"> & { kgBasis?: string | null };
export const isPair = (exKey: string) => PAIRS.has(exKey);

/** Weight in the unit the app shows for this exercise (per hand for pairs; total for bars; stack otherwise). */
export function shownKg(s: S): number | null {
  if (s.weightKg == null) return null;
  if (!isPair(s.exKey)) return s.weightKg;
  return s.kgBasis === "per_hand" ? s.weightKg : s.weightKg / 2;
}
/** Total load moved per rep (both dumbbells for pairs) — used for volume. */
export function totalKg(s: S): number {
  const w = shownKg(s) ?? 0;
  return isPair(s.exKey) ? w * 2 : w;
}
/** Copy of a set with weightKg converted to the shown unit. */
export const normalize = <T extends S>(s: T): T => ({ ...s, weightKg: shownKg(s), kgBasis: isPair(s.exKey) ? "per_hand" : s.kgBasis ?? null });
/** kgBasis to store when logging a new set. */
export const basisFor = (exKey: string) => (isPair(exKey) ? "per_hand" : loadOf(exKey) === "barbell" || loadOf(exKey) === "ez" ? "total" : null);
