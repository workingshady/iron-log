// Plain-language findings computed from the raw data. Each insight = one sentence + a tone.
// Add a new rule: push another {tone, title, text} in buildInsights.
import { EXERCISES } from "../program/exercises";
import { EX_GROUP, GROUPS } from "../program/groups";
import { EXCUSES } from "../shared/lists";

export interface Insight { tone: "good" | "warn" | "bad" | "info"; title: string; text: string }

type S = { id: string; date: string; week: number; status: string; excuse: string | null; startedAt: number | null; endedAt: number | null; readiness: string | null; rpe: number | null; plan: string };
type X = { sessionId: string; exKey: string; itemIdx: number; kind: string; weightKg: number | null; reps: number | null; seconds: number | null; rir: number | null; restBeforeS: number | null; doneAt: number; painArea: string | null; painLevel: number | null; swappedFrom: string | null };
type B = { date: string; weightKg: number | null; sleepH: number | null; proteinG: number | null };
type I = { date: string; amount: number };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function muscleSets(sess: S[], sets: X[]) {
  const wk = new Map(sess.map((s) => [s.id, s.week]));
  const out: Record<number, Record<string, number>> = {};
  for (const x of sets) {
    if (x.kind === "W") continue;
    const w = wk.get(x.sessionId);
    const g = EX_GROUP[x.exKey];
    if (w == null || !g) continue;
    (out[w] ??= {})[g] = (out[w][g] ?? 0) + 1;
  }
  return { groups: GROUPS, weeks: Object.entries(out).map(([w, m]) => ({ week: Number(w), sets: m })).sort((a, b) => a.week - b.week) };
}

