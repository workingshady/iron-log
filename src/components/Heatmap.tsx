import { useState } from "react";
import { localDate, niceDate, cx, heat } from "../lib/util";
import { useWidth } from "../lib/useWidth";

// GitHub-style calendar: columns = weeks, rows = weekdays.
// One hue (green) for training intensity; status colours only for partial (amber) and missed (coral ring).
export type Day = { status: string; sets: number; minutes: number; names: string[] };

export function Heatmap({ days, weekStart = 6, mode = "workout", grams, target = 5 }: {
  days?: Record<string, Day>; weeks?: number; weekStart?: number; mode?: "workout" | "creatine"; grams?: Record<string, number>; target?: number;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const CELL = 20, GAP = 4; // 20 px + 4 px gap = 24 px tap target (WCAG 2.5.8)
  const weeks = Math.min(53, Math.max(8, Math.floor((width - 18) / (CELL + GAP))));
  const today = new Date();
  const back = (today.getDay() - weekStart + 7) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - back - (weeks - 1) * 7);
  const cols: string[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: string[] = [];
    for (let d = 0; d < 7; d++) {
      const x = new Date(start);
      x.setDate(start.getDate() + w * 7 + d);
      col.push(localDate(x));
    }
    cols.push(col);
  }
  const t = localDate(today);
  const names = ["S", "M", "T", "W", "T", "F", "S"];

  // workout intensity is relative to YOUR big days (90th percentile of sets), so the scale fits you
  const doneSets = Object.values(days ?? {}).filter((d) => d.status === "done").map((d) => d.sets || Math.round(d.minutes / 3)).sort((a, b) => a - b);
  const top = Math.max(10, doneSets[Math.floor(doneSets.length * 0.9)] ?? 20);
  const style = (iso: string): { cls: string; style?: React.CSSProperties } => {
    if (iso > t) return { cls: "opacity-0" };
    if (mode === "creatine") {
      const g = grams?.[iso] ?? 0;
      if (!g) return { cls: "bg-card2" };
      // continuous: 1 g of 5 is faint, 5 g is full; way over (2× target) gets an amber ring
      return { cls: g > target * 2 ? "ring-1 ring-inset ring-warn" : "", style: { background: heat(g / target, "--color-vio", 22) } };
    }
    const d = days?.[iso];
    if (!d) return { cls: "bg-card2" };
    if (d.status === "done") {
      const v = d.sets || Math.round(d.minutes / 3);
      return { cls: "", style: { background: heat(v / top, "--color-acc", 25) } };
    }
    if (d.status === "abandoned" || d.status === "active") return { cls: "bg-warn/60" };
    return { cls: "bg-card2 ring-1 ring-inset ring-bad/80" };
  };

  const selDay = sel ? days?.[sel] : null;
  // screen-reader name for a cell (sighted users read the colour + the line under the grid)
  const label = (iso: string) => {
    if (mode === "creatine") return `${grams?.[iso] ?? 0} g creatine`;
    const d = days?.[iso];
    if (!d) return "no workout";
    if (d.status === "done") return `done${d.sets ? `, ${d.sets} sets` : ""}`;
    return d.status === "abandoned" || d.status === "active" ? "partial" : d.status;
  };

  return (
    <div ref={ref}>
      <div className="flex gap-[4px]">
        <div className="mr-1 flex flex-col gap-[4px] text-[9px] leading-none text-faint" aria-hidden>
          {Array.from({ length: 7 }, (_, d) => (
            <div key={d} className="flex h-[20px] w-3 items-center">{d % 2 === 0 ? names[(weekStart + d) % 7] : ""}</div>
          ))}
        </div>
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[4px]">
            {col.map((iso) => {
              const s = style(iso);
              return (
                <button
                  key={iso}
                  onClick={() => setSel(sel === iso ? null : iso)}
                  disabled={iso > t}
                  title={iso}
                  className={cx("h-[20px] w-[20px] rounded-[4px]", s.cls, iso === t && "outline outline-1 outline-offset-1 outline-ink", sel === iso && "outline outline-2 outline-info")}
                  style={s.style}
                  aria-label={`${niceDate(iso)}: ${label(iso)}`}
                  aria-pressed={sel === iso}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-mute">
        {mode === "workout" ? (
          <>
            <Scale token="--color-acc" from="few sets" to={`${top}+ sets`} />
            <Key c="color-mix(in srgb, var(--color-warn) 60%, transparent)" t="partial" />
            <Key ring t="missed" />
          </>
        ) : (
          <>
            <Scale token="--color-vio" from="1 g" to={`${target} g`} floor={22} />
            <Key ring warnRing t={`over ${target * 2} g`} />
          </>
        )}
        {sel && (
          <span className="ml-auto text-ink" aria-live="polite">
            {niceDate(sel)}:{" "}
            {mode === "creatine" ? `${grams?.[sel] ?? 0} g` : selDay ? `${selDay.names.join(", ")}${selDay.sets ? ` · ${selDay.sets} sets` : ""}${selDay.minutes ? ` · ${selDay.minutes} min` : ""}` : "rest"}
          </span>
        )}
      </div>
    </div>
  );
}

/** Less → more legend: 5 swatches of the same continuous scale the cells use. */
function Scale({ token, from, to, floor = 25 }: { token: string; from: string; to: string; floor?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{from}</span>
      {[0.1, 0.3, 0.5, 0.75, 1].map((x) => <span key={x} className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: heat(x, token, floor) }} />)}
      <span>{to}</span>
    </span>
  );
}

function Key({ c, t, ring, warnRing }: { c?: string; t: string; ring?: boolean; warnRing?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("inline-block h-2.5 w-2.5 rounded-[2px]", ring && "bg-card2 ring-1 ring-inset", ring && (warnRing ? "ring-warn" : "ring-bad"))} style={c ? { background: c } : undefined} />
      {t}
    </span>
  );
}
