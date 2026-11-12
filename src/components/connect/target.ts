// AI-set targets and one-workout overrides (written by the AI connector, see docs/AI_CONNECT.md).
//  • settings "target:<exKey>" = {kg?, reps?, seconds?, why, until?, by}: the working weight/reps the AI recommends.
//    It replaces the app's own recommendation for that exercise until `until` (YYYY-MM-DD, inclusive) or until cleared.
//    kg is in the unit the app shows (per hand for dumbbell pairs). shared/recommend.ts itself is unchanged.
//  • settings "override:<week>-<dayKey>" = {name?, items, why, by}: that one workout's plan (consumed when it starts).
import type { Rec } from "../../../shared/recommend";
import type { PlanItem } from "../../../shared/api";
import { buildPlan, toItem } from "../../../shared/plan";
import { EXERCISES, type Program, type Rx } from "../../../program";

export interface AiTarget { kg?: number | null; reps?: number | null; seconds?: number | null; why?: string; until?: string | null; by?: string }

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function targetFor(settings: Record<string, string> | undefined | null, ex: string): AiTarget | null {
  const raw = settings?.[`target:${ex}`];
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as AiTarget;
    if (t.until && t.until < localToday()) return null;
    return t.kg != null || t.reps != null || t.seconds != null ? t : null;
  } catch {
    return null;
  }
}

/** The app's recommendation with an AI target on top (if one is set and still valid). */
export function withTarget(rec: Rec, ex: string, settings: Record<string, string> | undefined | null): Rec {
  const t = targetFor(settings, ex);
  if (!t) return rec;
  return {
    ...rec,
    weightKg: t.kg ?? rec.weightKg,
    reps: t.reps ?? rec.reps,
    seconds: t.seconds ?? rec.seconds,
    kind: t.kg != null && rec.weightKg != null ? (t.kg > rec.weightKg ? "up" : t.kg < rec.weightKg ? "down" : "hold") : rec.kind,
    why: `${t.by ?? "AI"} target${t.why ? `: ${t.why}` : ""}`,
  };
}

/** The plan to preview for a week/day: the one-time AI override if there is one, else the normal plan. */
export function previewPlan(program: Program, week: number, dayKey: string, settings: Record<string, string> | undefined | null): { name: string; items: PlanItem[] } {
  try {
    const o = JSON.parse(settings?.[`override:${week}-${dayKey}`] ?? "") as { name?: string; items?: Rx[] };
    const items = (o.items ?? []).filter((it) => EXERCISES[it.ex]);
    if (items.length) return { name: o.name || buildPlan(program, week, dayKey).name, items: items.map(({ ex, ...rx }) => toItem(ex, rx)) };
  } catch { /* no override */ }
  return buildPlan(program, week, dayKey);
}
