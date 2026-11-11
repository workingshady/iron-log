import { useId, useMemo, useState } from "react";
import { Minus, RotateCcw } from "lucide-react";
import { plates } from "../../shared/recommend";
import { cx, kg } from "../lib/util";
import { Btn, Sheet } from "./ui";

/** Plates your gym has (Settings → Equipment), heaviest first. Default = a standard kg set. */
export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export function platesFrom(settings?: Record<string, string> | null): number[] {
  const raw = settings?.plates;
  if (!raw) return DEFAULT_PLATES;
  const list = raw.split(",").map((x) => Number(x.trim())).filter((x) => x > 0 && x <= 50);
  return list.length ? [...new Set(list)].sort((a, b) => b - a) : DEFAULT_PLATES;
}

// IWF competition colours; sizes in mm (≈ real bumper / change plates) so the drawing has true proportions:
// 10-25 kg bumpers share the 450 mm diameter and differ in thickness; 5 / 2.5 / 1.25 are smaller change plates.
const SPEC: Record<string, { fill: string; text: string; d: number; t: number }> = {
  "25": { fill: "#e5484d", text: "#fff", d: 450, t: 56 },
  "20": { fill: "#3e8ef7", text: "#fff", d: 450, t: 48 },
  "15": { fill: "#f5c542", text: "#1a1a1a", d: 450, t: 40 },
  "10": { fill: "#46a758", text: "#fff", d: 450, t: 32 },
  "5": { fill: "#f2f2f2", text: "#1a1a1a", d: 260, t: 28 },
  "2.5": { fill: "#d1363b", text: "#fff", d: 210, t: 22 },
  "2": { fill: "#3e8ef7", text: "#fff", d: 190, t: 20 },
  "1.25": { fill: "#eef1f6", text: "#1a1a1a", d: 170, t: 17 },
  "1": { fill: "#46a758", text: "#fff", d: 160, t: 15 },
  "0.5": { fill: "#eeeeee", text: "#1a1a1a", d: 135, t: 12 },
};
export const plateSpec = (p: number) => SPEC[String(p)] ?? { fill: "#8b8d98", text: "#111", d: Math.min(450, 120 + p * 14), t: Math.min(56, 10 + p * 2) };
const SLEEVE = 415; // mm of loadable sleeve on an Olympic bar (≈ 320 on an EZ bar)

/**
 * Realistic barbell with plates on both sides (heaviest inside), weights printed on the plates, and numbered
 * loading steps below. `side` = plates on ONE side (heaviest first). Collars/clips drawn when collarKg > 0.
 */
