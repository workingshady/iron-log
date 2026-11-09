// Recommended load per set. Pure functions, used by the workout screen, Plan and Home.
//
// Rules (double progression + RIR, see docs/GUIDE.md):
//  1. All work sets hit the TOP of the rep range at ≥ target RIR → add one weight step (two if "easy").
//  2. Otherwise keep the weight and aim for +1 rep (up to the top of the range).
//  3. Two or more sets fell below the BOTTOM of the range → drop one step.
//  4. Target reps changed a lot vs last time (e.g. 8 → 5) → recompute from estimated 1RM:
//     kg = e1RM ÷ (1 + (reps + RIR) / 30)   (Epley, with reps-in-reserve added back)
//  5. Deload week → ~10% lighter. Joint pain / "too much" last time → hold or −1 step.
//  6. No history → estimate from a related lift (swap ratio) or ask for an RIR-3 starting set.
import { EXERCISES } from "../program/exercises";
import { swapHint } from "../program/swaps";
import type { Rx } from "../program/types";
import type { SetLog } from "./api";

export type RecKind = "up" | "hold" | "down" | "start" | "deload" | "estimate";
export interface Rec {
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  kind: RecKind;
  why: string;
}
export interface ExHistory {
  date: string;
  sets: SetLog[]; // work sets of the most recent session with this exercise
  effort?: string | null; // easy | right | hard | too_much
  joints?: string | null; // fine | achy | pain
}

const round = (n: number, step: number) => Math.max(0, Math.round(n / step) * step);
const topOf = (r: Rx["reps"]) => (r == null ? null : Array.isArray(r) ? r[1] : r);
const botOf = (r: Rx["reps"]) => (r == null ? null : Array.isArray(r) ? r[0] : r);
const rirOf = (r: Rx["rir"]) => (r == null ? 2 : Array.isArray(r) ? r[0] : r);
export const e1rm = (kg: number, reps: number) => kg * (1 + reps / 30);

