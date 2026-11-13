import { useEffect, useState } from "react";
import { CalendarOff, CalendarRange, Dumbbell, Eye, Flame, FlaskConical, Footprints, HandFist, House, Lightbulb, Play, Plus, Timer, TrendingUp, Weight, type LucideIcon } from "lucide-react";
import type { AppState, DashboardData, InsightsData, Lifts, ProgressData, SlotInfo } from "../../shared/api";
import { recommend } from "../../shared/recommend";
import { kg } from "../lib/util";
import { InsightList } from "../components/Insights";
import { useProgram } from "../lib/program";
import { EXERCISES } from "../../program/exercises";
import { queue, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { clock, cx, niceDate, today } from "../lib/util";
import { Btn, Card, MoreLink, PageHead, SectionHead, Thumb } from "../components/ui";
import { weekConfig } from "../../shared/week";
import { Heatmap } from "../components/Heatmap";
import { Avatar } from "../components/Avatar";
import { useMe } from "../lib/me";
import { LineChart } from "../components/Chart";
import { LiftTrends, WeeklyTrend, useAnalytics } from "../components/Analytics";
import { MissedSheet, PickSheet, StartSheet } from "../components/StartSheets";
import { WorkoutPreview } from "../components/WorkoutPreview";
import { WeekPlanner, useNextSession, useWeekPlan } from "../components/WeekPlanner";
import { sportById } from "../../shared/lists";

export default function Home() {
  const me = useMe();
  const { data: s, error, reload } = useLoad<AppState>("/state");
  const { data: d } = useLoad<DashboardData>(`/dashboard?today=${today()}`);
  const { data: p } = useLoad<ProgressData>("/progress");
  const { data: ins } = useLoad<InsightsData>(`/insights?today=${today()}`);
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const [sheet, setSheet] = useState<null | "start" | "missed" | "pick" | "preview">(null);
  const [target, setTarget] = useState<SlotInfo | null>(null);
  const { plan: wp } = useWeekPlan();
  const adapted = useNextSession();
  const { data: an } = useAnalytics(s ? weekConfig(s.settings, s.schedules).weekStart : 1);
  const program = useProgram(); // the plan this user trains (default = CURRENT)

  if (!s) return <p className="py-20 text-center text-mute">{error ?? "Loading…"}</p>;
  // TODAY follows the adapted week (football, moved sessions, rest), never a fixed weekday
  const todayDay = wp?.days.find((x) => x.today) ?? null;
  const nextPlanned = wp?.days.find((x) => x.kind === "planned" && !x.today) ?? null;
  const slotOf = (key?: string | null) => (key && s.next ? s.slots.find((x) => x.week === s.next!.week && x.dayKey === key) ?? null : null);
  const state: "train" | "rest" | "football" | "done" | "busy" = !todayDay ? "train" : todayDay.kind === "planned" ? "train" : todayDay.kind === "football" || todayDay.kind === "sport" ? "football" : todayDay.kind === "done" ? "done" : todayDay.kind === "busy" ? "busy" : "rest";
  const next = (state === "train" ? slotOf(wp?.todayKey) : null) ?? adapted.next ?? s.next;
  const moved = state === "train" && next && s.next && next.dayKey !== s.next.dayKey;
  const week = next ? s.weeks.find((w) => w.n === next.week) : null;
  const weekStart = weekConfig(s.settings, s.schedules).weekStart;
  const dayPlan = next ? program.weeks.find((w) => w.n === next.week)?.days.find((x) => x.key === next.dayKey) : null;
  const weekdayOf = (iso?: string) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : "");
  const name = (me?.name || s.settings.profileName || "").split(" ")[0];
  const hello = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <PageHead icon={House} title={name ? `${hello}, ${name}` : "Home"} sub={`${new Date().toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })} · ${s.program.name.replace(/\s*v\d+$/, "")} · v${s.program.version}`}
        right={<a href="#/profile" className="-m-1 rounded-full p-1 md:hidden" aria-label="Your profile"><Avatar id={me?.avatarId} name={me?.name ?? me?.username} size={40} /></a>} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* 1. TODAY — the one main action */}
        <div className="md:col-span-2">
          {s.active && <ActiveCard a={s.active} />}
          {!s.active && state !== "train" && (
            <section className={cx("mb-3 rounded-2xl p-5", state === "football" ? "bg-warn/10" : state === "done" ? "bg-acc/10" : "bg-card")}>
              <div className="text-xs font-medium uppercase tracking-wide text-mute">Today</div>
              <div className={cx("mt-1 text-2xl font-bold", state === "football" ? "text-warn" : state === "done" ? "text-acc" : "")}>
                {state === "football" ? `${sportById(todayDay?.sport)?.emoji ?? "🏅"} ${sportById(todayDay?.sport)?.label ?? "Sport"} day` : state === "done" ? `Done: ${todayDay?.dayName} ✓` : state === "busy" ? "Busy day" : "Rest day"}
              </div>
              <p className="mt-1 text-sm text-mute">
                {state === "football" ? "No lifting — it's your cardio today. Log it from This week (tap today)." : state === "done" ? "Great work. Recover: protein, sleep, creatine." : todayDay?.note ?? "Recovery is where you grow. A walk or mobility is perfect."}
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
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Btn kind="soft" stack icon={Eye} onClick={() => { setTarget(next); setSheet("preview"); track("preview_open", { from: "home", dayKey: next.dayKey }); }}>Preview</Btn>
                <Btn kind="soft" stack icon={CalendarOff} onClick={() => { setTarget(next); setSheet("missed"); }}>Can't train</Btn>
                <Btn kind="soft" stack icon={CalendarRange} onClick={() => setSheet("pick")}>Other day</Btn>
              </div>
            </section>
          ) : (
            <Card>
              <div className="text-2xl font-bold">{s.block?.name ?? "This month"} complete 🎉</div>
              <p className="mt-2 text-sm text-mute">Log your re-tests, say “review” to Claude for the next version, then start the next month — the plan goes back to Week 1 with your weights carried over.</p>
              <Btn kind="primary" className="mt-3 w-full" onClick={() => { location.hash = "/months"; }}>Start the next month</Btn>
            </Card>
          )}
        </div>

        {/* 2. This week (adaptive) */}
        <div><WeekPlanner compact /></div>
      </div>

      {/* 3. Quick log: one-tap daily tracking */}
      <SectionHead>Quick log</SectionHead>
      <div className="grid grid-cols-4 gap-2">
        <QuickCreatine d={d} />
        <Tile href="#/cardio" icon={Footprints} tone="text-info">Cardio</Tile>
        <Tile href="#/body" icon={Weight}>Weigh in</Tile>
        <Tile href="#/extra" icon={HandFist}>Grip & Wrist</Tile>
      </div>

      {/* 4. Key numbers: one card, four figures (less chrome than four cards) */}
      <SectionHead right={<MoreLink href="#/stats" label="All stats">Stats</MoreLink>}>At a glance</SectionHead>
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line md:grid-cols-4">
        <Figure icon={Flame} tone="text-warn" value={d?.streak ?? 0} label={`workouts in a row · best ${d?.bestStreak ?? 0}`} />
        <Figure icon={TrendingUp} tone="text-acc" value={d?.adherence != null ? `${d.adherence}%` : "—"} label="adherence (done ÷ planned)" />
        <Figure icon={Footprints} tone="text-info" value={`${d?.cardioWeek?.sessions ?? 0}/3`} label={`cardio this week · ${d?.cardioWeek?.minutes ?? 0} min`} href="#/cardio" />
        <Figure icon={Timer} value={s.thisWeek.minutes} label="minutes lifted · 7 days" />
      </section>

      {/* 5. Insights: the few things worth acting on */}
      <Card title="Insights" icon={Lightbulb} className="mt-3" right={<MoreLink href="#/stats" label="All insights in Stats">All</MoreLink>}>
        {ins ? <InsightList items={ins.insights} max={3} /> : <p className="text-sm text-mute">Loading…</p>}
      </Card>

      {/* 6. Progress: trends + consistency, all secondary */}
      <SectionHead>Progress</SectionHead>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card title="Strength · 4 weeks" icon={TrendingUp} right={<MoreLink href="#/stats" label="All lifts in Stats">All lifts</MoreLink>}>
          {an ? <LiftTrends lifts={an.lifts} max={3} /> : <p className="text-sm text-mute">Loading…</p>}
        </Card>
        <Card title="Hard sets per week" icon={Dumbbell}>
          {an && p?.weeks.length ? <WeeklyTrend weeks={an.weeks} only="hardSets" /> : <p className="text-sm text-mute">Shows after your first workout.</p>}
        </Card>
        <Card title="Bodyweight" icon={Weight}>
          {d && d.body.length > 1 ? (
            <LineChart points={d.body.map((b) => ({ x: niceDate(b.date), y: b.weightKg ?? 0 }))} unit="kg" height={110} />
          ) : (
            <p className="text-sm text-mute">Weigh in whenever you like (weekly is enough) in Body & habits to see the trend.</p>
          )}
        </Card>
        <Card title="Training calendar" icon={CalendarRange} className="md:col-span-3">
          <Heatmap days={d?.days} weekStart={weekStart} />
        </Card>
      </div>

      {sheet === "preview" && target && <WorkoutPreview week={target.week} dayKey={target.dayKey} onClose={() => setSheet(null)} onStart={() => setSheet("start")} />}
      <StartSheet open={sheet === "start"} slot={target} kind={target && target.dayKey !== s.next?.dayKey && target.dayKey !== adapted.next?.dayKey ? (target.status === "open" ? "picked" : "extra") : "planned"} onClose={() => setSheet(null)} />
      <MissedSheet open={sheet === "missed"} slot={target} onClose={() => setSheet(null)} onDone={() => { reload(); }} />
      <PickSheet open={sheet === "pick"} s={s} onClose={() => setSheet(null)} onPick={(x) => { setTarget(x); setSheet("start"); }} />
    </div>
  );
}

