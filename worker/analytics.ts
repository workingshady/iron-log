// Dashboard analytics: pure functions over raw rows (no DB access) so they can be tested with tsx.
// Served by GET /api/analytics. Every number here has its formula written next to it.
//
// HARD SET (counting rule, decided here — see docs/GUIDE.md "Stats"):
//   W warm-up                      → 0
//   N / F set with RIR 0-4 or none → 1   (RIR 5+ = "5 or more left" is too far from failure to count as hard)
//   D drop / R rest-pause chain    → +0.5 for the whole chain that follows a set, however many mini-sets
//                                    (they extend the set before them; research counts them as part of it,
//                                    a half credit is the common practical convention)
// FRACTIONAL SETS PER MUSCLE (Pelland et al. 2024): a set counts 1 for the muscle group it mainly trains
//   (program/groups.ts + primary muscles in program/muscles.ts) and 0.5 for groups it trains indirectly (secondary).
// e1RM (Epley): kg × (1 + reps/30), honest straight sets only (N/F, reps 1-12, not marked cheated).
// Weight for dumbbell pairs is per hand (shownKg) — fine for trends, which compare a lift with itself.
import { EXERCISES } from "../program/exercises";
import { CURRENT } from "../program";
import { EX_GROUP, GROUPS, type Group } from "../program/groups";
import { EX_MUSCLES, type Muscle } from "../program/muscles";
import { shownKg, totalKg } from "../shared/load";
import { e1rmRir } from "../shared/recommend";
import type { AnalyticsData, AnalyticsLink } from "../shared/api";

export type ASess = { id: string; date: string; week: number; status: string; excuse: string | null; startedAt: number | null; endedAt: number | null; readiness: string | null };
export type ASet = { id: string; sessionId: string; exKey: string; itemIdx: number; kind: string; weightKg: number | null; kgBasis?: string | null; reps: number | null; rir: number | null; restBeforeS: number | null; doneAt: number; strict?: number | null; pr?: number | null };
export type ABody = { date: string; sleepH: number | null };
export type AIntake = { date: string; amount: number };
export type AJournal = { date: string; mood: number | null };
export type ACardio = { date: string; protocol: string; status: string };

const DAY = 864e5;
const dms = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(dms(d) + n * DAY);
/** Start (YYYY-MM-DD) of the calendar week containing `d`, weeks starting on weekday `ws` (0 = Sun). */
export const weekOf = (d: string, ws: number) => addDays(d, -((new Date(dms(d)).getUTCDay() - ws + 7) % 7));
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (n: number) => Math.round(n * 10) / 10;
const variance = (a: number[]) => { const m = mean(a); return a.length > 1 ? a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) : 0; };

// body-map muscle → dashboard muscle group (adductors/abductors have no group of their own)
const M2G: Partial<Record<Muscle, Group>> = {
  trapezius: "Traps", "upper-back": "Back", "lower-back": "Hamstrings/Glutes", chest: "Chest", biceps: "Biceps", triceps: "Triceps", forearm: "Forearms/Grip",
  "back-deltoids": "Shoulders", "front-deltoids": "Shoulders", abs: "Core", obliques: "Core", hamstring: "Hamstrings/Glutes", gluteal: "Hamstrings/Glutes",
  quadriceps: "Quads", calves: "Calves", neck: "Neck",
};
/** Credit per muscle group for ONE set of an exercise: 1 = direct, 0.5 = indirect. */
export function groupCredit(exKey: string): Partial<Record<Group, number>> {
  const out: Partial<Record<Group, number>> = {};
  const main = EX_GROUP[exKey];
  if (main) out[main] = 1;
  const m = EX_MUSCLES[exKey];
  for (const x of m?.p ?? []) { const g = M2G[x]; if (g) out[g] = 1; }
  for (const x of m?.s ?? []) { const g = M2G[x]; if (g && out[g] == null) out[g] = 0.5; }
  return out;
}
/** Small muscles where 10-20 sets/week is not the target (they get lots of indirect work or need less). */
export const SMALL_GROUPS: Group[] = ["Core", "Forearms/Grip", "Neck", "Calves", "Traps"];

