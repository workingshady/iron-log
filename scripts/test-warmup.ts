// `npx tsx scripts/test-warmup.ts` — warm-up sets the app suggests for W2 days (example working weights).
import { buildPlan } from "../shared/plan";
import { CURRENT } from "../program";
import { warmupFor } from "../shared/warmup";
import { barOf, barsFrom } from "../shared/load";
const W: Record<string, number[]> = { D1: [75, 22.5, 37.5, 12.5, 25], D2: [65, 65, 45, 36, 50, 10], D5: [47.5, 27.5, 40, 22.5, 30, 12.5], D6: [5, 30, 4, 5, 22.5, 22.5, 10] };
for (const k of Object.keys(W)) {
  const p = buildPlan(CURRENT, 2, k);
  console.log(`\n${p.name}`);
  p.items.forEach((it, i) => {
    const w = W[k][i];
    if (!w) return;
    const wp = warmupFor(p.items, i, w, barOf(it.ex, barsFrom({})));
    console.log(` ${(it.tag ?? "").padEnd(3)}${it.name.padEnd(32)}${String(w).padStart(5)} → ${wp.sets.map((s) => `${s.kg}×${s.reps}`).join(", ") || "none"}`);
  });
}
