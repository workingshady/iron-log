import { useState } from "react";
import { ChevronDown, Target } from "lucide-react";
import type { AppState, Lifts } from "../../shared/api";
import { CURRENT } from "../../program";
import { EXERCISES } from "../../program/exercises";
import { recommend } from "../../shared/recommend";
import { loadOf } from "../../shared/load";
import { cx, kg, niceDate } from "../lib/util";
import { useLoad } from "../lib/useLoad";
import { Card } from "./ui";

type Item = {
  exKey: string; name: string; target: { sets: number; reps: number | [number, number] | null; rir: number | [number, number] | null };
  suggested: { weightKg: number | null; reps: number | null; seconds: number | null; kind: string } | null;
  done: { kg: number | null; reps: number | null; seconds: number | null; rir: number | null; strict: number | null }[];
  topKg: number | null; avgReps: number | null; sets: number; verdict: "first" | "beat" | "hit" | "close" | "missed" | "skipped"; cheated: number; notes: string[];
};
type Row = { id: string; date: string; week: number; dayName: string; items: Item[] };

const V: Record<Item["verdict"], { label: string; cls: string }> = {
  beat: { label: "beat it", cls: "bg-acc/15 text-acc" },
  hit: { label: "hit", cls: "bg-acc/15 text-acc" },
  close: { label: "close", cls: "bg-info/15 text-info" },
  missed: { label: "missed", cls: "bg-warn/15 text-warn" },
  first: { label: "baseline", cls: "bg-card3 text-mute" },
  skipped: { label: "skipped", cls: "bg-card3 text-faint" },
};
const u = (ex: string) => (loadOf(ex) === "pair" ? "/hand" : "");
const reps = (r: Item["target"]["reps"] | undefined) => (r == null ? "max" : Array.isArray(r) ? `${r[0]}-${r[1]}` : `${r}`);

/** Recommended vs actually recorded, per session — plus what the app will recommend next time. */
export function PlanVsActual() {
  const { data } = useLoad<Row[]>("/targets");
  const { data: st } = useLoad<AppState>("/state");
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return null;

  const next = st?.next ? CURRENT.weeks.find((w) => w.n === st.next!.week)?.days.find((d) => d.key === st.next!.dayKey) : null;
  const deload = /deload/i.test(CURRENT.weeks.find((w) => w.n === st?.next?.week)?.name ?? "");

  return (
    <>
      {next && lifts && (
        <Card title={`Next session: ${next.name} — recommended weights`} icon={Target} className="md:col-span-2">
          <div className="space-y-1.5">
            {next.items.filter((x) => !x.finisher).map((rx, i) => {
              const r = recommend(rx.ex, rx, lifts.hist, { deload });
              const last = lifts.hist[rx.ex];
              const w = r.weightKg != null ? `${kg(r.weightKg)} kg${u(rx.ex)}` : r.seconds ? `${r.seconds} s` : "";
              return (
                <div key={i} className="rounded-xl bg-card2 px-3 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold">{EXERCISES[rx.ex].name}</span>
                    <span className={cx("shrink-0 num font-semibold", r.kind === "up" ? "text-acc" : r.kind === "down" ? "text-warn" : r.kind === "start" ? "text-mute" : "text-info")}>
                      {w ? `${w}${r.reps ? ` × ${r.reps}` : ""}` : r.kind === "start" ? "find it" : `${r.reps ?? ""} reps`}
                    </span>
                  </div>
                  <div className="text-xs text-mute">{rx.sets}×{reps(rx.reps)}{rx.rir != null ? ` @RIR${Array.isArray(rx.rir) ? rx.rir.join("-") : rx.rir}` : ""} · {r.why}{last ? ` · last ${niceDate(last.date)}` : ""}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Recommended vs actual" icon={Target} className="md:col-span-2">
        {!data.length && <p className="text-sm text-mute">Shows after your first finished workout.</p>}
        <div className="space-y-2">
          {data.map((s) => {
            const counted = s.items.filter((x) => x.verdict !== "skipped" && x.verdict !== "first");
            const ok = counted.filter((x) => x.verdict === "hit" || x.verdict === "beat").length;
            const isOpen = open === s.id || (open == null && s === data[0]);
            return (
              <div key={s.id} className="rounded-xl bg-card2">
                <button onClick={() => setOpen(isOpen ? "__" : s.id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm">
                  <span className="flex-1"><b>{s.dayName}</b> <span className="text-mute">· W{s.week} · {niceDate(s.date)}</span></span>
                  <span className="text-xs text-mute">{counted.length ? `${ok}/${counted.length} on target` : "baseline"}</span>
                  <ChevronDown size={16} className={cx("text-mute transition", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="overflow-x-auto px-3 pb-3">
                    <table className="w-full min-w-[320px] text-xs num">
                      <thead className="text-left text-mute"><tr><th className="py-1 font-normal">Exercise</th><th className="font-normal">Recommended</th><th className="font-normal">Actual</th><th /></tr></thead>
                      <tbody>
                        {s.items.map((x, i) => (
                          <tr key={i} className="border-t border-line/60 align-top">
                            <td className="py-1.5 pr-2">{x.name}{x.cheated > 0 && <span className="ml-1 text-bad">({x.cheated} cheat)</span>}</td>
                            <td className="pr-2 text-mute">{x.suggested?.weightKg != null ? `${kg(x.suggested.weightKg)}${u(x.exKey)} × ${x.suggested.reps ?? "?"}` : x.suggested?.kind === "start" || !x.suggested ? "—" : `${x.suggested.reps ?? ""} reps`}</td>
                            <td className="pr-2">{x.done.length ? x.done.map((d) => (d.kg != null ? `${kg(d.kg)}×${d.reps ?? d.seconds}` : `${d.reps ?? d.seconds}`)).join(", ") : "—"}</td>
                            <td><span className={cx("whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px]", V[x.verdict].cls)}>{V[x.verdict].label}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[11px] text-faint">Recommended = what the app suggested when you logged the set. "Baseline" = first time, nothing to compare yet. Dumbbell weights are per hand.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
