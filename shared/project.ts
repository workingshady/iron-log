// Weights for every week: run the app's own recommendation engine forward through the program,
// assuming each session goes as recommended (you hit the suggested reps at the target RIR).
//
// Why simulate instead of a fixed %-table: the engine is double progression (Plotkin 2022: adding reps and
// adding load both drive growth; load slightly better for strength) with RIR checks and a −10 % deload, so the
// only honest projection is "what would the engine say next, if you did what it says now". Real sessions then
// replace the projection as you log them — if you beat a target, later weeks move up; miss it, they wait.
import type { Program, Rx } from "../program/types";
import type { SetLog } from "./api";
import { EXERCISES } from "../program/exercises";
import { recommend, type ExHistory, type RecKind } from "./recommend";
import { basisFor } from "./load";

export interface Projected { kg: number | null; reps: number | null; seconds: number | null; kind: RecKind }
/** key = `${week}:${dayKey}:${itemIdx}` */
export type Projection = Record<string, Projected>;

const rirTarget = (r: Rx["rir"]) => (r == null ? 2 : Array.isArray(r) ? Math.max(...r) : r);
const topOf = (r: Rx["reps"]) => (r == null ? null : Array.isArray(r) ? r[1] : r);

export function projectProgram(
  p: Program,
  hist0: Record<string, ExHistory | undefined>,
  opts: { fromWeek: number; done?: Set<string>; bodyKg?: number | null; includeExtras?: boolean } ,
): Projection {
  const hist: Record<string, ExHistory | undefined> = { ...hist0 };
  const out: Projection = {};
  let t = Date.now();
  for (const w of p.weeks.filter((x) => x.n >= opts.fromWeek)) {
    const deload = /deload/i.test(w.name);
    const days = [...p.order.map((k) => w.days.find((d) => d.key === k)).filter(Boolean), ...(opts.includeExtras ? w.extras ?? [] : [])] as typeof w.days;
    for (const d of days) {
      if (opts.done?.has(`${w.n}:${d.key}`)) continue; // already logged — real data is in hist
      d.items.forEach((rx, i) => {
        const e = EXERCISES[rx.ex];
        const r = recommend(rx.ex, rx, hist, { deload, step: e?.step, bodyKg: opts.bodyKg ?? null });
        out[`${w.n}:${d.key}:${i}`] = { kg: r.weightKg, reps: r.reps, seconds: r.seconds, kind: r.kind };
        // simulate the session going as recommended
        const reps = r.reps ?? topOf(rx.reps);
        if (e?.metric === "weight_reps" && r.weightKg == null) return; // "find it" — nothing to carry forward
        t += 864e5;
        const sets: SetLog[] = Array.from({ length: rx.sets }, (_, k) => ({
          id: `proj-${w.n}-${d.key}-${i}-${k}`, sessionId: `proj-${w.n}-${d.key}`, exKey: rx.ex, itemIdx: i, setNo: k + 1, kind: "N",
          weightKg: r.weightKg, reps: e?.metric === "time" ? null : reps, seconds: e?.metric === "time" ? r.seconds ?? rx.seconds ?? null : null,
          meters: rx.meters ?? null, assist: null, rir: deload ? 3 : rirTarget(rx.rir), restBeforeS: null, doneAt: t, note: null,
          painArea: null, painLevel: null, swappedFrom: null, strict: 1, kgBasis: r.weightKg != null ? basisFor(rx.ex) : null, deleted: 0,
          suggested: JSON.stringify({ weightKg: r.weightKg, reps: r.reps, seconds: r.seconds, kind: r.kind }),
        }));
        hist[rx.ex] = { date: new Date(t).toISOString().slice(0, 10), sets };
      });
    }
  }
  return out;
}

/** "75 kg", "22.5/h", "30 s", "12 reps" — compact for tables. */
export function projLabel(ex: string, x?: Projected): string {
  if (!x) return "";
  if (x.kg != null) return `${+x.kg.toFixed(2)}${EXERCISES[ex]?.pair ? "/h" : " kg"}`;
  if (x.seconds) return `${x.seconds} s`;
  if (x.reps && x.kind !== "start") return `${x.reps} reps`;
  return "find it";
}
