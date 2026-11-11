// Recommended load per set. Pure functions, used by the workout screen, Plan, Home and Stats.
//
// v2.2 rules (double progression + RIR autoregulation; see docs/GUIDE.md "Recommended weights"):
//  0. Only honest work sets count: warm-ups, drop/rest-pause parts and sets marked "cheated" are ignored.
//     Weights are compared in the unit the app shows: dumbbell pairs PER HAND (old "total" logs halved,
//     shared/load.ts), barbells/EZ bars as total incl. the bar, machines/cables as the stack number.
//  1. Hit the TOP of the rep range on every set at >= target RIR → +1 weight step (+2 if you said "Easy").
//  2. Average reps at the top weight fell SHORT of the bottom of the range → ~3% lighter per missing rep
//     (max −15%), rounded DOWN to a real weight step.
//  3. Rep target changed by 2+ (e.g. 8 → 5 next week) → from your estimated max: kg = e1RM ÷ (1 + (reps + RIR)/30).
//     e1RM is RIR-adjusted Epley; RIR is trusted only 0-3 (far from failure it's unreliable — Zourdos 2021;
//     lifters usually under-call RIR by ~1). Unknown RIR is treated as 1.
//  4. Otherwise keep the weight and beat the reps (+1, up to the top of the range).
//  5. Deload week → ~10% lighter. Joint pain / "too much" → hold or one step lighter.
//  6. No history → estimate from a related lift you've done (swap ratios), else "pick a weight with ~3 left".
import { EXERCISES } from "../program/exercises";
import { swapHint } from "../program/swaps";
import type { Rx } from "../program/types";
import type { SetLog } from "./api";
import { normalize } from "./load";
import { STARTER } from "../program/starters";

export type RecKind = "up" | "hold" | "down" | "start" | "deload" | "estimate";
export interface Rec {
  weightKg: number | null; // in the exercise's shown unit (per hand for dumbbell pairs)
  reps: number | null;
  seconds: number | null;
  kind: RecKind;
  why: string;
  /** Estimated max behind the decision (same unit), if any. */
  e1rm?: number | null;
}
export interface ExHistory {
  date: string;
  sets: SetLog[]; // sets of the most recent session with this exercise
  effort?: string | null; // easy | right | hard | too_much
  joints?: string | null; // fine | achy | pain
}

const round = (n: number, step: number) => Math.max(0, Math.round(n / step) * step);
const roundDown = (n: number, step: number) => Math.max(0, Math.floor(n / step + 1e-9) * step);
const topOf = (r: Rx["reps"]) => (r == null ? null : Array.isArray(r) ? r[1] : r);
const botOf = (r: Rx["reps"]) => (r == null ? null : Array.isArray(r) ? r[0] : r);
const rirOf = (r: Rx["rir"]) => (r == null ? 2 : Array.isArray(r) ? r[0] : r);
export const e1rm = (kg: number, reps: number) => kg * (1 + reps / 30);
/** RIR-adjusted estimated max. RIR above 3 is capped (unreliable far from failure); unknown RIR → 1. */
export const e1rmRir = (kg: number, reps: number, rir: number | null | undefined) => kg * (1 + (reps + Math.min(rir ?? 1, 3)) / 30);
const fmt = (n: number) => `${+n.toFixed(2)}`;

/** Work sets that count for progression decisions (normalized units). */
export function honestSets(sets: SetLog[]): SetLog[] {
  return sets.filter((s) => (s.kind === "N" || s.kind === "F") && !s.deleted && s.strict !== 0).map(normalize);
}