export function BarDrawing({ side, bar, ez, collarKg = 0, onPlate }: { side: number[]; bar: number; ez?: boolean; collarKg?: number; onPlate?: (i: number) => void }) {
  const gid = useId().replace(/:/g, "");
  const sleeve = ez ? 320 : SLEEVE;
  const used = side.reduce((a, p) => a + plateSpec(p).t + 2, 0);
  const shaft = 150, innerCollar = 26, H = 470, cy = H / 2;
  const W = shaft + 2 * (innerCollar + sleeve);
  const x0 = (W - shaft) / 2; // left end of the visible shaft
  const sleeveL = x0 - innerCollar - sleeve, sleeveR = x0 + shaft + innerCollar;
  const plateEls = (dir: 1 | -1) => {
    let x = dir === 1 ? sleeveR : x0 - innerCollar;
    return side.map((p, i) => {
      const s = plateSpec(p);
      const px = dir === 1 ? x : x - s.t;
      x += dir * (s.t + 2);
      const label = s.t >= 20;
      return (
        <g key={`${dir}-${i}`} onClick={onPlate ? () => onPlate(i) : undefined} style={onPlate ? { cursor: "pointer" } : undefined}>
          <rect x={px} y={cy - s.d / 2} width={s.t} height={s.d} rx={Math.min(8, s.t / 3)} fill={s.fill} />
          <rect x={px} y={cy - s.d / 2} width={s.t} height={s.d} rx={Math.min(8, s.t / 3)} fill={`url(#${gid}-shade)`} />
          <rect x={px + 0.5} y={cy - s.d / 2 + 0.5} width={s.t - 1} height={s.d - 1} rx={Math.min(8, s.t / 3)} fill="none" stroke="#000" strokeOpacity={s.d < 300 ? 0.7 : 0.35} strokeWidth={s.d < 300 ? 2 : 1} />
          {/* small change plates: weight printed just above them */}
          {!label && <text x={px + s.t / 2} y={cy - s.d / 2 - 12} fill="#c9c9d1" fontSize={22} fontWeight={700} textAnchor="middle">{kg(p)}</text>}
          {label && <text x={px + s.t / 2} y={cy - s.d / 2 + (s.d > 300 ? 70 : 40)} fill={s.text} fontSize={s.t >= 40 ? 30 : 20} fontWeight={800} textAnchor="middle" transform={`rotate(-90 ${px + s.t / 2} ${cy - s.d / 2 + (s.d > 300 ? 70 : 40)})`} dominantBaseline="middle">{kg(p)}</text>}
        </g>
      );
    });
  };
  const collar = (dir: 1 | -1) => {
    if (!collarKg) return null;
    const x = dir === 1 ? sleeveR + used + 2 : x0 - innerCollar - used - 2 - 30;
    return <rect x={x} y={cy - 34} width={30} height={68} rx={6} fill="#5a5e6a" stroke="#000" strokeOpacity={0.4} />;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Bar ${kg(bar)} kg plus ${side.length ? side.map((p) => kg(p)).join(" + ") : "nothing"} kg per side`}>
      <defs>
        <linearGradient id={`${gid}-shade`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.28} /><stop offset="0.45" stopColor="#fff" stopOpacity={0} /><stop offset="1" stopColor="#000" stopOpacity={0.3} />
        </linearGradient>
        <linearGradient id={`${gid}-metal`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9fa3ad" /><stop offset="0.5" stopColor="#6b6f79" /><stop offset="1" stopColor="#41444c" />
        </linearGradient>
        <pattern id={`${gid}-knurl`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#9a9da7" /><path d="M0 0 L0 8" stroke="#6f727c" strokeWidth="3" />
        </pattern>
      </defs>
      {/* sleeves */}
      <rect x={sleeveL} y={cy - 25} width={sleeve} height={50} rx={6} fill={`url(#${gid}-metal)`} />
      <rect x={sleeveR} y={cy - 25} width={sleeve} height={50} rx={6} fill={`url(#${gid}-metal)`} />
      {/* inner collars (sleeve stops) */}
      <rect x={x0 - innerCollar} y={cy - 40} width={innerCollar} height={80} rx={4} fill={`url(#${gid}-metal)`} stroke="#000" strokeOpacity={0.3} />
      <rect x={x0 + shaft} y={cy - 40} width={innerCollar} height={80} rx={4} fill={`url(#${gid}-metal)`} stroke="#000" strokeOpacity={0.3} />
      {/* knurled shaft */}
      <rect x={x0} y={cy - 14} width={shaft} height={28} rx={3} fill={`url(#${gid}-knurl)`} />
      {plateEls(-1)}
      {plateEls(1)}
      {collar(-1)}
      {collar(1)}
      {used > sleeve && <text x={W / 2} y={36} fill="#ffb547" fontSize={30} textAnchor="middle">too many plates for the sleeve</text>}
    </svg>
  );
}

/** Numbered loading steps for one side: "1 · 20 kg  2 · 5 kg …" + bar (+ clips). */
function Steps({ side, bar, collarKg }: { side: number[]; bar: number; collarKg: number }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1 text-[11px] text-mute num">
      {side.length ? <span>Each side:</span> : <span>Empty bar</span>}
      {side.map((p, i) => {
        const s = plateSpec(p);
        return (
          <span key={i} className="inline-flex items-center gap-0.5">
            <span className="text-faint">{i + 1}</span>
            <span className="rounded px-1.5 py-0.5 font-bold" style={{ background: s.fill, color: s.text }}>{kg(p)}</span>
          </span>
        );
      })}
      <span className="text-faint">· bar {kg(bar)}{collarKg ? ` · clips ${kg(collarKg * 2)}` : ""}</span>
    </div>
  );
}