/** One tap: today's creatine dose. Shows ✓ when the target is reached. */
function QuickCreatine({ d }: { d: DashboardData | null }) {
  const g = d?.creatine?.today ?? 0, t = d?.creatine?.target ?? 5;
  const [busy, setBusy] = useState(false);
  if (g >= t) return <a href="#/creatine" aria-label={`Creatine done today, ${g} grams`} className={cx(TILE, "bg-vio/15 font-semibold text-vio")}><FlaskConical size={20} aria-hidden />Creatine ✓</a>;
  return (
    <button disabled={busy} aria-label={`Log ${t} grams of creatine`} onClick={() => { setBusy(true); queue("POST", "/intake", { id: uid(), date: today(), item: "creatine", amount: t, unit: "g", at: Date.now() }, `intake ${Date.now()}`); track("creatine_add", { g: t }); setTimeout(() => setBusy(false), 2000); }}
      className={cx(TILE, "bg-card hover:bg-card2 disabled:opacity-50")}>
      <span className="inline-flex items-center gap-0.5 text-vio" aria-hidden><Plus size={14} /><FlaskConical size={18} /></span>{t} g creatine
    </button>
  );
}

const TILE = "flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-center text-xs leading-tight";

/** Quick-log tile: icon over a short label, same size as the creatine button. */
function Tile({ href, icon: Icon, tone = "text-ink", children }: { href: string; icon: LucideIcon; tone?: string; children: string }) {
  return (
    <a href={href} className={cx(TILE, "bg-card hover:bg-card2")}>
      <Icon size={20} className={tone} aria-hidden />
      {children}
    </a>
  );
}

/** One figure in the "At a glance" card: icon, big number, label. Optional link. */
function Figure({ icon: Icon, tone = "text-mute", value, label, href }: { icon: LucideIcon; tone?: string; value: React.ReactNode; label: string; href?: string }) {
  const body = (
    <>
      <Icon size={18} className={tone} aria-hidden />
      <div className="mt-2 text-2xl font-bold num">{value}</div>
      <div className="text-xs text-mute">{label}</div>
    </>
  );
  return href ? <a href={href} className="block bg-card p-4 hover:bg-card2">{body}</a> : <div className="bg-card p-4">{body}</div>;
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
