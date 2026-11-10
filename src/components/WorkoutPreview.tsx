import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Clock, Dumbbell, Equal, Eye, Flame, Link2, Play, Sparkles } from "lucide-react";
import type { AppState, Lifts, PlanItem } from "../../shared/api";
import { CURRENT } from "../../program";
import { EX_GROUP } from "../../program/groups";
import { buildPlan, targetLabel } from "../../shared/plan";
import { isBarbell, recommend, warmups, type RecKind } from "../../shared/recommend";
import { barOf, barsFrom, loadOf } from "../../shared/load";
import { track } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, kg, restLabel } from "../lib/util";
import { Btn, Sheet, Thumb } from "./ui";
import { ExerciseSheet } from "./ExerciseSheet";

const KIND: Record<RecKind, { icon: typeof ArrowUp; cls: string; label: string }> = {
  up: { icon: ArrowUp, cls: "text-acc", label: "heavier" },
  hold: { icon: Equal, cls: "text-info", label: "same" },
  down: { icon: ArrowDown, cls: "text-warn", label: "lighter" },
  deload: { icon: ArrowDown, cls: "text-info", label: "deload" },
  start: { icon: Sparkles, cls: "text-mute", label: "new" },
  estimate: { icon: Sparkles, cls: "text-mute", label: "estimate" },
};

/** Rough session length: each set ≈ 40 s of work + its rest; supersets rest once per round; warm-ups ≈ 1 min each. */
export function estimateMinutes(items: PlanItem[], warmSets = 0) {
  let s = 0;
  items.forEach((it, i) => {
    const partnerNext = it.tag && items[i + 1]?.tag?.[0] === it.tag[0];
    s += it.sets * (40 + (partnerNext ? 10 : it.rest));
  });
  return Math.round((s + warmSets * 60) / 60);
}

/**
 * Look at a whole workout before starting it: exercises in order, supersets and finishers, sets × reps,
 * today's recommended weight (↑ heavier / = same / ↓ lighter), warm-ups, time estimate. Nothing is logged.
 */
