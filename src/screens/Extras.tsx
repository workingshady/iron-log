import { useMemo, useState } from "react";
import { Ban, Check, ChevronRight, Dumbbell, Play, RotateCcw } from "lucide-react";
import type { AppState, HistoryRow, Lifts, PlanItem } from "../../shared/api";
import { CURRENT } from "../../program";
import { toItem, targetLabel } from "../../shared/plan";
import { recommend } from "../../shared/recommend";
import { loadOf } from "../../shared/load";
import { EXCUSES } from "../../shared/lists";
import { weekConfig } from "../../shared/week";
import { queue, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, kg, niceDate, restLabel, today } from "../lib/util";
import { Btn, Chips, Empty, PageHead, Sheet, Thumb } from "../components/ui";
import { StartSheet } from "../components/StartSheets";
import { ExerciseSheet } from "../components/ExerciseSheet";
import { go } from "../nav";

const TARGET = 2; // per week (program rule: ≤ 2×/week, never the day before Pull)

/** Monday-or-your-week-start of the week containing iso. */
function weekStartOf(iso: string, startDow: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - startDow + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/** Optional extra sessions (Grip & Wrist): this week vs target, start, skip with a reason, history, per-exercise targets. */
export default function Extras() {
  const { data: s } = useLoad<AppState>("/state");
  const { data: hist, reload } = useLoad<HistoryRow[]>("/history");
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const [start, setStart] = useState(false);
  const [skip, setSkip] = useState(false);
  const [how, setHow] = useState<PlanItem | null>(null);
  const curWeek = s?.next?.week ?? s?.active?.week ?? 1;
  const week = CURRENT.weeks.find((w) => w.n === curWeek) ?? CURRENT.weeks[0];
  const extra = week.extras?.[0];
  const ws = weekConfig(s?.settings, CURRENT.schedules).weekStart;

  const rows = useMemo(() => (hist ?? []).filter((h) => h.dayKey.startsWith("X")), [hist]);
  const thisWeek = weekStartOf(today(), ws);
  const doneWeek = rows.filter((r) => r.status === "done" && weekStartOf(r.date, ws) === thisWeek);
  const skippedWeek = rows.filter((r) => r.status === "skipped" && weekStartOf(r.date, ws) === thisWeek);
  const last = rows.find((r) => r.status === "done");
  // last 8 weeks: done count per week
  const weeks = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const d = new Date(`${thisWeek}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 7 * (7 - i));
    const w = d.toISOString().slice(0, 10);
    return { w, n: rows.filter((r) => r.status === "done" && weekStartOf(r.date, ws) === w).length, skipped: rows.some((r) => r.status === "skipped" && weekStartOf(r.date, ws) === w) };
  }), [rows, thisWeek, ws]);
  const activeExtra = s?.active && rows.find((r) => r.id === s.active!.id);

  if (!extra) return <Empty icon={Dumbbell}>No optional extra in this program week.</Empty>;
  const items = extra.items.map((rx) => ({ rx, it: toItem(rx.ex, rx) }));

  return (
    <div>
      <PageHead icon={Dumbbell} title={extra.name} sub={`${extra.focus} · optional · up to ${TARGET}× a week · never the day before Pull (grip must be fresh)`} />

      {/* this week */}
      <section className="rounded-2xl bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {Array.from({ length: TARGET }, (_, i) => (
              <span key={i} className={cx("flex h-10 w-10 items-center justify-center rounded-full", i < doneWeek.length ? "bg-acc text-acc-ink" : "border-2 border-dashed border-line text-faint")}>
                {i < doneWeek.length ? <Check size={18} strokeWidth={3} /> : i + 1}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold num">{doneWeek.length}/{TARGET} this week</div>
            <div className="text-xs text-mute">
              {last ? `Last: ${niceDate(last.date)} · ${last.sets} sets` : "Not done yet"}
              {skippedWeek.length ? ` · skipped (${EXCUSES.find((e) => e.id === skippedWeek[0].excuse)?.label ?? skippedWeek[0].excuse})` : ""}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          {s?.active ? (
            <Btn kind="primary" icon={RotateCcw} onClick={() => go(`/s/${s.active!.id}`)}>{activeExtra ? "Continue" : `Finish ${s.active.dayName} first`}</Btn>
          ) : (
            <Btn kind="primary" icon={Play} onClick={() => setStart(true)}>Start {extra.name}</Btn>
          )}
          <Btn kind="soft" icon={Ban} disabled={!!s?.active || doneWeek.length >= TARGET} onClick={() => setSkip(true)}>Skip</Btn>
        </div>
        {/* 8-week consistency */}
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-mute"><span>Last 8 weeks</span><span className="num">{weeks.filter((w) => w.n > 0).length}/8 weeks trained</span></div>
          <div className="grid grid-cols-8 gap-1">
            {weeks.map((w) => (
              <div key={w.w} title={`${w.w}: ${w.n} done${w.skipped ? ", skipped" : ""}`} className={cx("h-6 rounded-md", w.n >= TARGET ? "bg-acc" : w.n === 1 ? "bg-acc/45" : w.skipped ? "bg-bad/30" : "bg-card3", w.w === thisWeek && "ring-2 ring-info")} />
            ))}
          </div>
          <div className="mt-1 flex gap-3 text-[10px] text-faint"><span>■ 2×</span><span className="text-acc/70">■ 1×</span><span className="text-bad/70">■ skipped</span></div>
        </div>
      </section>

      {/* today's targets with recommended weights */}
      <section className="mt-3 rounded-2xl bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-mute">Week {curWeek} targets</h2>
        <ul className="space-y-1.5">
          {items.map(({ rx, it }) => {
            const rec = recommend(rx.ex, rx, lifts?.hist ?? {}, {});
            const unit = loadOf(rx.ex) === "pair" ? "/hand" : "";
            return (
              <li key={rx.ex}>
                <button onClick={() => setHow(it)} className="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left hover:bg-card2">
                  <Thumb yt={it.yt[0]} className="h-9 w-12" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{it.name}</div>
                    <div className="text-xs text-mute num">{targetLabel(rx)} · {restLabel(rx.rest)}{rec.weightKg != null ? <span className="text-info"> · {kg(rec.weightKg)} kg{unit}{rec.reps ? ` × ${rec.reps}` : ""}</span> : rec.seconds ? <span className="text-info"> · {rec.seconds} s</span> : null}</div>
                  </div>
                  <ChevronRight size={16} className="text-faint" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* history */}
      <section className="mt-3 rounded-2xl bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-mute">History</h2>
        {!rows.length && <p className="text-sm text-mute">Nothing yet — every session and skip shows up here.</p>}
        <ul className="divide-y divide-line/60">
          {rows.slice(0, 20).map((r) => (
            <li key={r.id}>
              <button onClick={() => r.status !== "skipped" && go(`/s/${r.id}`)} className="flex w-full items-center gap-3 py-2.5 text-left text-sm">
                <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", r.status === "done" ? "bg-acc" : r.status === "active" ? "bg-warn" : "bg-bad")} />
                <span className="w-24 shrink-0 text-mute">{niceDate(r.date)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {r.status === "skipped" ? <span className="text-bad">Skipped · {EXCUSES.find((e) => e.id === r.excuse)?.label ?? r.excuse}</span> : `${r.sets} sets${r.volume ? ` · ${Math.round(r.volume)} kg` : ""}${r.status === "active" ? " · in progress" : ""}`}
                </span>
                {r.status !== "skipped" && <ChevronRight size={15} className="text-faint" />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <StartSheet open={start} slot={start ? { week: curWeek, dayKey: extra.key, dayName: extra.name, focus: extra.focus, items: extra.items.length, status: "open" } : null} kind="extra" onClose={() => setStart(false)} />
      {skip && <SkipSheet onClose={() => setSkip(false)} onSkip={(excuse, note) => {
        const id = uid();
        queue("POST", "/missed", { id, week: curWeek, dayKey: extra.key, date: today(), excuse, note, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, skip: true, kind: "extra" }, `skip ${extra.key}`);
        track("extra_skip", { dayKey: extra.key, excuse });
        setSkip(false);
        setTimeout(reload, 400);
      }} />}
      {how && <ExerciseSheet item={how} onClose={() => setHow(null)} />}
    </div>
  );
}

function SkipSheet({ onClose, onSkip }: { onClose: () => void; onSkip: (excuse: string, note: string | null) => void }) {
  const [ex, setEx] = useState<string | null>(null);
  const [note, setNote] = useState("");
  return (
    <Sheet open onClose={onClose} title="Skip Grip & Wrist this time" icon={Ban}>
      <p className="mb-2 text-sm text-mute">Saved with the reason so the monthly review sees patterns. Your main plan isn't affected.</p>
      <Chips small options={EXCUSES.map((e) => ({ id: e.id, label: e.label }))} value={ex} onChange={setEx} />
      <textarea dir="auto" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)" className="mt-3 w-full rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
      <Btn kind="primary" className="mt-3 w-full" disabled={!ex} onClick={() => ex && onSkip(ex, note.trim() || null)}>Save skip</Btn>
    </Sheet>
  );
}