export function recommend(
  ex: string,
  rx: Pick<Rx, "sets" | "reps" | "seconds" | "meters" | "rir">,
  hist: Record<string, ExHistory | undefined>,
  opts: { deload?: boolean; step?: number; bodyKg?: number | null } = {},
): Rec {
  const e = EXERCISES[ex];
  // dumbbell pairs move in real dumbbell jumps (your gym: 2.5 kg) even if the exercise step is smaller
  const step = Math.max(opts.step ?? e?.step ?? 2.5, e?.pair ? 2.5 : 0);
  const h = hist[ex];
  const all = (h?.sets ?? []).filter((s) => s.kind !== "W" && !s.deleted).map(normalize);
  const work = honestSets(h?.sets ?? []);
  const top = topOf(rx.reps), bot = botOf(rx.reps), rir = rirOf(rx.rir);
  const metric = e?.metric ?? "weight_reps";
  const unit = e?.pair ? " per hand" : "";

  if (metric === "time") {
    const best = Math.max(0, ...all.map((s) => s.seconds ?? 0));
    if (!best) return { weightKg: null, reps: null, seconds: rx.seconds ?? null, kind: "start", why: "First time: hold for the target time." };
    if (opts.deload) return { weightKg: null, reps: null, seconds: rx.seconds ?? null, kind: "deload", why: "Deload week: just the target time, easy" };
    const allHit = all.length >= rx.sets && all.every((s) => (s.seconds ?? 0) >= (rx.seconds ?? 0));
    return { weightKg: null, reps: null, seconds: Math.max(rx.seconds ?? 0, best + (allHit ? 5 : 0)), kind: allHit ? "up" : "hold", why: allHit ? `Hit ${rx.seconds}s on every set → +5 s` : `Beat ${best}s` };
  }
  if (metric === "reps" || metric === "assist_reps") {
    const best = Math.max(0, ...all.map((s) => s.reps ?? 0));
    if (!best) return { weightKg: null, reps: top, seconds: null, kind: "start", why: "First time: hit the target reps with good form." };
    const allTop = top != null && all.length >= rx.sets && all.every((s) => (s.reps ?? 0) >= top);
    if (allTop) return { weightKg: null, reps: top, seconds: null, kind: "up", why: `All sets at ${top} reps → add a little weight or slow the lowering` };
    return { weightKg: null, reps: Math.min(top ?? best + 1, best + 1), seconds: null, kind: "hold", why: `Beat last time by 1 rep (best ${best})` };
  }

  if (!work.some((s) => s.weightKg)) {
    for (const [other, oh] of Object.entries(hist)) {
      const r = swapHint(other, ex).ratio;
      const w = Math.max(0, ...honestSets(oh?.sets ?? []).map((s) => s.weightKg ?? 0));
      if (r && w) return { weightKg: round(w * r, step), reps: top, seconds: null, kind: "estimate", why: `Estimated from ${EXERCISES[other]?.name ?? other} (${fmt(w)} kg). Adjust on set 1.` };
    }
    // starting estimate from your bench (or bodyweight) via strength-standard ratios — rounded DOWN, ~3 reps in reserve
    const ratio = STARTER[ex];
    if (ratio && top != null) {
      const benchE = Math.max(0, ...honestSets([...(hist.bench?.sets ?? [])]).map((s) => (s.weightKg && s.reps ? e1rmRir(s.weightKg, s.reps, s.rir) : 0)));
      const anchor = benchE || (opts.bodyKg ? opts.bodyKg * 0.8 : 0);
      if (anchor) {
        const est = anchor * ratio * 0.9; // 10% safety margin
        const w = roundDown(est / (1 + (top + 3) / 30), step);
        if (w > 0) return { weightKg: w, reps: top, seconds: null, kind: "estimate", e1rm: Math.round(est * 10) / 10, why: `Starting estimate from your ${benchE ? `bench (est. max ${fmt(benchE)} kg)` : `bodyweight (${opts.bodyKg} kg)`} — aim for ~3 reps left. Set 1 is a test: adjust, the app learns from it.` };
      }
    }
    const why = all.length ? "Last time's sets were warm-ups or marked cheated — pick a weight with ~3 reps left." : `First time: pick a weight you could do ${rir + 1}+ more reps with. The app learns from it.`;
    return { weightKg: null, reps: top, seconds: null, kind: "start", why };
  }

  // Working weight = the weight used for the MOST work sets; on a tie, the one you ended on.
  // (Not simply the heaviest: if you drop 70 → 60 → 65 for better form, 65 is your weight — a real case from your data.)
  // Sets are in the order they were done, so "ended on" = the latest of the tied weights.
  const lastW = (() => {
    const n = new Map<number, number>();
    work.forEach((s) => n.set(s.weightKg ?? 0, (n.get(s.weightKg ?? 0) ?? 0) + 1));
    const most = Math.max(...n.values());
    const tied = new Set([...n.entries()].filter(([, c]) => c === most).map(([w]) => w));
    for (let i = work.length - 1; i >= 0; i--) if (tied.has(work[i].weightKg ?? 0)) return work[i].weightKg ?? 0;
    return Math.max(...work.map((s) => s.weightKg ?? 0));
  })();
  const atTop = work.filter((s) => (s.weightKg ?? 0) >= lastW - 1e-9);
  const avgReps = atTop.reduce((a, s) => a + (s.reps ?? 0), 0) / Math.max(1, atTop.length);
  const trusted = work.filter((s) => s.weightKg && s.reps && s.reps <= 15 && (s.rir == null || s.rir <= 3));
  const pool = trusted.length ? trusted : work.filter((s) => s.weightKg && s.reps);
  const bestE = Math.max(0, ...pool.map((s) => e1rmRir(s.weightKg!, s.reps!, s.rir)));
  const base = { seconds: null, e1rm: bestE ? Math.round(bestE * 10) / 10 : null };

  if (metric === "distance") {
    const allDone = work.length >= rx.sets;
    return { ...base, weightKg: allDone ? lastW + step : lastW, reps: null, kind: allDone ? "up" : "hold", why: allDone ? `All carries done → +${step} kg${unit}` : "Same weight, finish all carries" };
  }
  if (opts.deload) {
    // last time was already a deload session (same exercise twice in the deload week) → keep it, don't cut again
    const wasDeload = work.some((s) => { try { return JSON.parse(s.suggested ?? "null")?.kind === "deload"; } catch { return false; } });
    if (wasDeload) return { ...base, weightKg: lastW, reps: top, kind: "deload", why: "Deload week: same easy weight as earlier this week" };
    // ~10 % lighter, rounded to a weight you can actually load. With big jumps (2.5 kg dumbbells at 5 kg) one step
    // can be a 50 % cut → keep the weight then; the deload comes from fewer sets + 3 reps in reserve.
    let dw = round(lastW * 0.9, step);
    if (dw >= lastW) dw = lastW - step >= lastW * 0.75 ? lastW - step : lastW;
    return { ...base, weightKg: Math.max(step, dw), reps: top, kind: "deload", why: dw < lastW ? "Deload week: ~10% lighter, easy sets" : "Deload week: same weight (next step is too big a cut), fewer sets, 3 reps in reserve" };
  }
  if (h?.joints === "pain" || all.some((s) => (s.painLevel ?? 0) >= 2)) {
    return { ...base, weightKg: roundDown(lastW - step, step), reps: top, kind: "down", why: "Pain last time → one step lighter. Swap the exercise if it hurts again." };
  }

  // fewer reps than this range asks for, but with reps still in the tank → last time was a DIFFERENT (heavier)
  // rep range on purpose (e.g. laterals 12-15 on Push, 15-20 on Legs), not a miss → convert via estimated max
  const rirAtTop = atTop.filter((s) => s.rir != null).map((s) => s.rir!);
  // every set needs a logged RIR at/above target — otherwise it's treated as a real miss (e.g. 10, 8, 5, 5 with no RIR)
  if (bot != null && avgReps < bot - 1.5 && bestE > 0 && rirAtTop.length === atTop.length && Math.min(...rirAtTop) >= rir) {
    const w = Math.max(step, roundDown(bestE / (1 + (bot + rir) / 30), step));
    return { ...base, weightKg: w, reps: bot, kind: "hold", why: `Higher-rep day (${bot}-${top ?? bot}) than last time (${Math.round(avgReps)} reps) → ${fmt(w)} kg${unit} from your est. max — not a miss` };
  }

  // clearly too heavy last time
  // (1 rep short is normal noise / a different rep range → that's "same weight, beat the reps" below)
  if (bot != null && avgReps < bot - 1.5) {
    const short = bot - avgReps;
    const pct = Math.min(0.15, 0.03 * short);
    const w = Math.min(roundDown(lastW * (1 - pct), step), lastW - step);
    return { ...base, weightKg: Math.max(step, w), reps: bot, kind: "down", why: `Averaged ${fmt(avgReps)} reps at ${fmt(lastW)} kg${unit} (target ${bot}+) → about ${Math.round(pct * 100)}% lighter` };
  }

  // rep target changed a lot → from estimated max
  // (only when last time was ABOVE the new range — below the range is handled by the rule above)
  if (top != null && bestE > 0 && avgReps >= top + 2) {
    const w = round(bestE / (1 + (top + rir) / 30), step);
    return { ...base, weightKg: w, reps: top, kind: w > lastW ? "up" : w < lastW ? "down" : "hold", why: `Rep target changed (${Math.round(avgReps)} → ${top}): from your est. max ${fmt(bestE)} kg${unit} at RIR ${rir}` };
  }

  if (h?.effort === "too_much") return { ...base, weightKg: lastW, reps: bot ?? top, kind: "hold", why: "Felt too hard last time → same weight, bottom of the range" };

  const loggedRir = atTop.filter((s) => s.rir != null).map((s) => s.rir!);
  const rirOk = loggedRir.length ? Math.min(...loggedRir) >= rir : true;
  const allTop = top != null && atTop.length >= 2 && atTop.length >= Math.min(rx.sets, work.length) && atTop.every((s) => (s.reps ?? 0) >= top);
  if (allTop && rirOk) {
    // ACSM: add 2-10% once you beat the target by 1-2 reps → 2 steps when 2+ reps over the top or "Easy", capped at +10%
    const over = avgReps - top!;
    const steps = h?.effort === "easy" || over >= 2 ? 2 : 1;
    const jump = Math.max(step, Math.min(step * steps, Math.floor((lastW * 0.1) / step) * step || step));
    return { ...base, weightKg: lastW + jump, reps: bot ?? top, kind: "up", why: `Hit ${top} reps on every set${loggedRir.length ? ` with ≥${rir} left` : ""} → +${jump} kg${unit}` };
  }

  const target = top != null ? Math.min(top, Math.floor(avgReps) + 1) : Math.floor(avgReps) + 1;
  const why = allTop && !rirOk
    ? `Hit ${top} reps but with only ${Math.min(...loggedRir)} left (target ${rir}) → same weight, own it first`
    : `Same weight, aim for ${target} reps (last: ${atTop.map((s) => s.reps).join(", ")})`;
  return { ...base, weightKg: lastW, reps: target, kind: "hold", why };
}

// ---------------------------------------------------------------- warm-ups & plates

import { loadOf } from "./load";
export const isBarbell = (ex: string) => loadOf(ex) === "barbell" || loadOf(ex) === "ez";

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
