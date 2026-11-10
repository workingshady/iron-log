import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanItem, Session, SessionBundle, SetLog } from "../../shared/api";
import { NOTE_TAGS, PAIN_AREAS, SET_KINDS, type SetKind } from "../../shared/lists";
import { targetLabel, toItem } from "../../shared/plan";
import { EXERCISES } from "../../program/exercises";
import { DEFAULT_SWAP_NOTE, SWAP_REASONS, swapHint } from "../../program/swaps";
import { cache, get, queue, track, uid } from "../lib/api";
import { beep, clock, cx, kg, niceDate, restLabel, roundTo, unlockAudio, vibrate } from "../lib/util";
import { Btn, Chips, Label, NumInput, Sheet, Thumb, scale } from "../components/ui";
import { TechNote, InfoDot } from "../components/Terms";
import { TERMS } from "../../program/learn";
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, Hash, Mic, ChevronLeft, Clock, Dumbbell, Equal, Flame, Layers, MessageSquare, MoreHorizontal, NotebookPen, PlayCircle, Plus, Repeat, Ruler, SkipForward, Sparkles, Timer, TrendingDown, TrendingUp, TriangleAlert, Trophy } from "lucide-react";
import { e1rm, isBarbell, plates, recommend, warmups, type ExHistory, type Rec, type RecKind } from "../../shared/recommend";
import { CURRENT } from "../../program";
import { barOf, barsFrom, basisFor, kgHelp, kgLabel, loadOf, shownKg, type Bars } from "../../shared/load";
import type { AppState } from "../../shared/api";
import { useLoad } from "../lib/useLoad";
import { ExerciseSheet, SetupNote } from "../components/ExerciseSheet";
import { totalKg } from "../../shared/load";
import { ListOrdered } from "lucide-react";
import { RestTimer, loadRest, saveRest, type Rest } from "../components/RestTimer";
import { go } from "../nav";

type Draft = { weight: string; reps: string; seconds: string; meters: string; assist: string; rir: string; strict: string; note: string };
const workSets = (sets: SetLog[], i: number) => sets.filter((s) => s.itemIdx === i && s.kind !== "W");

