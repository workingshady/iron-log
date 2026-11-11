// Warm-up SETS (the ramp to your working weight — not the general joint warm-up).
// Coaching consensus (no hard science; Berardi, Hevy, Lyfta, Barbell Logic): ramp up for the FIRST exercise of each
// cold muscle; later exercises for an already-warm muscle need 0-1 "feeder" set. Fewer reps as the weight rises.
//
//   heavy compound (≤8 reps), cold:  bar×10 (barbell) · 40%×8 · 60%×5 · 80%×2      → 3-4 sets
//   other compound, cold:            50%×8 · 75%×4                                    → 2 sets
//   isolation / small muscle, cold:  50%×10                                          → 1 set
//   muscle already warm (same group trained earlier today): heavy → 1 feeder 70%×3, else none
//   superset: warm up BOTH exercises before round 1 (alternate A1 → A2, no rest timer), then start.
// Warm-ups are logged as kind "W": not counted in volume, PRs or recommendations.
import type { PlanItem } from "./api";
import { EX_GROUP } from "../program/groups";
import { EX_MUSCLES } from "../program/muscles";
import { kindOf } from "../program/bank";
import { loadOf } from "./load";

export interface WarmSet { kg: number; reps: number; pct: number }
export interface WarmPlan { sets: WarmSet[]; why: string }

const round = (n: number, step: number) => Math.max(0, Math.round(n / step) * step);
const topReps = (r: PlanItem["reps"]) => (r == null ? 10 : Array.isArray(r) ? r[1] : r);

/**
 * Warm-up sets for plan item i, given today's working weight. `bar` = empty-bar weight for barbell/EZ lifts.
 * Muscles count as warm once an earlier (non-skipped) item in the session trained them as a primary muscle.
 */
export function warmupFor(plan: PlanItem[], i: number, workKg: number | null | undefined, bar = 0): WarmPlan {
  const it = plan[i];
  if (!it || it.metric !== "weight_reps" || !workKg || it.finisher) return { sets: [], why: "" };
  const step = loadOf(it.ex) === "pair" ? 2.5 : it.step || 2.5;
  const kind = kindOf(it.ex);
  const mine = new Set([...(EX_MUSCLES[it.ex]?.p ?? []), EX_GROUP[it.ex] ?? ""]);
  const warmBefore = plan.slice(0, i).filter((p) => !p.skipped).some((p) => (EX_MUSCLES[p.ex]?.p ?? []).some((m) => mine.has(m)) || (EX_GROUP[p.ex] && mine.has(EX_GROUP[p.ex]!)));
  const heavy = kind === "heavy" || topReps(it.reps) <= 8;
  const isBar = bar > 0;

  let rows: { pct: number; reps: number }[];
  let why: string;
  if (warmBefore) {
    rows = heavy ? [{ pct: 0.7, reps: 3 }] : [];
    why = heavy ? "Muscles already warm — 1 feeder set to groove the heavier weight." : "Muscles already warm from an earlier exercise — start your work sets.";
  } else if (heavy) {
    rows = [{ pct: 0.4, reps: 8 }, { pct: 0.6, reps: 5 }, { pct: 0.8, reps: 2 }];
    why = "First heavy lift for these muscles — ramp up, fewer reps as it gets heavier. Rest ~1 min between.";
  } else if (kind === "compound") {
    rows = [{ pct: 0.5, reps: 8 }, { pct: 0.75, reps: 4 }];
    why = "First exercise for these muscles — 2 quick ramp sets.";
  } else {
    rows = [{ pct: 0.5, reps: 10 }];
    why = "Cold muscle — 1 light set to find the groove.";
  }
  const sets: WarmSet[] = [];
  if (isBar && heavy && workKg > bar + 10) sets.push({ kg: bar, reps: 10, pct: Math.round((bar / workKg) * 100) });
  for (const r of rows) {
    const kg = Math.max(isBar ? bar : step, round(workKg * r.pct, step));
    if (kg >= workKg) continue;
    if (sets.length && kg <= sets[sets.length - 1].kg) continue;
    sets.push({ kg, reps: r.reps, pct: Math.round(r.pct * 100) });
  }
  return { sets, why };
}

/** Superset partners of item i (same letter), in order, including i. */
export function supersetOf(plan: PlanItem[], i: number): number[] {
  const t = plan[i]?.tag?.[0];
  return t ? plan.map((p, k) => (p.tag?.[0] === t ? k : -1)).filter((k) => k >= 0) : [i];
}
