import { useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bell, CalendarClock, CheckCircle2, Clock, Database, ClipboardList, Dumbbell, Info, LayoutList, MessageCircle,
  Newspaper, Trophy, UserPlus, Users, XCircle, Zap, type LucideIcon,
} from "lucide-react";
import { Chips } from "../ui";
import { UserAvatar } from "../social/UserAvatar";
import { cx } from "../../lib/util";
import { ChartCard, ColumnChart, DataTable, HourHeatmap, Kpi, Meter, RankBars, Skeleton, WeekGrid } from "./charts";
import { bytes, compact, evLabel, fmt, shortDay, type Overview as O, type Tone } from "./lib";

const TONE_ICON: Record<Tone, [LucideIcon, string]> = {
  good: [CheckCircle2, "text-acc"], warn: [AlertTriangle, "text-warn"], bad: [XCircle, "text-bad"], info: [Info, "text-info"],
};

export function Insights({ items }: { items: O["insights"] }) {
  return (
    <section className="rounded-2xl border border-line/60 bg-card p-4" aria-labelledby="ins-h">
      <h2 id="ins-h" className="mb-2 flex items-center gap-2 text-sm font-semibold"><Zap size={16} className="text-warn" aria-hidden /> Insights</h2>
      <ul className="grid gap-x-6 md:grid-cols-2">
        {items.map((it, i) => {
          const [I, c] = TONE_ICON[it.tone];
          return (
            <li key={i} className="flex items-start gap-2.5 border-t border-line/40 py-2 text-sm first:border-0 md:[&:nth-child(2)]:border-0">
              <I size={16} className={cx("mt-0.5 shrink-0", c)} aria-label={it.tone === "bad" ? "Alert" : it.tone === "warn" ? "Watch" : it.tone === "good" ? "Good" : "Info"} />
              <span>{it.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-36" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-56" />)}</div>
    </div>
  );
}

export default function Overview({ data: o, onOpenUser }: { data: O; onOpenUser: (id: string) => void }) {
  const [range, setRange] = useState<30 | 90>(30);
  const k = o.kpis;
  const days = <T extends { d: string; n: number }>(a: T[]) => a.slice(-range).map((x) => ({ label: shortDay(x.d), value: x.n, long: shortDay(x.d) }));
  const dayTable = (a: { d: string; n: number }[], col: string) => ({ cols: ["Day", col], rows: a.slice(-range).reverse().map((x) => [x.d, x.n]) });
  const weekly = o.weeks.map((w) => ({ label: shortDay(w.start), long: `7 days from ${shortDay(w.start)}` }));
  const spark = (a: { n: number }[]) => a.slice(-14).map((x) => x.n);
  const usedPct = (k.storageBytes / k.storageLimit) * 100;

  return (
    <div className="space-y-4">
      <Insights items={o.insights} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Users} tone="info" label="People" value={fmt(k.users)} sub={k.suspended ? `${k.suspended} suspended` : "accounts"} />
        <Kpi icon={Activity} tone="info" label="Active today" value={fmt(k.activeToday)} sub={`of ${k.users}`} spark={spark(o.dau)} />
        <Kpi icon={Activity} tone="info" label="Active 7 days" value={fmt(k.active7)} sub={`${k.users ? Math.round((k.active7 / k.users) * 100) : 0}% of people`} />
        <Kpi icon={Activity} tone="info" label="Active 30 days" value={fmt(k.active30)} sub={`${k.users ? Math.round((k.active30 / k.users) * 100) : 0}% of people`} />
        <Kpi icon={Dumbbell} label="Workouts, 7 days" value={fmt(k.workoutsWeek)} delta={{ now: k.workoutsWeek, prev: k.workoutsPrev, vs: "prev 7d" }} spark={o.weeks.map((w) => w.workouts)} />
        <Kpi icon={BarChart3} label="Sets, 7 days" value={compact(k.setsWeek)} delta={{ now: k.setsWeek, prev: k.setsPrev, vs: "prev 7d" }} spark={o.weeks.map((w) => w.sets)} />
        <Kpi icon={MessageCircle} tone="info" label="Messages today" value={fmt(k.messagesToday)} delta={{ now: k.messagesToday, prev: k.messagesYesterday, vs: "yesterday" }} spark={spark(o.messagesDaily)} />
        <Kpi icon={Newspaper} tone="info" label="Posts" value={fmt(k.posts)} sub={`${fmt(k.photos)} photos · ${fmt(k.push)} push devices`} />
      </div>

      <section className="rounded-2xl border border-line/60 bg-card p-4" aria-labelledby="st-h">
        <div className="mb-2 flex items-baseline gap-2">
          <Database size={16} className="shrink-0 self-center text-vio" aria-hidden />
          <h2 id="st-h" className="flex-1 text-sm font-semibold">Database storage</h2>
          <span className="text-sm"><b className="num">{bytes(k.storageBytes)}</b> <span className="text-mute">of 500 MB free</span></span>
        </div>
        <Meter value={k.storageBytes} max={k.storageLimit} label="Database storage used" />
        <p className="mt-1.5 text-xs text-mute">{usedPct < 0.1 ? "<0.1" : usedPct.toFixed(1)}% used{k.storageExact ? "" : " (estimate)"} · amber at 50%, red at 80%</p>
      </section>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <h2 className="flex-1 text-xs font-semibold uppercase tracking-wide text-mute">Trends</h2>
        <div role="group" aria-label="Range for daily charts"><Chips small clearable={false} options={[{ id: 30, label: "30 days" }, { id: 90, label: "90 days" }]} value={range} onChange={(v) => v && setRange(v)} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Daily active people" sub="Anyone who opened, logged, posted or messaged" icon={Activity} table={dayTable(o.dau, "People")}>
          <ColumnChart data={days(o.dau)} unit="people" tone="info" />
        </ChartCard>
        <ChartCard title="Workouts per day" sub="Finished sessions, all people" icon={Dumbbell} table={dayTable(o.workoutsDaily, "Workouts")}>
          <ColumnChart data={days(o.workoutsDaily)} unit="workouts" />
        </ChartCard>
        <ChartCard title="Sets per week" sub="Rolling 7-day blocks, last 12" icon={BarChart3} table={{ cols: ["Week from", "Sets", "Workouts"], rows: [...o.weeks].reverse().map((w) => [w.start, w.sets, w.workouts]) }}>
          <ColumnChart data={o.weeks.map((w, i) => ({ ...weekly[i], value: w.sets }))} unit="sets" />
        </ChartCard>
        <ChartCard title="Volume per week" sub="kg × reps, all people" icon={Trophy} table={{ cols: ["Week from", "Volume kg"], rows: [...o.weeks].reverse().map((w) => [w.start, Math.round(w.volume)]) }}>
          <ColumnChart data={o.weeks.map((w, i) => ({ ...weekly[i], value: w.volume }))} unit="kg" />
        </ChartCard>
        <ChartCard title="Messages per day" sub="Count only, never content" icon={MessageCircle} table={dayTable(o.messagesDaily, "Messages")}>
          <ColumnChart data={days(o.messagesDaily)} unit="messages" tone="info" />
        </ChartCard>
        <ChartCard title="Posts per day" sub="Feed posts" icon={Newspaper} table={dayTable(o.postsDaily, "Posts")}>
          <ColumnChart data={days(o.postsDaily)} unit="posts" tone="info" />
        </ChartCard>
        <ChartCard title="Sign-ups" sub="New accounts per month" icon={UserPlus} table={{ cols: ["Month", "New", "Total"], rows: [...o.signups].reverse().map((s) => [s.m, s.n, s.total]) }}>
          <ColumnChart data={o.signups.map((s) => ({ label: shortDay(s.m), value: s.n, long: `${shortDay(s.m)} · ${s.total} total` }))} unit="new accounts" tone="info" valueFmt={fmt} />
        </ChartCard>
        <ChartCard title="Feature usage" sub="Top actions, last 30 days" icon={LayoutList} table={{ cols: ["Action", "Times", "People"], rows: o.features.map((f) => [evLabel(f.type), f.n, f.users]) }}>
          {o.features.length ? <RankBars items={o.features.slice(0, 8).map((f) => ({ label: evLabel(f.type), value: f.n, sub: `${f.users} ${f.users === 1 ? "person" : "people"}` }))} unit="times" /> : <p className="text-sm text-mute">No actions yet.</p>}
        </ChartCard>
      </div>

      <ChartCard title="When people train" sub="Sets logged by weekday and hour (your time zone), last 90 days" icon={Clock}
        table={{ cols: ["Weekday", "Hour", "Sets"], rows: [...o.heatmap].sort((a, b) => b.n - a.n).map((c) => [["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][c.wd], `${c.h}:00`, c.n]) }}>
        <HourHeatmap cells={o.heatmap} />
      </ChartCard>

      <div className="grid gap-4 md:grid-cols-5">
        <ChartCard className="md:col-span-3" title="Weekly consistency" sub="Workouts per week, last 8 weeks" icon={CalendarClock}
          table={{ cols: ["Person", ...o.weekStarts.map((w) => w.slice(5))], rows: o.leaderboard.map((b) => [b.name || b.username, ...b.weeks]) }}>
          <WeekGrid weeks={o.weekStarts} rows={o.leaderboard.map((b) => ({ id: b.id, name: b.name || b.username, weeks: b.weeks, label: <button type="button" onClick={() => onOpenUser(b.id)} className="truncate text-left hover:underline">{b.name || b.username}</button> }))} />
        </ChartCard>
        <ChartCard className="md:col-span-2" title="How many weeks people trained" sub="Out of the last 8" icon={BarChart3} table={{ cols: ["Weeks trained", "People"], rows: o.consistency.map((c) => [c.weeks, c.users]) }}>
          <ColumnChart data={o.consistency.map((c) => ({ label: String(c.weeks), value: c.users, long: `${c.weeks} of 8 weeks` }))} unit="people" valueFmt={fmt} height={110} />
        </ChartCard>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <section className="min-w-0 rounded-2xl border border-line/60 bg-card p-4 md:col-span-3" aria-labelledby="lb-h">
          <h3 id="lb-h" className="mb-3 flex items-center gap-2 text-sm font-semibold"><Trophy size={16} className="text-mute" aria-hidden /> Most active, last 30 days</h3>
          <ol className="divide-y divide-line/40">
            {o.leaderboard.slice(0, 8).map((b, i) => (
              <li key={b.id}>
                <button type="button" onClick={() => onOpenUser(b.id)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-1 text-left hover:bg-card2">
                  <span className="w-5 shrink-0 text-center text-sm font-semibold text-mute num">{i + 1}</span>
                  <UserAvatar id={b.avatarId} name={b.name ?? b.username} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{b.name || b.username}</span>
                    <span className="block truncate text-xs text-mute">{b.activeDays30} active days · {b.prs30} PRs</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-mute num"><b className="text-sm text-ink">{b.workouts30}</b> workouts<br />{fmt(b.sets30)} sets</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <ChartCard className="md:col-span-2" title="Plans in use" sub="People per plan" icon={ClipboardList} table={{ cols: ["Plan", "Template", "People"], rows: o.plans.map((p) => [p.name, p.template, p.users]) }}>
          <RankBars tone="acc" items={o.plans.map((p) => ({ label: p.name, value: p.users, sub: p.template !== "-" && p.template !== p.name ? p.template : undefined }))} unit="people" fmtValue={fmt} />
        </ChartCard>
      </div>

      <details className="rounded-2xl border border-line/60 bg-card p-4">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold"><Bell size={16} className="text-mute" aria-hidden /> All numbers as a table</summary>
        <div className="mt-3">
          <DataTable cols={["Person", "Workouts 7d", "Workouts 30d", "Sets 30d", "Volume 30d", "PRs 30d", "Active days 30d"]}
            rows={o.leaderboard.map((b) => [b.name || b.username, b.workouts7, b.workouts30, b.sets30, b.volume30, b.prs30, b.activeDays30])} />
        </div>
      </details>
    </div>
  );
}
