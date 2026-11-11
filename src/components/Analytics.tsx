// Dashboard analytics views (data: GET /api/analytics, formulas in worker/analytics.ts).
// One card = one topic; the "why / how it's counted" lives in a sheet behind a tap.
import { useState, type ReactNode } from "react";
import { ChevronRight, Info, Link2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { AnalyticsData, AnalyticsLink } from "../../shared/api";
import { Bars, Sparkline } from "./Chart";
import { Badge, Sheet } from "./ui";
import { cx } from "../lib/util";
import { useLoad } from "../lib/useLoad";
import { today } from "../lib/util";

export const useAnalytics = (ws: number) => useLoad<AnalyticsData>(`/analytics?today=${today()}&ws=${ws}`);

/** "3 Nov" — short week label that fits under a bar at 384 px. */
export const wkLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const sign = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}`;

/** Help sheet: the button is a ≥44 px tap target, the sheet holds the explanation. */
function Why({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="-m-2 inline-flex h-11 w-11 items-center justify-center text-info" aria-label={`How ${title} is calculated`}><Info size={16} aria-hidden /></button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title} icon={Info}><div className="space-y-2 text-sm text-mute">{children}</div></Sheet>
    </>
  );
}

// ---------------------------------------------------------------- strength trend per lift

export function LiftTrends({ lifts, max, onPick }: { lifts: AnalyticsData["lifts"]; max?: number; onPick?: (exKey: string) => void }) {
  if (!lifts.length) return <p className="text-sm text-mute">Shows once a lift has 2 sessions.</p>;
  return (
    <ul className="-mx-1">
      {lifts.slice(0, max).map((l) => {
        const c = l.change4w;
        const T = c == null || Math.abs(c) < 0.5 ? Minus : c > 0 ? TrendingUp : TrendingDown;
        return (
          <li key={l.exKey}>
            <button onClick={() => onPick?.(l.exKey)} disabled={!onPick} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left enabled:hover:bg-card2"
              aria-label={`${l.name}: estimated max ${l.e1rm} kg${c != null ? `, ${c} percent in 4 weeks` : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{l.name}</span>
                <span className="block text-xs text-mute num">{l.sessions} sessions · best {l.best} kg</span>
              </span>
              <Sparkline values={l.points.map((p) => p.e1rm)} />
              <span className="w-[4.5rem] text-right num">
                <span className="block text-sm font-semibold">{l.e1rm}<span className="text-xs font-normal text-mute"> kg{l.pair ? "/h" : ""}</span></span>
                <span className={cx("inline-flex items-center gap-0.5 text-xs", c == null ? "text-faint" : c >= 0.5 ? "text-acc" : c <= -0.5 ? "text-bad" : "text-mute")}>
                  <T size={12} />{c == null ? "new" : `${sign(c)}%`}
                </span>
              </span>
              {onPick && <ChevronRight size={16} className="text-faint" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function LiftTrendsHelp() {
  return (
    <Why title="Strength trend">
      <p><b className="text-ink">Number</b> = estimated 1-rep max from your latest session: best honest set, weight × (1 + reps ÷ 30) (Epley). Warm-ups, drop sets, rest-pause, cheated sets and sets over 12 reps are left out.</p>
      <p><b className="text-ink">%</b> = your best estimate in the last 4 weeks vs the best in the 4 weeks before. "new" = not enough history yet.</p>
      <p>The small line is your last 12 sessions. Dumbbell pairs are per hand. A dip in a deload week is planned, not a loss.</p>
    </Why>
  );
}

// ---------------------------------------------------------------- weekly trend (calendar weeks)

const WEEK_METRICS = {
  sessions: { label: "workouts", unit: "workouts", get: (w: AnalyticsData["weeks"][number]) => w.sessions },
  hardSets: { label: "hard sets", unit: "hard sets", get: (w: AnalyticsData["weeks"][number]) => w.hardSets },
  tonnage: { label: "tonnage", unit: "kg", get: (w: AnalyticsData["weeks"][number]) => w.tonnage },
  minutes: { label: "minutes", unit: "min / workout", get: (w: AnalyticsData["weeks"][number]) => w.minutes ?? 0 },
  prs: { label: "PRs", unit: "PRs", get: (w: AnalyticsData["weeks"][number]) => w.prs },
} as const;

export function WeeklyTrend({ weeks, only }: { weeks: AnalyticsData["weeks"]; only?: keyof typeof WEEK_METRICS }) {
  const [m, setM] = useState<keyof typeof WEEK_METRICS>(only ?? "hardSets");
  const first = weeks.findIndex((w) => w.sessions || w.missed || w.hardSets);
  const shown = first < 0 ? weeks.slice(-1) : weeks.slice(Math.min(first, weeks.length - 4)); // don't draw empty weeks before you started
  const M = WEEK_METRICS[m];
  return (
    <div>
      {!only && (
        <div className="mb-2 grid grid-cols-5 gap-0.5 rounded-full bg-card2 p-0.5 text-[11px]" role="group" aria-label="Measure">
          {(Object.keys(WEEK_METRICS) as (keyof typeof WEEK_METRICS)[]).map((k) => (
            <button key={k} aria-pressed={m === k} onClick={() => setM(k)} className={cx("min-h-11 truncate rounded-full px-1", m === k ? "bg-card3 font-semibold text-ink" : "text-mute")}>{WEEK_METRICS[k].label}</button>
          ))}
        </div>
      )}
      <Bars data={shown.map((w, i) => ({ x: i === shown.length - 1 ? "this wk" : wkLabel(w.start), y: M.get(w), label: m === "minutes" && w.minutes == null ? "no timed workouts" : undefined }))} unit={M.unit} fmt={m === "hardSets" ? (y) => String(y) : undefined} />
    </div>
  );
}

// ---------------------------------------------------------------- hard sets per muscle vs the research range

export function MuscleWeeks({ data }: { data: AnalyticsData["muscles"] }) {
  const weeks = data.weeks.slice(-4);
  const [i, setI] = useState<number | null>(null);
  const idx = i ?? weeks.length - 1;
  const w = weeks[idx];
  if (!w) return <p className="text-sm text-mute">Shows after your first workout.</p>;
  const max = 24;
  const isNow = idx === weeks.length - 1;
  return (
    <div>
      <div className="-mx-1 mb-3 flex flex-wrap gap-1 text-xs" role="group" aria-label="Week">
        {weeks.map((x, k) => (
          <button key={x.start} onClick={() => setI(k)} aria-pressed={k === idx} className={cx("min-h-11 rounded-full px-3", k === idx ? "bg-card3 font-semibold text-ink" : "text-mute")}>{k === weeks.length - 1 ? "This week" : wkLabel(x.start)}</button>
        ))}
      </div>
      <div className="space-y-1.5">
        {data.groups.map((g) => {
          const n = w.sets[g] ?? 0;
          const small = data.small.includes(g);
          // continuous saturation: more sets → stronger colour; over 20 = amber (more than most people recover from)
          const tone = small ? `color-mix(in srgb, var(--color-info) ${Math.round(35 + 55 * Math.min(1, n / 10))}%, transparent)` : n > 20 ? "var(--color-warn)" : `color-mix(in srgb, var(--color-acc) ${Math.round(30 + 70 * Math.min(1, n / 20))}%, transparent)`;
          return (
            <div key={g} className="flex items-center gap-2 text-xs" role="img" aria-label={`${g}: ${n} hard sets${small ? "" : ", target 10 to 20"}`}>
              <span className="w-24 shrink-0 truncate text-mute">{g}</span>
              <div className="relative h-4 flex-1 rounded bg-card2">
                {!small && <div className="absolute inset-y-0 border-x border-dashed border-faint/70" style={{ left: `${(10 / max) * 100}%`, width: `${(10 / max) * 100}%` }} />}
                <div className="relative h-4 rounded" style={{ width: `${Math.min(100, (n / max) * 100)}%`, background: tone }} />
              </div>
              <span className="w-8 text-right font-semibold num">{n}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-mute">Dashed box = 10-20 sets a week for the big muscles. Blue = small muscles (no fixed target).{isNow ? " This week is still running." : ""}</p>
    </div>
  );
}

export function MuscleHelp() {
  return (
    <Why title="Hard sets per muscle">
      <p><b className="text-ink">Counted per calendar week</b>, not program week, so blocks never mix.</p>
      <p><b className="text-ink">A hard set</b> = a normal or failure set with 0-4 reps left (RIR 5+ is too easy to count). Warm-ups = 0. A drop-set or rest-pause chain adds <b className="text-ink">½ set</b> to the set before it, however many drops (it extends that set; it isn't a new one).</p>
      <p><b className="text-ink">Fractional sets</b>: a set counts 1 for the muscle it mainly trains and ½ for muscles it helps (bench = 1 chest, ½ triceps, ½ shoulders), the method used in the 2024 dose-response meta-analysis by Pelland et al.</p>
      <p><b className="text-ink">10-20 a week</b> is the common evidence-based range for growth in big muscles. Gains keep rising with more sets but with diminishing returns, and even ~4 sets a week grows muscle. Over 20 is fine short-term (overload week), just watch recovery.</p>
    </Why>
  );
}

// ---------------------------------------------------------------- effort (RIR) mix

const RIR_TONE = ["var(--color-acc)", "var(--color-acc)", "color-mix(in srgb, var(--color-acc) 70%, transparent)", "color-mix(in srgb, var(--color-acc) 45%, transparent)", "var(--color-warn)", "var(--color-faint)"];

export function EffortMix({ effort }: { effort: AnalyticsData["effort"] }) {
  if (effort.logged < 5) return <p className="text-sm text-mute">Rate RIR after your sets; the mix shows after 5 rated sets.</p>;
  const pct = (n: number) => Math.round((n / effort.logged) * 100);
  const productive = pct(effort.rir.slice(0, 4).reduce((a, b) => a + b, 0));
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-2xl font-bold num">{productive}%</span>
        <span className="text-xs text-mute num">of {effort.logged} rated sets at 0-3 RIR</span>
      </div>
      <div className="flex h-4 overflow-hidden rounded bg-card2" role="img" aria-label={effort.rir.map((n, i) => `RIR ${i === 5 ? "5+" : i}: ${pct(n)}%`).join(", ")}>
        {effort.rir.map((n, i) => n ? <span key={i} style={{ width: `${(n / effort.logged) * 100}%`, background: RIR_TONE[i] }} className="border-r border-card last:border-0" /> : null)}
      </div>
      <div className="mt-2 grid grid-cols-6 text-center text-[11px] text-mute num">
        {effort.rir.map((n, i) => <span key={i}><span className="block text-ink">{pct(n)}%</span>{i === 5 ? "5+" : i}</span>)}
      </div>
      <p className="mt-2 text-xs text-mute">RIR rated on {Math.round((effort.logged / Math.max(1, effort.total)) * 100)}% of working sets. Most growth comes from sets 0-3 reps from failure; people usually guess about 1 rep too many left, so a 3 is often a 2.</p>
    </div>
  );
}

// ---------------------------------------------------------------- "what goes with good sessions"

const fmtV = (v: number, unit: AnalyticsLink["unit"]) => (unit === "%" ? `${sign(v)}%` : `${v} rep${Math.abs(v) === 1 ? "" : "s"}`);

/** Two group means on one axis around "your usual" (0): a dot plot reads faster than two numbers. */
function DotPlot({ l }: { l: AnalyticsLink }) {
  const span = Math.max(2, Math.abs(l.hi.mean), Math.abs(l.lo.mean)) * 1.15;
  const lo = l.unit === "%" ? -span : 0, hi = l.unit === "%" ? span : Math.max(1, l.hi.mean, l.lo.mean) * 1.15;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const goodHi = l.better === "higher" ? l.hi.mean >= l.lo.mean : l.hi.mean <= l.lo.mean;
  const rows = [{ g: l.hi, good: goodHi }, { g: l.lo, good: !goodHi }];
  return (
    <div className="space-y-3">
      {rows.map(({ g, good }) => (
        <div key={g.label}>
          <div className="mb-1 flex justify-between text-xs"><span>{g.label} <span className="text-mute num">· {g.n}</span></span><span className={cx("font-semibold num", good ? "text-acc" : "text-mute")}>{fmtV(g.mean, l.unit)}</span></div>
          <div className="relative h-3 rounded bg-card2">
            {l.unit === "%" && <span className="absolute inset-y-0 w-px bg-faint" style={{ left: x(0) }} />}
            <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card" style={{ left: x(g.mean), background: good ? "var(--color-acc)" : "var(--color-mute)" }} />
          </div>
        </div>
      ))}
      {l.unit === "%" && <div className="flex justify-between text-[10px] text-faint"><span>worse than usual</span><span>usual</span><span>better</span></div>}
    </div>
  );
}

export function Links({ data }: { data: AnalyticsData }) {
  const [sel, setSel] = useState<AnalyticsLink | null>(null);
  const { links, pending, perfSessions } = data;
  return (
    <div>
      {links.length ? (
        <ul className="-mx-1">
          {links.map((l) => {
            const goodFirst = (l.better === "higher") === (l.diff >= 0);
            const a = goodFirst ? l.hi : l.lo, b = goodFirst ? l.lo : l.hi;
            return (
              <li key={l.id}>
                <button onClick={() => setSel(l)} className="flex min-h-12 w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left hover:bg-card2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{l.label}</span>
                    <span className="block text-xs text-mute num">{a.label} {fmtV(a.mean, l.unit)} vs {fmtV(b.mean, l.unit)} <span className="text-faint">· n {a.n}+{b.n}</span></span>
                  </span>
                  {l.clear ? <Badge tone="info">pattern</Badge> : <Badge>maybe chance</Badge>}
                  <ChevronRight size={16} className="text-faint" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-mute">Nothing to compare yet. Each comparison needs at least 3 workouts on both sides.</p>
      )}
      {pending.length > 0 && <p className="mt-2 text-xs text-faint">Collecting: {pending.map((p) => `${p.label.toLowerCase()} (${p.have}/${p.need} on the smaller side)`).join(" · ")}.</p>}
      <p className="mt-2 text-xs text-mute">Based on {perfSessions} workouts compared with your own recent level. Associations in your data, not proof of cause.</p>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.label} icon={Link2}>
        {sel && (
          <div className="space-y-4">
            <DotPlot l={sel} />
            <div className="space-y-2 text-sm text-mute">
              {sel.unit === "%" ? (
                <p><b className="text-ink">Performance</b> = how your lifts went vs your own recent level: for every lift, the session's best estimated max (reps + reps left, max 3) ÷ the median of that lift's previous 3 sessions, averaged. 0% = a normal day. Deload weeks are left out.</p>
              ) : (
                <p><b className="text-ink">Reps lost</b> = reps on a set minus reps on the next set at the same weight, by the real rest you took between them. Fewer lost = better recovered.</p>
              )}
              <p>{sel.clear ? "The gap is bigger than twice its uncertainty, so it's worth paying attention to." : "The gap is small for this many workouts; it may be chance. More data will tell."} Workouts close together aren't independent and other things change at the same time (program week, time of day), so treat this as a hint to test, not a rule.</p>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- recent PRs

export function RecentPRs({ prs }: { prs: AnalyticsData["prs"] }) {
  if (!prs.length) return <p className="text-sm text-mute">Records light up with a 🏆 while you train; the latest show here.</p>;
  return (
    <ul className="text-sm">
      {prs.map((p, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-line/60 py-1.5 last:border-0">
          <span className="w-14 shrink-0 text-xs text-mute">{wkLabel(p.date)}</span>
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          <span className="num font-semibold">{p.kg != null && p.reps != null ? `${p.kg} × ${p.reps}` : p.reps != null ? `${p.reps} reps` : "—"}</span>
        </li>
      ))}
    </ul>
  );
}