export function recommend(
  ex: string,
  rx: Pick<Rx, "sets" | "reps" | "seconds" | "meters" | "rir">,
  hist: Record<string, ExHistory | undefined>,
  opts: { deload?: boolean; step?: number } = {},
): Rec {
  const e = EXERCISES[ex];
  const step = opts.step ?? e?.step ?? 2.5;
  const h = hist[ex];
  const work = (h?.sets ?? []).filter((s) => s.kind !== "W" && !s.deleted);
  const top = topOf(rx.reps), bot = botOf(rx.reps), rir = rirOf(rx.rir);
  const metric = e?.metric ?? "weight_reps";

  // ---- holds / carries / bodyweight ----
  if (metric === "time") {
    const best = Math.max(0, ...work.map((s) => s.seconds ?? 0));
    if (!best) return { weightKg: null, reps: null, seconds: rx.seconds ?? null, kind: "start", why: "First time: hold for the target time." };
    const allHit = work.length >= rx.sets && work.every((s) => (s.seconds ?? 0) >= (rx.seconds ?? 0));
    return { weightKg: null, reps: null, seconds: Math.max(rx.seconds ?? 0, best + (allHit ? 5 : 0)), kind: allHit ? "up" : "hold", why: allHit ? `Hit ${rx.seconds}s on every set → +5 s` : `Beat ${best}s` };
  }
  if (metric === "reps" || metric === "assist_reps") {
    const best = Math.max(0, ...work.map((s) => s.reps ?? 0));
    if (!best) return { weightKg: null, reps: top, seconds: null, kind: "start", why: metric === "assist_reps" ? "First time: pick a band that lets you hit the reps with ~2 left." : "First time: hit the target reps with good form." };
    const allTop = top != null && work.length >= rx.sets && work.every((s) => (s.reps ?? 0) >= top);
    if (allTop) return { weightKg: null, reps: top, seconds: null, kind: "up", why: metric === "assist_reps" ? "All sets at the top → try a thinner band" : `All sets at ${top} reps → add a little weight or slow the lowering` };
    return { weightKg: null, reps: Math.min(top ?? best + 1, best + 1), seconds: null, kind: "hold", why: `Beat last time by 1 rep (best ${best})` };
  }

  // ---- weighted (weight_reps / distance) ----
  if (!work.length || !work.some((s) => s.weightKg)) {
    // estimate from a related lift you have done
    for (const [other, oh] of Object.entries(hist)) {
      const r = swapHint(other, ex).ratio;
      const w = Math.max(0, ...(oh?.sets ?? []).filter((s) => s.kind !== "W").map((s) => s.weightKg ?? 0));
      if (r && w) return { weightKg: round(w * r, step), reps: top, seconds: null, kind: "estimate", why: `Estimated from ${EXERCISES[other]?.name ?? other} (${w} kg). Adjust on set 1.` };
    }
    return { weightKg: null, reps: top, seconds: null, kind: "start", why: `First time: pick a weight you could lift ${rir + 1}+ more reps with. The app learns from it.` };
  }

  const lastW = Math.max(...work.map((s) => s.weightKg ?? 0));
  const atTop = work.filter((s) => (s.weightKg ?? 0) >= lastW);
  const lastReps = Math.round(atTop.reduce((a, s) => a + (s.reps ?? 0), 0) / Math.max(1, atTop.length));
  const bestE = Math.max(...work.map((s) => (s.weightKg && s.reps ? e1rm(s.weightKg, s.reps) : 0)));

  if (metric === "distance") {
    const allDone = work.length >= rx.sets;
    return { weightKg: allDone ? lastW + step : lastW, reps: null, seconds: null, kind: allDone ? "up" : "hold", why: allDone ? `All carries done → +${step} kg` : "Same weight, finish all carries" };
  }

  if (opts.deload) return { weightKg: round(lastW * 0.9, step), reps: top, seconds: null, kind: "deload", why: "Deload week: ~10% lighter, easy sets" };

  if (h?.joints === "pain" || work.some((s) => (s.painLevel ?? 0) >= 2)) {
    return { weightKg: round(lastW - step, step), reps: top, seconds: null, kind: "down", why: "Pain last time → one step lighter. Swap if it hurts again." };
  }

  // target reps changed a lot → use e1RM
  if (top != null && bestE > 0 && Math.abs(top - lastReps) >= 2) {
    const w = round(bestE / (1 + (top + rir) / 30), step);
    return { weightKg: w, reps: top, seconds: null, kind: w > lastW ? "up" : w < lastW ? "down" : "hold", why: `Rep target changed (${lastReps} → ${top}): from your est. max ${Math.round(bestE)} kg at RIR ${rir}` };
  }

  const loggedRir = work.filter((s) => s.rir != null).map((s) => s.rir!);
  const easyRir = loggedRir.length ? Math.min(...loggedRir) >= rir : true;
  const allTop = top != null && work.length >= rx.sets && atTop.length >= rx.sets && atTop.every((s) => (s.reps ?? 0) >= top);
  const missed = bot != null ? atTop.filter((s) => (s.reps ?? 0) < bot).length : 0;

  if (h?.effort === "too_much") return { weightKg: lastW, reps: bot ?? top, seconds: null, kind: "hold", why: "Felt too hard last time → same weight, bottom of the range" };
  if (allTop && easyRir) {
    const jump = h?.effort === "easy" ? step * 2 : step;
    return { weightKg: lastW + jump, reps: bot ?? top, seconds: null, kind: "up", why: `Hit ${top} reps on every set${loggedRir.length ? ` at RIR ≥ ${rir}` : ""} → +${jump} kg` };
  }
  if (missed >= 2) return { weightKg: round(lastW - step, step), reps: bot, seconds: null, kind: "down", why: `${missed} sets under ${bot} reps → one step lighter` };
  const target = top != null ? Math.min(top, lastReps + 1) : lastReps + 1;
  return { weightKg: lastW, reps: target, seconds: null, kind: "hold", why: `Same weight, aim for ${target} reps (last: ${atTop.map((s) => s.reps).join(", ")})` };
}

// ---------------------------------------------------------------- warm-ups & plates

const BARBELL = new Set(["bench", "squat", "rdl", "bb_row", "ohp", "bb_shrug", "hip_thrust"]);
export const isBarbell = (ex: string) => BARBELL.has(ex);

/** Ramp-up sets before heavy work (Stronglifts/Hevy style): bar → 50% → 70% → 85%. */
export function warmups(ex: string, workKg: number, barKg = 20): { kg: number; reps: number }[] {
  const step = EXERCISES[ex]?.step ?? 2.5;
  const base = isBarbell(ex) ? barKg : 0;
  const rows = [
    ...(isBarbell(ex) ? [{ kg: barKg, reps: 10 }] : []),
    { kg: round(workKg * 0.5, step), reps: 5 },
    { kg: round(workKg * 0.7, step), reps: 3 },
    { kg: round(workKg * 0.85, step), reps: 1 },
  ];
  return rows.filter((r, i, a) => r.kg > base - 0.01 && r.kg < workKg && (i === 0 || r.kg > a[i - 1].kg));
}

/** Plates per side for a barbell weight (greedy, standard kg plates). */
export function plates(totalKg: number, barKg = 20, available = [25, 20, 15, 10, 5, 2.5, 1.25]): number[] | null {
  let side = (totalKg - barKg) / 2;
  if (side < 0) return null;
  const out: number[] = [];
  for (const p of available) while (side >= p - 1e-9) { out.push(p); side -= p; }
  return side > 0.01 ? null : out;
}