/** Hard-set credit for every set id (rules at the top of the file). */
export function setCredits(sets: ASet[]): Map<string, number> {
  const out = new Map<string, number>();
  const by = new Map<string, ASet[]>();
  for (const x of sets) by.set(`${x.sessionId}|${x.itemIdx}`, [...(by.get(`${x.sessionId}|${x.itemIdx}`) ?? []), x]);
  for (const list of by.values()) {
    let chainPaid = true; // a D/R without a set before it still earns its half once
    for (const x of [...list].sort((a, b) => a.doneAt - b.doneAt)) {
      if (x.kind === "W") { out.set(x.id, 0); continue; }
      if (x.kind === "D" || x.kind === "R") { out.set(x.id, chainPaid ? 0 : 0.5); chainPaid = true; continue; }
      out.set(x.id, x.rir != null && x.rir >= 5 ? 0 : 1);
      chainPaid = false;
    }
  }
  return out;
}
const honest = (x: ASet) => (x.kind === "N" || x.kind === "F") && x.strict !== 0 && !!x.reps && x.reps <= 12 && (shownKg(x) ?? 0) > 0;
const isDeloadWeek = (n: number) => /deload/i.test(CURRENT.weeks.find((w) => w.n === n)?.name ?? "");

export function buildAnalytics(
  inp: { sessions: ASess[]; sets: ASet[]; body: ABody[]; intake: AIntake[]; journal: AJournal[]; cardio: ACardio[]; creTarget: number },
  today: string, ws: number,
): AnalyticsData {
  const { sessions, body, intake, journal, cardio, creTarget } = inp;
  const sMap = new Map(sessions.map((s) => [s.id, s]));
  const done = sessions.filter((s) => s.status === "done");
  const counted = new Set(sessions.filter((s) => s.status === "done" || s.status === "abandoned" || s.status === "active").map((s) => s.id));
  const sets = inp.sets.filter((x) => counted.has(x.sessionId));
  const credit = setCredits(sets);

  // ---- calendar weeks (last 12, oldest first)
  const thisWeek = weekOf(today, ws);
  const starts = Array.from({ length: 12 }, (_, i) => addDays(thisWeek, (i - 11) * 7));
  const wk = new Map(starts.map((s) => [s, { start: s, sessions: 0, missed: 0, hardSets: 0, tonnage: 0, minutes: null as number | null, prs: 0, _m: [] as number[] }]));
  for (const s of sessions) {
    const w = wk.get(weekOf(s.date, ws));
    if (!w) continue;
    if (s.status === "done") {
      w.sessions++;
      const m = s.startedAt && s.endedAt ? (s.endedAt - s.startedAt) / 60000 : 0;
      if (m > 5 && m < 300) w._m.push(m); // ignore forgotten-open sessions
    } else if (s.status === "missed" || s.status === "skipped") w.missed++;
  }
  const mWeeks = new Map(starts.map((s) => [s, {} as Record<string, number>]));
  for (const x of sets) {
    const s = sMap.get(x.sessionId)!;
    const start = weekOf(s.date, ws);
    const w = wk.get(start);
    if (!w) continue;
    const c = credit.get(x.id) ?? 0;
    w.hardSets += c;
    if (x.kind !== "W") w.tonnage += totalKg(x) * (x.reps ?? 0); // tonnage = Σ load × reps (both dumbbells for pairs)
    if (x.pr && x.kind !== "W") w.prs++;
    if (c) for (const [g, f] of Object.entries(groupCredit(x.exKey))) { const mw = mWeeks.get(start)!; mw[g] = (mw[g] ?? 0) + c * f!; }
  }
  const weeks = [...wk.values()].map(({ _m, ...w }) => ({ ...w, hardSets: r1(w.hardSets), tonnage: Math.round(w.tonnage), minutes: _m.length ? Math.round(mean(_m)) : null }));
  const muscleWeeks = starts.map((s) => ({ start: s, sets: Object.fromEntries(Object.entries(mWeeks.get(s)!).map(([g, n]) => [g, r1(n)])) })).filter((w, i, a) => Object.keys(w.sets).length || i === a.length - 1);

  // ---- e1RM per lift per session (Epley, best honest set)
  const best = new Map<string, Map<string, { e: number; eR: number; date: string; week: number }>>();
  for (const x of sets) {
    if (!honest(x) || EXERCISES[x.exKey]?.metric !== "weight_reps") continue;
    const s = sMap.get(x.sessionId)!;
    const kg = shownKg(x)!;
    const e = kg * (1 + x.reps! / 30);
    const eR = e1rmRir(kg, x.reps!, x.rir); // RIR-adjusted: reps + min(RIR,3) — fairer when a set stopped short of failure
    const m = best.get(x.exKey) ?? new Map();
    best.set(x.exKey, m);
    const p = m.get(x.sessionId);
    if (!p) m.set(x.sessionId, { e, eR, date: s.date, week: s.week });
    else { p.e = Math.max(p.e, e); p.eR = Math.max(p.eR, eR); }
  }
  const lifts = [...best.entries()].map(([exKey, m]) => {
    const pts = [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
    const recent = pts.filter((p) => p.date > addDays(today, -28)).map((p) => p.e);
    const prior = pts.filter((p) => p.date <= addDays(today, -28) && p.date > addDays(today, -56)).map((p) => p.e);
    // 4-week change = best e1RM in the last 28 days ÷ best in the 28 days before − 1
    const change4w = recent.length && prior.length ? r1((Math.max(...recent) / Math.max(...prior) - 1) * 100) : null;
    return { exKey, name: EXERCISES[exKey]?.name ?? exKey, pair: !!EXERCISES[exKey]?.pair, e1rm: r1(pts[pts.length - 1].e), best: r1(Math.max(...pts.map((p) => p.e))), change4w, sessions: pts.length, last: pts[pts.length - 1].date, points: pts.slice(-12).map((p) => ({ date: p.date, e1rm: r1(p.e) })) };
  }).filter((l) => l.sessions >= 2).sort((a, b) => b.sessions - a.sessions || b.last.localeCompare(a.last)).slice(0, 8);

  // ---- session performance vs your own baseline (for the "what goes with good sessions" links)
  // perf = mean over lifts of (session best RIR-adjusted e1RM ÷ median of that lift's previous ≤3 sessions − 1) × 100.
  // Deload weeks are left out (lighter on purpose). A rolling baseline removes the long-term upward trend.
  const perf = new Map<string, number>();
  const hist = new Map<string, number[]>();
  for (const s of [...done].sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? 0) - (b.startedAt ?? 0))) {
    if (isDeloadWeek(s.week)) continue;
    const ratios: number[] = [];
    for (const [ex, m] of best) {
      const p = m.get(s.id);
      if (!p) continue;
      const h = hist.get(ex) ?? [];
      if (h.length) ratios.push(p.eR / median(h.slice(-3)) - 1);
      hist.set(ex, [...h, p.eR]);
    }
    if (ratios.length) perf.set(s.id, mean(ratios) * 100);
  }
  const perfSess = done.filter((s) => perf.has(s.id));
  const sleepH = new Map(body.filter((b) => b.sleepH != null).map((b) => [b.date, b.sleepH!]));
  const creDay = new Map<string, number>();
  intake.forEach((i) => creDay.set(i.date, (creDay.get(i.date) ?? 0) + i.amount));
  const moodDay = new Map<string, number[]>();
  journal.filter((j) => j.mood != null).forEach((j) => moodDay.set(j.date, [...(moodDay.get(j.date) ?? []), j.mood!]));
  const football = new Set(cardio.filter((c) => c.protocol === "football" && c.status !== "skipped").map((c) => c.date));
  const readiness = (s: ASess) => { try { return JSON.parse(s.readiness ?? "null") as Record<string, number> | null; } catch { return null; } };
  const firstCre = [...creDay.keys()].sort()[0];

  type F = { id: string; label: string; hi: string; lo: string; get: (s: ASess) => boolean | null };
  const FACTORS: F[] = [
    { id: "sleep_h", label: "Sleep hours (Body log)", hi: "7 h or more", lo: "under 7 h", get: (s) => (sleepH.has(s.date) ? sleepH.get(s.date)! >= 7 : null) },
    { id: "sleep_r", label: "Sleep rating before the workout", hi: "slept well (4-5)", lo: "slept poorly (1-3)", get: (s) => { const v = readiness(s)?.sleep; return v == null ? null : v >= 4; } },
    { id: "ready", label: "Readiness check (average of 5)", hi: "felt ready (3.5+)", lo: "felt flat (under 3.5)", get: (s) => { const r = readiness(s); const v = r ? Object.values(r).filter((x) => typeof x === "number") : []; return v.length ? mean(v) >= 3.5 : null; } },
    { id: "mood", label: "Journal mood that day", hi: "good mood (4-5)", lo: "low mood (1-3)", get: (s) => (moodDay.has(s.date) ? mean(moodDay.get(s.date)!) >= 4 : null) },
    { id: "football", label: "Football the day before", hi: "no football yesterday", lo: "football yesterday", get: (s) => !football.has(addDays(s.date, -1)) },
    // creatine: days in the 7 days up to the session where the daily target was hit (only once you started taking it)
    { id: "creatine", label: "Creatine in the 7 days before", hi: "6-7 days", lo: "0-4 days", get: (s) => { if (!firstCre || s.date < firstCre) return null; let n = 0; for (let i = 0; i < 7; i++) if ((creDay.get(addDays(s.date, -i)) ?? 0) >= creTarget) n++; return n >= 6 ? true : n <= 4 ? false : null; } },
  ];
  const MIN_N = 3;
  const links: AnalyticsLink[] = [];
  const pending: { label: string; have: number; need: number }[] = [];
  const compare = (id: string, label: string, hiL: string, loL: string, hi: number[], lo: number[], unit: AnalyticsLink["unit"], better: "higher" | "lower") => {
    if (hi.length < MIN_N || lo.length < MIN_N) { pending.push({ label, have: Math.min(hi.length, lo.length), need: MIN_N }); return; }
    const diff = mean(hi) - mean(lo);
    // rough check: |difference| > 2 × standard error of the difference (Welch). Day-to-day data aren't independent,
    // so even "clear" means "worth testing", never proof.
    const se = Math.sqrt(variance(hi) / hi.length + variance(lo) / lo.length);
    links.push({ id, label, hi: { label: hiL, n: hi.length, mean: r1(mean(hi)) }, lo: { label: loL, n: lo.length, mean: r1(mean(lo)) }, diff: r1(diff), unit, better, clear: se > 0 ? Math.abs(diff) > 2 * se : Math.abs(diff) > 0 });
  };
  for (const f of FACTORS) {
    const hi: number[] = [], lo: number[] = [];
    for (const s of perfSess) { const v = f.get(s); if (v === true) hi.push(perf.get(s.id)!); else if (v === false) lo.push(perf.get(s.id)!); }
    if (f.id === "football" && !lo.length) continue; // no football logged at all → nothing to say
    compare(f.id, f.label, f.hi, f.lo, hi, lo, "%", "higher");
  }
  // rest length vs reps kept: next set at the same weight, same exercise, same session
  const short: number[] = [], long: number[] = [];
  const byItem = new Map<string, ASet[]>();
  sets.filter((x) => (x.kind === "N" || x.kind === "F") && x.reps != null).forEach((x) => byItem.set(`${x.sessionId}|${x.itemIdx}`, [...(byItem.get(`${x.sessionId}|${x.itemIdx}`) ?? []), x]));
  for (const l of byItem.values()) {
    const s = [...l].sort((a, b) => a.doneAt - b.doneAt);
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i], r = b.restBeforeS;
      if (r == null || r < 30 || r > 900 || shownKg(a) !== shownKg(b) || !shownKg(b)) continue;
      const lost = a.reps! - b.reps!; // reps lost from one set to the next at the same weight
      if (r < 120) short.push(lost); else if (r >= 180) long.push(lost);
    }
  }
  if (short.length || long.length) compare("rest", "Rest before the next set (same weight)", "3 min or more", "under 2 min", long, short, "reps", "lower");

  // ---- effort mix (RIR on working sets): index 0-4, 5 = "5+"
  const work = sets.filter((x) => x.kind === "N" || x.kind === "F");
  const rir = [0, 0, 0, 0, 0, 0];
  work.forEach((x) => { if (x.rir != null) rir[Math.min(5, Math.max(0, x.rir))]++; });

  // ---- recent PRs
  const prs = sets.filter((x) => x.pr && x.kind !== "W").sort((a, b) => b.doneAt - a.doneAt).slice(0, 8).map((x) => {
    const kg = shownKg(x);
    return { date: sMap.get(x.sessionId)!.date, exKey: x.exKey, name: EXERCISES[x.exKey]?.name ?? x.exKey, kg, reps: x.reps, e1rm: kg && x.reps && x.reps <= 12 ? r1(kg * (1 + x.reps / 30)) : null };
  });

  // ---- adherence, last 28 days: done ÷ (done + missed/skipped)
  const since = addDays(today, -27);
  const d4 = sessions.filter((s) => s.date >= since && s.status === "done").length;
  const m4 = sessions.filter((s) => s.date >= since && (s.status === "missed" || s.status === "skipped")).length;

  return {
    weeks, lifts, prs, pending,
    muscles: { groups: [...GROUPS], small: SMALL_GROUPS, weeks: muscleWeeks },
    effort: { rir, logged: rir.reduce((a, b) => a + b, 0), total: work.length },
    links: links.sort((a, b) => Number(b.clear) - Number(a.clear) || Math.abs(b.diff) - Math.abs(a.diff)),
    perfSessions: perfSess.length,
    adherence4w: d4 + m4 ? Math.round((d4 / (d4 + m4)) * 100) : null,
  };
}

