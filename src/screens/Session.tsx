import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanItem, Session, SessionBundle, SetLog } from "../../shared/api";
import { NOTE_TAGS, PAIN_AREAS, SET_KINDS, type SetKind } from "../../shared/lists";
import { targetLabel, toItem } from "../../shared/plan";
import { EXERCISES } from "../../program/exercises";
import { DEFAULT_SWAP_NOTE, SWAP_REASONS, swapHint } from "../../program/swaps";
import { cache, get, queue, track, uid } from "../lib/api";
import { clock, cx, kg, niceDate, restLabel, roundTo, unlockAudio } from "../lib/util";
import { Btn, Chips, Label, NumInput, Sheet, Thumb, scale } from "../components/ui";
import { TechNote, InfoDot } from "../components/Terms";
import { TERMS } from "../../program/learn";
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, ChevronLeft, Clock, Dumbbell, Flame, Layers, MoreHorizontal, NotebookPen, PlayCircle, Plus, Repeat, Ruler, SkipForward, Timer, TriangleAlert } from "lucide-react";
import { HowTo } from "../components/HowTo";
import { RestTimer, loadRest, saveRest, type Rest } from "../components/RestTimer";
import { go } from "../nav";

type Draft = { weight: string; reps: string; seconds: string; meters: string; assist: string };
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
  const [undo, setUndo] = useState<SetLog | null>(null);
  const lastTap = useRef(0);
  const [sheet, setSheet] = useState<null | { k: "how" | "menu" | "swap"; i: number } | { k: "set"; s: SetLog } | { k: "finish" }>(null);

  const setRest = (r: Rest | null) => { saveRest(r); setRestState(r); };

  // load: cached first (offline), then server; keep local sets that haven't synced yet
  useEffect(() => {
    get<SessionBundle>(`/sessions/${id}`)
      .then((srv) => {
        setB((loc) => {
          if (!loc) return srv;
          const m = new Map(srv.sets.map((s) => [s.id, s]));
          loc.sets.forEach((s) => m.set(s.id, s));
          return { ...srv, session: { ...srv.session, plan: loc.session.plan.length ? loc.session.plan : srv.session.plan }, sets: [...m.values()].filter((s) => !s.deleted).sort((a, c) => a.doneAt - c.doneAt), last: { ...loc.last, ...srv.last } };
        });
      })
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  useEffect(() => { if (b) cache.set(ck, b); }, [b, ck]);

  const s = b?.session;
  const live = s?.status === "active";

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
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
    const prevBest = Math.max(0, ...sets.filter((x) => x.exKey === it.ex).map((x) => x.weightKg ?? 0), ...(b!.last[it.ex]?.sets.map((x) => x.weightKg ?? 0) ?? []));
    if (weight != null && prevBest >= 10 && weight > prevBest * 1.5 && !confirm(`${weight} kg is way above your best (${prevBest} kg). Typo?\n\nOK = save anyway`)) return;

    const t = Date.now();
    const prev = sets[sets.length - 1];
    const set: SetLog = {
      id: uid(), sessionId: id, exKey: it.ex, itemIdx: i, setNo: sets.filter((x) => x.itemIdx === i).length + 1, kind,
      weightKg: weight, reps, seconds: n(d.seconds), meters: n(d.meters), assist: d.assist || null, rir: null,
      restBeforeS: prev ? Math.round((t - prev.doneAt) / 1000) : null, doneAt: t, note: null, painArea: null, painLevel: null,
      swappedFrom: it.swappedFrom ?? null,
    };
    putSet(set);
    setUndo(set);
    track("set_done", { ex: it.ex, i, setNo: set.setNo, kind, weight, reps, seconds: set.seconds, meters: set.meters, assist: set.assist, restBeforeS: set.restBeforeS }, id);

    const after = [...sets, set];
    const nx = nextIdx(plan, after, i);
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
          <Btn kind={live ? "primary" : "soft"} className="min-h-10 px-3 text-sm" onClick={() => setSheet({ k: "finish" })}>
            {live ? "Finish" : "Edit"}
          </Btn>
        </div>
        <div className="mt-2 h-1 rounded bg-line"><div className="h-1 rounded bg-acc transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
      </header>

      <div className="space-y-2">
        {plan.map((it, i) => (
          <ExerciseCard
            key={`${i}-${it.ex}`}
            i={i}
            it={it}
            sets={sets.filter((x) => x.itemIdx === i)}
            last={b.last[it.ex]}
            open={open === i}
            onToggle={() => { setOpen(open === i ? -2 : i); track("ex_open", { i, ex: it.ex }, id); }}
            onLog={(d, kind) => logSet(i, d, kind)}
            onSet={(set) => setSheet({ k: "set", s: set })}
            onRir={(set, rir) => { putSet({ ...set, rir }); track("set_rir", { id: set.id, rir }, id); }}
            onHow={() => { setSheet({ k: "how", i }); track("video_open", { ex: it.ex }, id); }}
            onMenu={() => setSheet({ k: "menu", i })}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Btn kind="soft" icon={Plus} onClick={() => setSheet({ k: "swap", i: -1 })}>Add exercise</Btn>
        <Btn kind={live ? "primary" : "soft"} onClick={() => setSheet({ k: "finish" })}>{live ? "Finish workout" : "Edit session"}</Btn>
      </div>

      {undo && (
        <div className={cx("fixed inset-x-0 z-40 mx-auto flex max-w-lg justify-center px-4", rest && live ? "bottom-24" : "bottom-6")}>
          <div className="flex items-center gap-3 rounded-full bg-ink px-4 py-2 text-sm text-bg shadow-lg">
            Set logged
            <button
              className="font-bold underline"
              onClick={() => { putSet({ ...undo, deleted: 1 }); track("set_undo", { id: undo.id, ex: undo.exKey }, id); setRest(null); setUndo(null); }}
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {live && <RestTimer rest={rest} setRest={setRest} />}

      {sheet?.k === "how" && <HowTo item={plan[sheet.i]} open onClose={() => setSheet(null)} />}
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
          s={s} sets={sets} elapsed={elapsed}
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
  const w = [...cur, ...(last ?? [])].map((x) => x.weightKg ?? 0);
  return w.length ? Math.max(...w) || null : null;
}
function fmtSet(x: Pick<SetLog, "weightKg" | "reps" | "seconds" | "meters" | "assist">) {
  const parts: string[] = [];
  if (x.assist) parts.push(x.assist);
  if (x.weightKg) parts.push(`${kg(x.weightKg)}kg`);
  if (x.reps != null) parts.push(parts.length ? `×${x.reps}` : `${x.reps} reps`);
  if (x.seconds != null) parts.push(`${x.seconds}s`);
  if (x.meters != null) parts.push(`${x.meters}m`);
  return parts.join(" ").replace(" ×", "×") || "—";
}

// ---------------------------------------------------------------- exercise card

function ExerciseCard({ i, it, sets, last, open, onToggle, onLog, onSet, onRir, onHow, onMenu }: {
  i: number; it: PlanItem; sets: SetLog[]; last?: { date: string; sets: SetLog[] }; open: boolean;
  onToggle: () => void; onLog: (d: Draft, k?: SetKind) => void; onSet: (s: SetLog) => void; onRir: (s: SetLog, r: number) => void;
  onHow: () => void; onMenu: () => void;
}) {
  const work = sets.filter((s) => s.kind !== "W");
  const complete = work.length >= it.sets;
  const draft = useDraft(it, sets, last);
  const [d, setD] = useState<Draft>(draft);
  const lastRef = useRef(sets.length);
  useEffect(() => {
    if (sets.length !== lastRef.current) { lastRef.current = sets.length; setD(draft); }
  }, [sets.length, draft]);

  const needRir = sets.length > 0 && sets[sets.length - 1].rir == null && sets[sets.length - 1].reps != null;

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
            {targetLabel(it)} · <Clock size={10} className="inline" /> {restLabel(it.rest)}{it.swappedFrom ? ` · swapped from ${EXERCISES[it.swappedFrom]?.name ?? it.swappedFrom}` : ""}
          </span>
        </span>
        <span className="text-sm text-mute num">{work.length}/{it.sets}</span>
      </button>

      {open && !it.skipped && (
        <div className="px-4 pb-4">
          {(it.tech || last || it.startKg) && (
            <div className="mb-3 space-y-1 text-xs">
              {it.tech && <TechNote text={it.tech} />}
              {last && <div className="text-mute">Last ({niceDate(last.date)}): {last.sets.filter((x) => x.kind !== "W").map(fmtSet).join(" · ")}</div>}
              {!last && it.startKg != null && <div className="text-mute">Suggested start ≈ {it.startKg} kg</div>}
            </div>
          )}

          <div className="space-y-1.5">
            {sets.map((x, k) => (
              <div key={x.id}>
                <button onClick={() => onSet(x)} className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-card2 px-3 text-left">
                  <span className="w-14 text-xs text-mute">{x.kind === "N" ? `Set ${sets.slice(0, k + 1).filter((y) => y.kind === "N").length}` : ({ W: "warm-up", D: "drop", F: "failure", R: "rest-p." } as Record<string, string>)[x.kind]}</span>
                  <span className="flex-1 font-semibold num">{fmtSet(x)}</span>
                  {x.rir != null && <span className="text-xs text-mute">RIR {x.rir}</span>}
                  {x.restBeforeS != null && k > 0 && <span className="text-xs text-mute">{clock(x.restBeforeS * 1000)}</span>}
                  {x.painLevel ? <TriangleAlert size={15} className="text-bad" /> : x.note ? <NotebookPen size={15} className="text-mute" /> : null}
                </button>
                {k === sets.length - 1 && needRir && (
                  <div className="mt-1.5 flex items-center gap-1.5 pl-9">
                    <span className="text-xs text-mute">RIR</span>
                    {[0, 1, 2, 3, 4].map((r) => (
                      <button key={r} onClick={() => onRir(x, r)} className="h-9 w-9 rounded-lg border border-line text-sm num">{r === 4 ? "4+" : r}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {!complete && <SetInput it={it} d={d} setD={setD} n={work.length + 1} onLog={() => onLog(d)} />}

          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto text-sm">
            <span className="shrink-0 text-xs text-faint">Extra:</span>
            {complete && <button onClick={() => onLog(d)} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg bg-card2 px-2.5"><Plus size={14} />Set</button>}
            <button onClick={() => onLog(d, "D")} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg bg-card2 px-2.5"><Layers size={14} />Drop set</button>
            <button onClick={() => onLog(d, "W")} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg bg-card2 px-2.5"><Flame size={14} />Warm-up</button>
            <InfoDot term={TERMS.find((t) => t.key === "drop")!} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <button onClick={onHow} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-card2"><PlayCircle size={16} className="text-info" />How-to video</button>
            <button onClick={onMenu} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-card2"><MoreHorizontal size={16} />Swap · skip · more</button>
          </div>
          {complete && <SetInput it={it} d={d} setD={setD} n={work.length + 1} hidden />}
        </div>
      )}
    </section>
  );
}

function useDraft(it: PlanItem, sets: SetLog[], last?: { sets: SetLog[] }): Draft {
  return useMemo(() => {
    const work = sets.filter((s) => s.kind !== "W");
    const prevHere = work[work.length - 1];
    const prevLast = last?.sets.filter((s) => s.kind !== "W");
    const src = prevHere ?? prevLast?.[Math.min(work.length, (prevLast?.length ?? 1) - 1)];
    const tReps = it.reps == null ? "" : Array.isArray(it.reps) ? it.reps[1] : it.reps;
    const v = (x: number | null | undefined) => (x == null ? "" : String(x));
    return {
      weight: v(src?.weightKg ?? it.startKg ?? null),
      reps: src?.reps != null ? String(src.reps) : String(tReps ?? ""),
      seconds: src?.seconds != null ? String(src.seconds) : v(it.seconds),
      meters: src?.meters != null ? String(src.meters) : v(it.meters),
      assist: src?.assist ?? "",
    };
  }, [it, sets, last]);
}

function SetInput({ it, d, setD, n, onLog, hidden }: { it: PlanItem; d: Draft; setD: (d: Draft) => void; n: number; onLog?: () => void; hidden?: boolean }) {
  const [hold, setHold] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (hold == null) return;
    const i = setInterval(() => tick((x) => x + 1), 200);
    return () => clearInterval(i);
  }, [hold]);
  if (hidden) return null;
  const bump = (k: keyof Draft, by: number, min = 0) => setD({ ...d, [k]: String(Math.max(min, +(Number(d[k] || 0) + by).toFixed(2))) });
  const m = it.metric;

  const ICON = { weight: Dumbbell, reps: Repeat, seconds: Timer, meters: Ruler, assist: Dumbbell } as const;
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

  return (
    <div className="mt-3 rounded-xl border border-line p-3">
      <div className="mb-2 text-xs text-mute">Set {n}{it.perSide ? " · per side" : ""}</div>
      <div className="flex gap-2">
        {m === "assist_reps" && (
          <div className="flex-1">
            <div className="mb-1 text-center text-[11px] text-mute">band / assist</div>
            <input value={d.assist} onChange={(e) => setD({ ...d, assist: e.target.value })} placeholder="red / 20kg" className="min-h-12 w-full rounded-xl bg-card2 px-3 text-center outline-none focus:ring-2 focus:ring-acc" />
          </div>
        )}
        {(m === "weight_reps" || m === "distance") && field("weight", "kg", it.step)}
        {m === "reps" && field("weight", "+kg", it.step, "BW")}
        {(m === "weight_reps" || m === "reps" || m === "assist_reps") && field("reps", "reps", 1)}
        {m === "time" && field("seconds", "seconds", 5)}
        {m === "distance" && field("meters", "meters", 5)}
      </div>
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
      <Btn kind="primary" icon={Check} className="mt-3 w-full text-lg" onClick={onLog}>Log set {n}</Btn>
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

function FinishSheet({ s, sets, elapsed, onClose, onSave, onDelete }: {
  s: Session; sets: SetLog[]; elapsed: number; onClose: () => void; onSave: (p: Partial<Session>, leave: boolean) => void; onDelete: () => void;
}) {
  const [rpe, setRpe] = useState<number | null>(s.rpe);
  const [bw, setBw] = useState(s.bodyweight != null ? String(s.bodyweight) : "");
  const [note, setNote] = useState(s.note ?? "");
  const live = s.status === "active";
  const vol = sets.filter((x) => x.kind !== "W").reduce((a, x) => a + (x.weightKg ?? 0) * (x.reps ?? 0), 0);
  const pains = sets.filter((x) => x.painLevel).length;
  const base = { rpe, bodyweight: bw ? Number(bw) : null, note: note || null };
  return (
    <Sheet open onClose={onClose} title={live ? "Finish workout" : "Session"}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-card2 py-3"><div className="text-lg font-bold num">{clock(elapsed)}</div><div className="text-[11px] text-mute">time</div></div>
        <div className="rounded-xl bg-card2 py-3"><div className="text-lg font-bold num">{sets.filter((x) => x.kind !== "W").length}</div><div className="text-[11px] text-mute">sets</div></div>
        <div className="rounded-xl bg-card2 py-3"><div className="text-lg font-bold num">{Math.round(vol)}</div><div className="text-[11px] text-mute">kg volume</div></div>
      </div>
      {pains > 0 && <p className="mt-3 text-sm text-bad">⚠ {pains} set(s) with pain logged</p>}
      <Label>How hard was the whole session? (1-10)</Label>
      <Chips small options={scale(1, 10)} value={rpe} onChange={setRpe} />
      <Label>Bodyweight (optional)</Label>
      <NumInput value={bw} onChange={setBw} placeholder="kg" />
      <Label>Session note</Label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="How it went, life stuff, what to change…" className="w-full rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
      <div className="mt-6 grid gap-2">
        {live ? (
          <>
            <Btn kind="primary" onClick={() => onSave({ ...base, status: "done", endedAt: Date.now() }, true)}>Finish & save</Btn>
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
