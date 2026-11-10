import { useEffect, useState } from "react";
import { CalendarOff, CalendarRange, Dumbbell, Flame, FlaskConical, Footprints, House, Lightbulb, Play, Plus, Scale, Timer, TrendingUp } from "lucide-react";
import type { AppState, DashboardData, InsightsData, Lifts, ProgressData, SlotInfo } from "../../shared/api";
import { recommend } from "../../shared/recommend";
import { kg } from "../lib/util";
import { InsightList } from "../components/Insights";
import { CURRENT } from "../../program";
import { EXERCISES } from "../../program/exercises";
import { queue, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { clock, cx, niceDate, today } from "../lib/util";
import { Btn, Card, PageHead, Stat, Thumb } from "../components/ui";
import { weekConfig } from "../../shared/week";
import { Heatmap } from "../components/Heatmap";
import { LineChart } from "../components/Chart";
import { LiftTrends, WeeklyTrend, useAnalytics } from "../components/Analytics";
import { MissedSheet, PickSheet, StartSheet } from "../components/StartSheets";
import { WeekPlanner, useWeekPlan } from "../components/WeekPlanner";

export default function Home() {
  const { data: s, error, reload } = useLoad<AppState>("/state");
  const { data: d } = useLoad<DashboardData>(`/dashboard?today=${today()}`);
  const { data: p } = useLoad<ProgressData>("/progress");
  const { data: ins } = useLoad<InsightsData>(`/insights?today=${today()}`);
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const [sheet, setSheet] = useState<null | "start" | "missed" | "pick">(null);
  const [target, setTarget] = useState<SlotInfo | null>(null);
  const { plan: wp } = useWeekPlan();
  const { data: an } = useAnalytics(s ? weekConfig(s.settings, s.schedules).weekStart : 1);

  if (!s) return <p className="py-20 text-center text-mute">{error ?? "Loading…"}</p>;
  // TODAY follows the adapted week (football, moved sessions, rest), never a fixed weekday
  const todayDay = wp?.days.find((x) => x.today) ?? null;
  const nextPlanned = wp?.days.find((x) => x.kind === "planned" && !x.today) ?? null;
  const slotOf = (key?: string | null) => (key && s.next ? s.slots.find((x) => x.week === s.next!.week && x.dayKey === key) ?? null : null);
  const state: "train" | "rest" | "football" | "done" | "busy" = !todayDay ? "train" : todayDay.kind === "planned" ? "train" : todayDay.kind === "football" ? "football" : todayDay.kind === "done" ? "done" : todayDay.kind === "busy" ? "busy" : "rest";
  const next = (state === "train" ? slotOf(wp?.todayKey) : slotOf(nextPlanned?.dayKey)) ?? s.next;
  const moved = state === "train" && next && s.next && next.dayKey !== s.next.dayKey;
  const week = next ? s.weeks.find((w) => w.n === next.week) : null;
  const weekStart = weekConfig(s.settings, s.schedules).weekStart;
  const dayPlan = next ? CURRENT.weeks.find((w) => w.n === next.week)?.days.find((x) => x.key === next.dayKey) : null;
  const weekdayOf = (iso?: string) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : "");
  const name = s.settings.profileName || "";
  const hello = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <PageHead icon={House} title={name ? `${hello}, ${name}` : "Home"} sub={`${new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })} · ${s.program.name} v${s.program.version}`} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* 1. TODAY — the one main action */}
        <div className="md:col-span-2">
          {s.active && <ActiveCard a={s.active} />}
          {!s.active && state !== "train" && (
            <section className={cx("mb-3 rounded-2xl p-5", state === "football" ? "bg-warn/10" : state === "done" ? "bg-acc/10" : "bg-card")}>
              <div className="text-xs font-medium uppercase tracking-wide text-mute">Today</div>
              <div className={cx("mt-1 text-2xl font-bold", state === "football" ? "text-warn" : state === "done" ? "text-acc" : "")}>
                {state === "football" ? "⚽ Football day" : state === "done" ? `Done: ${todayDay?.dayName} ✓` : state === "busy" ? "Busy day" : "Rest day"}
              </div>
              <p className="mt-1 text-sm text-mute">
                {state === "football" ? "No lifting — football is your cardio. Log the game from This week (tap today)." : state === "done" ? "Great work. Recover: protein, sleep, creatine." : todayDay?.note ?? "Recovery is where you grow. A walk or mobility is perfect."}
              </p>
              {nextPlanned && <p className="mt-2 text-sm">Next: <b>{nextPlanned.dayName}</b> on {weekdayOf(nextPlanned.iso)}</p>}
            </section>
          )}
          {next ? (
            <section className={cx("rounded-2xl bg-card p-5", !s.active && state !== "train" && "opacity-90")}>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-mute">
                {state === "train" ? "Today's workout" : "Up next"} · Week {next.week} · {week?.name}
              </div>
              {moved && <div className="mt-2 rounded-xl bg-info/10 px-3 py-2 text-xs text-info">Week adapted: {next.dayName} today, {s.next?.dayName} moved{todayDay?.note ? ` · ${todayDay.note}` : ""}.</div>}
              {!moved && state === "train" && todayDay?.note && <div className="mt-2 rounded-xl bg-info/10 px-3 py-2 text-xs text-info">{todayDay.note}</div>}
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
                  .map((it) => ({ it, r: recommend(it.ex, it, lifts.hist, { deload, bodyKg: Number(s.settings.bodyKg) || null }) })).filter((x) => x.r.weightKg != null);
                return key.length ? (
                  <div className="mt-4 rounded-xl bg-card2 p-3">
                    <div className="mb-1.5 text-[11px] uppercase tracking-wide text-mute">Targets</div>
                    {key.map(({ it, r }) => (
                      <div key={it.ex} className="flex items-center justify-between py-0.5 text-sm">
                        <span className="truncate">{EXERCISES[it.ex].name}</span>
                        <span className={cx("num font-semibold", r.kind === "up" ? "text-acc" : r.kind === "down" ? "text-warn" : "text-ink")}>{kg(r.weightKg)} kg{EXERCISES[it.ex].pair ? "/hand" : ""} × {r.reps}</span>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
              {!s.active && (
                <Btn kind={state === "train" ? "primary" : "soft"} icon={Play} className="mt-5 w-full text-lg" onClick={() => { setTarget(next); setSheet("start"); }}>
                  {state === "train" ? "Start workout" : `Train anyway — ${next.dayName}`}
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

        {/* quick actions */}
        <div className="grid grid-cols-4 gap-2 md:col-span-3">
          <QuickCreatine d={d} />
          <a href="#/cardio" className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-card text-xs"><Footprints size={18} className="text-info" />Cardio</a>
          <a href="#/body" className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-card text-xs"><Scale size={18} className="text-mute" />Weigh in</a>
          <a href="#/extra" className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-card text-xs"><Dumbbell size={18} className="text-vio" />Grip & Wrist</a>
        </div>

        {/* 3. Key numbers */}
        <div className="grid grid-cols-2 gap-3 md:col-span-3 md:grid-cols-4">
          <Stat icon={Flame} tone="warn" value={d?.streak ?? 0} label={`workouts in a row · best ${d?.bestStreak ?? 0}`} />
          <Stat icon={TrendingUp} tone="acc" value={d?.adherence != null ? `${d.adherence}%` : "—"} label="adherence (done ÷ planned)" />
          <a href="#/cardio" className="block"><Stat icon={Footprints} tone="info" value={`${d?.cardioWeek?.sessions ?? 0}/3`} label={`cardio this week · ${d?.cardioWeek?.minutes ?? 0} min`} /></a>
          <Stat icon={Timer} value={s.thisWeek.minutes} label="minutes lifted · 7 days" />
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
        <Card title="Strength · 4 weeks" icon={TrendingUp} right={<a href="#/stats" className="inline-flex min-h-11 items-center text-xs font-normal text-info">all lifts →</a>}>
          {an ? <LiftTrends lifts={an.lifts} max={3} /> : <p className="text-sm text-mute">Loading…</p>}
        </Card>
        <Card title="Hard sets per week" icon={Dumbbell}>
          {an && p?.weeks.length ? <WeeklyTrend weeks={an.weeks} only="hardSets" /> : <p className="text-sm text-mute">Shows after your first workout.</p>}
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
      <MissedSheet open={sheet === "missed"} slot={target} onClose={() => setSheet(null)} onDone={() => { reload(); }} />
      <PickSheet open={sheet === "pick"} s={s} onClose={() => setSheet(null)} onPick={(x) => { setTarget(x); setSheet("start"); }} />
    </div>
  );
}

/** One tap: today's creatine dose. Shows ✓ when the target is reached. */
function QuickCreatine({ d }: { d: DashboardData | null }) {
  const g = d?.creatine?.today ?? 0, t = d?.creatine?.target ?? 5;
  const [busy, setBusy] = useState(false);
  if (g >= t) return <a href="#/creatine" className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-vio/15 text-xs text-vio"><FlaskConical size={18} />Creatine ✓</a>;
  return (
    <button disabled={busy} onClick={() => { setBusy(true); queue("POST", "/intake", { id: uid(), date: today(), item: "creatine", amount: t, unit: "g", at: Date.now() }, `intake ${Date.now()}`); track("creatine_add", { g: t }); setTimeout(() => setBusy(false), 2000); }}
      className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-card text-xs disabled:opacity-50">
      <span className="inline-flex items-center gap-0.5 text-vio"><Plus size={14} /><FlaskConical size={16} /></span>{t} g creatine
    </button>
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