export function buildInsights(sess: S[], sets: X[], body: B[], intake: I[], creTarget: number, today: string): Insight[] {
  const out: Insight[] = [];
  const done = sess.filter((s) => s.status === "done");
  const missed = sess.filter((s) => s.status === "missed" || s.status === "skipped");
  const work = sets.filter((x) => x.kind !== "W");
  if (!done.length && !missed.length) return [{ tone: "info", title: "No data yet", text: "Finish your first workout and insights will appear here." }];

  // 1. strength progress per lift (e1RM first vs last session)
  const bySess = new Map<string, Map<string, number>>();
  const order = new Map(sess.map((s) => [s.id, s.date]));
  for (const x of work) {
    if (!x.weightKg || !x.reps || x.reps > 12) continue;
    const e = x.weightKg * (1 + x.reps / 30);
    const m = bySess.get(x.exKey) ?? new Map<string, number>();
    m.set(x.sessionId, Math.max(m.get(x.sessionId) ?? 0, e));
    bySess.set(x.exKey, m);
  }
  const gains: { k: string; pct: number; stall: boolean }[] = [];
  for (const [k, m] of bySess) {
    const pts = [...m.entries()].sort((a, b) => (order.get(a[0]) ?? "").localeCompare(order.get(b[0]) ?? "")).map((p) => p[1]);
    if (pts.length < 2) continue;
    const pct = ((pts[pts.length - 1] - pts[0]) / pts[0]) * 100;
    const last3 = pts.slice(-3);
    gains.push({ k, pct, stall: pts.length >= 3 && Math.max(...last3) <= last3[0] * 1.005 });
  }
  const top = gains.filter((g) => g.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 3);
  if (top.length) out.push({ tone: "good", title: "Getting stronger", text: top.map((g) => `${EXERCISES[g.k]?.name ?? g.k} +${Math.round(g.pct)}%`).join(" · ") + " (estimated 1-rep max)." });
  const stalls = gains.filter((g) => g.stall).map((g) => EXERCISES[g.k]?.name ?? g.k);
  if (stalls.length) out.push({ tone: "warn", title: "Stalled 3 sessions", text: `${stalls.slice(0, 3).join(", ")}. Try +1 rep before adding weight, or change the rep range next block.` });

  // 2. RIR logging + effort
  const withReps = work.filter((x) => x.reps != null);
  const rirLogged = withReps.filter((x) => x.rir != null);
  if (withReps.length >= 10) {
    const pct = Math.round((rirLogged.length / withReps.length) * 100);
    if (pct < 50) out.push({ tone: "info", title: `RIR logged on ${pct}% of sets`, text: "Tap the RIR number after each set. It's the best signal for adjusting weights." });
    else {
      const a = avg(rirLogged.map((x) => x.rir!));
      out.push({ tone: a > 3 ? "warn" : "good", title: `Average RIR ${r1(a)}`, text: a > 3 ? "Most sets feel easy. Weights can go up." : a < 1 ? "You're near failure on most sets. Watch recovery." : "Effort is in the productive range (0-3 RIR)." });
    }
  }

  // 3. real rest vs planned
  const planRest = new Map<string, number[]>();
  for (const s of done) {
    try { planRest.set(s.id, (JSON.parse(s.plan) as { rest: number }[]).map((p) => p.rest)); } catch { /* ignore */ }
  }
  const diffs: number[] = [];
  const sorted = [...work].sort((a, b) => a.doneAt - b.doneAt);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (a.sessionId !== b.sessionId || a.itemIdx !== b.itemIdx || b.restBeforeS == null) continue;
    const planned = planRest.get(a.sessionId)?.[a.itemIdx];
    if (planned && b.restBeforeS < 900) diffs.push(b.restBeforeS - planned);
  }
  if (diffs.length >= 8) {
    const d = Math.round(avg(diffs));
    if (Math.abs(d) >= 30) out.push({ tone: "warn", title: `Rest is ${Math.abs(d)} s ${d > 0 ? "longer" : "shorter"} than planned`, text: d > 0 ? "Sessions run long. Start the next set when the timer says GO." : "Too little rest costs strength on big lifts. Let the timer finish." });
    else out.push({ tone: "good", title: "Rest times on point", text: "Your real rest matches the plan within 30 s." });
  }

  // 4. duration
  const mins = done.filter((s) => s.startedAt && s.endedAt).map((s) => (s.endedAt! - s.startedAt!) / 60000);
  if (mins.length >= 2) out.push({ tone: avg(mins) > 85 ? "warn" : "info", title: `Average session ${Math.round(avg(mins))} min`, text: avg(mins) > 85 ? "Over the 65-80 min target. Supersets and timer discipline help." : "Within the 65-80 min target." });

  // 5. missed-day patterns
  if (missed.length >= 2) {
    const wd = new Map<number, number>();
    missed.forEach((s) => { const d = new Date(`${s.date}T12:00:00`).getDay(); wd.set(d, (wd.get(d) ?? 0) + 1); });
    const [day, n] = [...wd.entries()].sort((a, b) => b[1] - a[1])[0];
    const ex = new Map<string, number>();
    missed.forEach((s) => s.excuse && ex.set(s.excuse, (ex.get(s.excuse) ?? 0) + 1));
    const topEx = [...ex.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({ tone: "warn", title: `Most missed: ${DAYS[day]} (${n}×)`, text: `Top reason: ${EXCUSES.find((e) => e.id === topEx?.[0])?.label ?? topEx?.[0] ?? "—"}. Consider moving that session or making it shorter.` });
  }

  // 6. readiness vs performance
  const rd = done.map((s) => { try { const r = JSON.parse(s.readiness ?? "null"); const v = r ? Object.values(r).filter((x) => typeof x === "number") as number[] : []; return v.length ? avg(v) : null; } catch { return null; } }).filter((x): x is number => x != null);
  if (rd.length >= 3) out.push({ tone: avg(rd) < 3 ? "warn" : "info", title: `Average readiness ${r1(avg(rd))}/5`, text: avg(rd) < 3 ? "You often start tired. Sleep and food are the levers." : "You usually come in fresh enough to push." });

  // 7. pain
  const pains = work.filter((x) => x.painLevel);
  if (pains.length) {
    const area = new Map<string, number>();
    pains.forEach((x) => x.painArea && area.set(x.painArea, (area.get(x.painArea) ?? 0) + 1));
    const [a, n] = [...area.entries()].sort((x, y) => y[1] - x[1])[0] ?? ["?", 0];
    const exs = [...new Set(pains.filter((x) => x.painArea === a).map((x) => EXERCISES[x.exKey]?.name ?? x.exKey))];
    out.push({ tone: "bad", title: `Pain: ${a} (${n} sets)`, text: `On ${exs.slice(0, 3).join(", ")}. If it repeats, swap the movement and log it.` });
  }

  // 8. swaps
  const swapped = work.filter((x) => x.swappedFrom);
  if (swapped.length) {
    const m = new Map<string, number>();
    swapped.forEach((x) => m.set(x.swappedFrom!, (m.get(x.swappedFrom!) ?? 0) + 1));
    const [k] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({ tone: "info", title: "Swaps", text: `${EXERCISES[k]?.name ?? k} gets swapped most. The review may replace it for good.` });
  }

  // 9. bodyweight trend (weekly averages; no need to weigh daily)
  const bw = body.filter((b) => b.weightKg != null).sort((a, b) => a.date.localeCompare(b.date));
  if (bw.length >= 2) {
    const days = (Date.parse(bw[bw.length - 1].date) - Date.parse(bw[0].date)) / 864e5;
    if (days >= 7) {
      const perWk = ((bw[bw.length - 1].weightKg! - bw[0].weightKg!) / days) * 7;
      out.push({ tone: perWk > 0.6 ? "warn" : perWk < 0 ? "warn" : "good", title: `Bodyweight ${perWk >= 0 ? "+" : ""}${r1(perWk)} kg/week`, text: perWk > 0.6 ? "Faster than the 0.25-0.5 kg target. Likely extra fat; trim ~200 kcal." : perWk < 0 ? "Going down while trying to build. Add ~200 kcal/day." : "On target for lean gain." });
    }
  }
  const lastW = bw[bw.length - 1];
  if (lastW) {
    const ago = Math.round((Date.parse(today) - Date.parse(lastW.date)) / 864e5);
    if (ago >= 10) out.push({ tone: "info", title: `Last weigh-in ${ago} days ago`, text: "Once a week is enough. Same time, morning, after the bathroom." });
  }

  // 10. creatine last 14 days
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 13 * 864e5).toISOString().slice(0, 10);
  const cd = new Map<string, number>();
  intake.filter((i) => i.date >= since).forEach((i) => cd.set(i.date, (cd.get(i.date) ?? 0) + i.amount));
  const hit = [...cd.values()].filter((g) => g >= creTarget).length;
  if (intake.length) out.push({ tone: hit >= 12 ? "good" : "warn", title: `Creatine ${hit}/14 days`, text: hit >= 12 ? "Consistent. That's what makes it work." : "Creatine works through saturation, so daily matters. Try pairing it with breakfast." });

  return out;
}
