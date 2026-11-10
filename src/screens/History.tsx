import { useState } from "react";
import { AlertTriangle, ChevronRight, Clock, Dumbbell, History as HistoryIcon, Weight } from "lucide-react";
import type { AppState, DashboardData, HistoryRow } from "../../shared/api";
import { EXCUSES } from "../../shared/lists";
import { useLoad } from "../lib/useLoad";
import { clock, cx, niceDate, today } from "../lib/util";
import { Badge, Card, Empty, PageHead } from "../components/ui";
import { Heatmap } from "../components/Heatmap";
import { EXCUSE_ICON } from "../components/StartSheets";
import { weekConfig } from "../../shared/week";

type Filter = "all" | "workouts" | "missed";

export default function History() {
  const { data, error } = useLoad<HistoryRow[]>("/history");
  const { data: d } = useLoad<DashboardData>(`/dashboard?today=${today()}`);
  const { data: s } = useLoad<AppState>("/state");
  const [f, setF] = useState<Filter>("all");
  if (!data) return <p className="py-20 text-center text-mute">{error ?? "Loading…"}</p>;

  const rows = data.filter((r) => f === "all" || (f === "missed" ? r.status === "missed" || r.status === "skipped" : r.status !== "missed" && r.status !== "skipped"));
  const groups = new Map<number, HistoryRow[]>();
  rows.forEach((r) => groups.set(r.week, [...(groups.get(r.week) ?? []), r]));

  return (
    <div>
      <PageHead icon={HistoryIcon} title="History" sub="Every workout and missed day — tap one to edit" />

      <Card className="mb-4">
        <Heatmap days={d?.days} weekStart={s ? weekConfig(s.settings, s.schedules).weekStart : 1} />
      </Card>

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-card p-1 text-sm">
        {(["all", "workouts", "missed"] as Filter[]).map((k) => (
          <button key={k} onClick={() => setF(k)} className={cx("min-h-10 rounded-lg capitalize", f === k ? "bg-card3 font-semibold" : "text-mute")}>{k}</button>
        ))}
      </div>

      {!rows.length && <Empty icon={HistoryIcon}>Nothing here yet. Finished workouts and missed days show up here.</Empty>}

      <div className="space-y-5">
        {[...groups.entries()].map(([w, list]) => (
          <section key={w}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-mute">Week {w}</div>
            <div className="space-y-2">
              {list.map((r) => {
                if (r.status === "missed" || r.status === "skipped") {
                  const Ic = EXCUSE_ICON[r.excuse ?? "other"] ?? EXCUSE_ICON.other;
                  return (
                    <div key={r.id} className="flex items-center gap-3 rounded-xl border border-dashed border-bad/40 px-4 py-3 text-sm">
                      <Ic size={18} className="shrink-0 text-bad" />
                      <span className="min-w-0 flex-1">
                        <span className="block">{r.status === "skipped" ? "Skipped" : "Missed"} {r.dayName} · <span className="text-bad">{EXCUSES.find((e) => e.id === r.excuse)?.label ?? r.excuse}</span></span>
                        {r.note && <span dir="auto" className="bidi block truncate text-xs text-mute">{r.note}</span>}
                      </span>
                      <span className="text-xs text-mute">{niceDate(r.date)}</span>
                    </div>
                  );
                }
                return (
                  <a key={r.id} href={`#/s/${r.id}`} className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 hover:bg-card2">
                    <div className="w-14 shrink-0 text-center">
                      <div className="text-[11px] uppercase text-mute">{niceDate(r.date).split(" ")[0]}</div>
                      <div className="text-lg font-bold num">{r.date.slice(8)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-semibold">
                        {r.dayName}
                        {r.kind !== "planned" && <Badge>{r.kind}</Badge>}
                        {r.status === "abandoned" && <Badge tone="warn">partial</Badge>}
                        {r.status === "active" && <Badge tone="warn">in progress</Badge>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-mute num">
                        {r.startedAt && r.endedAt && <span className="inline-flex items-center gap-1"><Clock size={11} />{clock(r.endedAt - r.startedAt)}</span>}
                        <span className="inline-flex items-center gap-1"><Dumbbell size={11} />{r.sets} sets</span>
                        <span className="inline-flex items-center gap-1"><Weight size={11} />{r.volume.toLocaleString()} kg</span>
                        {r.rpe && <span>effort {r.rpe}/10</span>}
                        {r.pains > 0 && <span className="inline-flex items-center gap-1 text-bad"><AlertTriangle size={11} />{r.pains} pain</span>}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-faint" />
                  </a>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
