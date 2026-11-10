// `npx tsx scripts/test-weekplan.ts` — scenario checks for the adaptive week planner.
import { planWeek, weekDates, type Mark } from "../shared/weekplan";

const schedB = ["D2", "D3", "rest", "D5", "D6", "rest", "D1"]; // Sat start (Egypt weekend)
const slots = (done: string[] = []) => [
  { dayKey: "D1", dayName: "Push" }, { dayKey: "D2", dayName: "Pull" }, { dayKey: "D3", dayName: "Legs" },
  { dayKey: "D5", dayName: "Chest + Back" }, { dayKey: "D6", dayName: "Shoulders + Arms" },
].map((s) => ({ ...s, status: done.includes(s.dayKey) ? ("done" as const) : ("open" as const) }));

function run(title: string, today: string, marks: Record<string, Mark>, done: string[], doneOn: Record<string, string> = {}) {
  const dates = weekDates(today, 6);
  const out = planWeek({ today, dates, schedule: schedB, slots: slots(done), doneOn, marks });
  console.log(`\n## ${title}  (${out.summary})`);
  for (const d of out.days) console.log(`  ${d.iso} ${"SMTWTFS"[d.dow]} ${d.today ? "*" : " "} ${d.kind.padEnd(8)} ${d.dayName ?? ""}${d.note ? `  — ${d.note}` : ""}`);
  for (const u of out.unplaced) console.log(`  ! ${u.dayName}: ${u.advice}`);
}
// week Sat 2026-11-07 … Fri 2026-11-13
run("Normal week, nothing marked", "2026-11-07", {}, []);
run("Football Wednesday", "2026-11-07", { "2026-11-11": "football" }, []);
run("Football Monday (Legs day)", "2026-11-07", { "2026-11-09": "football" }, []);
run("Football Mon + Thu, busy Tue", "2026-11-07", { "2026-11-09": "football", "2026-11-12": "football", "2026-11-10": "busy" }, []);
run("Mid-week: Push+Pull done, football Wed", "2026-11-10", { "2026-11-11": "football" }, ["D1", "D2"], { "2026-11-08": "Push", "2026-11-09": "Pull" });
