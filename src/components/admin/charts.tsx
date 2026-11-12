import { useState, type ReactNode, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus, Table2 } from "lucide-react";
import { useWidth } from "../../lib/useWidth";
import { cx, heat } from "../../lib/util";
import { compact, fmt } from "./lib";

// Admin charts (dataviz rules): one hue per chart with one meaning (green = training, blue = social/usage,
// violet = storage), thin columns (≤24 px, 4 px rounded data-end, 2 px gap), hairline solid gridlines, clean y ticks,
// a live readout on hover / tap / arrow keys, a <title> per mark, and a table twin behind the "Table" toggle.

export type ToneName = "acc" | "info" | "vio" | "warn";
const TONE: Record<ToneName, string> = { acc: "var(--color-acc)", info: "var(--color-info)", vio: "var(--color-vio)", warn: "var(--color-warn)" };

/** Clean axis maximum + step (1/2/5 × 10^k) for ~3 gridlines. */
function niceScale(max: number) {
  if (max <= 0) return { top: 1, step: 1 };
  const raw = max / 3;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const s = Math.max(step, max < 3 ? 1 : step);
  return { top: Math.ceil(max / s) * s, step: s };
}

/** Card with a title, a one-line subtitle and a Chart ⇄ Table toggle (the table is the accessible twin). */
export function ChartCard({ title, sub, icon: Icon, children, table, className, right }: {
  title: string; sub?: string; icon?: LucideIcon; children: ReactNode; className?: string; right?: ReactNode;
  table?: { cols: string[]; rows: (string | number)[][] };
}) {
  const [tab, setTab] = useState(false);
  return (
    <section className={cx("min-w-0 rounded-2xl border border-line/60 bg-card p-4", className)}>
      <div className="mb-3 flex items-start gap-2">
        {Icon && <Icon size={16} className="mt-0.5 shrink-0 text-mute" aria-hidden />}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {sub && <p className="truncate text-xs text-mute">{sub}</p>}
        </div>
        {right}
        {table && (
          <button type="button" onClick={() => setTab(!tab)} aria-pressed={tab} aria-label={tab ? "Show chart" : "Show as table"}
            className={cx("-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tab ? "bg-card2 text-ink" : "text-mute hover:bg-card2 hover:text-ink")}>
            <Table2 size={16} aria-hidden />
          </button>
        )}
      </div>
      {tab && table ? <DataTable cols={table.cols} rows={table.rows} /> : children}
    </section>
  );
}

export function DataTable({ cols, rows, max = 400 }: { cols: string[]; rows: (string | number)[][]; max?: number }) {
  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-line/60">
      <table className="w-full text-left text-xs num">
        <thead className="sticky top-0 bg-card2 text-mute">
          <tr>{cols.map((c, i) => <th key={c} scope="col" className={cx("px-3 py-2 font-medium", i > 0 && "text-right")}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i} className="border-t border-line/40">
              {r.map((v, j) => <td key={j} className={cx("px-3 py-1.5", j > 0 && "text-right")}>{typeof v === "number" ? fmt(Math.round(v * 10) / 10) : v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Columns over time (one series). Readout above shows the hovered / focused / latest value. */
export function ColumnChart({ data, unit, tone = "acc", height = 132, valueFmt = compact, describe }: {
  data: { label: string; value: number; long?: string }[]; unit: string; tone?: ToneName; height?: number; valueFmt?: (n: number) => string; describe?: string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  if (!data.length) return <div ref={ref} className="h-24" />;
  const sel = hi ?? data.length - 1;
  const max = Math.max(...data.map((d) => d.value));
  const { top, step } = niceScale(max);
  const pad = { l: 34, r: 4, t: 6, b: 20 };
  const H = height + pad.t + pad.b;
  const plotW = Math.max(40, W - pad.l - pad.r);
  const slot = plotW / data.length;
  const bw = Math.max(1, Math.min(24, slot - 2));
  const y = (v: number) => pad.t + (1 - v / top) * height;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(plotW / 56)));
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) * (W / r.width) - pad.l) / slot);
    setHi(Math.max(0, Math.min(data.length - 1, i)));
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") { setHi(Math.max(0, sel - 1)); e.preventDefault(); }
    if (e.key === "ArrowRight") { setHi(Math.min(data.length - 1, sel + 1)); e.preventDefault(); }
    if (e.key === "Home") setHi(0);
    if (e.key === "End") setHi(data.length - 1);
  };
  const cur = data[sel];
  return (
    <div ref={ref}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm" aria-live="polite">
        <span><span className="font-semibold num">{valueFmt(cur.value)}</span> <span className="text-xs text-mute">{unit}</span></span>
        <span className="truncate text-xs text-mute">{cur.long ?? cur.label}</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block touch-none select-none outline-none focus-visible:outline-2 focus-visible:outline-acc"
        role="img" tabIndex={0} aria-label={describe ?? `${data.length} ${unit} values, latest ${valueFmt(data[data.length - 1].value)}. Use arrow keys to read each value.`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)} onPointerDown={(e) => pick(e.clientX, e.currentTarget)} onPointerLeave={() => setHi(null)} onKeyDown={key}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} stroke="var(--color-line)" strokeOpacity={tk ? 0.45 : 1} strokeWidth="1" />
            <text x={pad.l - 6} y={y(tk) + 3} fontSize="10" textAnchor="end" fill="var(--color-mute)" className="num">{compact(tk)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * slot + (slot - bw) / 2;
          const h = d.value > 0 ? Math.max(2, height - (y(d.value) - pad.t)) : 0;
          const r = Math.min(4, bw / 2, h);
          const yt = pad.t + height - h;
          const path = h ? `M${x},${pad.t + height} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${pad.t + height} Z` : "";
          return (
            <g key={i}>
              {path && <path d={path} fill={TONE[tone]} opacity={i === sel ? 1 : 0.62}><title>{`${d.long ?? d.label}: ${fmt(Math.round(d.value))} ${unit}`}</title></path>}
              {(i % labelEvery === 0 && data.length - 1 - i >= labelEvery) || i === data.length - 1 ? (
                <text x={Math.min(W - pad.r, Math.max(pad.l, pad.l + i * slot + slot / 2))} y={H - 5} fontSize="10" fill="var(--color-mute)"
                  textAnchor={i === data.length - 1 ? "end" : i === 0 ? "start" : "middle"}>{d.label}</text>
              ) : null}
            </g>
          );
        })}
        <line x1={pad.l + sel * slot + slot / 2} x2={pad.l + sel * slot + slot / 2} y1={pad.t} y2={pad.t + height} stroke="var(--color-ink)" strokeOpacity="0.25" strokeWidth="1" />
      </svg>
    </div>
  );
}

