import { useState } from "react";
import type { ProgressData } from "../../shared/api";
import { EXCUSES } from "../../shared/lists";
import { EXERCISES } from "../../program/exercises";
import { useLoad } from "../lib/useLoad";
import { niceDate } from "../lib/util";
import { Bars, LineChart } from "../components/Chart";
import { Empty, Sheet } from "../components/ui";

type Ex = ProgressData["exercises"][number];

/** The one number that best shows progress for each metric type. */
function metricOf(e: Ex) {
  const m = e.metric;
  if (m === "weight_reps") return { unit: "kg e1RM", get: (p: Ex["points"][number]) => p.e1rm ?? p.bestWeight ?? 0, label: "est. 1-rep max" };
  if (m === "time") return { unit: "s", get: (p: Ex["points"][number]) => p.bestSeconds ?? 0, label: "best hold" };
  if (m === "distance") return { unit: "kg", get: (p: Ex["points"][number]) => p.bestWeight ?? 0, label: "carry weight" };
  return { unit: "reps", get: (p: Ex["points"][number]) => p.bestReps ?? 0, label: "best set reps" };
}

export default function Progress() {
  const { data, error } = useLoad<ProgressData>("/progress");
  const [sel, setSel] = useState<Ex | null>(null);
  const [weekMetric, setWeekMetric] = useState<"sets" | "sessions" | "minutes">("sets");
  if (!data) return <p className="py-20 text-center text-mute">{error ?? "Loading…"}</p>;
  if (!data.exercises.length && !data.weeks.length) return (<><h1 className="text-2xl font-bold">Progress</h1><Empty>Log a workout to see progress.</Empty></>);

  const totals = data.weeks.reduce((a, w) => ({ s: a.s + w.sessions, m: a.m + w.missed, sets: a.sets + w.sets }), { s: 0, m: 0, sets: 0 });
  const adherence = totals.s + totals.m ? Math.round((totals.s / (totals.s + totals.m)) * 100) : 100;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Progress</h1>

      <section className="grid grid-cols-3 gap-2 text-center">
        <Tile n={totals.s} label="workouts" />
        <Tile n={`${adherence}%`} label="adherence" />
        <Tile n={totals.sets} label="hard sets" />
      </section>

      <section className="rounded-2xl bg-card p-4">
        <div className="mb-3 flex gap-1 text-xs">
          {(["sets", "sessions", "minutes"] as const).map((k) => (
            <button key={k} onClick={() => setWeekMetric(k)} className={`rounded-full px-3 py-1.5 ${weekMetric === k ? "bg-card2 text-ink" : "text-mute"}`}>
              {k} / week
            </button>
          ))}
        </div>
        <Bars data={data.weeks.map((w) => ({ x: w.start, y: w[weekMetric] }))} unit={weekMetric} />
      </section>

      <section>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-mute">Exercises</div>
        <div className="space-y-1.5">
          {data.exercises.map((e) => {
            const m = metricOf(e);
            const first = m.get(e.points[0]), last = m.get(e.points[e.points.length - 1]);
            const diff = Math.round((last - first) * 10) / 10;
            return (
              <button key={e.exKey} onClick={() => setSel(e)} className="flex w-full items-center gap-3 rounded-xl bg-card px-4 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.name}</span>
                  <span className="block text-xs text-mute">{e.points.length} sessions · {m.label}</span>
                </span>
                <span className="text-right num">
                  <span className="block font-semibold">{last} <span className="text-xs text-mute">{m.unit}</span></span>
                  {e.points.length > 1 && <span className={`block text-xs ${diff > 0 ? "text-acc" : diff < 0 ? "text-bad" : "text-mute"}`}>{diff > 0 ? "▲" : diff < 0 ? "▼" : "="} {Math.abs(diff)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {data.excuses.length > 0 && (
        <section className="rounded-2xl bg-card p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-mute">Why sessions were missed</div>
          {data.excuses.map((x) => (
            <div key={x.excuse} className="flex justify-between py-1 text-sm"><span>{EXCUSES.find((e) => e.id === x.excuse)?.label ?? x.excuse}</span><span className="num text-mute">{x.n}</span></div>
          ))}
        </section>
      )}

      {data.pains.length > 0 && (
        <section className="rounded-2xl bg-card p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-bad">Pain log</div>
          {data.pains.slice(0, 15).map((p, i) => (
            <div key={i} className="border-b border-line py-2 text-sm last:border-0">
              <span className="text-mute">{niceDate(p.date)}</span> · {EXERCISES[p.exKey]?.name ?? p.exKey} · <b>{p.area}</b> {"!".repeat(p.level ?? 1)}
              {p.note && <div className="text-xs text-mute">{p.note}</div>}
            </div>
          ))}
        </section>
      )}

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.name}>
        {sel && (() => {
          const m = metricOf(sel);
          return (
            <>
              <LineChart points={sel.points.map((p) => ({ x: niceDate(p.date), y: m.get(p) }))} unit={m.unit} />
              <table className="mt-4 w-full text-sm num">
                <thead className="text-left text-xs text-mute"><tr><th className="py-1">Date</th><th>Best</th><th>Reps</th><th>Sets</th><th>Volume</th></tr></thead>
                <tbody>
                  {[...sel.points].reverse().map((p) => (
                    <tr key={p.sessionId} className="border-t border-line">
                      <td className="py-2"><a href={`#/s/${p.sessionId}`} className="underline decoration-line">{niceDate(p.date)}</a></td>
                      <td>{p.bestWeight ?? p.bestSeconds ?? p.bestMeters ?? "—"}</td>
                      <td>{p.bestReps ?? "—"}</td>
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

function Tile({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-xl bg-card py-3">
      <div className="text-xl font-bold num">{n}</div>
      <div className="text-[11px] text-mute">{label}</div>
    </div>
  );
}
