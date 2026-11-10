import { EXERCISES } from "../program/exercises";
import type { Program, Rx } from "../program/types";
import type { PlanItem } from "./api";

/** Program Rx + exercise library info → a self-contained plan item. */
export function toItem(exKey: string, rx: Omit<Rx, "ex">): PlanItem {
  const e = EXERCISES[exKey];
  return {
    ...rx,
    ex: exKey,
    name: e.name,
    metric: e.metric,
    muscles: e.muscles,
    cues: e.cues,
    yt: e.yt ? (Array.isArray(e.yt) ? e.yt : [e.yt]) : [],
    alts: (e.alts ?? []).filter((k) => EXERCISES[k]).map((k) => ({ key: k, name: EXERCISES[k].name })),
    step: e.step ?? 2.5,
    perSide: e.perSide,
  };
}

export function buildPlan(p: Program, week: number, dayKey: string): { name: string; items: PlanItem[] } {
  const w = p.weeks.find((x) => x.n === week);
  const d = w?.days.find((x) => x.key === dayKey) ?? w?.extras?.find((x) => x.key === dayKey);
  if (!d) throw new Error(`No ${dayKey} in week ${week}`);
  return { name: d.name, items: d.items.map(({ ex, ...rx }) => toItem(ex, rx)) };
}

/** "3×6-8 @RIR2" style label. */
export function targetLabel(it: Pick<Rx, "sets" | "reps" | "seconds" | "meters" | "rir">): string {
  const r = it.reps === null ? "max" : Array.isArray(it.reps) ? `${it.reps[0]}-${it.reps[1]}` : it.reps != null ? `${it.reps}` : it.seconds ? `${it.seconds}s` : it.meters ? `${it.meters}m` : "";
  const rir = it.rir == null ? "" : ` @RIR${Array.isArray(it.rir) ? it.rir.join("-") : it.rir}`;
  return `${it.sets}×${r}${rir}`;
}