/** Plates for a total, shown on a realistic bar. Says so when it can't be loaded exactly and offers the nearest. */
export function PlateBar({ total, bar, available = DEFAULT_PLATES, ez, collarKg = 0, className, onBuilder }: {
  total: number; bar: number; available?: number[]; ez?: boolean; collarKg?: number; className?: string; onBuilder?: () => void;
}) {
  if (!(total > 0)) return null;
  const base = bar + 2 * collarKg;
  if (total < base) return <div className={cx("text-[11px] text-warn", className)}>Below the empty bar{collarKg ? " + clips" : ""} ({kg(base)} kg)</div>;
  const side = plates(total - 2 * collarKg, bar, available);
  if (!side) {
    const step = 2 * Math.min(...available);
    const lo = Math.floor((total - base) / step) * step + base, hi = lo + step;
    return <div className={cx("text-[11px] text-warn", className)}>Can't load exactly {kg(total)} kg with your plates — {kg(lo)} or {kg(hi)} kg{onBuilder && <button onClick={onBuilder} className="ml-1 text-info underline">open loader</button>}</div>;
  }
  return (
    <div className={cx("px-1", className)}>
      <button type="button" onClick={onBuilder} className="block w-full" aria-label="Open plate loader" disabled={!onBuilder}>
        <BarDrawing side={side} bar={bar} ez={ez} collarKg={collarKg} />
      </button>
      <Steps side={side} bar={bar} collarKg={collarKg} />
    </div>
  );
}

/**
 * Tap-to-load: tap a plate to add a pair (one each side), tap a plate on the bar (or −) to take it off.
 * Live total; "Use" sends it to the set you're logging.
 */
export function PlateLoader({ start, bar, ez, available = DEFAULT_PLATES, collarKg = 0, onUse, onClose }: {
  start: number; bar: number; ez?: boolean; available?: number[]; collarKg?: number; onUse?: (kg: number) => void; onClose: () => void;
}) {
  const initial = useMemo(() => plates(Math.max(bar, start - 2 * collarKg), bar, available) ?? [], [start, bar, available, collarKg]);
  const [side, setSide] = useState<number[]>(initial);
  const total = bar + 2 * collarKg + 2 * side.reduce((a, p) => a + p, 0);
  const add = (p: number) => setSide((s) => [...s, p].sort((a, b) => b - a));
  const removeAt = (i: number) => setSide((s) => s.filter((_, k) => k !== i));
  return (
    <Sheet open onClose={onClose} title="Plate loader" icon={RotateCcw}>
      <div className="text-center">
        <div className="text-4xl font-bold num">{kg(total)} <span className="text-base font-normal text-mute">kg</span></div>
        <div className="text-[11px] text-mute num">bar {kg(bar)}{collarKg ? ` + clips ${kg(collarKg * 2)}` : ""} + 2 × {kg(side.reduce((a, p) => a + p, 0))}</div>
      </div>
      <div className="mt-3 rounded-xl bg-card2 p-2">
        <BarDrawing side={side} bar={bar} ez={ez} collarKg={collarKg} onPlate={removeAt} />
        <Steps side={side} bar={bar} collarKg={collarKg} />
      </div>
      <p className="mt-2 text-center text-[11px] text-faint">Tap a plate below to add a pair · tap a plate on the bar to take that pair off</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {available.map((p) => {
          const s = plateSpec(p);
          const n = side.filter((x) => x === p).length;
          return (
            <button key={p} onClick={() => add(p)} className="relative flex min-h-14 flex-col items-center justify-center rounded-xl font-bold num shadow-inner active:scale-95" style={{ background: s.fill, color: s.text }}>
              <span className="text-lg leading-none">{kg(p)}</span>
              <span className="text-[10px] font-medium opacity-80">kg</span>
              {n > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-bg px-1 text-[10px] text-ink ring-1 ring-line">×{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-[auto_auto_1fr] gap-2">
        <Btn kind="soft" icon={Minus} onClick={() => setSide((s) => s.slice(0, -1))} disabled={!side.length}>Last</Btn>
        <Btn kind="soft" onClick={() => setSide([])} disabled={!side.length}>Clear</Btn>
        {onUse ? <Btn kind="primary" onClick={() => { onUse(total); onClose(); }}>Use {kg(total)} kg</Btn> : <Btn kind="soft" onClick={onClose}>Close</Btn>}
      </div>
    </Sheet>
  );
}
