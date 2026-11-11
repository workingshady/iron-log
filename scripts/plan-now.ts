// `npx tsx scripts/plan-now.ts` — the adapted week for the REAL settings snapshot below (edit marks to try scenarios).
import { planWeek, weekDates } from "../shared/weekplan";
const schedule = ["rest", "train", "train", "train", "rest", "train", "train"];
const slots = [["D1", "Push", "done"], ["D2", "Pull", "done"], ["D3", "Legs", "open"], ["D5", "Chest + Back", "open"], ["D6", "Shoulders + Arms", "open"]]
  .map(([k, n, st]) => ({ dayKey: k, dayName: n, status: st as "done" | "open" }));
const out = planWeek({ today: "2026-11-11", dates: weekDates("2026-11-11", 1), schedule, slots, doneOn: { "2026-11-09": "Push", "2026-11-10": "Pull" }, marks: { "2026-11-11": "football", "2026-11-12": "busy", "2026-11-14": "pin:D3" } });
for (const d of out.days) console.log(d.iso, d.today ? "*" : " ", d.kind.padEnd(8), d.dayName ?? "", d.pinned ? "📌" : "", d.note ?? "");
for (const u of out.unplaced) console.log("unplaced:", u.dayName, "-", u.advice);
