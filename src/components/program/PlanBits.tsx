import { EXERCISES } from "../../../program/exercises";
import { MUSCLE_LABEL } from "../../../program/muscles";
import { BAND_LABEL, VOLUME_MUSCLES, bandOf, dayMinutes, designVolume, type Band, type DItem, type Design } from "../../../program/templates";
import { cx } from "../../lib/util";

/** "3×8-12" · "3×30s" · "2×max" for one design item. */
export function schemeLabel(it: DItem): string {
  const r = it.reps === null ? "max" : Array.isArray(it.reps) ? `${it.reps[0]}-${it.reps[1]}` : it.reps != null ? `${it.reps}` : it.seconds ? `${it.seconds}s` : it.meters ? `${it.meters}m` : "";
  return `${it.sets}×${r}`;
}
export const rirLabel = (it: DItem) => (it.fin || it.rir === null ? "" : `RIR ${it.rir ?? (it.heavy ? 2 : 1)}`);
export const restLabel = (s: number) => (s === 0 ? "superset" : s >= 60 && s % 60 === 0 ? `${s / 60} min` : s > 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`);

const BAND_TONE: Record<Band, { bar: string; text: string }> = {
  low: { bar: "bg-bad", text: "text-bad" },
  min: { bar: "bg-warn", text: "text-warn" },
  good: { bar: "bg-acc", text: "text-acc" },
  high: { bar: "bg-info", text: "text-info" },
};
const MAX = 26;

/** Weekly hard sets per muscle (fractional: primary 1, secondary ½) with guidance bands. The shaded zone is 10-20 sets. */
export function VolumeBars({ design, compact }: { design: Design; compact?: boolean }) {
  const v = designVolume(design);
  return (
    <div>
      <ul className={cx("space-y-1.5", compact && "space-y-1")}>
        {VOLUME_MUSCLES.map((m) => {
          const n = Math.round((v[m] ?? 0) * 2) / 2;
          const b = bandOf(n, m);
          return (
            <li key={m} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 truncate text-mute">{MUSCLE_LABEL[m]}</span>
              <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-card3" aria-hidden>
                <span className="absolute inset-y-0 bg-ink/10" style={{ left: `${(10 / MAX) * 100}%`, width: `${(10 / MAX) * 100}%` }} />
                <span className={cx("absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-500", BAND_TONE[b].bar)} style={{ width: `${Math.min(1, n / MAX) * 100}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right font-semibold num">{n}</span>
              <span className={cx("w-16 shrink-0 text-[11px]", BAND_TONE[b].text)}>{BAND_LABEL[b]}</span>
            </li>
          );
        })}
      </ul>
      {!compact && (
        <p className="mt-3 text-[11px] leading-snug text-faint">
          Hard sets per week (an exercise's main muscle counts 1, helpers ½). Shaded zone = 10-20 sets, where most growth happens; small muscles (rear delts, traps, calves, abs) need less because rows, presses and squats already hit them.
        </p>
      )}
    </div>
  );
}

/** Days → exercises with sets × reps, RIR and rest. */
export function DesignPreview({ design }: { design: Design }) {
  return (
    <ol className="space-y-3">
      {design.days.map((d, i) => (
        <li key={d.key} className="rounded-xl bg-card2 p-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-faint num">Day {i + 1}</span>
            <h3 className="min-w-0 flex-1 truncate font-semibold">{d.name}</h3>
            <span className="shrink-0 text-xs text-mute num">~{dayMinutes(d)} min</span>
          </div>
          {d.focus && <p className="mb-1.5 text-xs text-mute">{d.focus}</p>}
          <ul className="divide-y divide-line/50">
            {d.items.map((it, k) => (
              <li key={k} className="flex items-center gap-2 py-1.5 text-sm">
                {it.tag && <span className="w-6 shrink-0 text-[11px] font-semibold text-info">{it.tag}</span>}
                <span className="min-w-0 flex-1 truncate">{EXERCISES[it.ex]?.name ?? it.ex}</span>
                <span className="shrink-0 font-semibold num">{schemeLabel(it)}</span>
                <span className="w-12 shrink-0 text-right text-[11px] text-mute num">{rirLabel(it)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
