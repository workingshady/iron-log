import { useState } from "react";
import { localDate, niceDate, cx } from "../lib/util";
import { useWidth } from "../lib/useWidth";

// GitHub-style calendar: columns = weeks, rows = weekdays.
// One hue (green) for training intensity; status colours only for partial (amber) and missed (coral ring).
export type Day = { status: string; sets: number; minutes: number; names: string[] };

export function Heatmap({ days, weekStart = 6, mode = "workout", grams, target = 5 }: {
  days?: Record<string, Day>; weeks?: number; weekStart?: number; mode?: "workout" | "creatine"; grams?: Record<string, number>; target?: number;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const CELL = 14, GAP = 3;
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

  const style = (iso: string): { cls: string; style?: React.CSSProperties } => {
    if (iso > t) return { cls: "opacity-0" };
    if (mode === "creatine") {
      const g = grams?.[iso] ?? 0;
      if (!g) return { cls: "bg-card2" };
      return { cls: "", style: { background: `color-mix(in srgb, var(--color-vio) ${g >= target ? 100 : 45}%, var(--color-card2))` } };
    }
    const d = days?.[iso];
    if (!d) return { cls: "bg-card2" };
    if (d.status === "done") {
      const pct = d.sets >= 22 ? 100 : d.sets >= 12 ? 72 : 48;
      return { cls: "", style: { background: `color-mix(in srgb, var(--color-acc) ${pct}%, var(--color-card2))` } };
    }
    if (d.status === "abandoned" || d.status === "active") return { cls: "bg-warn/60" };
    return { cls: "bg-card2 ring-1 ring-inset ring-bad/80" };
  };

  const selDay = sel ? days?.[sel] : null;

  return (
    <div ref={ref}>
      <div className="flex gap-[3px]">
        <div className="mr-1 flex flex-col gap-[3px] text-[9px] leading-none text-faint">
          {Array.from({ length: 7 }, (_, d) => (
            <div key={d} className="flex h-[14px] w-3 items-center">{d % 2 === 0 ? names[(weekStart + d) % 7] : ""}</div>
          ))}
        </div>
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((iso) => {
              const s = style(iso);
              return (
                <button
                  key={iso}
                  onClick={() => setSel(sel === iso ? null : iso)}
                  disabled={iso > t}
                  title={iso}
                  className={cx("h-[14px] w-[14px] rounded-[3px]", s.cls, iso === t && "outline outline-1 outline-offset-1 outline-ink", sel === iso && "outline outline-2 outline-info")}
                  style={s.style}
                  aria-label={iso}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-mute">
        {mode === "workout" ? (
          <>
            <Key c="color-mix(in srgb, var(--color-acc) 48%, var(--color-card2))" t="light" />
            <Key c="var(--color-acc)" t="big session" />
            <Key c="color-mix(in srgb, var(--color-warn) 60%, transparent)" t="partial" />
            <Key ring t="missed" />
          </>
        ) : (
          <>
            <Key c="color-mix(in srgb, var(--color-vio) 45%, var(--color-card2))" t={`under ${target} g`} />
            <Key c="var(--color-vio)" t={`${target} g+`} />
          </>
        )}
        {sel && (
          <span className="ml-auto text-ink">
            {niceDate(sel)}:{" "}
            {mode === "creatine" ? `${grams?.[sel] ?? 0} g` : selDay ? `${selDay.names.join(", ")}${selDay.sets ? ` · ${selDay.sets} sets` : ""}${selDay.minutes ? ` · ${selDay.minutes} min` : ""}` : "rest"}
          </span>
        )}
      </div>
    </div>
  );
}

function Key({ c, t, ring }: { c?: string; t: string; ring?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("inline-block h-2.5 w-2.5 rounded-[2px]", ring && "bg-card2 ring-1 ring-inset ring-bad")} style={c ? { background: c } : undefined} />
      {t}
    </span>
  );
}
