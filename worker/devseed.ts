// DEV mode only: fills the separate test database with ~3 weeks of realistic dummy data
// (sessions, every set type, notes, pain, a cheated set, football days, cardio, creatine, body, tests, journal).
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as t from "./db/schema";
import { CURRENT, programVersionId } from "../program";
import { EXERCISES } from "../program/exercises";
import { STARTER } from "../program/starters";
import { buildPlan } from "../shared/plan";
import { basisFor, isPair } from "../shared/load";

type DB = DrizzleD1Database<typeof t>;
const iso = (base: string, back: number) => { const d = new Date(`${base}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - back); return d.toISOString().slice(0, 10); };
const at = (date: string, h: number, m = 0) => Date.parse(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`) - 2 * 3600e3; // Cairo
const r = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

export async function seedDev(d: DB, today: string, real?: DB): Promise<number> {
  // wipe the TEST database only
  await d.batch([d.delete(t.sets), d.delete(t.sessions), d.delete(t.events), d.delete(t.body), d.delete(t.tests), d.delete(t.journal), d.delete(t.intake), d.delete(t.feedback), d.delete(t.cardio), d.delete(t.settings), d.delete(t.programVersions)]);
  const pv = programVersionId(CURRENT);
  await d.insert(t.programVersions).values({ id: pv, name: CURRENT.name, changelog: CURRENT.changelog, snapshot: JSON.stringify(CURRENT), firstSeenAt: Date.now() });

  // schedule B (Sat start) — 2 full program weeks done, week 3 in progress, one missed day, football marks
  const order: [number, number, string][] = [
    [20, 1, "D1"], [19, 1, "D2"], [18, 1, "D3"], [16, 1, "D5"], [15, 1, "D6"],
    [13, 2, "D1"], [12, 2, "D2"], [10, 2, "D3"], [9, 2, "D5"], [8, 2, "D6"],
    [6, 3, "D1"], [5, 3, "D2"],
  ];
  const sessions: (typeof t.sessions.$inferInsert)[] = [];
  const sets: (typeof t.sets.$inferInsert)[] = [];
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  for (const [back, week, dayKey] of order) {
    const date = iso(today, back);
    const plan = buildPlan(CURRENT, week, dayKey);
    const sid = id("s");
    let time = at(date, 19, 0);
    const start = time;
    plan.items.forEach((it, idx) => {
      const e = EXERCISES[it.ex];
      const prog = 1 + (20 - back) * 0.006;
      const top = Array.isArray(it.reps) ? it.reps[1] : it.reps ?? 10;
      const ratio = it.ex === "bench" ? 1 : STARTER[it.ex];
      const base = ratio ? r((90 * ratio * 0.9 / (1 + (top + 2) / 30)) * prog, isPair(it.ex) ? 2.5 : e.step ?? 2.5) : null;
      for (let k = 1; k <= it.sets; k++) {
        time += (k === 1 && idx === 0 ? 60 : it.rest + 45) * 1000;
        const reps = e.metric === "time" || e.metric === "distance" ? null : Math.max(1, top - (k === it.sets ? 2 : k > 1 ? 1 : 0));
        const note = it.ex === "db_ohp" && back === 13 && k === 2 ? "left shoulder a bit tight" : it.ex === "close_grip_bench" && back === 6 && k === 3 ? "lost count, about 7" : null;
        sets.push({
          id: id("x"), sessionId: sid, exKey: it.ex, itemIdx: idx, setNo: k, kind: "N",
          weightKg: e.metric === "weight_reps" || e.metric === "distance" ? base : null, reps,
          seconds: e.metric === "time" ? (it.seconds ?? 30) : null, meters: e.metric === "distance" ? 30 : null,
          rir: e.metric === "weight_reps" ? (k === it.sets ? 1 : 2) : null, strict: it.ex === "ez_curl" && back === 15 && k === 3 ? 0 : 1,
          restBeforeS: k === 1 && idx === 0 ? null : it.rest + 45, doneAt: time, note, painArea: note?.includes("shoulder") ? "shoulder" : null, painLevel: note?.includes("shoulder") ? 1 : null,
          kgBasis: base != null ? basisFor(it.ex) : null, suggested: JSON.stringify({ weightKg: base, reps: top, seconds: null, kind: back > 18 ? "start" : "hold" }),
          deleted: 0, updatedAt: time,
        });
        if (it.ex === "db_lateral" && k === it.sets && back < 10) { time += 15000; sets.push({ id: id("x"), sessionId: sid, exKey: it.ex, itemIdx: idx, setNo: k + 1, kind: "D", weightKg: base ? r(base * 0.75, 2.5) : null, reps: 10, kgBasis: "per_hand", doneAt: time, updatedAt: time, deleted: 0 }); }
      }
    });
    const status = back === 5 ? "done" : "done";
    sessions.push({ id: sid, programVersionId: pv, week, dayKey, dayName: plan.name, status, kind: "planned", date, startedAt: start, endedAt: time + 120000, plan: JSON.stringify(plan.items), readiness: JSON.stringify({ sleep: 3 + (back % 2), energy: 4, mood: 4, stress: 3, soreness: 3 }), rpe: 7 + (back % 3 === 0 ? 1 : 0), tz: "Africa/Cairo", createdAt: start, updatedAt: start });
  }
  // a missed Legs day (football) + a skipped day
  sessions.push({ id: id("m"), programVersionId: pv, week: 3, dayKey: "D3", dayName: "Legs", status: "missed", kind: "planned", date: iso(today, 3), plan: "[]", excuse: "sport", note: "Played football", tz: "Africa/Cairo", createdAt: at(iso(today, 3), 18), updatedAt: at(iso(today, 3), 18) });
  for (let i = 0; i < sessions.length; i += 4) await d.insert(t.sessions).values(sessions.slice(i, i + 4)); // D1: max 100 bound params per query
  for (let i = 0; i < sets.length; i += 4) await d.insert(t.sets).values(sets.slice(i, i + 4));

  // cardio, football, creatine, body, tests, journal, settings
  const cardio: (typeof t.cardio.$inferInsert)[] = [
    { id: id("c"), date: iso(today, 20), protocol: "incline_hiit30", status: "done", minutes: 30, kcalEst: 316, rpe: 8, createdAt: Date.now() },
    { id: id("c"), date: iso(today, 16), protocol: "hill_walk30", status: "done", minutes: 30, kcalEst: 280, rpe: 6, createdAt: Date.now() },
    { id: id("c"), date: iso(today, 13), protocol: "incline_hiit30", status: "skipped", minutes: 0, createdAt: Date.now() },
    { id: `football-${iso(today, 3)}`, date: iso(today, 3), protocol: "football", status: "done", minutes: 90, kcalEst: 840, rpe: 7, note: "normal", createdAt: Date.now() },
  ];
  await d.insert(t.cardio).values(cardio);
  const intake = Array.from({ length: 18 }, (_, i) => i).filter((i) => i !== 4 && i !== 11).map((i) => ({ id: id("i"), date: iso(today, i), item: "creatine", amount: 5, unit: "g", at: at(iso(today, i), 8, 30) }));
  for (let i = 0; i < intake.length; i += 10) await d.insert(t.intake).values(intake.slice(i, i + 10));
  await d.insert(t.body).values([20, 13, 6, 0].map((b, k) => ({ date: iso(today, b), weightKg: 80 + k * 0.3, waistCm: 86 - k * 0.2, sleepH: 7, proteinG: 150, updatedAt: Date.now() })));
  await d.insert(t.tests).values([{ id: id("t"), date: iso(today, 20), testKey: "dead_hang", value: 32, unit: "s", createdAt: Date.now() }, { id: id("t"), date: iso(today, 20), testKey: "pushups", value: 28, unit: "reps", createdAt: Date.now() }]);
  await d.insert(t.journal).values({ id: id("j"), date: iso(today, 6), text: "Week 3. Football on Wednesday so Legs moved — felt fine.", tags: "life", createdAt: Date.now() });
  const marks = { [iso(today, 3)]: "football", [iso(today, -2)]: "football" };
  // copy YOUR real preferences (read-only) so test mode looks like your week; dummy football marks on top
  const mine = real ? (await real.select().from(t.settings)).filter((r) => r.key !== "weekMarks") : [];
  const base = mine.length ? mine : [{ key: "schedule", value: "A (Mon start)" }, { key: "barKg", value: "20" }, { key: "ezKg", value: "10" }];
  await d.insert(t.settings).values([...base, { key: "weekMarks", value: JSON.stringify(marks) }]);
  return sessions.length + sets.length + cardio.length + intake.length;
}
