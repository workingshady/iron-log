import { useEffect, useState } from "react";
import { CalendarOff, CalendarRange, Dumbbell, Flame, FlaskConical, Footprints, House, Lightbulb, Play, Plus, Scale, TrendingUp } from "lucide-react";
import type { AppState, DashboardData, InsightsData, Lifts, ProgressData, SlotInfo } from "../../shared/api";
import { recommend } from "../../shared/recommend";
import { kg } from "../lib/util";
import { InsightList } from "../components/Insights";
import { CURRENT } from "../../program";
import { EXERCISES } from "../../program/exercises";
import { queue, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { clock, cx, niceDate, today } from "../lib/util";
import { Badge, Btn, Card, PageHead, Stat, Thumb } from "../components/ui";
import { Heatmap } from "../components/Heatmap";
import { Bars, LineChart } from "../components/Chart";
import { MissedSheet, PickSheet, StartSheet } from "../components/StartSheets";
import { WeekPlanner, useWeekPlan } from "../components/WeekPlanner";

export default function Home() {
  const { data: s, error, reload } = useLoad<AppState>("/state");
  const { data: d, reload: reloadD } = useLoad<DashboardData>(`/dashboard?today=${today()}`);
  const { data: p } = useLoad<ProgressData>("/progress");
  const { data: ins } = useLoad<InsightsData>(`/insights?today=${today()}`);
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const [sheet, setSheet] = useState<null | "start" | "missed" | "pick">(null);
  const [target, setTarget] = useState<SlotInfo | null>(null);
  const { plan: wp } = useWeekPlan();

  if (!s) return <p className="py-20 text-center text-mute">{error ?? "Loading…"}</p>;
  // adaptive week: today's planned session can differ from program order (e.g. Legs moved for football)
  const todayDay = wp?.days.find((d) => d.today);
  const adapted = wp?.todayKey && s.next && wp.todayKey !== s.next.dayKey ? s.slots.find((x) => x.week === s.next!.week && x.dayKey === wp.todayKey) ?? null : null;
  const next = adapted ?? s.next;
  const week = next ? s.weeks.find((w) => w.n === next.week) : null;
  const sched = s.settings.schedule ? s.schedules[s.settings.schedule] : null;
  const restToday = sched?.[new Date().getDay()] === "rest";
  const weekStart = s.settings.schedule?.startsWith("B") ? 6 : 1;
  const dayPlan = next ? CURRENT.weeks.find((w) => w.n === next.week)?.days.find((x) => x.key === next.dayKey) : null;

  return (
    <div>
      <PageHead icon={House} title="Home" sub={`${s.program.name} · v${s.program.version}`} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* 1. The one main action */}
        <div className="md:col-span-2">
          {s.active && <ActiveCard a={s.active} />}
          {next ? (
            <section className="rounded-2xl bg-card p-5">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-mute">
                Week {next.week} · {week?.name}
                {restToday && <Badge tone="info">rest day on your schedule</Badge>}
              </div>
              {todayDay?.kind === "football" && <div className="mt-2 rounded-xl bg-warn/15 px-3 py-2 text-sm text-warn">⚽ Football today — no lifting. Log the game from the week card below.</div>}
              {adapted && <div className="mt-2 rounded-xl bg-info/10 px-3 py-2 text-xs text-info">Adapted week: {adapted.dayName} today, {s.next?.dayName} moved{todayDay?.note ? ` · ${todayDay.note}` : ""}.</div>}
              {!adapted && todayDay?.note && <div className="mt-2 rounded-xl bg-info/10 px-3 py-2 text-xs text-info">{todayDay.note}</div>}
              <div className="mt-1 text-3xl font-bold">{next.dayName}</div>
              <div className="text-sm text-mute">{next.focus}</div>
              {dayPlan && (
                <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
                  {dayPlan.items.slice(0, 6).map((it, i) => {
                    const e = EXERCISES[it.ex];
                    const yt = Array.isArray(e.yt) ? e.yt[0] : e.yt;
                    return (
                      <div key={i} className="w-20 shrink-0" title={e.name}>
                        <Thumb yt={yt} className="h-12 w-20" />
                        <div className="mt-1 truncate text-[11px] text-mute">{e.name}</div>
                      </div>
                    );
                  })}
                  {dayPlan.items.length > 6 && <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-card2 text-sm text-mute">+{dayPlan.items.length - 6}</div>}
                </div>
              )}
              {dayPlan && lifts && (() => {
                const deload = /deload/i.test(week?.name ?? "");
                const key = dayPlan.items.filter((it) => EXERCISES[it.ex]?.metric === "weight_reps").slice(0, 3)
                  .map((it) => ({ it, r: recommend(it.ex, it, lifts.hist, { deload }) })).filter((x) => x.r.weightKg != null);
                return key.length ? (
                  <div className="mt-4 rounded-xl bg-card2 p-3">
                    <div className="mb-1.5 text-[11px] uppercase tracking-wide text-mute">Today's targets</div>
                    {key.map(({ it, r }) => (
                      <div key={it.ex} className="flex items-center justify-between py-0.5 text-sm">
                        <span className="truncate">{EXERCISES[it.ex].name}</span>
                        <span className={cx("num font-semibold", r.kind === "up" ? "text-acc" : r.kind === "down" ? "text-warn" : "text-ink")}>{kg(r.weightKg)} kg × {r.reps}</span>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
              {!s.active && (
                <Btn kind="primary" icon={Play} className="mt-5 w-full text-lg" onClick={() => { setTarget(next); setSheet("start"); }}>
                  {todayDay?.kind === "rest" || todayDay?.kind === "football" ? "Start anyway" : "Start workout"}
                </Btn>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Btn kind="soft" icon={CalendarOff} onClick={() => { setTarget(next); setSheet("missed"); }}>Can't train</Btn>
                <Btn kind="soft" icon={CalendarRange} onClick={() => setSheet("pick")}>Other day</Btn>
              </div>
            </section>
          ) : (
            <Card><div className="text-2xl font-bold">Program complete 🎉</div><p className="mt-2 text-sm text-mute">Log your re-tests, run <code>npm run export</code>, and ask Claude for the next version.</p></Card>
          )}
        </div>

        {/* 2. This week (adaptive) */}
        <div><WeekPlanner compact /></div>

        {/* 3. Key numbers */}
        <div className="grid grid-cols-2 gap-3 md:col-span-3 md:grid-cols-4">
          <Stat icon={Flame} tone="warn" value={d?.streak ?? 0} label={`workouts in a row · best ${d?.bestStreak ?? 0}`} />
          <Stat icon={TrendingUp} tone="acc" value={d?.adherence != null ? `${d.adherence}%` : "—"} label="adherence (done ÷ planned)" />
          <a href="#/cardio" className="block"><Stat icon={Footprints} tone="info" value={`${d?.cardioWeek?.sessions ?? 0}/3`} label={`cardio this week · ${d?.cardioWeek?.minutes ?? 0} min`} /></a>
          <CreatineTile d={d} onAdd={reloadD} />
        </div>

        {/* 4. Calendar */}
        <Card title="Training calendar" icon={CalendarRange} className="md:col-span-3">
          <Heatmap days={d?.days} weekStart={weekStart} />
        </Card>

        {/* 5. Insights */}
        <Card title="Insights" icon={Lightbulb} className="md:col-span-3" right={<a href="#/stats" className="text-xs font-normal text-info">all stats →</a>}>
          {ins ? <InsightList items={ins.insights} max={4} /> : <p className="text-sm text-mute">Loading…</p>}
        </Card>

        {/* 6. Trends */}
        <Card title="Hard sets per week" icon={Dumbbell} className="md:col-span-2">
          {p?.weeks.length ? <Bars data={p.weeks.map((w) => ({ x: w.start, y: w.sets }))} unit="sets" /> : <p className="text-sm text-mute">Shows after your first workout.</p>}
        </Card>
        <Card title="Bodyweight" icon={Scale}>
          {d && d.body.length > 1 ? (
            <LineChart points={d.body.map((b) => ({ x: niceDate(b.date), y: b.weightKg ?? 0 }))} unit="kg" height={110} />
          ) : (
            <p className="text-sm text-mute">Weigh in whenever you like (weekly is enough) in Body & habits to see the trend.</p>
          )}
        </Card>
      </div>

      <StartSheet open={sheet === "start"} slot={target} kind={target && target.dayKey !== s.next?.dayKey ? (target.status === "open" ? "picked" : "extra") : "planned"} onClose={() => setSheet(null)} />
      <MissedSheet open={sheet === "missed"} slot={target} onClose={() => setSheet(null)} onDone={() => { reload(); reloadD(); }} />
      <PickSheet open={sheet === "pick"} s={s} onClose={() => setSheet(null)} onPick={(x) => { setTarget(x); setSheet("start"); }} />
    </div>
  );
}

function CreatineTile({ d, onAdd }: { d: DashboardData | null; onAdd: () => void }) {
  const g = d?.creatine?.today ?? 0, t = d?.creatine?.target ?? 5;
  const ok = g >= t;
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-center justify-between">
        <FlaskConical size={18} className="text-vio" />
        {!ok && (
          <button
            onClick={() => { queue("POST", "/intake", { id: uid(), date: today(), item: "creatine", amount: t, unit: "g", at: Date.now() }, `intake ${Date.now()}`); track("creatine_add", { g: t }); setTimeout(onAdd, 700); }}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-vio px-2.5 text-xs font-semibold text-black"
          >
            <Plus size={14} /> {t} g
          </button>
        )}
      </div>
      <div className="mt-2 text-2xl font-bold num">{g}<span className="text-sm text-mute"> / {t} g</span></div>
      <a href="#/creatine" className="text-xs text-mute underline decoration-line">creatine today{d?.creatine?.streak ? ` · ${d.creatine.streak}-day streak` : ""}</a>
    </div>
  );
}

function ActiveCard({ a }: { a: NonNullable<AppState["active"]> }) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <a href={`#/s/${a.id}`} className="mb-3 flex items-center justify-between rounded-2xl border border-warn/50 bg-warn/10 p-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-warn">Workout in progress — tap to continue</div>
        <div className="text-lg font-semibold">Week {a.week} · {a.dayName}</div>
      </div>
      <div className="text-2xl font-bold num">{a.startedAt ? clock(t - a.startedAt) : ""}</div>
    </a>
  );
}