export default function SessionScreen({ id }: { id: string }) {
  const ck = `bundle_${id}`;
  const [b, setB] = useState<SessionBundle | null>(() => cache.get(ck));
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number>(-1);
  const [rest, setRestState] = useState<Rest | null>(() => {
    const r = loadRest();
    return r?.sessionId === id ? r : null;
  });
  const { data: appState } = useLoad<AppState>("/state");
  const bars = barsFrom(appState?.settings);
  const [undo, setUndo] = useState<{ set: SetLog; pr: string | null; warn?: boolean } | null>(null);
  const lastTap = useRef(0);
  const [sheet, setSheet] = useState<null | { k: "how" | "menu" | "swap"; i: number } | { k: "set"; s: SetLog } | { k: "finish" } | { k: "log" }>(null);

  const setRest = (r: Rest | null) => { saveRest(r); setRestState(r); };

  // load: cached first (offline), then server; keep local sets that haven't synced yet
  useEffect(() => {
    get<SessionBundle>(`/sessions/${id}`)
      .then((srv) => {
        setB((loc) => {
          if (!loc) return srv;
          const m = new Map(srv.sets.map((s) => [s.id, s]));
          loc.sets.forEach((s) => m.set(s.id, s));
          return { ...srv, session: { ...srv.session, plan: loc.session.plan.length ? loc.session.plan : srv.session.plan }, sets: [...m.values()].filter((s) => !s.deleted).sort((a, c) => a.doneAt - c.doneAt), last: { ...loc.last, ...srv.last }, feedback: { ...srv.feedback, ...(loc.feedback ?? {}) } };
        });
      })
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  useEffect(() => { if (b) cache.set(ck, b); }, [b, ck]);

  const s = b?.session;
  const live = s?.status === "active";

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), undo.warn ? 9000 : 6000);
    return () => clearTimeout(t);
  }, [undo]);

  // keep the screen awake during a workout
  useEffect(() => {
    if (!live || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const req = () => navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    req();
    const vis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); lock?.release().catch(() => {}); };
  }, [live]);

  // open the first unfinished exercise on load
  useEffect(() => {
    if (b && open === -1) setOpen(firstOpen(b.session.plan, b.sets, -1));
  }, [b, open]);

  const patchSession = useCallback((p: Partial<Session>) => {
    setB((x) => (x ? { ...x, session: { ...x.session, ...p } } : x));
    queue("PATCH", `/sessions/${id}`, p);
  }, [id]);

  const setPlan = (plan: PlanItem[]) => patchSession({ plan });

  const putSet = (set: SetLog) => {
    setB((x) => {
      if (!x) return x;
      const others = x.sets.filter((o) => o.id !== set.id);
      return { ...x, sets: set.deleted ? others : [...others, set].sort((a, c) => a.doneAt - c.doneAt) };
    });
    queue("PUT", `/sets/${set.id}`, set);
  };

  if (!b || !s) return <p className="py-20 text-center text-mute">{err ?? "Loading…"}</p>;

  const plan = s.plan;
  const sets = b.sets;
  const hist: Record<string, ExHistory | undefined> = b.last;
  const deload = /deload/i.test(CURRENT.weeks.find((w) => w.n === s.week)?.name ?? "");
  const recs = plan.map((it) => recommend(it.ex, it, hist, { deload, step: it.step }));
  const total = plan.filter((p) => !p.skipped).reduce((a, p) => a + p.sets, 0);
  const done = plan.reduce((a, p, i) => a + (p.skipped ? 0 : Math.min(p.sets, workSets(sets, i).length)), 0);

  function logSet(i: number, d: Draft, kind: SetKind = "N") {
    const tap = Date.now();
    if (tap - lastTap.current < 900) return; // double-tap guard
    lastTap.current = tap;
    unlockAudio();
    const it = plan[i];
    const n = (v: string) => (v.trim() === "" ? null : Number(v));
    const weight = n(d.weight), reps = n(d.reps);
    // guard against typos ("margin of error")
    if (weight != null && (weight < 0 || weight > 400)) return alert("Weight looks wrong (0-400 kg).");
    if (reps != null && (reps < 0 || reps > 100)) return alert("Reps look wrong (0-100).");
    if (kind === "D" && reps == null) return alert("How many reps did you get on the drop?");
    const prevBest = Math.max(0, ...sets.filter((x) => x.exKey === it.ex).map((x) => shownKg(x) ?? 0), ...(b!.last[it.ex]?.sets.map((x) => shownKg(x) ?? 0) ?? []));
    const bar = barOf(it.ex, bars);
    if (weight != null && bar > 0 && weight > 0 && weight < bar && !confirm(`${weight} kg is lighter than the empty bar (${bar} kg). Bar weights count in the total. Save anyway?`)) return;
    if (weight != null && prevBest >= 10 && weight > prevBest * 1.5 && !confirm(`${weight} kg is way above your best (${prevBest} kg). Typo?\n\nOK = save anyway`)) return;

    const t = Date.now();
    const prev = sets[sets.length - 1];
    const set: SetLog = {
      id: uid(), sessionId: id, exKey: it.ex, itemIdx: i, setNo: sets.filter((x) => x.itemIdx === i).length + 1, kind,
      weightKg: weight, reps, seconds: n(d.seconds), meters: n(d.meters), assist: d.assist || null, rir: n(d.rir), strict: d.strict === "" ? null : Number(d.strict),
      restBeforeS: prev ? Math.round((t - prev.doneAt) / 1000) : null, doneAt: t, note: d.note.trim() || null, painArea: null, painLevel: null,
      kgBasis: weight != null ? basisFor(it.ex) : null,
      swappedFrom: it.swappedFrom ?? null,
      suggested: JSON.stringify({ weightKg: recs[i].weightKg, reps: recs[i].reps, seconds: recs[i].seconds, kind: recs[i].kind }),
    };
    // live PR check vs all-time best (and earlier sets today)
    let pr: string | null = null;
    if (kind !== "W") {
      const best = b!.best?.[it.ex];
      const today = sets.filter((x) => x.exKey === it.ex && x.kind !== "W");
      const bestE = Math.max(best?.e1rm ?? 0, ...today.map((x) => { const w = shownKg(x); return w && x.reps && x.reps <= 12 ? e1rm(w, x.reps) : 0; }));
      const bestR = Math.max(best?.reps ?? 0, ...today.map((x) => x.reps ?? 0));
      const bestS = Math.max(best?.seconds ?? 0, ...today.map((x) => x.seconds ?? 0));
      const hasHistory = !!best || today.length > 0;
      if (hasHistory) {
        if (weight && reps && reps <= 12 && bestE > 0 && e1rm(weight, reps) > bestE + 0.05) pr = `New PR · est. max ${Math.round(e1rm(weight, reps) * 10) / 10} kg`;
        else if (it.metric !== "weight_reps" && reps && bestR > 0 && reps > bestR) pr = `New PR · ${reps} reps`;
        else if (set.seconds && bestS > 0 && set.seconds > bestS) pr = `New PR · ${set.seconds} s hold`;
      }
      if (pr) set.pr = 1;
    }
    // honesty nudge: stopped below the target while saying there were 2+ reps left
    const bottom = it.reps == null ? null : Array.isArray(it.reps) ? it.reps[0] : it.reps;
    let nudge: string | null = null;
    if (kind === "N" && reps != null && bottom != null && reps < bottom && set.rir != null && set.rir >= 2) {
      nudge = `Stopped at ${reps} with ${set.rir} left — target is ${bottom}+. Burn ≠ failure: next set push to ${bottom}.`;
      track("early_stop", { ex: it.ex, reps, rir: set.rir, target: bottom }, id);
    }
    if (set.strict === 0) track("cheated_set", { ex: it.ex, reps }, id);
    putSet(set);
    setUndo({ set, pr: pr ?? nudge, warn: !pr && !!nudge });
    if (pr) { track("pr", { ex: it.ex, text: pr }, id); vibrate([60, 40, 60]); }
    track("set_done", { ex: it.ex, i, setNo: set.setNo, kind, weight, reps, seconds: set.seconds, meters: set.meters, assist: set.assist, restBeforeS: set.restBeforeS }, id);

    const after = [...sets, set];
    // drop / rest-pause / warm-up are part of the current set → stay here, no rest timer
    if (kind === "D" || kind === "R" || kind === "W") { if (kind !== "W") setRest(null); return; }
    const isExtra = workSets(sets, i).length >= it.sets; // extra set beyond the plan → stay, normal rest
    const nx = isExtra ? i : nextIdx(plan, after, i);
    if (nx !== i) setOpen(nx);
    if (live && it.rest > 0 && nx >= 0) {
      const nxIt = plan[nx];
      setRest({ sessionId: id, startedAt: t, endAt: t + it.rest * 1000, planned: it.rest, next: `${nxIt.name} · set ${workSets(after, nx).length + 1}` });
      track("rest_start", { planned: it.rest }, id);
    } else setRest(null);
  }

  const elapsed = s.startedAt ? (s.endedAt ?? Date.now()) - s.startedAt : 0;

  return (
    <div>
      <header className="sticky top-0 z-30 -mx-4 mb-3 border-b border-line bg-bg/95 px-4 pb-3 pt-2 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex items-center gap-3">
          <button onClick={() => go(live ? "/" : "/history")} className="flex h-10 w-10 items-center justify-center rounded-full bg-card2" aria-label="Back"><ChevronLeft size={20} /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">W{s.week} · {s.dayName}{s.kind === "extra" && " (extra)"}</div>
            <div className="flex items-center gap-1.5 text-xs text-mute">{live ? <span className="inline-flex items-center gap-1 text-warn"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />live</span> : `${s.status} · ${niceDate(s.date)}`} · {done}/{total} sets</div>
          </div>
          <Elapsed from={s.startedAt} to={live ? null : s.endedAt} />
          <button onClick={() => setSheet({ k: "log" })} className="flex h-10 w-10 items-center justify-center rounded-full bg-card2" aria-label="Session log"><ListOrdered size={18} /></button>
          <Btn kind={live ? "primary" : "soft"} className="min-h-10 px-3 text-sm" onClick={() => setSheet({ k: "finish" })}>
            {live ? "Finish" : "Edit"}
          </Btn>
        </div>
        <div className="mt-2 h-1 rounded bg-line"><div className="h-1 rounded bg-acc transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        {/* exercise strip: see everything at a glance, tap to jump */}
        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] md:-mx-8 md:px-8">
          {plan.map((it, i) => {
            const n = workSets(sets, i).length;
            const full = !it.skipped && n >= it.sets;
            return (
              <button key={i} onClick={() => { setOpen(i); setTimeout(() => document.getElementById(`ex-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}
                className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] num", it.skipped ? "bg-card2 text-faint line-through" : full ? "bg-acc/15 text-acc" : open === i ? "bg-ink text-bg" : n > 0 ? "bg-info/15 text-info" : "bg-card2 text-mute")}>
                {it.tag ?? i + 1} {it.name.split(" ").slice(0, 2).join(" ")} {n}/{it.sets}
              </button>
            );
          })}
        </div>
      </header>

      <div className="space-y-2">
        {plan.map((it, i) => (
          <div key={`${i}-${it.ex}`} id={`ex-${i}`} className={cx("scroll-mt-36", it.tag && plan[i - 1]?.tag?.[0] === it.tag[0] && "-mt-1 border-l-2 border-info/50 pl-2", it.tag && plan[i + 1]?.tag?.[0] === it.tag[0] && plan[i - 1]?.tag?.[0] !== it.tag[0] && "border-l-2 border-info/50 pl-2")}>
          {it.tag && plan[i + 1]?.tag?.[0] === it.tag[0] && plan[i - 1]?.tag?.[0] !== it.tag[0] && (
            <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-info">Superset {it.tag[0]} · do {it.tag[0]}1 then {it.tag[0]}2 back-to-back, rest after the pair</div>
          )}
          {it.finisher && !plan[i - 1]?.finisher && (
            <div className="mb-2 mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-mute">
              <Flame size={13} className="text-warn" /> Finishers · small muscles, 5-10 min <span className="h-px flex-1 bg-line" />
            </div>
          )}
          <ExerciseCard
            i={i}
            it={it}
            sets={sets.filter((x) => x.itemIdx === i)}
            last={b.last[it.ex]}
            rec={recs[i]}
            live={live}
            bars={bars}
            feedback={b.feedback?.[`${id}:${i}`]}
            onFeedback={(f) => {
              setB((x) => (x ? { ...x, feedback: { ...x.feedback, [`${id}:${i}`]: f } } : x));
              queue("PUT", `/feedback/${id}:${i}`, { sessionId: id, exKey: it.ex, ...f });
              track("ex_feedback", { i, ex: it.ex, ...f }, id);
            }}
            open={open === i}
            onToggle={() => { setOpen(open === i ? -2 : i); track("ex_open", { i, ex: it.ex }, id); }}
            onLog={(d, kind) => logSet(i, d, kind)}
            onSet={(set) => setSheet({ k: "set", s: set })}
            onHow={() => { setSheet({ k: "how", i }); track("video_open", { ex: it.ex }, id); }}
            onMenu={() => setSheet({ k: "menu", i })}
          />
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Btn kind="soft" icon={Plus} onClick={() => setSheet({ k: "swap", i: -1 })}>Add exercise</Btn>
        <Btn kind={live ? "primary" : "soft"} onClick={() => setSheet({ k: "finish" })}>{live ? "Finish workout" : "Edit session"}</Btn>
      </div>

      {undo && (
        <div className={cx("fixed inset-x-0 z-40 mx-auto flex max-w-lg justify-center px-4", rest && live ? "bottom-24" : "bottom-6")}>
          <div className={cx("flex items-center gap-3 px-4 py-2 text-sm shadow-lg", undo.warn ? "rounded-2xl bg-bad text-black" : "rounded-full", !undo.warn && (undo.pr ? "bg-warn text-black" : "bg-ink text-bg"))}>
            {undo.warn ? <><TriangleAlert size={16} className="shrink-0" /> {undo.pr}</> : undo.pr ? <><Trophy size={16} /> {undo.pr}</> : "Set logged"}
            <button
              className="font-bold underline"
              onClick={() => { putSet({ ...undo.set, deleted: 1 }); track("set_undo", { id: undo.set.id, ex: undo.set.exKey }, id); setRest(null); setUndo(null); }}
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {live && <RestTimer rest={rest} setRest={setRest} />}

      {sheet?.k === "how" && <ExerciseSheet item={plan[sheet.i]} onClose={() => setSheet(null)} onSwap={live ? () => setSheet({ k: "swap", i: sheet.i }) : undefined} />}
      {sheet?.k === "log" && <SessionLog plan={plan} sets={sets} onClose={() => setSheet(null)} onSet={(x) => setSheet({ k: "set", s: x })} />}
      {sheet?.k === "menu" && (
        <ItemMenu
          it={plan[sheet.i]} i={sheet.i} n={plan.length}
          onClose={() => setSheet(null)}
          onSwap={() => setSheet({ k: "swap", i: sheet.i })}
          onPlan={(p, ev, data) => { const np = p(plan); setPlan(np); track(ev, data, id); setSheet(null); }}
        />
      )}
      {sheet?.k === "swap" && (
        <SwapSheet
          it={sheet.i >= 0 ? plan[sheet.i] : null}
          lastWeight={sheet.i >= 0 ? topWeight(sets.filter((x) => x.itemIdx === sheet.i), b.last[plan[sheet.i].ex]?.sets) : null}
          sessionId={id}
          onClose={() => setSheet(null)}
          onPick={(item, last, reason) => {
            const np = [...plan];
            if (sheet.i >= 0) {
              track("ex_swap", { i: sheet.i, from: plan[sheet.i].ex, to: item.ex, reason }, id);
              np[sheet.i] = item;
              setOpen(sheet.i);
            } else {
              track("ex_add", { ex: item.ex }, id);
              np.push(item);
              setOpen(np.length - 1);
            }
            setB((x) => (x ? { ...x, last: last ? { ...x.last, [item.ex]: last } : x.last } : x));
            setPlan(np);
            setSheet(null);
          }}
        />
      )}
      {sheet?.k === "set" && (
        <SetSheet
          set={sheet.s}
          onClose={() => setSheet(null)}
          onSave={(x) => { putSet(x); track(x.deleted ? "set_delete" : "set_edit", { id: x.id, ex: x.exKey }, id); setSheet(null); }}
        />
      )}
      {sheet?.k === "finish" && (
        <FinishSheet
          s={s} sets={sets} last={b.last} elapsed={elapsed}
          onClose={() => setSheet(null)}
          onSave={(p, leave) => {
            patchSession(p);
            track(p.status === "done" ? "session_finish" : p.status === "abandoned" ? "session_abandon" : "session_edit", p, id);
            setRest(null);
            setSheet(null);
            if (leave) go(p.status ? "/" : "/history");
          }}
          onDelete={() => {
            if (!confirm("Delete this whole session and its sets?")) return;
            track("session_delete", { week: s.week, dayKey: s.dayKey }, id);
            queue("DELETE", `/sessions/${id}`);
            setRest(null);
            go("/history");
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- logic

/** Own component so the 1-second tick doesn't re-render the whole workout. */
function Elapsed({ from, to }: { from: number | null; to: number | null }) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    if (to) return;
    const i = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(i);
  }, [to]);
  return <div className="text-xl font-bold num">{from ? clock((to ?? t) - from) : ""}</div>;
}

function remaining(plan: PlanItem[], sets: SetLog[], i: number) {
  return plan[i].skipped ? 0 : Math.max(0, plan[i].sets - workSets(sets, i).length);
}
function firstOpen(plan: PlanItem[], sets: SetLog[], fallback: number) {
  const k = plan.findIndex((_, i) => remaining(plan, sets, i) > 0);
  return k >= 0 ? k : fallback;
}
/** Superset-aware: A1 → A2 → A1 …, otherwise stay until done, then the next unfinished one. */
function nextIdx(plan: PlanItem[], sets: SetLog[], i: number) {
  const tag = plan[i].tag;
  if (tag) {
    const letter = tag[0];
    const group = plan.map((p, k) => ({ p, k })).filter(({ p }) => p.tag?.[0] === letter);
    const pos = group.findIndex((g) => g.k === i);
    for (let step = 1; step <= group.length; step++) {
      const g = group[(pos + step) % group.length];
      if (remaining(plan, sets, g.k) > 0) return g.k;
    }
  }
  if (remaining(plan, sets, i) > 0) return i;
  return firstOpen(plan, sets, -1);
}
function topWeight(cur: SetLog[], last?: SetLog[]) {
  const w = [...cur, ...(last ?? [])].map((x) => shownKg(x) ?? 0);
  return w.length ? Math.max(...w) || null : null;
}
function fmtSet(x: Pick<SetLog, "exKey" | "weightKg" | "reps" | "seconds" | "meters" | "assist"> & { kgBasis?: string | null }) {
  const parts: string[] = [];
  if (x.assist) parts.push(x.assist);
  const w = shownKg(x);
  if (w) parts.push(loadOf(x.exKey) === "pair" ? `${kg(w)}kg/hand` : `${kg(w)}kg`);
  if (x.reps != null) parts.push(parts.length ? `×${x.reps}` : `${x.reps} reps`);
  if (x.seconds != null) parts.push(`${x.seconds}s`);
  if (x.meters != null) parts.push(`${x.meters}m`);
  return parts.join(" ").replace(" ×", "×") || "—";
}

// ---------------------------------------------------------------- exercise card

const REC_TONE: Record<RecKind, string> = { up: "text-acc", hold: "text-info", down: "text-warn", start: "text-mute", deload: "text-info", estimate: "text-info" };
const REC_ICON: Record<RecKind, typeof TrendingUp> = { up: TrendingUp, hold: Equal, down: TrendingDown, start: Sparkles, deload: TrendingDown, estimate: Sparkles };
const KIND_LABEL: Record<string, string> = { W: "warm-up", D: "drop", F: "failure", R: "rest-p." };

function ExerciseCard({ i, it, sets, last, rec, live, bars, feedback, open, onToggle, onLog, onSet, onFeedback, onHow, onMenu }: {
  i: number; it: PlanItem; sets: SetLog[]; last?: { date: string; sets: SetLog[] }; rec: Rec; live: boolean; bars: Bars;
  feedback?: { effort: string | null; joints: string | null };
  open: boolean; onToggle: () => void; onLog: (d: Draft, k?: SetKind) => void; onSet: (s: SetLog) => void;
  onFeedback: (f: { effort: string | null; joints: string | null }) => void; onHow: () => void; onMenu: () => void;
}) {
  const work = sets.filter((s) => s.kind !== "W");
  const complete = work.length >= it.sets;
  const draft = useDraft(it, sets, last, rec);
  const [d, setD] = useState<Draft>(draft);
  const [showWarm, setShowWarm] = useState(false);
  const [extra, setExtra] = useState<null | "D" | "R" | "N">(null);
  const lastRef = useRef(sets.length);
  useEffect(() => {
    if (sets.length !== lastRef.current) { lastRef.current = sets.length; setD(draft); }
  }, [sets.length, draft]);

  const RecIcon = REC_ICON[rec.kind];
  const recText = rec.weightKg != null ? `${kg(rec.weightKg)} kg${loadOf(it.ex) === "pair" ? "/hand" : ""}${rec.reps ? ` × ${rec.reps}` : ""}` : rec.seconds ? `${rec.seconds} s` : rec.reps ? `${rec.reps} reps` : "";
  const warm = it.metric === "weight_reps" && rec.weightKg && (isBarbell(it.ex) ? rec.weightKg > barOf(it.ex, bars) + 10 : rec.weightKg >= 15) ? warmups(it.ex, rec.weightKg, barOf(it.ex, bars) || 20) : [];
  const hasWarmLogged = sets.some((s) => s.kind === "W");
  const remainingRows = Math.max(0, it.sets - work.length - 1);

  return (
    <section className={cx("rounded-2xl bg-card", it.skipped && "opacity-50", open && "ring-1 ring-line")}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="relative shrink-0">
          <Thumb yt={it.yt[0]} className={cx("h-11 w-16", complete && "opacity-50")} />
          <span className={cx("absolute -left-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-bold ring-2 ring-card", complete ? "bg-acc text-acc-ink" : "bg-card3 text-ink")}>
            {complete ? <Check size={13} strokeWidth={3} /> : it.tag ?? i + 1}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate font-semibold", it.skipped && "line-through")}>{it.name}</span>
          <span className="block truncate text-xs text-mute">
            {complete && !open ? <span className="text-acc">{work.map((x) => fmtSet(x)).join(" · ")}</span> : <>
            {targetLabel(it)} · <Clock size={10} className="inline" /> {restLabel(it.rest)}
            {!complete && recText && <span className={cx("ml-1", REC_TONE[rec.kind])}>· {recText}</span>}</>}
          </span>
        </span>
        <span className="text-sm text-mute num">{work.length}/{it.sets}</span>
      </button>

      {/* finished + closed: ask the quick check right on the card (until answered) */}
      {complete && live && !open && !(feedback?.effort && feedback?.joints) && (
        <div className="px-4 pb-4"><FeedbackRow value={feedback} onChange={onFeedback} compact /></div>
      )}

      {open && !it.skipped && (
        <div className="px-4 pb-4">
          {/* 1. what to do today: recommendation (why) + last time + technique */}
          <div className="mb-3 space-y-1.5 rounded-xl bg-card2/60 p-3 text-xs">
            <div className={cx("flex items-start gap-1.5", REC_TONE[rec.kind])}>
              <RecIcon size={14} className="mt-0.5 shrink-0" />
              <span><b>{recText ? `Today: ${recText}` : "Today"}</b> — {rec.why}</span>
            </div>
            {last && <div className="text-mute">Last time ({niceDate(last.date)}): {last.sets.filter((x) => x.kind !== "W").map(fmtSet).join(" · ")}</div>}
            {it.swappedFrom && <div className="text-mute">Swapped from {EXERCISES[it.swappedFrom]?.name ?? it.swappedFrom}{it.swapReason ? ` (${it.swapReason})` : ""}</div>}
            {it.tech && <TechNote text={it.tech} />}
            <SetupNote exKey={it.ex} compact />
          </div>

          {/* 2. optional warm-up ramp */}
          {warm.length > 0 && !complete && work.length === 0 && (
            <div className="mb-3">
              <button onClick={() => setShowWarm(!showWarm)} className="inline-flex items-center gap-1.5 text-xs text-info">
                <Flame size={13} /> {showWarm ? "Hide" : "Show"} warm-up sets ({warm.length}){hasWarmLogged ? " · some done" : ""}
              </button>
              {showWarm && (
                <div className="mt-2 grid gap-1.5">
                  {warm.map((w, k) => (
                    <button key={k} onClick={() => onLog({ ...d, weight: String(w.kg), reps: String(w.reps), rir: "", strict: "", note: "" }, "W")} className="flex min-h-10 items-center gap-3 rounded-lg border border-dashed border-line px-3 text-left text-sm">
                      <span className="w-14 text-xs text-mute">warm-up</span>
                      <span className="flex-1 num">{kg(w.kg)} kg × {w.reps}</span>
                      {isBarbell(it.ex) && <span className="text-[11px] text-faint">{plateText(w.kg, barOf(it.ex, bars))}</span>}
                      <Plus size={14} className="text-info" />
                    </button>
                  ))}
                  <p className="text-[11px] text-faint">Tap a row after doing it to log it as a warm-up (not counted in volume).</p>
                </div>
              )}
            </div>
          )}

          {/* 3. the sequence: done sets → current set → remaining sets */}
          <div className="space-y-1.5">
            {sets.map((x, k) => (
              <button key={x.id} onClick={() => onSet(x)} className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-card2 px-3 text-left">
                <span className="w-14 text-xs text-mute">{x.kind === "N" ? `Set ${sets.slice(0, k + 1).filter((y) => y.kind === "N").length}` : KIND_LABEL[x.kind]}</span>
                <span className="flex-1 font-semibold num">{fmtSet(x)}</span>
                {!!x.pr && <Trophy size={14} className="text-warn" />}
                {x.strict === 0 && <span className="rounded bg-bad/20 px-1.5 text-[10px] text-bad">cheat</span>}
                {x.rir != null && <span className="text-xs text-mute">RIR {x.rir}</span>}
                {x.restBeforeS != null && k > 0 && <span className="text-xs text-faint">{clock(x.restBeforeS * 1000)}</span>}
                {x.painLevel ? <TriangleAlert size={15} className="text-bad" /> : x.note ? <NotebookPen size={15} className="text-mute" /> : null}
              </button>
            ))}
          </div>

          {!complete && extra !== "N" && work.length > 0 && (() => {
            const prev = work[work.length - 1];
            const w = shownKg(prev);
            return (
              <button onClick={() => onLog({ ...d, weight: w != null ? String(w) : "", reps: prev.reps != null ? String(prev.reps) : d.reps, seconds: prev.seconds != null ? String(prev.seconds) : d.seconds, meters: prev.meters != null ? String(prev.meters) : d.meters, assist: prev.assist ?? "", rir: prev.rir != null ? String(prev.rir) : "", strict: prev.strict != null ? String(prev.strict) : "", note: "" })}
                className="mt-2 flex min-h-12 w-full items-center justify-between rounded-xl border border-acc/40 px-3 text-sm active:bg-acc/10">
                <span className="inline-flex items-center gap-2 font-semibold text-acc"><Repeat size={16} />Same as last set</span>
                <span className="num text-mute">{fmtSet(prev)}{prev.rir != null ? ` @${prev.rir}` : ""}</span>
              </button>
            );
          })()}
          {!complete && extra !== "N" && <SetInput it={it} d={d} setD={setD} n={work.length + 1} total={it.sets} bars={bars} onLog={() => onLog(d)} />}

          {!complete && remainingRows > 0 && (
            <div className="mt-1.5 space-y-1">
              {Array.from({ length: remainingRows }, (_, k) => (
                <div key={k} className="flex min-h-9 items-center gap-3 rounded-xl border border-dashed border-line/70 px-3 text-sm text-faint">
                  <span className="w-14 text-xs">Set {work.length + 2 + k}</span>
                  <span className="num">{recText || targetLabel({ ...it, sets: 1 })}</span>
                </div>
              ))}
            </div>
          )}

          {/* 4. after the last set: quick RP-style check (feeds next time's recommendation) */}
          {complete && live && <FeedbackRow value={feedback} onChange={onFeedback} />}

          {/* 5. secondary actions */}
          {extra ? (
            <ExtraInput
              mode={extra}
              it={it}
              last={[...sets].reverse().find((x) => x.kind !== "W")}
              bars={bars}
              onLog={(dd) => onLog({ ...d, ...dd, rir: "", strict: "" }, extra)}
              onDone={() => setExtra(null)}
            />
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-sm">
              <button onClick={() => setExtra("N")} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-card2"><Plus size={14} />{complete ? "Extra set" : "Set"}</button>
              <button disabled={!work.length} onClick={() => setExtra("D")} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-card2 disabled:opacity-40"><Layers size={14} />Drop set</button>
              <button disabled={!work.length} onClick={() => setExtra("R")} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-card2 disabled:opacity-40"><Repeat size={14} />Rest-pause</button>
            </div>
          )}
          {!extra && (
            <div className="mt-1 flex items-center justify-between text-[11px] text-faint">
              <span>Drop / rest-pause attach to your last set — no rest timer, you stay here.</span>
              <InfoDot term={TERMS.find((t) => t.key === "drop")!} />
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <button onClick={onHow} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-card2"><PlayCircle size={16} className="text-info" />How-to video</button>
            <button onClick={onMenu} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-card2"><MoreHorizontal size={16} />Swap · skip · more</button>
          </div>
          {complete && <SetInput it={it} d={d} setD={setD} n={work.length + 1} total={it.sets} bars={bars} hidden />}
        </div>
      )}
    </section>
  );
}

/** Inline entry for drop sets, rest-pause mini-sets and extra sets — pre-filled, one tap to log, chainable. */
function ExtraInput({ mode, it, last, bars, onLog, onDone }: {
  mode: "D" | "R" | "N"; it: PlanItem; last?: SetLog; bars: Bars; onLog: (d: Partial<Draft>) => void; onDone: () => void;
}) {
  const step = loadOf(it.ex) === "pair" ? Math.max(2.5, it.step) : it.step;
  const lastKg = last ? shownKg(last) : null;
  const prefill = () => {
    if (mode === "D" && lastKg) return String(Math.max(step, Math.floor((lastKg * 0.75) / step + 1e-9) * step));
    return lastKg != null ? String(lastKg) : "";
  };
  const [w, setW] = useState(prefill);
  const [r, setR] = useState(mode === "R" ? "3" : mode === "N" && last?.reps != null ? String(last.reps) : "");
  const [count, setCount] = useState(0);
  useEffect(() => { setW(prefill()); }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = { D: "Drop set", R: "Rest-pause mini-set", N: "Extra set" }[mode];
  const hint = {
    D: "Right after the set: ~25% lighter, reps to near failure.",
    R: "Same weight · rest 15-20 s · a few more reps.",
    N: "Counts as a normal set (rest timer runs).",
  }[mode];
  const weighted = it.metric === "weight_reps";
  const bump = (v: string, by: number, set: (x: string) => void) => set(String(Math.max(0, +(Number(v || 0) + by).toFixed(2))));
  return (
    <div className="mt-3 rounded-xl border border-info/50 bg-info/[0.05] p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-info">{title}{count > 0 ? ` · ${count} logged` : ""}</span>
        <button onClick={onDone} className="rounded-full bg-card2 px-3 py-1 text-mute">Done</button>
      </div>
      <p className="mt-1 text-[11px] text-mute">{hint}</p>
      <div className="mt-2 flex gap-2">
        {weighted && (
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-center text-[11px] text-mute">{kgLabel(it.ex, bars)}</div>
            <div className="flex items-center gap-1">
              <button onClick={() => bump(w, -step, setW)} className="h-12 w-10 shrink-0 rounded-xl bg-card2 text-xl" aria-label="less kg">−</button>
              <NumInput value={w} onChange={setW} />
              <button onClick={() => bump(w, step, setW)} className="h-12 w-10 shrink-0 rounded-xl bg-card2 text-xl" aria-label="more kg">+</button>
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-center text-[11px] text-mute">reps</div>
          <div className="flex items-center gap-1">
            <button onClick={() => bump(r, -1, setR)} className="h-12 w-10 shrink-0 rounded-xl bg-card2 text-xl" aria-label="less reps">−</button>
            <NumInput value={r} onChange={setR} placeholder="?" />
            <button onClick={() => bump(r, 1, setR)} className="h-12 w-10 shrink-0 rounded-xl bg-card2 text-xl" aria-label="more reps">+</button>
          </div>
        </div>
      </div>
      <button
        onClick={() => {
          if (!r) return;
          onLog({ weight: weighted ? w : "", reps: r, note: "" });
          setCount((c) => c + 1);
          if (mode === "N") onDone();
          else if (mode === "R") setR("3");
          else setR("");
        }}
        disabled={!r}
        className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-info font-semibold text-black disabled:opacity-40"
      >
        <Check size={18} /> Log {title.toLowerCase()}{mode === "D" && count > 0 ? " (another)" : ""}
      </button>
      {mode === "D" && count > 0 && <p className="mt-1 text-center text-[11px] text-faint">Weight dropped again by ~25% for a double drop — or tap Done.</p>}
    </div>
  );
}

function plateText(total: number, bar = 20) {
  const p = plates(total, bar);
  if (!p) return "";
  return p.length ? `per side: ${p.join(" + ")}` : "empty bar";
}

function FeedbackRow({ value, onChange, compact }: { value?: { effort: string | null; joints: string | null }; onChange: (f: { effort: string | null; joints: string | null }) => void; compact?: boolean }) {
  const v = value ?? { effort: null, joints: null };
  const E = [{ id: "easy", label: "Easy" }, { id: "right", label: "Just right" }, { id: "hard", label: "Hard" }, { id: "too_much", label: "Too much" }];
  const J = [{ id: "fine", label: "Fine" }, { id: "achy", label: "Achy" }, { id: "pain", label: "Pain" }];
  return (
    <div className={cx("rounded-xl border border-line p-3", !compact && "mt-3")}>
      <div className="mb-2 flex items-center gap-1.5 text-xs text-mute"><MessageSquare size={13} /> Done! Quick check (optional) — tunes next time's weight</div>
      <div className="mb-1 text-[11px] text-faint">How hard was this exercise?</div>
      <Chips small options={E} value={v.effort} onChange={(effort) => onChange({ ...v, effort })} />
      <div className="mb-1 mt-2 text-[11px] text-faint">Joints?</div>
      <Chips small tone={v.joints === "pain" ? "bad" : "acc"} options={J} value={v.joints} onChange={(joints) => onChange({ ...v, joints })} />
    </div>
  );
}

function useDraft(it: PlanItem, sets: SetLog[], last: { sets: SetLog[] } | undefined, rec: Rec): Draft {
  return useMemo(() => {
    const work = sets.filter((s) => s.kind !== "W");
    const prevHere = work[work.length - 1];
    const prevLast = last?.sets.filter((s) => s.kind !== "W");
    const lastSame = prevLast?.[Math.min(work.length, (prevLast?.length ?? 1) - 1)];
    const tReps = it.reps == null ? null : Array.isArray(it.reps) ? it.reps[1] : it.reps;
    const v = (x: number | null | undefined) => (x == null ? "" : String(x));
    // priority: this session's previous set → recommendation → same set last time → plan target
    return {
      weight: v((prevHere ? shownKg(prevHere) : null) ?? rec.weightKg ?? (lastSame ? shownKg(lastSame) : null) ?? it.startKg ?? null),
      reps: v(prevHere?.reps ?? rec.reps ?? lastSame?.reps ?? tReps),
      seconds: v(prevHere?.seconds ?? rec.seconds ?? lastSame?.seconds ?? it.seconds),
      meters: v(prevHere?.meters ?? lastSame?.meters ?? it.meters),
      assist: prevHere?.assist ?? lastSame?.assist ?? "",
      rir: "",
      strict: "",
      note: "",
    };
  }, [it, sets, last, rec]);
}

function SetInput({ it, d, setD, n, total, bars, onLog, hidden }: { it: PlanItem; d: Draft; setD: (d: Draft) => void; n: number; total: number; bars: Bars; onLog?: () => void; hidden?: boolean }) {
  const [hold, setHold] = useState<number | null>(null);
  const [perSide, setPerSide] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (hold == null) return;
    const i = setInterval(() => tick((x) => x + 1), 200);
    return () => clearInterval(i);
  }, [hold]);
  if (hidden) return null;
  const bump = (k: keyof Draft, by: number, min = 0) => setD({ ...d, [k]: String(Math.max(min, +(Number(d[k] || 0) + by).toFixed(2))) });
  const m = it.metric;
  const ICON = { weight: Dumbbell, reps: Repeat, seconds: Timer, meters: Ruler, assist: Dumbbell, rir: Repeat, strict: Check, note: NotebookPen } as const;
  const field = (k: keyof Draft, label: string, step: number, placeholder = "") => {
    const I = ICON[k];
    return (
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-center gap-1 text-[11px] text-mute"><I size={12} />{label}</div>
        <div className="flex items-center gap-1">
          <button onClick={() => bump(k, -step)} className="h-12 w-10 shrink-0 rounded-xl bg-card2 text-xl" aria-label={`less ${label}`}>−</button>
          <NumInput value={d[k]} onChange={(v) => setD({ ...d, [k]: v })} placeholder={placeholder} />
          <button onClick={() => bump(k, step)} className="h-12 w-10 shrink-0 rounded-xl bg-card2 text-xl" aria-label={`more ${label}`}>+</button>
        </div>
      </div>
    );
  };
  const showRir = m === "weight_reps" || m === "reps" || m === "assist_reps";
  const bar = barOf(it.ex, bars);
  const isBar = isBarbell(it.ex);
  const pt = isBar && d.weight ? plateText(Number(d.weight), bar) : "";
  const side = d.weight ? Math.max(0, (Number(d.weight) - bar) / 2) : 0;
  const sideField = (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-center gap-1 text-[11px] text-mute"><Dumbbell size={12} />plates per side</div>
      <div className="flex items-center gap-1">
        <button onClick={() => setD({ ...d, weight: String(bar + 2 * Math.max(0, side - 1.25)) })} className="h-12 w-10 shrink-0 rounded-xl bg-card2 text-xl" aria-label="less per side">−</button>
        <NumInput value={d.weight ? String(+side.toFixed(2)) : ""} onChange={(v) => setD({ ...d, weight: v === "" ? "" : String(bar + 2 * Number(v)) })} placeholder="0" />
        <button onClick={() => setD({ ...d, weight: String(bar + 2 * (side + 1.25)) })} className="h-12 w-10 shrink-0 rounded-xl bg-card2 text-xl" aria-label="more per side">+</button>
      </div>
    </div>
  );

  return (
    <div className="mt-2 rounded-xl border border-acc/40 bg-acc/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-ink">Set {n} of {total}{it.perSide ? " · per side" : ""}</span>
        {pt && <span className="text-faint">{pt}</span>}
      </div>
      <div className="flex gap-2">
        {m === "assist_reps" && (
          <div className="flex-1">
            <div className="mb-1 text-center text-[11px] text-mute">band / assist</div>
            <input value={d.assist} onChange={(e) => setD({ ...d, assist: e.target.value })} placeholder="red / 20kg" className="min-h-12 w-full rounded-xl bg-card2 px-3 text-center outline-none focus:ring-2 focus:ring-acc" />
          </div>
        )}
        {(m === "weight_reps" || m === "distance") && (isBar && perSide ? sideField : field("weight", kgLabel(it.ex, bars), it.step))}
        {m === "reps" && field("weight", "+kg", it.step, "BW")}
        {(m === "weight_reps" || m === "reps" || m === "assist_reps") && field("reps", "reps", 1)}
        {m === "time" && field("seconds", "seconds", 5)}
        {m === "distance" && field("meters", "meters", 5)}
      </div>
      {m === "weight_reps" && (
        <div className="mt-1.5 flex items-start justify-between gap-2 text-[11px] text-faint">
          <span>{isBar && perSide ? `Total = ${bar} kg bar + 2 × ${+side.toFixed(2)} = ${d.weight || bar} kg` : kgHelp(it.ex, bars)}</span>
          {isBar && (
            <button onClick={() => setPerSide(!perSide)} className="shrink-0 rounded-full bg-card2 px-2.5 py-1 text-info">{perSide ? "enter total" : "per side"}</button>
          )}
        </div>
      )}
      {m === "time" && (
        <button
          onClick={() => {
            if (hold == null) setHold(Date.now());
            else { setD({ ...d, seconds: String(Math.round((Date.now() - hold) / 1000)) }); setHold(null); }
          }}
          className={cx("mt-2 min-h-11 w-full rounded-xl text-sm font-semibold", hold != null ? "bg-warn text-black" : "bg-card2")}
        >
          {hold != null ? `Stop · ${Math.round((Date.now() - hold) / 1000)} s` : "Start hold timer"}
        </button>
      )}
      {showRir && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-mute">
            <span>Reps left in the tank? <span className="text-faint">(optional)</span></span>
            {it.rir != null && <span>target RIR {Array.isArray(it.rir) ? it.rir.join("-") : it.rir}</span>}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {["0", "1", "2", "3", "4"].map((r) => (
              <button key={r} onClick={() => setD({ ...d, rir: d.rir === r ? "" : r })} className={cx("h-10 rounded-lg text-sm num", d.rir === r ? "bg-ink font-bold text-bg" : "bg-card2 text-mute")}>
                {r === "4" ? "4+" : r}
              </button>
            ))}
          </div>
        </div>
      )}
      {(m === "weight_reps" || m === "reps" || m === "assist_reps") && (
        <RepCounter onCount={(r) => setD({ ...d, reps: String(r) })} />
      )}
      {showRir && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11px] text-mute">Form</span>
          {[{ v: "1", l: "Strict" }, { v: "0", l: "Cheated / partial" }].map((o) => (
            <button key={o.v} onClick={() => setD({ ...d, strict: d.strict === o.v ? "" : o.v })}
              className={cx("h-10 flex-1 rounded-lg text-sm", d.strict === o.v ? (o.v === "1" ? "bg-acc font-semibold text-acc-ink" : "bg-bad font-semibold text-black") : "bg-card2 text-mute")}>
              {o.l}
            </button>
          ))}
        </div>
      )}
      {noteOpen || d.note ? (
        <div className="mt-3">
          <div className="flex gap-1.5">
            <textarea value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} rows={2} placeholder="Note for this set (e.g. shoulder tight, lost count, bar slipped)" className="min-w-0 flex-1 rounded-xl bg-card2 p-2.5 text-sm outline-none focus:ring-2 focus:ring-acc" />
            <VoiceButton onText={(t) => setD({ ...d, note: [d.note, t].filter(Boolean).join(" ") })} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {QUICK_NOTES.map((q) => (
              <button key={q.t} onClick={() => setD({ ...d, note: d.note.includes(q.t) ? d.note : [d.note, q.t].filter(Boolean).join(" · "), strict: q.cheat ? "0" : d.strict })}
                className={cx("min-h-8 rounded-full border px-2.5 text-[11px]", d.note.includes(q.t) ? "border-acc text-acc" : "border-line text-mute")}>{q.t}</button>
            ))}
          </div>
        </div>
      ) : (
        <button onClick={() => setNoteOpen(true)} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs text-info"><NotebookPen size={13} /> Add a note (tap tags or speak)</button>
      )}
      <Btn kind="primary" icon={Check} className="mt-3 w-full text-lg" onClick={onLog}>Log set {n}</Btn>
    </div>
  );
}

/** Never lose count: tap a big pad for every rep, or let it beep every 3 s (tempo) and count for you. */
function RepCounter({ onCount }: { onCount: (r: number) => void }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [tempo, setTempo] = useState(false);
  useEffect(() => {
    if (!tempo) return;
    const i = setInterval(() => { setCount((c) => c + 1); beep(); vibrate(40); }, 3000);
    return () => clearInterval(i);
  }, [tempo]);
  if (!open) return (
    <button onClick={() => { unlockAudio(); setOpen(true); setCount(0); }} className="mt-3 inline-flex items-center gap-1.5 text-xs text-info">
      <Hash size={13} /> Count reps for me
    </button>
  );
  return (
    <div className="mt-3 rounded-xl bg-card2 p-2">
      <button onClick={() => { setCount((c) => c + 1); vibrate(25); }} className="flex h-28 w-full flex-col items-center justify-center rounded-lg bg-card3 active:bg-acc/20" aria-label="Count one rep">
        <span className="text-5xl font-bold num">{count}</span>
        <span className="text-[11px] text-mute">tap every rep{tempo ? " · auto every 3 s" : ""}</span>
      </button>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
        <button onClick={() => setCount((c) => Math.max(0, c - 1))} className="h-10 rounded-lg bg-card3">−1</button>
        <button onClick={() => setTempo(!tempo)} className={cx("h-10 rounded-lg", tempo ? "bg-info text-black" : "bg-card3")}>{tempo ? "Stop beeper" : "Tempo 3 s"}</button>
        <button onClick={() => { onCount(count); setTempo(false); setOpen(false); }} className="h-10 rounded-lg bg-acc font-semibold text-acc-ink">Use {count}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sheets

function ItemMenu({ it, i, n, onClose, onSwap, onPlan }: {
  it: PlanItem; i: number; n: number; onClose: () => void; onSwap: () => void;
  onPlan: (f: (p: PlanItem[]) => PlanItem[], ev: string, data: unknown) => void;
}) {
  const edit = (f: (x: PlanItem) => PlanItem, ev: string) => onPlan((p) => p.map((x, k) => (k === i ? f(x) : x)), ev, { i, ex: it.ex });
  const move = (dir: -1 | 1) => onPlan((p) => { const c = [...p]; [c[i], c[i + dir]] = [c[i + dir], c[i]]; return c; }, "ex_move", { i, dir });
  return (
    <Sheet open onClose={onClose} title={it.name}>
      <div className="grid gap-2">
        <Btn kind="soft" icon={ArrowLeftRight} onClick={onSwap}>Swap for an alternative</Btn>
        <div className="grid grid-cols-2 gap-2">
          <Btn kind="soft" onClick={() => edit((x) => ({ ...x, sets: x.sets + 1 }), "ex_add_set")}>+1 planned set</Btn>
          <Btn kind="soft" disabled={it.sets <= 1} onClick={() => edit((x) => ({ ...x, sets: x.sets - 1 }), "ex_remove_set")}>−1 planned set</Btn>
          <Btn kind="soft" icon={ArrowUp} disabled={i === 0} onClick={() => move(-1)}>Move up</Btn>
          <Btn kind="soft" icon={ArrowDown} disabled={i === n - 1} onClick={() => move(1)}>Move down</Btn>
        </div>
        <Btn kind={it.skipped ? "soft" : "danger"} icon={SkipForward} onClick={() => edit((x) => ({ ...x, skipped: !x.skipped }), it.skipped ? "ex_unskip" : "ex_skip")}>
          {it.skipped ? "Un-skip exercise" : "Skip exercise today"}
        </Btn>
      </div>
    </Sheet>
  );
}

function SwapSheet({ it, lastWeight, sessionId, onClose, onPick }: {
  it: PlanItem | null; lastWeight: number | null; sessionId: string; onClose: () => void;
  onPick: (item: PlanItem, last: { date: string; sets: SetLog[] } | null, reason: string | null) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [all, setAll] = useState(!it);
  const origin = it?.swappedFrom ?? it?.ex;

  async function pick(key: string) {
    const h = origin ? swapHint(origin, key) : {};
    const base = it ?? { sets: 3, reps: [8, 12] as [number, number], rest: 90 };
    const { ex: _ex, name: _n, metric: _m, muscles: _mu, cues: _c, yt: _y, alts: _a, step: _s, perSide: _p, startKg: _k, ...rx } = base as PlanItem;
    const item = toItem(key, { ...rx, reps: h.reps ?? rx.reps, tech: h.note ?? (it ? DEFAULT_SWAP_NOTE : undefined) });
    if (it && origin && key !== origin) { item.swappedFrom = origin; item.swapReason = reason ?? undefined; }
    if (h.ratio && lastWeight) item.startKg = roundTo(lastWeight * h.ratio, item.step);
    const last = await get<{ date: string; sets: SetLog[] } | null>(`/last/${key}?not=${sessionId}`).catch(() => null);
    onPick(item, last, reason);
  }

  const alts = it ? [...(origin && origin !== it.ex ? [{ key: origin, name: `${EXERCISES[origin]?.name} (original)` }] : []), ...it.alts.filter((a) => a.key !== origin)] : [];
  const list = Object.values(EXERCISES).filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Sheet open onClose={onClose} title={it ? `Swap ${it.name}` : "Add exercise"}>
      {it && (
        <>
          <Label>Why? (saved for review)</Label>
          <Chips small options={SWAP_REASONS.map((r) => ({ id: r, label: r }))} value={reason} onChange={setReason} />
          <Label>Alternatives</Label>
          <div className="grid gap-2">
            {alts.map((a) => {
              const h = origin ? swapHint(origin, a.key) : {};
              const sk = h.ratio && lastWeight ? roundTo(lastWeight * h.ratio, EXERCISES[a.key]?.step ?? 2.5) : null;
              return (
                <button key={a.key} onClick={() => pick(a.key)} className="flex items-center gap-3 rounded-xl bg-card2 p-2.5 text-left hover:bg-card3">
                  <Thumb yt={(() => { const y = EXERCISES[a.key]?.yt; return Array.isArray(y) ? y[0] : y; })()} />
                  <div className="min-w-0 flex-1">
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-xs text-mute">
                    {[sk != null && `start ≈ ${sk} kg`, h.reps && `reps ${Array.isArray(h.reps) ? h.reps.join("-") : h.reps}`, h.note].filter(Boolean).join(" · ") || "same sets · reps · RIR"}
                  </div>
                  </div>
                </button>
              );
            })}
          </div>
          <button onClick={() => setAll(!all)} className="mt-3 text-sm text-acc">{all ? "Hide full list" : "Any other exercise…"}</button>
        </>
      )}
      {all && (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" className="mt-3 min-h-12 w-full rounded-xl bg-card2 px-3 outline-none focus:ring-2 focus:ring-acc" />
          <div className="mt-2 grid gap-1">
            {list.map((e) => (
              <button key={e.key} onClick={() => pick(e.key)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-card2">
                <Thumb yt={Array.isArray(e.yt) ? e.yt[0] : e.yt} className="h-9 w-12" />
                <span className="min-w-0 flex-1 truncate">{e.name} <span className="text-xs text-mute">· {e.muscles}</span></span>
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

function SetSheet({ set, onClose, onSave }: { set: SetLog; onClose: () => void; onSave: (s: SetLog) => void }) {
  const [x, setX] = useState<SetLog>(set);
  const v = (n: number | null) => (n == null ? "" : String(n));
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const tags = NOTE_TAGS.filter((t) => (x.note ?? "").includes(t));
  const toggleTag = (t: string) => {
    const has = (x.note ?? "").includes(t);
    const note = has ? (x.note ?? "").replace(t, "").replace(/\s*·\s*·\s*/g, " · ").replace(/^\s*·\s*|\s*·\s*$/g, "") : [x.note, t].filter(Boolean).join(" · ");
    setX({ ...x, note: note || null });
  };
  return (
    <Sheet open onClose={onClose} title={`${EXERCISES[x.exKey]?.name ?? x.exKey} · set ${x.setNo}`}>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>kg</Label><NumInput value={v(x.weightKg)} onChange={(s) => setX({ ...x, weightKg: num(s) })} /></div>
        <div><Label>reps</Label><NumInput value={v(x.reps)} onChange={(s) => setX({ ...x, reps: num(s) })} /></div>
        <div><Label>seconds</Label><NumInput value={v(x.seconds)} onChange={(s) => setX({ ...x, seconds: num(s) })} /></div>
        <div><Label>meters</Label><NumInput value={v(x.meters)} onChange={(s) => setX({ ...x, meters: num(s) })} /></div>
      </div>
      <Label>Set type</Label>
      <Chips small clearable={false} options={SET_KINDS.map((k) => ({ id: k.id, label: k.label }))} value={x.kind} onChange={(k) => k && setX({ ...x, kind: k })} />
      <Label>Reps in reserve</Label>
      <Chips small options={scale(0, 5)} value={x.rir} onChange={(r) => setX({ ...x, rir: r })} />
      <Label>Quick tags</Label>
      <div className="flex flex-wrap gap-2">
        {NOTE_TAGS.map((t) => (
          <button key={t} onClick={() => toggleTag(t)} className={cx("min-h-9 rounded-full border px-3 text-sm", tags.includes(t) ? "border-acc text-acc" : "border-line")}>{t}</button>
        ))}
      </div>
      <Label>Note</Label>
      <textarea value={x.note ?? ""} onChange={(e) => setX({ ...x, note: e.target.value || null })} rows={2} placeholder="e.g. left shoulder clicks at the bottom" className="w-full rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
      <Label>Pain?</Label>
      <Chips small options={PAIN_AREAS.map((a) => ({ id: a, label: a }))} value={x.painArea} onChange={(a) => setX({ ...x, painArea: a, painLevel: a ? x.painLevel ?? 1 : null })} />
      {x.painArea && (
        <div className="mt-2">
          <Chips small clearable={false} options={[{ id: 1, label: "mild" }, { id: 2, label: "moderate" }, { id: 3, label: "sharp — stop" }]} value={x.painLevel} onChange={(l) => setX({ ...x, painLevel: l })} />
        </div>
      )}
      <div className="mt-6 grid grid-cols-3 gap-2">
        <Btn kind="danger" onClick={() => confirm("Delete this set?") && onSave({ ...x, deleted: 1 })}>Delete</Btn>
        <Btn kind="primary" className="col-span-2" onClick={() => onSave(x)}>Save</Btn>
      </div>
    </Sheet>
  );
}

function FinishSheet({ s, sets, last, elapsed, onClose, onSave, onDelete }: {
  s: Session; sets: SetLog[]; last: SessionBundle["last"]; elapsed: number; onClose: () => void; onSave: (p: Partial<Session>, leave: boolean) => void; onDelete: () => void;
}) {
  // vs last time: per exercise, best estimated max today vs last session
  const cmp = [...new Set(sets.filter((x) => x.kind === "N").map((x) => x.exKey))].map((ex) => {
    const est = (l: SetLog[]) => Math.max(0, ...l.filter((x) => x.kind === "N" && x.strict !== 0).map((x) => { const w = shownKg(x); return w && x.reps ? e1rm(w, x.reps) : x.reps ?? x.seconds ?? 0; }));
    const now = est(sets.filter((x) => x.exKey === ex)), before = last?.[ex] ? est(last[ex].sets) : null;
    return { ex, now, before, diff: before ? Math.round(((now - before) / before) * 100) : null };
  }).filter((x) => x.before != null);
  const [rpe, setRpe] = useState<number | null>(s.rpe);
  const [bw, setBw] = useState(s.bodyweight != null ? String(s.bodyweight) : "");
  const [note, setNote] = useState(s.note ?? "");
  const live = s.status === "active";
  const vol = sets.filter((x) => x.kind !== "W").reduce((a, x) => a + totalKg(x) * (x.reps ?? 0), 0);
  const pains = sets.filter((x) => x.painLevel).length;
  const prs = sets.filter((x) => x.pr);
  const base = { rpe, bodyweight: bw ? Number(bw) : null, note: note || null };
  return (
    <Sheet open onClose={onClose} title={live ? "Finish workout" : "Session"}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-card2 py-3"><div className="text-lg font-bold num">{clock(elapsed)}</div><div className="text-[11px] text-mute">time</div></div>
        <div className="rounded-xl bg-card2 py-3"><div className="text-lg font-bold num">{sets.filter((x) => x.kind !== "W").length}</div><div className="text-[11px] text-mute">sets</div></div>
        <div className="rounded-xl bg-card2 py-3"><div className="text-lg font-bold num">{Math.round(vol)}</div><div className="text-[11px] text-mute">kg volume</div></div>
      </div>
      {cmp.length > 0 && (
        <div className="mt-3 rounded-xl bg-card2 p-3 text-sm">
          <div className="font-semibold">vs last time · {cmp.filter((c) => (c.diff ?? 0) > 0).length}/{cmp.length} exercises stronger</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {cmp.map((c) => <li key={c.ex} className="flex justify-between"><span className="text-mute">{EXERCISES[c.ex]?.name ?? c.ex}</span><span className={cx("num", (c.diff ?? 0) > 0 ? "text-acc" : (c.diff ?? 0) < 0 ? "text-warn" : "text-mute")}>{(c.diff ?? 0) > 0 ? "+" : ""}{c.diff}%</span></li>)}
          </ul>
        </div>
      )}
      {prs.length > 0 && (
        <div className="mt-3 rounded-xl bg-warn/10 p-3 text-sm">
          <div className="flex items-center gap-1.5 font-semibold text-warn"><Trophy size={15} /> {prs.length} personal record{prs.length > 1 ? "s" : ""}</div>
          <ul className="mt-1 text-xs text-mute">{prs.map((x) => <li key={x.id}>{EXERCISES[x.exKey]?.name ?? x.exKey}: {fmtSet(x)}</li>)}</ul>
        </div>
      )}
      {pains > 0 && <p className="mt-3 text-sm text-bad">⚠ {pains} set(s) with pain logged</p>}
      <div className={cx("mt-4 rounded-xl p-3", live && rpe == null ? "border border-warn/60 bg-warn/5" : "bg-card2")}>
        <div className="text-sm font-semibold">How hard was today overall?</div>
        <div className="text-xs text-mute">1 = very easy · 5 = solid · 7 = hard · 9 = almost everything I had · 10 = max. It tells the monthly review how much you can handle.</div>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setRpe(n)} className={cx("h-11 rounded-lg text-sm font-semibold num", rpe === n ? (n >= 9 ? "bg-bad text-black" : n >= 7 ? "bg-warn text-black" : "bg-acc text-acc-ink") : "bg-card3 text-mute")}>{n}</button>
          ))}
        </div>
      </div>
      <Label>Bodyweight (optional)</Label>
      <NumInput value={bw} onChange={setBw} placeholder="kg" />
      <Label>Session note</Label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="How it went, life stuff, what to change…" className="w-full rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
      <div className="mt-6 grid gap-2">
        {live ? (
          <>
            <Btn kind="primary" onClick={() => { if (rpe == null && !confirm("Save without rating how hard it was? (1 tap above helps the review)")) return; onSave({ ...base, status: "done", endedAt: Date.now() }, true); }}>Finish & save</Btn>
            <Btn kind="soft" onClick={() => onSave({ ...base, status: "abandoned", endedAt: Date.now() }, true)}>Stop early (didn't finish)</Btn>
          </>
        ) : (
          <Btn kind="primary" onClick={() => onSave(base, true)}>Save</Btn>
        )}
        <Btn kind="danger" onClick={onDelete}>Delete session</Btn>
      </div>
    </Sheet>
  );
}


const QUICK_NOTES: { t: string; cheat?: boolean }[] = [
  { t: "felt strong" }, { t: "easy" }, { t: "hard" }, { t: "tight" }, { t: "pain" }, { t: "lost count" },
  { t: "cheated reps", cheat: true }, { t: "grip failed" }, { t: "bar slipped" }, { t: "no spotter" }, { t: "machine busy" },
];

/** Speak a note (Chrome on Android uses Google's speech engine). Falls back to the keyboard mic. */
function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [on, setOn] = useState(false);
  type SR = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void };
  const Ctor = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
  if (!Ctor) return null;
  return (
    <button
      onClick={() => {
        try {
          const r = new Ctor();
          r.lang = navigator.language || "en-US";
          r.interimResults = false;
          r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(" "));
          r.onend = () => setOn(false);
          r.onerror = () => { setOn(false); alert("Voice didn't work here — use the mic on your keyboard instead."); };
          setOn(true);
          r.start();
        } catch { setOn(false); }
      }}
      className={cx("flex w-11 shrink-0 items-center justify-center rounded-xl", on ? "animate-pulse bg-bad text-black" : "bg-card2 text-info")}
      aria-label="Speak a note"
    >
      <Mic size={18} />
    </button>
  );
}

/** Everything logged this session, in order, with time, rest and notes — tap to edit. */
function SessionLog({ plan, sets, onClose, onSet }: { plan: PlanItem[]; sets: SetLog[]; onClose: () => void; onSet: (s: SetLog) => void }) {
  const KIND: Record<string, string> = { N: "", W: "warm-up", D: "drop", F: "failure", R: "rest-pause" };
  return (
    <Sheet open onClose={onClose} title={`Session log · ${sets.length} set${sets.length === 1 ? "" : "s"}`} icon={ListOrdered}>
      {!sets.length && <p className="text-sm text-mute">Nothing logged yet.</p>}
      <ol className="space-y-1">
        {sets.map((x, k) => (
          <li key={x.id}>
            <button onClick={() => onSet(x)} className="flex w-full items-start gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-card2">
              <span className="w-12 shrink-0 text-[11px] text-mute num">{new Date(x.doneAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{plan[x.itemIdx]?.name ?? x.exKey}</span>{KIND[x.kind] ? <span className="text-xs text-info"> · {KIND[x.kind]}</span> : null}
                <span className="block text-xs text-mute num">{fmtSet(x)}{x.rir != null ? ` · RIR ${x.rir}` : ""}{x.strict === 0 ? " · cheated" : ""}{k > 0 && x.restBeforeS != null ? ` · rested ${clock(x.restBeforeS * 1000)}` : ""}</span>
                {x.note && <span className="block text-xs text-ink/80">“{x.note}”</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
