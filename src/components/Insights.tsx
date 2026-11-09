import { useState } from "react";
import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { InsightsData } from "../../shared/api";
import { cx } from "../lib/util";

const TONE = {
  good: { icon: CheckCircle2, c: "text-acc" },
  warn: { icon: TriangleAlert, c: "text-warn" },
  bad: { icon: AlertTriangle, c: "text-bad" },
  info: { icon: Info, c: "text-info" },
};

export function InsightList({ items, max }: { items: InsightsData["insights"]; max?: number }) {
  return (
    <ul className="space-y-2.5">
      {items.slice(0, max).map((x, i) => {
        const T = TONE[x.tone];
        return (
          <li key={i} className="flex gap-3">
            <T.icon size={18} className={cx("mt-0.5 shrink-0", T.c)} />
            <div className="min-w-0">
              <div className="text-sm font-semibold">{x.title}</div>
              <div className="text-sm text-mute">{x.text}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Hard sets per muscle for one program week, against the 10-20 target band. */
export function MuscleChart({ data }: { data: InsightsData["muscles"] }) {
  const [wk, setWk] = useState<number | null>(null);
  if (!data.weeks.length) return <p className="text-sm text-mute">Shows after your first workout.</p>;
  const w = data.weeks.find((x) => x.week === wk) ?? data.weeks[data.weeks.length - 1];
  const max = 24;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1 text-xs">
        {data.weeks.map((x) => (
          <button key={x.week} onClick={() => setWk(x.week)} className={cx("rounded-full px-3 py-1.5", x.week === w.week ? "bg-card3 text-ink" : "text-mute")}>Week {x.week}</button>
        ))}
      </div>
      <div className="space-y-1.5">
        {data.groups.map((g) => {
          const n = w.sets[g] ?? 0;
          const tone = n >= 10 && n <= 20 ? "var(--color-acc)" : n > 20 ? "var(--color-warn)" : "color-mix(in srgb, var(--color-acc) 45%, transparent)";
          return (
            <div key={g} className="flex items-center gap-2 text-xs" title={`${g}: ${n} sets`}>
              <span className="w-28 shrink-0 truncate text-mute">{g}</span>
              <div className="relative h-4 flex-1 rounded bg-card2">
                {/* target band 10-20 */}
                <div className="absolute inset-y-0 border-x border-dashed border-faint/70" style={{ left: `${(10 / max) * 100}%`, width: `${(10 / max) * 100}%` }} />
                <div className="relative h-4 rounded" style={{ width: `${Math.min(100, (n / max) * 100)}%`, background: tone }} />
              </div>
              <span className="w-6 text-right font-semibold num">{n}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-mute">Dashed box = 10-20 hard sets/week (research range). Lighter bar = under 10, amber = over 20. Warm-ups don't count.</p>
    </div>
  );
}
