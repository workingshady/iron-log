// Exercise bank: tags + defaults for EVERY exercise (in the plan or not), so any exercise can be
// added to a workout or swapped in with sensible sets/reps/rest and a starting weight.
//
// Defaults follow the program's own rules (see versions/v2.ts): heavy compounds 3×5-8 @RIR2, 2.5-3 min rest;
// other compounds 3×8-12 @RIR1-2, 2 min; isolation 3×10-15 @RIR0-1, 75-90 s; small muscles (delts, calves,
// forearms) 3×12-20, 60 s; holds 3×30 s; carries 3×30 m. Starting weights come from STARTER ratios.
import type { Rx } from "./types";
import { EXERCISES } from "./exercises";
import { EX_GROUP, type Group } from "./groups";
import { EX_MUSCLES } from "./muscles";
import { STARTER } from "./starters";
import { loadOf } from "../shared/load";

export type Equip = "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight" | "other";
export type Kind = "heavy" | "compound" | "isolation" | "small" | "core" | "hold";

const HEAVY = new Set(["bench", "squat", "deadlift", "rdl", "ohp", "bb_row", "front_squat", "incline_bench", "rack_pull", "push_press", "hack_squat", "leg_press", "smith_squat", "close_grip_bench", "hip_thrust", "good_morning", "tbar_row", "seal_row"]);
const COMPOUND = new Set([
  "db_bench", "incline_db", "machine_press", "smith_incline", "landmine_press", "db_ohp", "machine_shoulder_press", "arnold_press", "pulldown", "neutral_pulldown",
  "cable_row", "wide_cable_row", "machine_row", "cs_row", "db_row", "meadows_row", "single_arm_pulldown", "single_arm_cable_row", "bss", "walking_lunge", "goblet_squat",
  "db_rdl", "step_up", "reverse_lunge", "single_leg_rdl", "jm_press", "pullup", "chinup", "dip", "pushup", "knuckle_pushup", "deficit_pushup", "diamond_pushup",
  "inverted_row", "neg_pullup", "neg_dip", "assisted_dip", "band_pullup", "assisted_pullup_machine", "bench_dip", "cable_upright_row", "back_extension", "cable_pull_through",
]);
// v3 bank (templates): new compounds
for (const k of ["incline_pushup", "pike_pushup", "bw_squat", "bw_split_squat", "db_floor_press", "db_bent_row", "machine_incline_press", "dip_machine"]) COMPOUND.add(k);
/** Your gym HAS a dip station and pull-up bars, but NO assisted machine and NO resistance bands → never auto-suggest those. */
export const UNAVAILABLE = new Set(["assisted_dip", "band_pullup", "assisted_pullup_machine", "band_pull_apart"]);
const SMALL_GROUPS: Group[] = ["Calves", "Forearms/Grip", "Neck", "Traps"];
const SIDE_DELT = /lateral|y_raise|upright|rear|face_pull|pec_deck_rev|reverse_pec/;

export function equipOf(key: string): Equip {
  const e = EXERCISES[key];
  const n = `${key} ${e?.name ?? ""}`.toLowerCase();
  if (e?.metric === "reps" || e?.metric === "time" || e?.metric === "assist_reps") return /cable|band|machine/.test(n) ? "other" : "bodyweight";
  if (/cable|pulldown|pushdown|face_pull|crossover|pallof|woodchop|pull.through/.test(n)) return "cable";
  if (/machine|smith|pec_deck|leg_press|hack|leg_curl|leg_extension|seated_calf|standing_calf|reverse_pec|abduction|adduction|t-bar|tbar|landmine|meadows/.test(n)) return "machine";
  const l = loadOf(key);
  if (l === "barbell" || l === "ez") return "barbell";
  if (l === "pair" || l === "single") return "dumbbell";
  return "other";
}

export function kindOf(key: string): Kind {
  const e = EXERCISES[key];
  if (e?.metric === "time" || e?.metric === "distance") return "hold";
  if (HEAVY.has(key)) return "heavy";
  if (COMPOUND.has(key)) return "compound";
  const g = EX_GROUP[key];
  if (g === "Core") return "core";
  if ((g && SMALL_GROUPS.includes(g)) || SIDE_DELT.test(key)) return "small";
  return "isolation";
}

