// `npx tsx scripts/project-weights.ts private/exports/<date> [fromWeek]` — weights for every week & session,
// projected by the app's engine from your real history (assumes each session goes as recommended).
import { readFileSync } from "node:fs";
import { CURRENT } from "../program";
import { EXERCISES } from "../program/exercises";
import { projectProgram, projLabel } from "../shared/project";
import type { ExHistory } from "../shared/recommend";
import { targetLabel } from "../shared/plan";

const dir = process.argv[2];
const fromWeek = Number(process.argv[3] ?? 1);
const sessions = JSON.parse(readFileSync(`${dir}/sessions.json`, "utf8"));
const sets = JSON.parse(readFileSync(`${dir}/sets.json`, "utf8"));
const done = new Set<string>(sessions.filter((s: any) => s.status === "done").map((s: any) => `${s.week}:${s.day_key}`));
const hist: Record<string, ExHistory> = {};
for (const s of [...sessions].filter((x: any) => x.status === "done").sort((a: any, b: any) => a.started_at - b.started_at)) {
  const ss = sets.filter((x: any) => x.session_id === s.id && !x.deleted).map((x: any) => ({ ...x, exKey: x.ex_key, weightKg: x.weight_kg, kgBasis: x.kg_basis, doneAt: x.done_at }));
  for (const k of new Set<string>(ss.map((x: any) => x.exKey))) hist[k] = { date: s.date, sets: ss.filter((x: any) => x.exKey === k).sort((a: any, b: any) => a.doneAt - b.doneAt) };
}
const proj = projectProgram(CURRENT, hist, { fromWeek, done, bodyKg: 80, includeExtras: true });
for (const w of CURRENT.weeks.filter((x) => x.n >= fromWeek)) {
  console.log(`\n# Week ${w.n} — ${w.name}`);
  for (const d of [...CURRENT.order.map((k) => w.days.find((x) => x.key === k)!), ...(w.extras ?? [])]) {
    if (done.has(`${w.n}:${d.key}`)) { console.log(`\n## ${d.name} — done ✓`); continue; }
    console.log(`\n## ${d.name}`);
    d.items.forEach((rx, i) => {
      const p = proj[`${w.n}:${d.key}:${i}`];
      console.log(`- ${EXERCISES[rx.ex].name.padEnd(34)} ${targetLabel(rx).padEnd(14)} ${projLabel(rx.ex, p).padEnd(10)} ${p?.reps && p.kg != null ? "× " + p.reps : ""} ${p ? "[" + p.kind + "]" : ""}`);
    });
  }
}