/** Ranked horizontal bars (feature usage, plans, table sizes). Value at the tip, label above the bar. */
export function RankBars({ items, unit, tone = "info", fmtValue = compact }: { items: { label: string; value: number; sub?: string }[]; unit: string; tone?: ToneName; fmtValue?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.label} title={`${it.label}: ${fmt(it.value)} ${unit}`}>
          <div className="mb-1 flex items-baseline gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-ink">{it.label}</span>
            {it.sub && <span className="shrink-0 text-mute">{it.sub}</span>}
            <span className="shrink-0 font-semibold num">{fmtValue(it.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-card2" aria-hidden>
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, background: TONE[tone] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Cairo week: Saturday first

/** Weekday × hour heatmap (sequential: one hue, light → dark), sets logged in the last 90 days. */
export function HourHeatmap({ cells }: { cells: { wd: number; h: number; n: number }[] }) {
  const m = new Map(cells.map((c) => [`${c.wd}:${c.h}`, c.n]));
  const max = Math.max(1, ...cells.map((c) => c.n));
  return (
    <div>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: "2.25rem repeat(24, minmax(0, 1fr))" }} role="img" aria-label="Sets logged by weekday and hour. Table view lists every value.">
        {WD_ORDER.map((wd) => (
          <div key={wd} className="contents">
            <span className="pr-1 text-[10px] leading-4 text-mute">{WD[wd]}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const v = m.get(`${wd}:${h}`) ?? 0;
              return <span key={h} title={`${WD[wd]} ${h}:00 · ${v} sets`} className="h-4 rounded-[3px] md:h-5" style={{ background: v ? heat(v / max, "--color-acc", 14) : "var(--color-card2)" }} />;
            })}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[9px] text-mute num">{h % 6 === 0 ? h : ""}</span>)}
      </div>
      <Scale lo="Fewer sets" hi={`${max} sets`} />
    </div>
  );
}

function Scale({ lo, hi, token = "--color-acc" }: { lo: string; hi: string; token?: string }) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-mute" aria-hidden>
      <span>{lo}</span>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => <span key={t} className="h-2.5 w-4 rounded-[3px]" style={{ background: heat(t, token, 14) }} />)}
      <span>{hi}</span>
    </div>
  );
}