/** Sensible prescription for an exercise you add yourself (not from the plan). */
export function defaultRx(key: string): Rx {
  const e = EXERCISES[key];
  const k = kindOf(key);
  if (e?.metric === "time") return { ex: key, sets: 3, seconds: 30, rest: 60 };
  if (e?.metric === "distance") return { ex: key, sets: 3, meters: 30, rest: 90 };
  if (e?.metric === "reps" || e?.metric === "assist_reps") return { ex: key, sets: 3, reps: k === "core" ? [10, 15] : [8, 15], rir: 2, rest: 75 };
  switch (k) {
    case "heavy": return { ex: key, sets: 3, reps: [5, 8], rir: 2, rest: 165 };
    case "compound": return { ex: key, sets: 3, reps: [8, 12], rir: [1, 2], rest: 120 };
    case "small": return { ex: key, sets: 3, reps: [12, 20], rir: [0, 1], rest: 60 };
    case "core": return { ex: key, sets: 3, reps: [10, 15], rir: 1, rest: 60 };
    default: return { ex: key, sets: 3, reps: [10, 15], rir: [0, 1], rest: 75 };
  }
}

/**
 * Starting-weight conversion between ANY two exercises: both STARTER ratios are "share of your bench max",
 * so to/from ≈ how much you can use on `to` given your weight on `from`. Rep ranges usually differ
 * (heavy vs isolation), so we scale with Epley: weight ∝ e1RM / (1 + reps/30).
 */
export function genericRatio(from: string, to: string, fromReps = 10, toReps = 10): number | null {
  const a = from === "bench" ? 1 : STARTER[from], b = to === "bench" ? 1 : STARTER[to];
  if (!a || !b) return null;
  return (b / a) * ((1 + fromReps / 30) / (1 + toReps / 30));
}

export const WHY_SWAP = ["equipment busy", "no equipment", "pain", "too hard", "too easy", "preference"] as const;

/**
 * Alternatives ranked for the reason you swap:
 *  • the hand-picked alts first, then exercises for the same muscle group with overlapping muscles;
 *  • "equipment busy" / "no equipment" → different equipment first;
 *  • "pain" → machines/cables & isolation first (stable path, easy to stop), heavy barbell last;
 *  • "too hard" → easier: machines, lighter kinds; "too easy" → heavier/freer: barbell & compound first.
 */
export function smartAlts(key: string, reason?: string | null, limit = 8): string[] {
  const e = EXERCISES[key];
  if (!e) return [];
  const g = EX_GROUP[key];
  const mine = new Set(EX_MUSCLES[key]?.p ?? []);
  const eq = equipOf(key);
  const k = kindOf(key);
  const rank = (x: string) => {
    let s = 0;
    if (e.alts?.includes(x)) s += 6;
    if (EX_GROUP[x] === g) s += 3;
    s += (EX_MUSCLES[x]?.p ?? []).filter((m) => mine.has(m)).length * 2;
    const xe = equipOf(x), xk = kindOf(x);
    if (reason === "equipment busy" || reason === "no equipment") s += xe !== eq ? 3 : -4;
    if (reason === "pain") s += (xe === "machine" || xe === "cable" ? 3 : 0) + (xk === "isolation" || xk === "small" ? 1 : 0) - (xk === "heavy" ? 4 : 0);
    if (reason === "too hard") s += (xe === "machine" ? 2 : 0) + (xk === "heavy" ? -3 : 1);
    if (reason === "too easy") s += (xe === "barbell" ? 2 : 0) + (xk === "heavy" || xk === "compound" ? 2 : -1);
    if (xk === k) s += 1;
    return s;
  };
  return Object.keys(EXERCISES)
    .filter((x) => x !== key && !UNAVAILABLE.has(x) && (EX_GROUP[x] === g || e.alts?.includes(x)))
    .map((x) => ({ x, s: rank(x) }))
    .filter((r) => r.s >= 4)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.x);
}

export const EQUIP_LABEL: Record<Equip, string> = { barbell: "Barbell", dumbbell: "Dumbbell", cable: "Cable", machine: "Machine", bodyweight: "Bodyweight", other: "Other" };
