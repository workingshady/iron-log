import { useState, type ReactNode } from "react";
import { useWidth } from "../../lib/useWidth";
import { cx } from "../../lib/util";

// Social charts. Rules (dataviz skill): one categorical palette validated on the dark card surface (#19191d, all-pairs
// CVD ΔE ≥ 9.4, normal ≥ 20.9), max 3 people per chart, colour follows the PERSON (me = slot 1 always), text stays in ink
// tokens, thin marks with rounded data ends, a legend + direct labels for 2-3 series, hover/tap shows exact values.
export const SERIES = ["#3987e5", "#d95926", "#199e70"] as const;
/** Medal tints (rank meaning only, never series identity). */
export const MEDAL = ["#f5c84b", "#c9ced6", "#d39a6a"] as const;

/** Progress ring (challenge members, badges). `value/max`, children sit in the middle. Decorative: pair with text. */
export function Ring({ value, max, size = 48, stroke = 4, color = "var(--color-acc)", track = "var(--color-card3)", children, className }: {
  value: number; max: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode; className?: string;
}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <span className={cx("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {pct > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} className="transition-[stroke-dasharray] duration-700 motion-reduce:transition-none" />}
      </svg>
      {children}
    </span>
  );
}

/** Legend: colour dot + name (identity is never colour alone: the name is always there). */
export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Legend">
      {items.map((x) => (
        <li key={x.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} aria-hidden />
          <span className="text-mute">{x.label}</span>{x.value && <span className="font-semibold text-ink num">{x.value}</span>}
        </li>
      ))}
    </ul>
  );
}

type Line = { id: string; label: string; color: string; points: { date: string; y: number }[] };

/** Several people's e1RM over time on one time axis. Crosshair + values on hover/tap; direct labels at the line ends. */
export function MultiLine({ lines, unit, height = 170 }: { lines: Line[]; unit: string; height?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<string | null>(null);
  const all = lines.flatMap((l) => l.points);
  if (!all.length) return <div ref={ref} />;
  const t = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const dates = [...new Set(all.map((p) => p.date))].sort();
  let t0 = t(dates[0]), t1 = t(dates[dates.length - 1]);
  if (t0 === t1) { t0 -= 864e5 * 3; t1 += 864e5 * 3; }
  let lo = Math.min(...all.map((p) => p.y)), hiY = Math.max(...all.map((p) => p.y));
  const padY = Math.max(2.5, (hiY - lo) * 0.12);
  lo = Math.max(0, lo - padY); hiY += padY;
  const pad = { l: 34, r: 56, t: 10, b: 20 };
  const x = (d: string) => pad.l + ((t(d) - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hiY - lo)) * (height - pad.t - pad.b);
  const sel = hi ?? dates[dates.length - 1];
  const at = (l: Line, d: string) => [...l.points].reverse().find((p) => p.date <= d) ?? null;
  const fmtD = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const ticks = [lo, (lo + hiY) / 2, hiY].map((v) => Math.round(v));
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const rel = ((clientX - r.left) / r.width) * W;
    let best = dates[0];
    for (const d of dates) if (Math.abs(x(d) - rel) < Math.abs(x(best) - rel)) best = d;
    setHi(best);
  };
  // direct labels at the end of each line, nudged apart so they never overlap
  const ends = lines.filter((l) => l.points.length).map((l) => ({ l, yy: y(l.points[l.points.length - 1].y) })).sort((a, z) => a.yy - z.yy);
  for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 13) ends[i].yy = ends[i - 1].yy + 13;
  return (
    <div ref={ref}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs" aria-live="polite">
        <Legend items={lines.map((l) => { const p = at(l, sel); return { label: l.label, color: l.color, value: p ? `${p.y}` : "–" }; })} />
        <span className="shrink-0 text-mute">{fmtD(sel)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} className="block touch-none select-none" role="img"
        aria-label={`Estimated 1-rep max over time (${unit}): ${lines.map((l) => `${l.label} ${l.points.at(-1)?.y ?? "none"}`).join(", ")}`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)} onPointerDown={(e) => pick(e.clientX, e.currentTarget)} onPointerLeave={() => setHi(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" opacity="0.5" />
            <text x={pad.l - 6} y={y(v) + 3} fontSize="10" fill="var(--color-mute)" textAnchor="end" className="num">{v}</text>
          </g>
        ))}
        <text x={pad.l} y={height - 4} fontSize="10" fill="var(--color-mute)">{fmtD(dates[0])}</text>
        <text x={W - pad.r} y={height - 4} fontSize="10" fill="var(--color-mute)" textAnchor="end">{fmtD(dates[dates.length - 1])}</text>
        <line x1={x(sel)} x2={x(sel)} y1={pad.t} y2={height - pad.b} stroke="var(--color-mute)" strokeDasharray="3 3" opacity="0.6" />
        {lines.map((l) => (
          <g key={l.id}>
            {l.points.length > 1 && <path d={l.points.map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(p.y)}`).join(" ")} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            {l.points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.y)} r={p.date === sel ? 5 : 3.5} fill={l.color} stroke="var(--color-card)" strokeWidth="2" />)}
          </g>
        ))}
        {ends.map(({ l, yy }) => (
          <text key={l.id} x={W - pad.r + 8} y={yy + 3} fontSize="11" fill="var(--color-ink)" fontWeight="600">{l.label.slice(0, 8)}</text>
        ))}
      </svg>
    </div>
  );
}

/** Head-to-head horizontal bars, one per person, proportional to the best. Labels + values in ink; bar = person colour. */
export function PersonBars({ rows, fmt }: { rows: { id: string; label: string; color: string; value: number | null; sub?: string; lead?: boolean }[]; fmt: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.id}>
          <div className="mb-1 flex items-baseline gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">{r.label}{r.lead && <span className="ml-1" aria-label="leads">👑</span>}</span>
            {r.sub && <span className="text-xs text-mute num">{r.sub}</span>}
            <span className="font-bold num">{r.value == null ? "–" : fmt(r.value)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-card3/70">
            {r.value != null && <div className="h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: r.color }} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
