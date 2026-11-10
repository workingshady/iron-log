// `npx tsx scripts/recs-from-export.ts private/exports/<date> [week]` — next-session recommendations from an export.
import { readFileSync } from "node:fs";
import { CURRENT } from "../program";
import { EXERCISES } from "../program/exercises";
import { recommend, type ExHistory } from "../shared/recommend";
import { shownKg } from "../shared/load";
import type { SetLog } from "../shared/api";

const dir = process.argv[2];
const sets = JSON.parse(readFileSync(`${dir}/sets.json`, "utf8")) as Record<string, unknown>[];
const sess = JSON.parse(readFileSync(`${dir}/sessions.json`, "utf8")) as { id: string; date: string; status: string }[];
const fb = JSON.parse(readFileSync(`${dir}/feedback.json`, "utf8")) as { session_id: string; ex_key: string; effort: string; joints: string }[];
const camel = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v])) as unknown as SetLog;
const hist: Record<string, ExHistory> = {};
for (const s of sess.filter((x) => x.status === "done").sort((a, b) => a.date.localeCompare(b.date))) {
  const ss = sets.map(camel).filter((x) => x.sessionId === s.id && !x.deleted);
  for (const k of new Set(ss.map((x) => x.exKey))) {
    const f = fb.find((x) => x.session_id === s.id && x.ex_key === k);
    hist[k] = { date: s.date, sets: ss.filter((x) => x.exKey === k), effort: f?.effort, joints: f?.joints };
  }
}
const week = Number(process.argv[3] ?? 2);
for (const d of CURRENT.weeks.find((w) => w.n === week)!.days) {
  console.log(`\n## W${week} ${d.name}`);
  for (const rx of d.items) {
    const h = hist[rx.ex];
    const r = recommend(rx.ex, rx, hist, { deload: week === 4 });
    const last = h ? h.sets.filter((s) => s.kind !== "W").map((s) => `${shownKg(s) ?? "BW"}×${s.reps ?? s.seconds}${s.rir != null ? "@" + s.rir : ""}${s.strict === 0 ? "(cheat)" : ""}${s.kind === "D" ? "(drop)" : ""}`).join(" ") : "—";
    const w = r.weightKg != null ? `${r.weightKg} kg${EXERCISES[rx.ex].pair ? "/hand" : ""}` : r.seconds ? `${r.seconds}s` : "";
    console.log(`- ${EXERCISES[rx.ex].name.padEnd(30)} last: ${last.padEnd(38)} → ${(w + (r.reps ? " × " + r.reps : "")).padEnd(18)} [${r.kind}] ${r.why}`);
  }
}
