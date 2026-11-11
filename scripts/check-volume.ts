// `npx tsx scripts/check-volume.ts` — fractional hard sets per muscle group per week and per session
// (primary = 1, secondary = ½; Pelland 2024: gains rise to ~10-20/week, per-session plateau ~11). Finishers count.
import { CURRENT } from "../program";
import { EX_MUSCLES, MUSCLE_LABEL, type Muscle } from "../program/muscles";
for (const w of CURRENT.weeks.filter((x) => x.n <= 3)) {
  const week: Record<string, number> = {};
  const sessMax: Record<string, [number, string]> = {};
  for (const d of w.days) {
    const s: Record<string, number> = {};
    for (const it of d.items) { const m = EX_MUSCLES[it.ex]; if (!m) continue; m.p.forEach((x) => (s[x] = (s[x] ?? 0) + it.sets)); (m.s ?? []).forEach((x) => (s[x] = (s[x] ?? 0) + it.sets / 2)); }
    for (const [k, v] of Object.entries(s)) { week[k] = (week[k] ?? 0) + v; if (!sessMax[k] || v > sessMax[k][0]) sessMax[k] = [v, d.name]; }
  }
  console.log(`\nWeek ${w.n} (${w.name})  muscle: week sets | max in one session`);
  for (const [k, v] of Object.entries(week).sort((a, b) => b[1] - a[1])) {
    const flag = v < 8 ? " ↓low" : v > 22 ? " ↑high" : ""; const sf = sessMax[k][0] > 12 ? " ⚠ >12/session" : "";
    console.log(`  ${(MUSCLE_LABEL[k as Muscle] ?? k).padEnd(20)} ${String(v).padStart(5)}${flag.padEnd(7)} | ${sessMax[k][0]} (${sessMax[k][1]})${sf}`);
  }
}
