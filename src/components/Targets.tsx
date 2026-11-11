import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Equal, Sparkles, Target, Trophy, TriangleAlert } from "lucide-react";
import type { Best, Lifts, PlanItem } from "../../shared/api";
import { CURRENT } from "../../program";
import { EXERCISES } from "../../program/exercises";
import { EX_GROUP, GROUPS } from "../../program/groups";
import { recommend, type RecKind } from "../../shared/recommend";
import { loadOf, shownKg } from "../../shared/load";
import { toItem } from "../../shared/plan";
import { cx, kg, niceDate, today } from "../lib/util";
import { useLoad } from "../lib/useLoad";
import { Card, Thumb } from "./ui";
import { ExerciseSheet } from "./ExerciseSheet";
import { useNextSession } from "./WeekPlanner";

type Item = {
  exKey: string; name: string; target: { sets: number; reps: number | [number, number] | null; rir: number | [number, number] | null };
  suggested: { weightKg: number | null; reps: number | null; seconds: number | null; kind: string } | null;
  done: { kg: number | null; reps: number | null; seconds: number | null; rir: number | null; strict: number | null }[];
  topKg: number | null; avgReps: number | null; sets: number; verdict: "first" | "beat" | "hit" | "close" | "missed" | "skipped"; cheated: number; notes: string[];
};
type Row = { id: string; date: string; week: number; dayName: string; items: Item[] };

const V: Record<Item["verdict"], { label: string; cls: string; bar: string }> = {
  beat: { label: "beat it", cls: "bg-acc/20 text-acc", bar: "bg-acc" },
  hit: { label: "on target", cls: "bg-acc/10 text-acc", bar: "bg-acc/60" },
  close: { label: "close", cls: "bg-info/15 text-info", bar: "bg-info" },
  missed: { label: "missed", cls: "bg-warn/15 text-warn", bar: "bg-warn" },
  first: { label: "baseline", cls: "bg-card3 text-mute", bar: "bg-card3" },
  skipped: { label: "skipped", cls: "bg-card3 text-faint", bar: "bg-card3" },
};
const u = (ex: string) => (loadOf(ex) === "pair" ? "/hand" : "");
const repsTxt = (r: Item["target"]["reps"] | undefined) => (r == null ? "max" : Array.isArray(r) ? `${r[0]}-${r[1]}` : `${r}`);
const bottomOf = (r: Item["target"]["reps"] | undefined) => (r == null ? null : Array.isArray(r) ? r[0] : r);
const KIND: Record<RecKind, { icon: typeof ArrowUp; label: string; cls: string }> = {
  up: { icon: ArrowUp, label: "heavier", cls: "bg-acc/15 text-acc" },
  hold: { icon: Equal, label: "same", cls: "bg-info/15 text-info" },
  down: { icon: ArrowDown, label: "lighter", cls: "bg-warn/15 text-warn" },
  deload: { icon: ArrowDown, label: "deload", cls: "bg-info/15 text-info" },
  start: { icon: Sparkles, label: "new", cls: "bg-card3 text-mute" },
  estimate: { icon: Sparkles, label: "estimate", cls: "bg-card3 text-mute" },
};

// ---------------------------------------------------------------- next session

