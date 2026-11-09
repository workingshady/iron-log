import { useState } from "react";
import { useWidth } from "../lib/useWidth";

// Single-series charts: one accent colour, 2px line, 8px markers, recessive axes,
// tap/hover shows the exact value (no numbers on every point). Tables sit beside them.

type P = { x: string; y: number; label?: string };

export function LineChart({ points, unit, height = 140 }: { points: P[]; unit: string; height?: number }) {
  const [hi, setHi] = useState<number | null>(null);
  const [ref, W] = useWidth<HTMLDivElement>();
  if (points.length === 0) return <div ref={ref} />;
  const H = height, pad = { l: 8, r: 8, t: 12, b: 18 };
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys), hiY = Math.max(...ys);
  if (lo === hiY) { lo -= 1; hiY += 1; }
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hiY - lo)) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.y)}`).join(" ");
  const sel = hi ?? points.length - 1;
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const rel = ((clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((_, i) => { if (Math.abs(x(i) - rel) < Math.abs(x(best) - rel)) best = i; });
    setHi(best);
  };
  return (
    <div ref={ref}>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-semibold num">{points[sel].label ?? `${Math.round(points[sel].y * 10) / 10} ${unit}`}</span>
        <span className="text-xs text-mute">{points[sel].x}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block touch-none select-none"
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHi(null)}
        role="img"
        aria-label={`Trend, latest ${points[points.length - 1].y} ${unit}`}
      >
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--color-line)" strokeWidth="1" />
        <text x={pad.l} y={H - 4} fontSize="10" fill="var(--color-mute)">{points[0].x}</text>
        <text x={W - pad.r} y={H - 4} fontSize="10" fill="var(--color-mute)" textAnchor="end">{points[points.length - 1].x}</text>
        <line x1={x(sel)} x2={x(sel)} y1={pad.t} y2={H - pad.b} stroke="var(--color-line)" strokeDasharray="3 3" />
        <path d={d} fill="none" stroke="var(--color-acc)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.y)} r={i === sel ? 5 : 4} fill="var(--color-acc)" stroke="var(--color-card)" strokeWidth="2" />
        ))}
      </svg>
    </div>
  );
}

export function Bars({ data, unit }: { data: P[]; unit: string }) {
  const [hi, setHi] = useState<number | null>(null);
  if (!data.length) return null;
  const max = Math.max(1, ...data.map((d) => d.y));
  const sel = hi ?? data.length - 1;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-semibold num">{Math.round(data[sel].y).toLocaleString()} {unit}</span>
        <span className="text-xs text-mute">{data[sel].x}</span>
      </div>
      <div className="flex h-24 items-end gap-0.5" onPointerLeave={() => setHi(null)}>
        {data.map((d, i) => (
          <button
            key={i}
            onPointerEnter={() => setHi(i)}
            onClick={() => setHi(i)}
            className="flex h-full flex-1 items-end"
            aria-label={`${d.x}: ${d.y} ${unit}`}
          >
            <span className="block w-full rounded-t" style={{ height: `${(d.y / max) * 100}%`, minHeight: d.y ? 4 : 0, background: i === sel ? "var(--color-acc)" : "color-mix(in srgb, var(--color-acc) 55%, transparent)" }} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-center text-[10px] text-mute">
        {data.map((d, i) => <span key={i} className="flex-1 truncate">{d.x}</span>)}
      </div>
    </div>
  );
}
