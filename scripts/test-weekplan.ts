// `npx tsx scripts/test-weekplan.ts` — scenario checks for the adaptive week planner.
import { planWeek, weekDates, type Mark, type WeekPlanOut } from "../shared/weekplan";

const schedB = ["D2", "D3", "rest", "D5", "D6", "rest", "D1"]; // Sat start (Egypt weekend)
const slots = (done: string[] = []) => [
  { dayKey: "D1", dayName: "Push" }, { dayKey: "D2", dayName: "Pull" }, { dayKey: "D3", dayName: "Legs" },
  { dayKey: "D5", dayName: "Chest + Back" }, { dayKey: "D6", dayName: "Shoulders + Arms" },
].map((s) => ({ ...s, status: done.includes(s.dayKey) ? ("done" as const) : ("open" as const) }));

function run(title: string, today: string, marks: Record<string, Mark>, done: string[], doneOn: Record<string, string> = {}): WeekPlanOut {
  const dates = weekDates(today, 6);
  const out = planWeek({ today, dates, schedule: schedB, slots: slots(done), doneOn, marks });
  console.log(`\n## ${title}  (${out.summary})`);
  for (const d of out.days) console.log(`  ${d.iso} ${"SMTWTFS"[d.dow]} ${d.today ? "*" : " "} ${d.kind.padEnd(8)} ${d.dayName ?? ""}${d.note ? `  — ${d.note}` : ""}`);
  for (const u of out.unplaced) console.log(`  ! ${u.dayName}: ${u.advice}`);
  return out;
}
let failed = 0;
function check(ok: boolean, what: string) { console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; }
const on = (o: WeekPlanOut, iso: string) => o.days.find((d) => d.iso === iso)!;
const legsDay = (o: WeekPlanOut) => o.days.find((d) => d.kind === "planned" && /leg/i.test(d.dayName ?? ""))?.iso ?? null;
// week Sat 2026-11-07 … Fri 2026-11-13
run("Normal week, nothing marked", "2026-11-07", {}, []);
run("Football Wednesday", "2026-11-07", { "2026-11-11": "football" }, []);
{
  const o = run("Football Monday (Legs day)", "2026-11-07", { "2026-11-09": "football" }, []);
  check(!["2026-11-08", "2026-11-09", "2026-11-10"].includes(legsDay(o) ?? ""), "football: no Legs the day before / of / after");
  check(on(o, "2026-11-09").kind === "football", "old \"football\" mark still a football day");
}
run("Football Mon + Thu, busy Tue", "2026-11-07", { "2026-11-09": "football", "2026-11-12": "football", "2026-11-10": "busy" }, []);
run("Mid-week: Push+Pull done, football Wed", "2026-11-10", { "2026-11-11": "football" }, ["D1", "D2"], { "2026-11-08": "Push", "2026-11-09": "Pull" });

// ---------------------------------------------------------------- other sports
{
  const o = run("Padel Monday (heavy legs, like football)", "2026-11-07", { "2026-11-09": "sport:padel" }, []);
  check(on(o, "2026-11-09").kind === "sport" && on(o, "2026-11-09").sport === "padel", "padel day is a sport day, no lifting");
  check(!["2026-11-08", "2026-11-09", "2026-11-10"].includes(legsDay(o) ?? ""), "padel: no Legs the day before / of / after");
  check(o.summary.startsWith("1 padel day"), "summary names padel");
  check(o.days.some((d) => d.note?.includes("padel")), "notes name padel");
}
{
  const o = run("Padel Mon + Thu, busy Tue", "2026-11-07", { "2026-11-09": "sport:padel", "2026-11-12": "sport:padel", "2026-11-10": "busy" }, []);
  const u = o.unplaced.find((x) => x.dayName === "Legs");
  check(!!u && u.action === "skip_sport" && u.advice.includes("padel") && u.sport === "padel", "Legs left out with padel advice");
}
{
  const o = run("Padel Wed, Push+Pull done, rest Fri", "2026-11-09", { "2026-11-11": "sport:padel", "2026-11-13": "rest" }, ["D1", "D2"], { "2026-11-07": "Push", "2026-11-08": "Pull" });
  const u = o.unplaced.find((x) => x.dayName === "Legs");
  check(!u || u.advice.startsWith("Padel loaded your legs") || u.advice.includes("padel"), "Legs advice (if any) names padel");
}
{
  const o = run("Swimming Wednesday (light legs, heavy upper)", "2026-11-07", { "2026-11-11": "sport:swimming" }, []);
  const thu = on(o, "2026-11-12");
  check(on(o, "2026-11-11").kind === "sport", "no lifting on the swim day");
  check(!(thu.kind === "planned" && /push|shoulder|arm/i.test(thu.dayName ?? "")), "no Push / Shoulders+Arms the day after swimming");
  check(o.unplaced.length === 0, "everything still fits");
}
{
  const o = run("Swimming Mon, Legs pinned Sun (allowed)", "2026-11-07", { "2026-11-09": "sport:swimming", "2026-11-08": "pin:D3" }, []);
  check(legsDay(o) === "2026-11-08", "Legs the day before swimming is fine (light legs)");
  const p = run("Padel Mon, Legs pinned Sun (refused)", "2026-11-07", { "2026-11-09": "sport:padel", "2026-11-08": "pin:D3" }, []);
  check(legsDay(p) !== "2026-11-08", "Legs pinned the day before padel is refused (48 h rule)");
}
{
  const o = run("Yoga Wednesday (light/light)", "2026-11-07", { "2026-11-11": "sport:yoga" }, []);
  check(on(o, "2026-11-11").kind === "sport", "no lifting on the yoga day");
  check(!on(o, "2026-11-12").note?.includes("recovery"), "no recovery note after yoga");
  check(o.unplaced.length === 0, "everything fits");
}
{
  const o = run("Yoga Mon + Legs can sit next to it", "2026-11-07", { "2026-11-09": "sport:yoga", "2026-11-11": "busy", "2026-11-13": "busy" }, []);
  check(legsDay(o) !== null, "Legs still placed in a tight yoga week");
}
{
  const o = run("Cycling Monday (moderate legs)", "2026-11-07", { "2026-11-09": "sport:cycling" }, []);
  check(!["2026-11-09", "2026-11-10"].includes(legsDay(o) ?? ""), "cycling: no Legs the day of / after");
}
{
  const o = run("Football Mon + padel Thu", "2026-11-07", { "2026-11-09": "football", "2026-11-12": "sport:padel" }, []);
  check(o.summary.startsWith("2 sport days"), "mixed sports summary");
  check(on(o, "2026-11-09").kind === "football" && on(o, "2026-11-12").kind === "sport", "kinds kept per sport");
}
console.log(failed ? `${failed} check(s) FAILED` : "all checks passed");
if (failed) process.exit(1);
