import { plates } from "../../shared/recommend";
import { cx, kg } from "../lib/util";

/** Plates your gym has (Settings → Equipment), heaviest first. Default = a standard kg set. */
export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export function platesFrom(settings?: Record<string, string> | null): number[] {
  const raw = settings?.plates;
  if (!raw) return DEFAULT_PLATES;
  const list = raw.split(",").map((x) => Number(x.trim())).filter((x) => x > 0 && x <= 50);
  return list.length ? [...new Set(list)].sort((a, b) => b - a) : DEFAULT_PLATES;
}

// IWF competition colours (kg plates): 25 red · 20 blue · 15 yellow · 10 green · 5 white · 2.5 red · 1.25 chrome.
// Height grows with the plate, so 25 looks bigger than 5 at a glance.
const STYLE: Record<string, { fill: string; text: string; h: number; w: number }> = {
  "25": { fill: "#e5484d", text: "#fff", h: 44, w: 11 },
  "20": { fill: "#3e8ef7", text: "#fff", h: 44, w: 10 },
  "15": { fill: "#f5c542", text: "#111", h: 40, w: 9 },
  "10": { fill: "#46a758", text: "#fff", h: 36, w: 8 },
  "5": { fill: "#eeeeee", text: "#111", h: 28, w: 7 },
  "2.5": { fill: "#c9393e", text: "#fff", h: 22, w: 6 },
  "1.25": { fill: "#b8bcc4", text: "#111", h: 18, w: 5 },
};
const styleOf = (p: number) => STYLE[String(p)] ?? { fill: "#8b8d98", text: "#111", h: Math.max(16, Math.min(44, 16 + p * 1.2)), w: 6 };

/**
 * Bar diagram for a barbell / EZ-bar total: plates on both sides (heaviest in the middle), per-side list below.
 * If the total can't be made exactly with your plates, shows the nearest loadable totals instead.
 */
export function PlateBar({ total, bar, available = DEFAULT_PLATES, compact, className }: { total: number; bar: number; available?: number[]; compact?: boolean; className?: string }) {
  if (!(total > 0)) return null;
  const side = plates(total, bar, available);
  if (total < bar) return <div className={cx("text-[11px] text-warn", className)}>Below the empty bar ({kg(bar)} kg)</div>;
  if (!side) {
    // nearest totals you can actually load
    const step = 2 * Math.min(...available);
    const lo = Math.floor((total - bar) / step) * step + bar, hi = lo + step;
    return <div className={cx("text-[11px] text-warn", className)}>Can't load exactly {kg(total)} kg with your plates — use {kg(lo)} or {kg(hi)} kg</div>;
  }
  const H = compact ? 34 : 46, scale = H / 46;
  const sleeve = side.reduce((a, p) => a + styleOf(p).w * scale + 1, 0);
  const W = 2 * (sleeve + 18) + 54;
  const cy = H / 2;
  const drawSide = (dir: 1 | -1) => {
    let x = W / 2 + dir * 27; // start at the collar
    return side.map((p, i) => {
      const st = styleOf(p);
      const w = st.w * scale, h = st.h * scale;
      const rx = dir === 1 ? x : x - w;
      x += dir * (w + 1);
      return <rect key={`${dir}-${i}`} x={rx} y={cy - h / 2} width={w} height={h} rx={1.5} fill={st.fill} stroke="#0006" strokeWidth={0.5} />;
    });
  };
  return (
    <div className={cx("flex flex-col items-center", className)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${kg(total)} kg: bar ${kg(bar)} kg plus ${side.join(" + ") || "nothing"} kg per side`}>
        <rect x={4} y={cy - 2} width={W - 8} height={4} rx={2} fill="#9b9ba6" />
        <rect x={W / 2 - 27 - 3} y={cy - 5} width={3} height={10} rx={1} fill="#c9c9d1" />
        <rect x={W / 2 + 27} y={cy - 5} width={3} height={10} rx={1} fill="#c9c9d1" />
        {drawSide(-1)}
        {drawSide(1)}
      </svg>
      <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1 text-[10px] text-mute num">
        {side.length ? (
          <>
            <span>per side</span>
            {side.map((p, i) => <span key={i} className="rounded px-1 font-semibold" style={{ background: styleOf(p).fill, color: styleOf(p).text }}>{kg(p)}</span>)}
            <span>+ bar {kg(bar)}</span>
          </>
        ) : <span>empty bar · {kg(bar)} kg</span>}
      </div>
    </div>
  );
}
