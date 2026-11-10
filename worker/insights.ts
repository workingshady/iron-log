// Plain-language findings computed from the raw data. Each insight = one sentence + a tone.
// Add a new rule: push another {tone, title, text} in buildInsights.
import { EXERCISES } from "../program/exercises";
import { TOPICS } from "../shared/notes";
import { EX_GROUP, GROUPS } from "../program/groups";
import { EXCUSES } from "../shared/lists";
import { shownKg } from "../shared/load";

export interface Insight { tone: "good" | "warn" | "bad" | "info"; title: string; text: string }

type S = { id: string; date: string; week: number; status: string; excuse: string | null; startedAt: number | null; endedAt: number | null; readiness: string | null; rpe: number | null; plan: string };
type X = { sessionId: string; exKey: string; itemIdx: number; kind: string; weightKg: number | null; reps: number | null; seconds: number | null; rir: number | null; restBeforeS: number | null; doneAt: number; painArea: string | null; painLevel: number | null; swappedFrom: string | null; strict?: number | null; suggested?: string | null; note?: string | null };
type B = { date: string; weightKg: number | null; sleepH: number | null; proteinG: number | null };
type I = { date: string; amount: number };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function muscleSets(sess: S[], sets: X[]) {
  const wk = new Map(sess.map((s) => [s.id, s.week]));
  const out: Record<number, Record<string, number>> = {};
  const ex: Record<number, Record<string, number>> = {};
  for (const x of sets) {
    if (x.kind === "W") continue;
    const w = wk.get(x.sessionId);
    if (w == null) continue;
    (ex[w] ??= {})[x.exKey] = (ex[w][x.exKey] ?? 0) + 1;
    const g = EX_GROUP[x.exKey];
    if (g) (out[w] ??= {})[g] = (out[w][g] ?? 0) + 1;
  }
  return { groups: GROUPS, weeks: Object.keys(ex).map(Number).sort((a, b) => a - b).map((w) => ({ week: w, sets: out[w] ?? {}, ex: ex[w] })) };
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
    const wk = shownKg(x as never);
    if (!wk || !x.reps || x.reps > 12 || x.strict === 0 || x.kind === "D" || x.kind === "R") continue;
    const e = wk * (1 + x.reps / 30);
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

  // 2b. honesty: stopping early & cheating (the user's own known habits)
  // bottom of the planned rep range for that exercise in that session (stopping inside the range is fine)
  const bottoms = new Map<string, number>();
  for (const sess of done) { try { (JSON.parse(sess.plan) as { reps?: number | [number, number] | null }[]).forEach((p, i) => { const r = p.reps; if (r != null) bottoms.set(`${sess.id}|${i}`, Array.isArray(r) ? r[0] : r); }); } catch { /* ignore */ } }
  const tgtBottom = (x: X) => bottoms.get(`${x.sessionId}|${x.itemIdx}`) ?? null;
  const early = work.filter((x) => { const b = tgtBottom(x); return x.reps != null && x.rir != null && x.rir >= 2 && b != null && x.reps < b; });
  if (early.length) out.push({ tone: "warn", title: `Stopped early on ${early.length} set${early.length > 1 ? "s" : ""}`, text: "Below the target reps with 2+ left in the tank. The burn isn't failure — finish the set." });
  const answered = work.filter((x) => x.strict != null);
  const cheated = answered.filter((x) => x.strict === 0);
  if (answered.length >= 5) out.push({ tone: cheated.length / answered.length > 0.15 ? "warn" : "good", title: `Strict form on ${Math.round(((answered.length - cheated.length) / answered.length) * 100)}% of sets`, text: cheated.length ? `${cheated.length} cheated set${cheated.length > 1 ? "s" : ""}. Lighten the weight a step and own every rep.` : "Clean reps — the numbers you log are real progress." });

  // 2c. what your NOTES say (keyword groups — read every note, find repeats)
  const NOTE_RULES: { re: RegExp; tone: Insight["tone"]; title: string; fix: string }[] = [
    { re: new RegExp(`pump|${TOPICS.tight.source}`, "i"), tone: "warn", title: "Tightness / stiffness", fix: "Warm that area up (light sets + band work) and start the exercise 1 step lighter. Pain that stays → swap the exercise." },
    { re: new RegExp(`hurn|${TOPICS.pain.source}`, "i"), tone: "bad", title: "Pain words in notes", fix: "Log it with the Pain chip too (area + level) so the app lowers the weight next time." },
    { re: new RegExp(`estimate is [0-9]|${TOPICS.count.source}`, "i"), tone: "warn", title: "Lost count of reps", fix: "Use 'Count reps for me' (tap per rep or 3 s tempo beeper) — numbers drive the next weight." },
    { re: new RegExp(`use my back|${TOPICS.cheat.source}`, "i"), tone: "warn", title: "Cheated reps", fix: "Tap 'Cheated / partial' on that set — it's then ignored for weight decisions. Next time: one step lighter, strict." },
    { re: /drop|dropp/i, tone: "info", title: "Drop sets written in notes", fix: "Use the 'Drop set' button so the lighter part is logged as its own set (keeps the main set honest)." },
    { re: /rest|then another|after \d+ ?min|play \d+ reps and rest/i, tone: "info", title: "Rest-pause written in notes", fix: "Use the 'Rest-pause' button for the extra mini-set instead of adding the reps together." },
    { re: /bar.{0,20}(fall|slip)|gone fall|dropp?ed the bar|almost dropped|no spotter/i, tone: "bad", title: "Bar safety", fix: "Close to failure on bench/close-grip: use safety pins, a Smith machine or dumbbells, and stop at RIR 1 when alone." },
    { re: /first time|never done|new exercise/i, tone: "info", title: "New exercise learning curve", fix: "First 2-3 sessions on a new lift: stay at RIR 2-3 and focus on the groove — strength comes fast after." },
  ];
  const notes = sets.filter((x) => x.note && x.note.trim()).map((x) => ({ ex: x.exKey, text: x.note!.trim() }));
  for (const r of NOTE_RULES) {
    const hits = notes.filter((n) => r.re.test(n.text));
    if (!hits.length) continue;
    const exs = [...new Set(hits.map((h) => EXERCISES[h.ex]?.name ?? h.ex))].slice(0, 3).join(", ");
    out.push({ tone: r.tone, title: `${r.title} (${hits.length} note${hits.length > 1 ? "s" : ""})`, text: `${exs}: "${hits[0].text.slice(0, 70)}${hits[0].text.length > 70 ? "…" : ""}". ${r.fix}` });
  }

  // 2d. data quality
  const bySessEx = new Map<string, X[]>();
  for (const x of work) bySessEx.set(`${x.sessionId}|${x.exKey}`, [...(bySessEx.get(`${x.sessionId}|${x.exKey}`) ?? []), x]);
  let rirJumps = 0;
  for (const list of bySessEx.values()) {
    const l = [...list].sort((a, b) => a.doneAt - b.doneAt);
    for (let i = 1; i < l.length; i++) if (l[i].rir != null && l[i - 1].rir != null && l[i].weightKg === l[i - 1].weightKg && l[i].reps === l[i - 1].reps && Math.abs(l[i].rir! - l[i - 1].rir!) >= 3) rirJumps++;
  }
  if (rirJumps) out.push({ tone: "info", title: "RIR jumped on identical sets", text: `${rirJumps}× the same weight × reps went from "4+ left" to "0 left". Fatigue builds, but a 4-rep swing usually means the first rating was a guess. Rate RIR right after the last rep.` });
  const planned = new Map<string, number>();
  for (const sess of done) { try { (JSON.parse(sess.plan) as { sets: number; skipped?: boolean }[]).forEach((p, i) => planned.set(`${sess.id}|${i}`, p.skipped ? -1 : p.sets)); } catch { /* ignore */ } }
  const skippedEx = [...planned.values()].filter((v) => v === -1).length;
  if (skippedEx) out.push({ tone: "warn", title: `${skippedEx} planned exercise${skippedEx > 1 ? "s" : ""} skipped`, text: "Usually the last ones (core / finishers) when the session runs long. Keep rests on the timer, or do core at home on rest days." });

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
