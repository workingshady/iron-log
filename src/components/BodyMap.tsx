import { useMemo, useState } from "react";
import Model from "react-body-highlighter";
import { EX_MUSCLES, MUSCLE_LABEL, muscleVolume, type Muscle } from "../../program/muscles";
import { EXERCISES } from "../../program/exercises";
import { cx } from "../lib/util";

// Body heatmap: one green scale (more weekly sets → brighter), amber = over 20 (too much).
// Tiers follow the 10-20 hard sets/week research range used by the program.
// Continuous scale: 1 shade per set from 1 to 20 (dark olive → bright green), amber above 20.
const mix = (a: string, b: string, t: number) => {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0")).join("");
};
const SHADES = [...Array.from({ length: 20 }, (_, k) => mix("#33401a", "#c8f560", k / 19)), "#ffb547"];
const shadeOf = (n: number) => (n > 20 ? 21 : Math.max(1, Math.min(20, Math.round(n))));
const colorOf = (n: number) => SHADES[shadeOf(n) - 1];

/** exSets: {exerciseKey: number of sets} for the period shown. */
export function BodyMap({ exSets, caption }: { exSets: Record<string, number>; caption?: string }) {
  const [sel, setSel] = useState<Muscle | null>(null);
  const vol = useMemo(() => muscleVolume(exSets), [exSets]);
  // One entry per muscle; frequency = colour tier (library colours by frequency).
  const data = useMemo(
    () => (Object.entries(vol) as [Muscle, number][]).filter(([, n]) => n > 0).map(([m, n]) => ({ name: m, muscles: [m], frequency: shadeOf(n) })),
    [vol],
  );
  const colors = SHADES;
  const style = { width: "100%", maxWidth: 170 };
  const click = (s: { muscle: string }) => setSel(s.muscle as Muscle);

  const list = (Object.entries(vol) as [Muscle, number][]).filter(([m]) => MUSCLE_LABEL[m]).sort((a, b) => b[1] - a[1]);
  const exFor = (m: Muscle) => Object.entries(exSets).filter(([ex]) => EX_MUSCLES[ex]?.p.includes(m) || EX_MUSCLES[ex]?.s?.includes(m));

  return (
    <div>
      <div className="flex items-start justify-center gap-2">
        <figure className="flex flex-1 flex-col items-center">
          <Model type="anterior" data={data as never} highlightedColors={colors} bodyColor="#2c2c32" style={style} onClick={click as never} />
          <figcaption className="mt-1 text-[11px] text-mute">Front</figcaption>
        </figure>
        <figure className="flex flex-1 flex-col items-center">
          <Model type="posterior" data={data as never} highlightedColors={colors} bodyColor="#2c2c32" style={style} onClick={click as never} />
          <figcaption className="mt-1 text-[11px] text-mute">Back</figcaption>
        </figure>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-mute">
        <span>sets/week: 1</span>
        <span className="inline-flex h-2.5 w-28 overflow-hidden rounded-[2px]">{SHADES.slice(0, 20).map((c) => <span key={c} className="h-full flex-1" style={{ background: c }} />)}</span>
        <span>20</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: SHADES[20] }} />20+</span>
      </div>
      {caption && <p className="mt-1 text-center text-[11px] text-faint">{caption}</p>}

      {sel ? (
        <div className="mt-3 rounded-xl bg-card2 p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <b>{MUSCLE_LABEL[sel]}</b>
            <span className="num text-mute">{Math.round((vol[sel] ?? 0) * 10) / 10} sets</span>
          </div>
          <ul className="mt-1 text-xs text-mute">
            {exFor(sel).map(([ex, n]) => (
              <li key={ex}>{EXERCISES[ex]?.name ?? ex} · {n} sets{EX_MUSCLES[ex]?.p.includes(sel) ? "" : " (½ — helper muscle)"}</li>
            ))}
            {!exFor(sel).length && <li>Not trained in this period.</li>}
          </ul>
          <button onClick={() => setSel(null)} className="mt-2 text-xs text-info">show all muscles</button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {list.map(([m, n]) => (
            <button key={m} onClick={() => setSel(m)} className="flex items-center gap-2 text-left">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(n) }} />
              <span className="flex-1 truncate text-mute">{MUSCLE_LABEL[m]}</span>
              <span className={cx("num", n > 20 ? "text-warn" : "text-ink")}>{Math.round(n * 10) / 10}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-center text-[11px] text-faint">Tap a muscle for its exercises · helper muscles count ½ set</p>
    </div>
  );
}
