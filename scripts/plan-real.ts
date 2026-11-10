// `npx tsx scripts/plan-real.ts` — planner scenarios (Mon-start schedule A, like the real settings).
import { planWeek, weekDates, type Mark } from "../shared/weekplan";

const schedA = ["rest", "D1", "D2", "D3", "rest", "D5", "D6"];
const all = [["D1", "Push"], ["D2", "Pull"], ["D3", "Legs"], ["D5", "Chest + Back"], ["D6", "Shoulders + Arms"]];
function run(title: string, today: string, marks: Record<string, Mark>, doneOn: Record<string, string>) {
  const doneNames = new Set(Object.values(doneOn));
  const slots = all.map(([k, n]) => ({ dayKey: k, dayName: n, status: doneNames.has(n) ? ("done" as const) : ("open" as const) }));
  const t0 = Date.now();
  const out = planWeek({ today, dates: weekDates(today, 1), schedule: schedA, slots, doneOn, marks });
  console.log(`\n## ${title}  [${out.summary}] (${Date.now() - t0} ms)`);
  for (const d of out.days) console.log(`  ${d.iso} ${"SMTWTFS"[d.dow]} ${d.today ? "*" : " "} ${d.kind.padEnd(8)} ${(d.dayName ?? "").padEnd(17)} ${d.note ?? ""}`);
  for (const u of out.unplaced) console.log(`  ! ${u.advice}`);
}
run("REAL: Push done Mon, football Wed, today Tue", "2026-11-10", { "2026-11-11": "football" }, { "2026-11-09": "Push" });
run("Fresh week, football Wed", "2026-11-09", { "2026-11-11": "football" }, {});
run("Fresh week, no football", "2026-11-09", {}, {});
run("Football Wed + Sat", "2026-11-09", { "2026-11-11": "football", "2026-11-14": "football" }, {});
run("Football Mon + Thu, busy Tue", "2026-11-09", { "2026-11-09": "football", "2026-11-12": "football", "2026-11-10": "busy" }, {});
run("Late week: Thu, nothing done yet", "2026-11-12", {}, {});
