import { useState } from "react";
import { Activity, AlertTriangle, BarChart3, CalendarOff, ChevronRight, Dumbbell, Lightbulb, Minus, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import type { InsightsData, ProgressData } from "../../shared/api";
import { InsightList, MuscleChart } from "../components/Insights";
import { today } from "../lib/util";
import { EXCUSES } from "../../shared/lists";
import { EXERCISES } from "../../program/exercises";
import { TERMS } from "../../program/learn";
import { useLoad } from "../lib/useLoad";
import { cx, niceDate } from "../lib/util";
import { Bars, LineChart } from "../components/Chart";
import { Card, Empty, PageHead, Sheet, Stat, Thumb } from "../components/ui";
import { InfoDot } from "../components/Terms";
import { EXCUSE_ICON } from "../components/StartSheets";

type Ex = ProgressData["exercises"][number];
type Pt = Ex["points"][number];

/** The one number that best shows progress for each kind of exercise. */
function metricOf(e: Ex) {
  if (e.metric === "weight_reps") return { unit: "kg", get: (p: Pt) => p.e1rm ?? p.bestWeight ?? 0, label: "estimated 1-rep max", term: "e1rm" };
  if (e.metric === "time") return { unit: "s", get: (p: Pt) => p.bestSeconds ?? 0, label: "longest hold" };
  if (e.metric === "distance") return { unit: "kg", get: (p: Pt) => p.bestWeight ?? 0, label: "carry weight" };
  return { unit: "reps", get: (p: Pt) => p.bestReps ?? 0, label: "best set (reps)" };
}

export default function Stats() {
  const { data, error } = useLoad<ProgressData>("/progress");
  const { data: ins } = useLoad<InsightsData>(`/insights?today=${today()}`);
  const [sel, setSel] = useState<Ex | null>(null);
  const [wm, setWm] = useState<"sets" | "sessions" | "minutes" | "volume">("sets");
  const [all, setAll] = useState(false);
  if (!data) return <p className="py-20 text-center text-mute">{error ?? "Loading…"}</p>;

  const head = <PageHead icon={BarChart3} title="Stats" sub="Are you getting stronger? Each exercise shows its best number per workout." />;
  if (!data.exercises.length && !data.weeks.length) return (<>{head}<Empty icon={BarChart3}>Log your first workout to see trends here.</Empty></>);

  const totals = data.weeks.reduce((a, w) => ({ s: a.s + w.sessions, m: a.m + w.missed, sets: a.sets + w.sets, v: a.v + w.volume }), { s: 0, m: 0, sets: 0, v: 0 });
  const adherence = totals.s + totals.m ? Math.round((totals.s / (totals.s + totals.m)) * 100) : 100;
  const improving = data.exercises.filter((e) => { const m = metricOf(e); return e.points.length > 1 && m.get(e.points[e.points.length - 1]) > m.get(e.points[0]); }).length;
  const units = { sets: "hard sets", sessions: "workouts", minutes: "minutes", volume: "kg" };

  return (
    <div>
      {head}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Dumbbell} value={totals.s} label="workouts done" />
        <Stat icon={TrendingUp} tone="acc" value={`${adherence}%`} label="adherence" />
        <Stat icon={BarChart3} value={totals.sets} label="hard sets (no warm-ups)" />
        <Stat icon={Trophy} tone="acc" value={`${improving}/${data.exercises.length}`} label="exercises improving" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ins && (
          <>
            <Card title="Insights" icon={Lightbulb}><InsightList items={ins.insights} /></Card>
            <Card title="Hard sets per muscle" icon={Activity}><MuscleChart data={ins.muscles} /></Card>
          </>
        )}

        <Card title="Per program week" icon={BarChart3} className="md:col-span-2">
          <div className="mb-3 flex flex-wrap gap-1 text-xs">
            {(Object.keys(units) as (keyof typeof units)[]).map((k) => (
              <button key={k} onClick={() => setWm(k)} className={cx("rounded-full px-3 py-1.5", wm === k ? "bg-card3 text-ink" : "text-mute")}>{units[k]}</button>
            ))}
          </div>
          <Bars data={data.weeks.map((w) => ({ x: w.start, y: w[wm] }))} unit={units[wm]} />
        </Card>

        <Card title="Exercises — tap for the chart" icon={TrendingUp} className="md:col-span-2">
          <div className="grid gap-1.5 md:grid-cols-2">
            {data.exercises.slice(0, all ? undefined : 10).map((e) => {
              const m = metricOf(e);
              const first = m.get(e.points[0]), last = m.get(e.points[e.points.length - 1]);
              const diff = Math.round((last - first) * 10) / 10;
              const ex = EXERCISES[e.exKey];
              const Trend = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
              return (
                <button key={e.exKey} onClick={() => setSel(e)} className="flex items-center gap-3 rounded-xl bg-card2 p-2.5 text-left hover:bg-card3">
                  <Thumb yt={Array.isArray(ex?.yt) ? ex.yt[0] : ex?.yt} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.name}</span>
                    <span className="block text-xs text-mute">{m.label} · {e.points.length}×</span>
                  </span>
                  <span className="text-right num">
                    <span className="block font-semibold">{last}<span className="text-xs text-mute"> {m.unit}</span></span>
                    {e.points.length > 1 && <span className={cx("inline-flex items-center gap-0.5 text-xs", diff > 0 ? "text-acc" : diff < 0 ? "text-bad" : "text-mute")}><Trend size={12} />{Math.abs(diff)}</span>}
                  </span>
                  <ChevronRight size={16} className="text-faint" />
                </button>
              );
            })}
          </div>
          {data.exercises.length > 10 && (
            <button onClick={() => setAll(!all)} className="mt-3 w-full rounded-xl bg-card2 py-2.5 text-sm text-mute hover:text-ink">
              {all ? "Show fewer" : `Show all ${data.exercises.length} exercises`}
            </button>
          )}
        </Card>

        {data.excuses.length > 0 && (
          <Card title="Why sessions were missed" icon={CalendarOff}>
            {data.excuses.map((x) => {
              const Ic = EXCUSE_ICON[x.excuse] ?? EXCUSE_ICON.other;
              const max = data.excuses[0].n;
              return (
                <div key={x.excuse} className="flex items-center gap-3 py-1.5 text-sm">
                  <Ic size={16} className="text-mute" />
                  <span className="w-32 truncate">{EXCUSES.find((e) => e.id === x.excuse)?.label ?? x.excuse}</span>
                  <span className="h-2 flex-1 rounded bg-card2"><span className="block h-2 rounded bg-bad/70" style={{ width: `${(x.n / max) * 100}%` }} /></span>
                  <span className="w-6 text-right num text-mute">{x.n}</span>
                </div>
              );
            })}
          </Card>
        )}

        {data.pains.length > 0 && (
          <Card title="Pain log" icon={AlertTriangle}>
            {data.pains.slice(0, 12).map((p, i) => (
              <div key={i} className="flex gap-3 border-b border-line py-2 text-sm last:border-0">
                <span className="w-16 shrink-0 text-xs text-mute">{niceDate(p.date)}</span>
                <span className="flex-1">
                  <b className="text-bad">{p.area}</b> · {EXERCISES[p.exKey]?.name ?? p.exKey} · {["", "mild", "moderate", "sharp"][p.level ?? 1]}
                  {p.note && <span className="block text-xs text-mute">{p.note}</span>}
                </span>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.name} icon={TrendingUp}>
        {sel && (() => {
          const m = metricOf(sel);
          const term = TERMS.find((t) => t.key === m.term);
          return (
            <>
              <div className="mb-2 flex items-center text-xs text-mute">{m.label}{term && <InfoDot term={term} />}</div>
              <LineChart points={sel.points.map((p) => ({ x: niceDate(p.date), y: m.get(p) }))} unit={m.unit} />
              <table className="mt-4 w-full text-sm num">
                <thead className="text-left text-xs text-mute"><tr><th className="py-1">Date</th><th>Top kg</th><th>Best reps</th><th>Sets</th><th>Volume</th></tr></thead>
                <tbody>
                  {[...sel.points].reverse().map((p) => (
                    <tr key={p.sessionId} className="border-t border-line">
                      <td className="py-2"><a href={`#/s/${p.sessionId}`} className="underline decoration-line">{niceDate(p.date)}</a></td>
                      <td>{p.bestWeight ?? "—"}</td>
                      <td>{p.bestReps ?? (p.bestSeconds ? `${p.bestSeconds}s` : p.bestMeters ? `${p.bestMeters}m` : "—")}</td>
                      <td>{p.sets}</td>
                      <td>{Math.round(p.volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          );
        })()}
      </Sheet>
    </div>
  );
}