/** Plain-language findings from the analytics, appended to /api/insights. */
export function analyticsInsights(a: AnalyticsData): { tone: "good" | "warn" | "bad" | "info"; title: string; text: string }[] {
  const out: { tone: "good" | "warn" | "bad" | "info"; title: string; text: string }[] = [];
  const up = a.lifts.filter((l) => l.change4w != null);
  if (up.length >= 2) {
    const avg = r1(mean(up.map((l) => l.change4w!)));
    out.push({ tone: avg > 0 ? "good" : avg < -2 ? "warn" : "info", title: `Strength ${avg >= 0 ? "+" : ""}${avg}% in 4 weeks`, text: `Average change in estimated max over ${up.length} lifts (best of the last 4 weeks vs the 4 before).` });
  }
  const top = a.links.find((l) => l.clear && l.unit === "%");
  if (top) {
    const better = top.diff > 0 ? top.hi : top.lo, worse = top.diff > 0 ? top.lo : top.hi;
    out.push({ tone: "info", title: `Pattern: ${top.label.toLowerCase()}`, text: `Sessions with ${better.label} averaged ${better.mean >= 0 ? "+" : ""}${better.mean}% vs your usual (n=${better.n}); with ${worse.label} ${worse.mean >= 0 ? "+" : ""}${worse.mean}% (n=${worse.n}). An association in your data, not proof.` });
  }
  return out;
}
