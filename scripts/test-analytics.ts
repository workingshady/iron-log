// Sanity checks for worker/analytics.ts on synthetic data: `npx tsx scripts/test-analytics.ts`
import assert from "node:assert/strict";
import { addDays, buildAnalytics, groupCredit, setCredits, weekOf, type ASess, type ASet } from "../worker/analytics";

// --- week start: 2026-11-10 is a Tuesday
assert.equal(weekOf("2026-11-10", 1), "2026-11-09"); // Monday start
assert.equal(weekOf("2026-11-10", 6), "2026-11-07"); // Saturday start
assert.equal(weekOf("2026-11-09", 1), "2026-11-09");

// --- set credits: W 0, N 1, RIR 5 → 0, drop chain +0.5 once, new set restarts the chain
let n = 0;
const mk = (p: Partial<ASet>): ASet => ({ id: `x${n++}`, sessionId: "s1", exKey: "bench", itemIdx: 0, kind: "N", weightKg: 60, reps: 8, rir: 2, restBeforeS: 120, doneAt: n, strict: null, pr: 0, ...p });
const chain = [mk({ kind: "W" }), mk({}), mk({ kind: "D" }), mk({ kind: "D" }), mk({ rir: 5 }), mk({ kind: "R" })];
const c = setCredits(chain);
assert.deepEqual(chain.map((x) => c.get(x.id)), [0, 1, 0.5, 0, 0, 0.5]);

// --- fractional groups: bench = 1 chest, ½ triceps, ½ shoulders
assert.deepEqual(groupCredit("bench"), { Chest: 1, Triceps: 0.5, Shoulders: 0.5 });

// --- a synthetic 8-week block: bench gains 1 kg a week; sleep-good sessions are +2 kg stronger
const today = "2026-11-10";
const sessions: ASess[] = [];
const sets: ASet[] = [];
const body: { date: string; sleepH: number | null }[] = [];
for (let i = 0; i < 24; i++) {
  const date = addDays(today, -(56 - i * 2) - 1);
  const id = `S${i}`;
  const good = i % 2 === 0;
  sessions.push({ id, date, week: 1, status: "done", excuse: null, startedAt: 0, endedAt: 60 * 60000, readiness: JSON.stringify({ sleep: good ? 5 : 2, energy: 3, mood: 3, stress: 3, soreness: 3 }) });
  body.push({ date, sleepH: good ? 8 : 6 });
  const kg = 60 + i * 0.3 + (good ? 2 : 0);
  for (let k = 0; k < 3; k++) sets.push({ id: `${id}-${k}`, sessionId: id, exKey: "bench", itemIdx: 0, kind: "N", weightKg: kg, reps: 8 - k, rir: 2, restBeforeS: k ? (good ? 200 : 90) : null, doneAt: Date.parse(`${date}T10:00:00Z`) + k * 1000, strict: 1, pr: 0 });
}
sessions.push({ id: "M1", date: addDays(today, -3), week: 1, status: "missed", excuse: "busy", startedAt: null, endedAt: null, readiness: null });
const a = buildAnalytics({ sessions, sets, body, intake: [], journal: [], cardio: [], creTarget: 5 }, today, 1);

assert.equal(a.weeks.length, 12);
assert.equal(a.weeks[11].start, "2026-11-09");
const bench = a.lifts.find((l) => l.exKey === "bench")!;
assert.ok(bench, "bench trend exists");
assert.ok(bench.change4w != null && bench.change4w > 0, `bench 4w change positive: ${bench.change4w}`);
assert.equal(a.weeks.reduce((s, w) => s + w.hardSets, 0), 72); // 24 sessions × 3 sets
const sleep = a.links.find((l) => l.id === "sleep_h")!;
assert.ok(sleep && sleep.diff > 0 && sleep.clear, `sleep link found: ${JSON.stringify(sleep)}`);
const rest = a.links.find((l) => l.id === "rest")!;
assert.ok(rest, "rest link exists");
assert.ok(a.adherence4w != null && a.adherence4w < 100);
assert.equal(a.effort.rir[2], 72);
console.log("bench", bench.e1rm, `${bench.change4w}%`, "| sleep link", sleep.hi, sleep.lo, "| rest", rest.hi, rest.lo, "| adherence 4w", a.adherence4w);
console.log("muscles this week", a.muscles.weeks.at(-1));
console.log("ok");
