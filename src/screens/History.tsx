import type { HistoryRow } from "../../shared/api";
import { EXCUSES } from "../../shared/lists";
import { useLoad } from "../lib/useLoad";
import { clock, cx, niceDate } from "../lib/util";
import { Empty } from "../components/ui";

const excuseLabel = (id: string | null) => EXCUSES.find((e) => e.id === id)?.label ?? id ?? "";

export default function History() {
  const { data, error } = useLoad<HistoryRow[]>("/history");
  if (!data) return <p className="py-20 text-center text-mute">{error ?? "Loading…"}</p>;

  // group by program week
  const groups = new Map<number, HistoryRow[]>();
  data.forEach((r) => groups.set(r.week, [...(groups.get(r.week) ?? []), r]));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">History</h1>
      {!data.length && <Empty>Nothing yet. Your first workout will show up here.</Empty>}
      {[...groups.entries()].map(([w, rows]) => (
        <section key={w}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-mute">Week {w}</div>
          <div className="space-y-2">
            {rows.map((r) =>
              r.status === "missed" || r.status === "skipped" ? (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm">
                  <span className="w-20 text-mute">{niceDate(r.date)}</span>
                  <span className="flex-1">
                    {r.status === "skipped" ? "Skipped" : "Missed"} {r.dayName} · <span className="text-warn">{excuseLabel(r.excuse)}</span>
                    {r.note && <span className="block truncate text-xs text-mute">{r.note}</span>}
                  </span>
                </div>
              ) : (
                <a key={r.id} href={`#/s/${r.id}`} className="flex items-center gap-3 rounded-xl bg-card px-4 py-3">
                  <span className="w-20 text-sm text-mute">{niceDate(r.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {r.dayName}
                      {r.kind !== "planned" && <span className="ml-1 text-xs text-mute">({r.kind})</span>}
                    </span>
                    <span className="block text-xs text-mute num">
                      {r.startedAt && r.endedAt ? clock(r.endedAt - r.startedAt) + " · " : ""}
                      {r.sets} sets · {r.volume} kg{r.rpe ? ` · RPE ${r.rpe}` : ""}
                      {r.pains > 0 && <span className="text-bad"> · ⚠ {r.pains}</span>}
                    </span>
                  </span>
                  <span className={cx("rounded-full px-2 py-0.5 text-[11px]", r.status === "done" ? "bg-acc/15 text-acc" : r.status === "active" ? "bg-warn/15 text-warn" : "bg-card2 text-mute")}>
                    {r.status === "abandoned" ? "partial" : r.status}
                  </span>
                </a>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