/** What the app will recommend next time, per exercise — with why, and what you did last time. */
export function NextSession() {
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const [how, setHow] = useState<PlanItem | null>(null);
  const nx = useNextSession(); // same "next" as Home and Plan (follows football / busy / pins)
  const wk = nx.next ? CURRENT.weeks.find((w) => w.n === nx.next!.week) : null;
  const next = wk?.days.find((d) => d.key === nx.next!.dayKey);
  if (!next || !lifts) return null;
  const deload = /deload/i.test(wk!.name);
  const rows = next.items.filter((x) => !x.finisher).map((rx) => ({ rx, r: recommend(rx.ex, rx, lifts.hist, { deload }), last: lifts.hist[rx.ex] }));
  const count = (k: RecKind[]) => rows.filter((x) => k.includes(x.r.kind)).length;

  return (
    <Card title={`Next: W${wk!.n} · ${next.name}`} icon={Target} className="md:col-span-2">
      <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
        {deload && <span className="rounded-full bg-info/15 px-2 py-1 text-info">Deload week — lighter on purpose</span>}
        {count(["up"]) > 0 && <span className="rounded-full bg-acc/15 px-2 py-1 text-acc">↑ {count(["up"])} heavier</span>}
        {count(["hold"]) > 0 && <span className="rounded-full bg-info/15 px-2 py-1 text-info">= {count(["hold"])} same weight, more reps</span>}
        {count(["down"]) > 0 && <span className="rounded-full bg-warn/15 px-2 py-1 text-warn">↓ {count(["down"])} lighter</span>}
        {count(["start", "estimate"]) > 0 && <span className="rounded-full bg-card3 px-2 py-1 text-mute">★ {count(["start", "estimate"])} first time</span>}
      </div>
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {rows.map(({ rx, r, last }, i) => {
          const K = KIND[r.kind];
          const w = r.weightKg != null ? `${kg(r.weightKg)}` : r.seconds ? `${r.seconds}` : r.reps != null ? `${r.reps}` : "—";
          const unit = r.weightKg != null ? `kg${u(rx.ex)}` : r.seconds ? "s" : "reps";
          const lastWork = last?.sets.filter((x) => x.kind === "N" || x.kind === "F") ?? [];
          return (
            <button key={i} onClick={() => setHow(toItem(rx.ex, rx))} className="flex items-center gap-3 rounded-xl bg-card2 p-2.5 text-left hover:bg-card3">
              <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", K.cls)} title={K.label}><K.icon size={16} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{EXERCISES[rx.ex].name}</span>
                <span className="block truncate text-[11px] text-mute num">
                  {rx.sets}×{repsTxt(rx.reps)}{rx.rir != null ? ` @RIR${Array.isArray(rx.rir) ? rx.rir.join("-") : rx.rir}` : ""}
                  {lastWork.length ? ` · last ${lastWork.map((x) => `${shownKg(x) ?? ""}${shownKg(x) != null ? "×" : ""}${x.reps ?? x.seconds}`).join(" ")}` : " · no history yet"}
                </span>
                <span className="block truncate text-[11px] text-faint">{r.why}</span>
              </span>
              <span className="shrink-0 text-right num">
                <span className="block text-lg font-bold leading-tight">{w}<span className="ml-0.5 text-[11px] font-normal text-mute">{unit}</span></span>
                {r.weightKg != null && r.reps ? <span className="block text-[11px] text-mute">× {r.reps}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {how && <ExerciseSheet item={how} onClose={() => setHow(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------- recommended vs actual

/** How each logged set compared with what the app suggested — per session, plus your overall tendency. */
export function RecVsActual() {
  const { data } = useLoad<Row[]>("/targets");
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const sum = useMemo(() => {
    const items = (data ?? []).flatMap((s) => s.items).filter((x) => x.verdict !== "skipped" && x.verdict !== "first");
    const by = (v: Item["verdict"]) => items.filter((x) => x.verdict === v).length;
    const kgDiffs = items.filter((x) => x.suggested?.weightKg && x.topKg).map((x) => (x.topKg! - x.suggested!.weightKg!) / x.suggested!.weightKg!);
    const repDiffs = items.filter((x) => x.suggested?.reps != null && x.avgReps != null && x.suggested.weightKg != null && x.topKg != null && Math.abs(x.topKg - x.suggested.weightKg) < 0.01).map((x) => x.avgReps! - x.suggested!.reps!);
    const avg = (a: number[]) => (a.length ? a.reduce((p, c) => p + c, 0) / a.length : null);
    return { n: items.length, beat: by("beat"), hit: by("hit"), close: by("close"), missed: by("missed"), kg: avg(kgDiffs), reps: avg(repDiffs) };
  }, [data]);
  if (!data) return null;
  const list = more ? data : data.slice(0, 6);
  const pct = sum.n ? Math.round(((sum.beat + sum.hit) / sum.n) * 100) : 0;

  return (
    <Card title="Recommended vs actual" icon={Target} className="md:col-span-2">
      {!data.length && <p className="text-sm text-mute">Shows after your first finished workout.</p>}
      {sum.n > 0 && (
        <div className="mb-3 rounded-xl bg-card2 p-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-2xl font-bold num">{pct}%</div>
              <div className="text-[11px] text-mute">on target or better · {sum.n} exercises</div>
            </div>
            <div className="text-right text-[11px] text-mute num">
              {sum.kg != null && <div>weight vs suggested: <b className={sum.kg > 0.02 ? "text-acc" : sum.kg < -0.02 ? "text-warn" : "text-ink"}>{sum.kg > 0 ? "+" : ""}{Math.round(sum.kg * 100)}%</b></div>}
              {sum.reps != null && <div>reps at that weight: <b className={sum.reps >= 0 ? "text-acc" : "text-warn"}>{sum.reps > 0 ? "+" : ""}{sum.reps.toFixed(1)}</b></div>}
            </div>
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-card3">
            {(["beat", "hit", "close", "missed"] as const).map((v) => sum[v] > 0 && <div key={v} className={V[v].bar} style={{ width: `${(sum[v] / sum.n) * 100}%` }} title={`${V[v].label}: ${sum[v]}`} />)}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-mute num">
            {(["beat", "hit", "close", "missed"] as const).map((v) => <span key={v} className="inline-flex items-center gap-1"><span className={cx("h-2 w-2 rounded-full", V[v].bar)} />{V[v].label} {sum[v]}</span>)}
          </div>
          {sum.missed / sum.n > 0.35 && <p className="mt-2 text-[11px] text-warn">Often below the suggestion — the app lowers weights after real misses; check sleep, rest times and the "stopped early" insight.</p>}
          {sum.beat / sum.n > 0.5 && <p className="mt-2 text-[11px] text-acc">You usually beat the suggestion — the app will keep stepping up faster.</p>}
        </div>
      )}

      <div className="space-y-2">
        {list.map((s) => {
          const counted = s.items.filter((x) => x.verdict !== "skipped" && x.verdict !== "first");
          const ok = counted.filter((x) => x.verdict === "hit" || x.verdict === "beat").length;
          const isOpen = open === s.id || (open == null && s === data[0]);
          return (
            <div key={s.id} className="rounded-xl bg-card2">
              <button onClick={() => setOpen(isOpen ? "__" : s.id)} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.dayName} <span className="font-normal text-mute">· W{s.week}</span></span>
                  <span className="block text-[11px] text-mute">{niceDate(s.date)}</span>
                </span>
                <span className="w-24 shrink-0">
                  <span className="block text-right text-[11px] text-mute num">{counted.length ? `${ok}/${counted.length} on target` : "baseline"}</span>
                  <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-card3">
                    {counted.length > 0 && (["beat", "hit", "close", "missed"] as const).map((v) => { const n = counted.filter((x) => x.verdict === v).length; return n ? <span key={v} className={V[v].bar} style={{ width: `${(n / counted.length) * 100}%` }} /> : null; })}
                  </span>
                </span>
                <ChevronDown size={16} className={cx("shrink-0 text-mute transition", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="grid grid-cols-1 gap-1.5 px-2 pb-2 md:grid-cols-2">
                  {s.items.map((x, i) => {
                    const sw = x.suggested?.weightKg ?? null, sr = x.suggested?.reps ?? null, bottom = bottomOf(x.target.reps);
                    return (
                      <div key={i} className="rounded-lg bg-card p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{x.name}</span>
                          {x.cheated > 0 && <span className="shrink-0 rounded bg-bad/15 px-1.5 text-[10px] text-bad">{x.cheated} cheat</span>}
                          <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", V[x.verdict].cls)}>{V[x.verdict].label}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] num">
                          <span className="text-mute">Rec</span>
                          <span className="rounded bg-card3 px-1.5 py-0.5">{sw != null ? `${kg(sw)}${u(x.exKey)} × ${sr ?? "?"}` : x.suggested?.seconds ? `${x.suggested.seconds}s` : sr != null ? `${sr} reps` : "—"}</span>
                          <span className="text-faint">→</span>
                          {x.done.length ? x.done.map((d, k) => {
                            const good = (sw == null || (d.kg ?? 0) >= sw - 0.01) && (sr == null || (d.reps ?? 0) >= sr);
                            const inRange = bottom == null || (d.reps ?? 0) >= bottom;
                            return <span key={k} className={cx("rounded px-1.5 py-0.5", d.strict === 0 ? "bg-bad/15 text-bad" : good ? "bg-acc/15 text-acc" : inRange ? "bg-info/10 text-info" : "bg-warn/15 text-warn")}>{d.kg != null ? `${kg(d.kg)}×${d.reps ?? d.seconds}` : `${d.reps ?? d.seconds}${d.seconds && !d.reps ? "s" : ""}`}</span>;
                          }) : <span className="text-faint">not done</span>}
                        </div>
                        {x.notes.length > 0 && <div dir="auto" className="bidi mt-1 truncate text-[11px] text-mute">“{x.notes.join(" · ")}”</div>}
                      </div>
                    );
                  })}
                  <p className="px-1 text-[10px] text-faint md:col-span-2">Green = met the suggestion · blue = inside your rep range · amber = below range · red = cheated. Dumbbells per hand.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {data.length > 6 && <button onClick={() => setMore(!more)} className="mt-2 min-h-11 w-full rounded-xl bg-card2 text-sm text-mute">{more ? "Show fewer" : `Show all ${data.length} workouts`}</button>}
    </Card>
  );
}

/** Kept for older imports: next session + recommended vs actual. */
export function PlanVsActual() {
  return <><NextSession /><RecVsActual /></>;
}

// ---------------------------------------------------------------- personal records

const BIG = ["bench", "squat", "deadlift", "rdl", "ohp", "db_ohp", "incline_db", "pulldown", "machine_row", "leg_press"];
const headOf = (b: Best) => (b.e1rm ? { v: b.e1rm, unit: "kg", label: "est. max" } : b.seconds ? { v: b.seconds, unit: "s", label: "hold" } : b.reps ? { v: b.reps, unit: "reps", label: "best set" } : { v: b.weightKg, unit: "kg", label: "heaviest" });
const daysAgo = (iso?: string) => (iso ? Math.round((Date.parse(`${today()}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 864e5) : 999);

/** All-time records: big lifts highlighted, the rest grouped by muscle, with the set behind it, the date and progress since you started. */
export function PersonalRecords({ lifts }: { lifts: Lifts }) {
  const [how, setHow] = useState<PlanItem | null>(null);
  const [openG, setOpenG] = useState<string | null>(null);
  const entries = Object.entries(lifts.best).filter(([, b]) => b.e1rm || b.seconds || b.reps || b.weightKg);
  const big = BIG.map((k) => [k, lifts.best[k]] as const).filter(([, b]) => b && (b.e1rm || b.weightKg)).slice(0, 6);
  const fresh = entries.filter(([, b]) => daysAgo(b.at) <= 14).length;
  const groups = GROUPS.map((g) => ({ g, rows: entries.filter(([k]) => (EX_GROUP[k] ?? "Other") === g && !big.some(([bk]) => bk === k)).sort((a, b) => headOf(b[1]).v - headOf(a[1]).v) })).filter((x) => x.rows.length);
  const open = (k: string) => setHow(toItem(k, { sets: 3, rest: 90 }));
  const gain = (b: Best) => { const h = headOf(b).v; return b.start && b.start > 0 && h > b.start ? Math.round(((h - b.start) / b.start) * 100) : 0; };

  return (
    <Card title="Personal records" icon={Trophy} className="md:col-span-2" right={fresh ? <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] text-warn">{fresh} new in 2 weeks</span> : undefined}>
      {/* big lifts, highlighted */}
      {big.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3">
          {big.map(([k, b]) => {
            const h = headOf(b), g = gain(b), isNew = daysAgo(b.at) <= 14;
            return (
              <button key={k} onClick={() => open(k)} className={cx("relative rounded-xl p-3 text-left", isNew ? "bg-warn/10 ring-1 ring-warn/40" : "bg-card2")}>
                {isNew && <span className="absolute right-2 top-2 rounded-full bg-warn px-1.5 text-[9px] font-bold text-black">NEW</span>}
                <div className="truncate pr-8 text-[11px] text-mute">{EXERCISES[k]?.name ?? k}</div>
                <div className="mt-0.5 text-xl font-bold num">{kg(h.v)}<span className="ml-0.5 text-xs font-normal text-mute">{h.unit}{u(k)}</span></div>
                <div className="text-[10px] text-mute num">{b.setKg != null && b.setReps ? `${kg(b.setKg)}×${b.setReps}` : h.label}{b.at ? ` · ${niceDate(b.at)}` : ""}</div>
                {g > 0 && <div className="mt-1 text-[10px] font-semibold text-acc num">+{g}% since start</div>}
              </button>
            );
          })}
        </div>
      )}
      {/* everything else by muscle group */}
      <div className="space-y-1.5">
        {groups.map(({ g, rows }) => {
          const isOpen = openG === g || (openG == null && g === groups[0]?.g);
          const newIn = rows.filter(([, b]) => daysAgo(b.at) <= 14).length;
          return (
            <div key={g} className="rounded-xl bg-card2">
              <button onClick={() => setOpenG(isOpen ? "__" : g)} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm">
                <span className="flex-1 font-semibold">{g}</span>
                {newIn > 0 && <span className="rounded-full bg-warn/15 px-1.5 text-[10px] text-warn">{newIn} new</span>}
                <span className="text-xs text-mute num">{rows.length}</span>
                <ChevronDown size={15} className={cx("text-mute transition", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="grid grid-cols-1 gap-x-4 px-3 pb-2 md:grid-cols-2">
                  {rows.map(([k, b]) => {
                    const h = headOf(b), gg = gain(b), isNew = daysAgo(b.at) <= 14;
                    return (
                      <button key={k} onClick={() => open(k)} className="flex min-h-11 items-center gap-2.5 border-t border-line/50 py-1.5 text-left">
                        <Thumb yt={(() => { const y = EXERCISES[k]?.yt; return Array.isArray(y) ? y[0] : y; })()} className="h-8 w-11" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{EXERCISES[k]?.name ?? k}</span>
                          <span className="block truncate text-[10px] text-mute num">{b.setKg != null && b.setReps ? `${kg(b.setKg)}${u(k)}×${b.setReps}` : h.label}{b.at ? ` · ${niceDate(b.at)}` : ""}{b.sessions ? ` · ${b.sessions}×` : ""}</span>
                        </span>
                        <span className="shrink-0 text-right num">
                          <span className={cx("block text-sm font-semibold", isNew && "text-warn")}>{kg(h.v)} <span className="text-[10px] font-normal text-mute">{h.unit}</span></span>
                          {gg > 0 && <span className="block text-[10px] text-acc">+{gg}%</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 flex items-start gap-1 text-[10px] text-faint"><TriangleAlert size={11} className="mt-px shrink-0" />Only strict straight sets count (no cheated, drop or rest-pause sets). Est. max = Epley from sets of ≤12 reps; dumbbells per hand.</p>
      {how && <ExerciseSheet item={how} onClose={() => setHow(null)} />}
    </Card>
  );
}
