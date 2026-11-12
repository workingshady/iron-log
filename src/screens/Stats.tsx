import { useState } from "react";
import { Activity, AlertTriangle, BarChart3, CalendarOff, CalendarRange, ChevronRight, Dumbbell, Gauge, Lightbulb, Link2, Minus, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import type { AppState, InsightsData, Lifts, ProgressData } from "../../shared/api";
import { InsightList } from "../components/Insights";
import { NextSession, PersonalRecords, RecVsActual } from "../components/Targets";
import { BodyMap } from "../components/BodyMap";
import { EffortMix, LiftTrends, LiftTrendsHelp, Links, MuscleHelp, MuscleWeeks, RecentPRs, WeeklyTrend, useAnalytics } from "../components/Analytics";
import { useProgram } from "../lib/program";
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
import { weekConfig } from "../../shared/week";

type Ex = ProgressData["exercises"][number];
type Pt = Ex["points"][number];

/** The one number that best shows progress for each kind of exercise. */
function metricOf(e: Ex) {
  if (e.metric === "weight_reps") return { unit: "kg", get: (p: Pt) => p.e1rm ?? p.bestWeight ?? 0, label: "estimated 1-rep max", term: "e1rm" };
  if (e.metric === "time") return { unit: "s", get: (p: Pt) => p.bestSeconds ?? 0, label: "longest hold" };
  if (e.metric === "distance") return { unit: "kg", get: (p: Pt) => p.bestWeight ?? 0, label: "carry weight" };
  return { unit: "reps", get: (p: Pt) => p.bestReps ?? 0, label: "best set (reps)" };
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "strength", label: "Strength" },
  { id: "volume", label: "Volume" },
  { id: "patterns", label: "Patterns" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const TAB_KEY = "il.statsTab";
const readTab = (): Tab => { try { const v = localStorage.getItem(TAB_KEY); return TABS.some((t) => t.id === v) ? (v as Tab) : "overview"; } catch { return "overview"; } };

export default function Stats() {
  const { data, error } = useLoad<ProgressData>("/progress");
  const { data: ins } = useLoad<InsightsData>(`/insights?today=${today()}`);
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const { data: st } = useLoad<AppState>("/state");
  const ws = st ? weekConfig(st.settings, st.schedules).weekStart : 1;
  const { data: an } = useAnalytics(ws);
  const [tab, setTabRaw] = useState<Tab>(readTab);
  const setTab = (t: Tab) => { setTabRaw(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* private mode */ } };
  const [sel, setSel] = useState<Ex | null>(null);
  const [wm, setWm] = useState<"sets" | "sessions" | "minutes" | "volume">("sets");
  const [all, setAll] = useState(false);
  const [mapMode, setMapMode] = useState<"done" | "plan">("done");
  const [mapWeek, setMapWeek] = useState<number | null>(null);
  const program = useProgram(); // the plan this user trains (default = CURRENT)
  if (!data) return <p className="py-20 text-center text-mute">{error ?? "Loading…"}</p>;

  const head = <PageHead icon={BarChart3} title="Stats" sub="Stronger? Enough volume? What helps?" />;
  if (!data.exercises.length && !data.weeks.length) return (<>{head}<Empty icon={BarChart3}>Log your first workout to see trends here.</Empty></>);

  const totals = data.weeks.reduce((a, w) => ({ s: a.s + w.sessions, m: a.m + w.missed, sets: a.sets + w.sets, v: a.v + w.volume }), { s: 0, m: 0, sets: 0, v: 0 });
  const adherence = totals.s + totals.m ? Math.round((totals.s / (totals.s + totals.m)) * 100) : 100;
  const improving = data.exercises.filter((e) => { const m = metricOf(e); return e.points.length > 1 && m.get(e.points[e.points.length - 1]) > m.get(e.points[0]); }).length;
  const units = { sets: "working sets", sessions: "workouts", minutes: "minutes", volume: "kg" };
  const pickLift = (k: string) => setSel(data.exercises.find((e) => e.exKey === k) ?? null);
  const loading = <p className="text-sm text-mute">Loading…</p>;

  return (
    <div>
      {head}
      {/* segmented tabs: four focused pages instead of one long scroll. ARIA tabs pattern: arrow keys move between tabs. */}
      <div className="sticky top-[env(safe-area-inset-top)] z-10 -mx-4 mb-3 bg-bg/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:px-0 md:pt-0">
        <div
          className="grid grid-cols-4 gap-1 rounded-full bg-card p-1 text-sm"
          role="tablist"
          aria-label="Stats sections"
          onKeyDown={(e) => {
            const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!d) return;
            const n = TABS[(TABS.findIndex((t) => t.id === tab) + d + TABS.length) % TABS.length].id;
            setTab(n);
            document.getElementById(`stats-tab-${n}`)?.focus();
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`stats-tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls="stats-panel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={cx("min-h-11 rounded-full px-1 transition-colors", tab === t.id ? "bg-card3 font-semibold text-ink shadow-sm" : "text-mute hover:text-ink")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div id="stats-panel" role="tabpanel" aria-labelledby={`stats-tab-${tab}`}>

      {tab === "overview" && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Totals" role="group">
            <Stat icon={Dumbbell} value={totals.s} label="workouts done" />
            <Stat icon={TrendingUp} tone="acc" value={an?.adherence4w != null ? `${an.adherence4w}%` : `${adherence}%`} label={an?.adherence4w != null ? `adherence · 4 weeks (all ${adherence}%)` : "adherence"} />
            <Stat icon={BarChart3} value={an ? an.weeks[an.weeks.length - 1].hardSets : "—"} label="hard sets this week" />
            <Stat icon={Trophy} tone="acc" value={`${improving}/${data.exercises.length}`} label="exercises improving" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card title="Week by week" icon={CalendarRange} className="md:col-span-2">{an ? <WeeklyTrend weeks={an.weeks} /> : loading}</Card>
            <Card title="Insights" icon={Lightbulb} className="md:col-span-2">{ins ? <InsightList items={ins.insights} /> : loading}</Card>
          </div>
        </>
      )}

      {tab === "strength" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card title="Strength trend · 4 weeks" icon={TrendingUp} right={<LiftTrendsHelp />}>{an ? <LiftTrends lifts={an.lifts} onPick={pickLift} /> : loading}</Card>
          <Card title="Recent records" icon={Trophy}>{an ? <RecentPRs prs={an.prs} /> : loading}</Card>

          <Card title="All exercises" icon={TrendingUp} className="md:col-span-2" right={<span className="text-xs font-normal">tap one for its chart</span>}>
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
              {data.exercises.slice(0, all ? undefined : 10).map((e) => {
                const m = metricOf(e);
                const first = m.get(e.points[0]), last = m.get(e.points[e.points.length - 1]);
                const diff = Math.round((last - first) * 10) / 10;
                const ex = EXERCISES[e.exKey];
                const Trend = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
                return (
                  <button key={e.exKey} onClick={() => setSel(e)} className="flex min-h-14 items-center gap-3 rounded-xl bg-card2 p-2.5 text-left hover:bg-card3">
                    <Thumb yt={Array.isArray(ex?.yt) ? ex.yt[0] : ex?.yt} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{e.name}</span>
                      <span className="block text-xs text-mute">{m.label} · {e.points.length}×</span>
                    </span>
                    <span className="text-right num">
                      <span className="block font-semibold">{last}<span className="text-xs text-mute"> {m.unit}</span></span>
                      {e.points.length > 1 && <span className={cx("inline-flex items-center gap-0.5 text-xs", diff > 0 ? "text-acc" : diff < 0 ? "text-bad" : "text-mute")}><Trend size={12} aria-hidden /><span className="sr-only">{diff > 0 ? "up" : diff < 0 ? "down" : "no change"} </span>{Math.abs(diff)}</span>}
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden />
                  </button>
                );
              })}
            </div>
            {data.exercises.length > 10 && (
              <button onClick={() => setAll(!all)} aria-expanded={all} className="mt-3 min-h-11 w-full rounded-xl bg-card2 text-sm text-mute hover:text-ink">
                {all ? "Show fewer" : `Show all ${data.exercises.length} exercises`}
              </button>
            )}
          </Card>

          <NextSession />
          <RecVsActual />

          {lifts && Object.keys(lifts.best).length > 0 && <PersonalRecords lifts={lifts} />}
        </div>
      )}

      {tab === "volume" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card title="Hard sets per muscle" icon={Activity} right={<MuscleHelp />}>{an ? <MuscleWeeks data={an.muscles} /> : loading}</Card>
          {ins && (
            <Card title="Muscle map" icon={Activity}>
              {(() => {
                const weeks = program.weeks.map((w) => w.n);
                const wk = mapWeek ?? ins.muscles.weeks[ins.muscles.weeks.length - 1]?.week ?? 1;
                const planned = (program.weeks.find((w) => w.n === wk)?.days ?? []).flatMap((d) => d.items).reduce<Record<string, number>>((a, x) => ({ ...a, [x.ex]: (a[x.ex] ?? 0) + x.sets }), {});
                const done = ins.muscles.weeks.find((w) => w.week === wk)?.ex ?? {};
                return (
                  <>
                    <div className="mb-3 space-y-2 text-xs">
                      <div className="flex w-fit rounded-full bg-card2 p-0.5" role="group" aria-label="Show">
                        {(["done", "plan"] as const).map((m) => (
                          <button key={m} onClick={() => setMapMode(m)} aria-pressed={mapMode === m} className={cx("inline-flex min-h-11 items-center rounded-full px-3.5", mapMode === m ? "bg-card3 font-semibold text-ink" : "text-mute")}>{m === "done" ? "What you did" : "What the plan asks"}</button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1" role="group" aria-label="Program week">
                        {weeks.map((n) => (
                          <button key={n} onClick={() => setMapWeek(n)} aria-pressed={n === wk} className={cx("inline-flex min-h-11 items-center rounded-full px-3.5", n === wk ? "bg-card3 font-semibold text-ink" : "text-mute")}>Week {n}</button>
                        ))}
                      </div>
                    </div>
                    <div className="mx-auto max-w-md"><BodyMap exSets={mapMode === "done" ? done : planned} caption={mapMode === "done" ? `Logged sets, program week ${wk}` : `Planned sets, program week ${wk}`} /></div>
                  </>
                );
              })()}
            </Card>
          )}
          <Card title="Per program week" icon={BarChart3} className="md:col-span-2">
            <div className="mb-3 flex flex-wrap gap-1 text-xs" role="group" aria-label="Measure">
              {(Object.keys(units) as (keyof typeof units)[]).map((k) => (
                <button key={k} onClick={() => setWm(k)} aria-pressed={wm === k} className={cx("min-h-11 rounded-full px-3", wm === k ? "bg-card3 font-semibold text-ink" : "text-mute")}>{units[k]}</button>
              ))}
            </div>
            <Bars data={data.weeks.map((w) => ({ x: w.start, y: w[wm] }))} unit={units[wm]} />
            <p className="mt-2 text-xs text-mute">All blocks added up by program week (W1-W4). Working sets = every set except warm-ups.</p>
          </Card>
        </div>
      )}

      {tab === "patterns" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card title="What goes with good workouts" icon={Link2} className="md:col-span-2">{an ? <Links data={an} /> : loading}</Card>
          <Card title="Effort (reps in reserve)" icon={Gauge}>{an ? <EffortMix effort={an.effort} /> : loading}</Card>

          {data.excuses.length > 0 && (
            <Card title="Why sessions were missed" icon={CalendarOff}>
              {data.excuses.map((x) => {
                const Ic = EXCUSE_ICON[x.excuse] ?? EXCUSE_ICON.other;
                const max = data.excuses[0].n;
                return (
                  <div key={x.excuse} className="flex items-center gap-3 py-1.5 text-sm">
                    <Ic size={16} className="shrink-0 text-mute" aria-hidden />
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
                    {p.note && <span dir="auto" className="bidi block text-xs text-mute">{p.note}</span>}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
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
              {sel.metric === "weight_reps" && sel.points.length > 1 && (
                <>
                  <div className="mb-1 mt-4 text-xs text-mute">Volume per workout (kg × reps, no warm-ups)</div>
                  <Bars data={sel.points.map((p) => ({ x: niceDate(p.date), y: p.volume }))} unit="kg" tone="var(--color-info)" />
                </>
              )}
              <table className="mt-4 w-full text-sm num">
                <thead className="text-left text-xs text-mute"><tr><th scope="col" className="py-1">Date</th><th scope="col">Top kg</th><th scope="col">Best reps</th><th scope="col">Sets</th><th scope="col">Volume</th></tr></thead>
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