/** People × last 8 weeks: workouts per week (retention-style grid). */
export function WeekGrid({ rows, weeks }: { rows: { id: string; label: ReactNode; name: string; weeks: number[] }[]; weeks: string[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.weeks));
  return (
    <div>
      <div className="grid items-center gap-x-[3px] gap-y-1.5" style={{ gridTemplateColumns: `minmax(0, 8rem) repeat(${weeks.length}, minmax(0, 1fr))` }}>
        <span />
        {weeks.map((w, i) => <span key={w} className="text-center text-[10px] text-mute num">{i === weeks.length - 1 ? "now" : `-${weeks.length - 1 - i}w`}</span>)}
        {rows.map((r) => (
          <div key={r.id} className="contents">
            <div className="min-w-0 truncate pr-2 text-xs">{r.label}</div>
            {r.weeks.map((v, i) => (
              <span key={i} title={`${r.name}, week of ${weeks[i]}: ${v} workout${v === 1 ? "" : "s"}`} className="h-6 rounded-[4px]"
                style={{ background: v ? heat(v / max, "--color-acc", 22) : "var(--color-card2)" }} />
            ))}
          </div>
        ))}
      </div>
      <Scale lo="0" hi={`${max} workouts / week`} />
    </div>
  );
}

/** Calendar strip of daily activity (13 weeks), like a contribution graph. */
export function DayStrip({ days, token = "--color-info" }: { days: { d: string; n: number }[]; token?: string }) {
  const max = Math.max(1, ...days.map((d) => d.n));
  const cols: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));
  return (
    <div>
      <div className="flex gap-[3px]" role="img" aria-label={`Active on ${days.filter((d) => d.n).length} of the last ${days.length} days`}>
        {cols.map((c, i) => (
          <div key={i} className="flex flex-1 flex-col gap-[3px]">
            {c.map((d) => <span key={d.d} title={`${d.d}: ${d.n} actions`} className="aspect-square w-full max-w-5 rounded-[3px]" style={{ background: d.n ? heat(d.n / max, token, 22) : "var(--color-card2)" }} />)}
          </div>
        ))}
      </div>
      <Scale lo="Quiet" hi="Busy" token={token} />
    </div>
  );
}

/** Fill = severity (green → amber → red); track = a faint step of the same hue. */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const p = Math.min(1, value / max);
  const tone = p > 0.8 ? "--color-bad" : p > 0.5 ? "--color-warn" : "--color-acc";
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className="h-2.5 rounded-full" style={{ background: `color-mix(in srgb, var(${tone}) 18%, var(--color-card2))` }}>
        <div className="h-2.5 rounded-full" style={{ width: `${Math.max(1.5, p * 100)}%`, background: `var(${tone})` }} />
      </div>
    </div>
  );
}

/** Stat tile: label · value (proportional figures) · signed delta vs a named period · optional sparkline. */
export function Kpi({ icon: Icon, label, value, sub, delta, spark, tone = "acc", className }: {
  icon: LucideIcon; label: string; value: ReactNode; sub?: string; delta?: { now: number; prev: number; vs: string; upGood?: boolean }; spark?: number[]; tone?: ToneName; className?: string;
}) {
  let d: ReactNode = null;
  if (delta) {
    const diff = delta.now - delta.prev;
    const p = delta.prev ? Math.round((diff / delta.prev) * 100) : null;
    const good = diff === 0 ? null : (diff > 0) === (delta.upGood ?? true);
    const I = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
    d = (
      <span className={cx("inline-flex items-center gap-0.5 text-xs font-medium", good == null ? "text-mute" : good ? "text-acc" : "text-warn")}>
        <I size={13} aria-hidden />{diff === 0 ? "same" : p == null ? `+${fmt(diff)}` : `${p > 0 ? "+" : ""}${p}%`}<span className="font-normal text-mute">&nbsp;vs {delta.vs}</span>
      </span>
    );
  }
  return (
    <div className={cx("flex min-w-0 flex-col rounded-2xl border border-line/60 bg-card p-4", className)}>
      <div className="flex items-center gap-1.5 text-xs text-mute">
        <Icon size={14} className="shrink-0" style={{ color: TONE[tone] }} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-[26px] font-bold leading-none">{value}</div>
        {spark && spark.length > 1 && <Spark values={spark} tone={tone} />}
      </div>
      <div className="mt-1.5 min-h-4 truncate text-xs text-mute">{d ?? sub}</div>
    </div>
  );
}

function Spark({ values, tone }: { values: number[]; tone: ToneName }) {
  const w = 64, h = 24;
  const max = Math.max(1, ...values);
  const x = (i: number) => 2 + (i / (values.length - 1)) * (w - 4);
  const y = (v: number) => 3 + (1 - v / max) * (h - 6);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path d={values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--color-mute)" strokeOpacity="0.7" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3" fill={TONE[tone]} stroke="var(--color-card)" strokeWidth="1.5" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-2xl bg-card", className)} aria-hidden />;
}