export function WorkoutPreview({ week, dayKey, onStart, onClose }: { week: number; dayKey: string; onStart?: () => void; onClose: () => void }) {
  const { data: s } = useLoad<AppState>("/state");
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const [how, setHow] = useState<PlanItem | null>(null);
  const wk = CURRENT.weeks.find((w) => w.n === week);
  let plan: { name: string; items: PlanItem[] } | null = null;
  try { plan = buildPlan(CURRENT, week, dayKey); } catch { plan = null; }
  if (!plan || !wk) return null;
  const deload = /deload/i.test(wk.name);
  const bars = barsFrom(s?.settings);
  const day = [...wk.days, ...(wk.extras ?? [])].find((d) => d.key === dayKey);
  const rows = plan.items.map((it) => {
    const rec = recommend(it.ex, it, lifts?.hist ?? {}, { deload, step: it.step, bodyKg: Number(s?.settings?.bodyKg) || null });
    const warm = it.metric === "weight_reps" && rec.weightKg && (isBarbell(it.ex) ? rec.weightKg > barOf(it.ex, bars) + 10 : rec.weightKg >= 15) ? warmups(it.ex, rec.weightKg, barOf(it.ex, bars) || 20) : [];
    return { it, rec, warm };
  });
  const warmTotal = rows.reduce((a, r) => a + (r.warm.length ? Math.min(2, r.warm.length) : 0), 0); // usually only the first lifts get a full ramp
  const minutes = estimateMinutes(plan.items, warmTotal);
  const sets = plan.items.reduce((a, it) => a + it.sets, 0);
  const groups = new Map<string, number>();
  plan.items.filter((x) => !x.finisher).forEach((x) => { const g = EX_GROUP[x.ex]; if (g) groups.set(g, (groups.get(g) ?? 0) + x.sets); });
  const counts = { up: rows.filter((r) => r.rec.kind === "up").length, down: rows.filter((r) => r.rec.kind === "down").length };

  return (
    <Sheet open onClose={onClose} title={`W${week} · ${plan.name}`} icon={Eye}>
      <p className="-mt-1 text-sm text-mute">{day?.focus}</p>

      {/* summary */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-card2 p-2"><div className="text-lg font-bold num">~{minutes}</div><div className="text-[10px] text-mute">minutes</div></div>
        <div className="rounded-xl bg-card2 p-2"><div className="text-lg font-bold num">{plan.items.length}</div><div className="text-[10px] text-mute">exercises</div></div>
        <div className="rounded-xl bg-card2 p-2"><div className="text-lg font-bold num">{sets}</div><div className="text-[10px] text-mute">sets</div></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
        {deload && <span className="rounded-full bg-info/15 px-2 py-0.5 text-info">Deload — lighter on purpose</span>}
        {counts.up > 0 && <span className="rounded-full bg-acc/15 px-2 py-0.5 text-acc">↑ {counts.up} heavier than last time</span>}
        {counts.down > 0 && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-warn">↓ {counts.down} lighter</span>}
        {[...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g, n]) => <span key={g} className="rounded-full bg-card2 px-2 py-0.5 text-mute num">{g} {n}</span>)}
      </div>

      {/* exercises in order */}
      <ol className="mt-3 space-y-1.5">
        {rows.map(({ it, rec, warm }, i) => {
          const K = KIND[rec.kind];
          const unit = loadOf(it.ex) === "pair" ? "/hand" : "";
          const w = rec.weightKg != null ? `${kg(rec.weightKg)} kg${unit}` : rec.seconds ? `${rec.seconds} s` : rec.reps != null && rec.kind !== "start" ? `${rec.reps} reps` : "find it";
          const groupStart = it.tag && rows[i + 1]?.it.tag?.[0] === it.tag[0] && rows[i - 1]?.it.tag?.[0] !== it.tag[0];
          const inGroup = it.tag && (rows[i + 1]?.it.tag?.[0] === it.tag[0] || rows[i - 1]?.it.tag?.[0] === it.tag[0]);
          const firstFin = it.finisher && !rows[i - 1]?.it.finisher;
          return (
            <li key={i}>
              {groupStart && <div className="mb-1 mt-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-info"><Link2 size={12} />Superset {it.tag![0]} · back-to-back, rest after the round</div>}
              {firstFin && <div className="mb-1 mt-3 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-mute"><Flame size={12} className="text-warn" />Finishers · small muscles</div>}
              <button onClick={() => { setHow(it); track("preview_ex", { ex: it.ex }); }} className={cx("flex w-full items-center gap-3 rounded-xl bg-card2 p-2 text-left active:bg-card3", inGroup && "border-l-2 border-info/60")}>
                <span className="relative shrink-0">
                  <Thumb yt={it.yt[0]} className="h-11 w-16" />
                  <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-card3 px-1 text-[10px] font-bold ring-2 ring-card2">{it.tag ?? i + 1}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{it.name}</span>
                  <span className="block truncate text-[11px] text-mute num">{targetLabel(it)} · <Clock size={9} className="inline" /> {restLabel(it.rest)}{warm.length ? ` · ${warm.length} warm-ups` : ""}</span>
                  {it.tech && <span className="block truncate text-[11px] text-warn">{it.tech}</span>}
                </span>
                <span className="shrink-0 text-right num">
                  <span className={cx("flex items-center justify-end gap-0.5 text-sm font-semibold", K.cls)}><K.icon size={12} />{w}</span>
                  {rec.weightKg != null && rec.reps ? <span className="block text-[11px] text-mute">× {rec.reps}</span> : <span className="block text-[11px] text-faint">{K.label}</span>}
                </span>
                <ChevronRight size={15} className="shrink-0 text-faint" />
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-faint">Preview only — nothing is logged. Weights are today's suggestion from your history; tap an exercise for the video, cues, last time and alternatives.</p>

      <div className="sticky bottom-0 -mx-1 mt-3 grid grid-cols-[auto_1fr] gap-2 bg-card px-1 pb-1 pt-2">
        <Btn kind="soft" onClick={onClose}>Close</Btn>
        {onStart && !s?.active ? (
          <Btn kind="primary" icon={Play} onClick={() => { track("preview_start", { week, dayKey }); onStart(); }}>Start this workout</Btn>
        ) : (
          <Btn kind="soft" icon={Dumbbell} disabled>{s?.active ? "Finish the current workout first" : "Preview"}</Btn>
        )}
      </div>
      {how && <ExerciseSheet item={how} onClose={() => setHow(null)} />}
    </Sheet>
  );
}
