import { useMemo, useState } from "react";
import { Ban, CalendarClock, Check, Dumbbell, Moon, Trophy } from "lucide-react";
import type { AppState, HistoryRow } from "../../shared/api";
import { planWeek, weekDates, type Mark, type WeekPlanOut } from "../../shared/weekplan";
import { queue, send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, today, tz } from "../lib/util";
import { Btn, Card, Chips, Label, Sheet } from "./ui";

const FOOTBALL_MET = 7; // recreational soccer ≈ 7 METs (Compendium of Physical Activities)

/** Reads marks + history and returns this week's adapted plan. Shared by Home and Plan. */
export function useWeekPlan() {
  const { data: s, reload: reloadState } = useLoad<AppState>("/state");
  const { data: hist, reload: reloadHist } = useLoad<HistoryRow[]>("/history");
  const marks = useMemo<Record<string, Mark>>(() => {
    try { return JSON.parse(s?.settings?.weekMarks ?? "{}"); } catch { return {}; }
  }, [s?.settings?.weekMarks]);
  const plan = useMemo<WeekPlanOut | null>(() => {
    if (!s) return null;
    const t = today();
    const weekStart = s.settings?.schedule?.startsWith("B") ? 6 : 1;
    const dates = weekDates(t, weekStart);
    const schedule = s.settings?.schedule ? s.schedules[s.settings.schedule] : null;
    const wk = s.next?.week;
    const slots = wk ? s.slots.filter((x) => x.week === wk) : [];
    const doneOn: Record<string, string> = {};
    for (const h of hist ?? []) if (h.status === "done" && h.kind !== "extra" && dates.some((d) => d.iso === h.date)) doneOn[h.date] = h.dayName;
    return planWeek({ today: t, dates, schedule, slots, doneOn, marks });
  }, [s, hist, marks]);
  return { s, plan, marks, reload: () => { reloadState(); reloadHist(); } };
}

const TILE: Record<string, string> = {
  done: "bg-acc/15 text-acc", planned: "bg-info/15 text-info", football: "bg-warn/20 text-warn",
  busy: "bg-card3 text-faint", rest: "bg-card2 text-mute", past: "bg-card2 text-faint",
};
const short = (name?: string) => (name ?? "").replace("Shoulders + Arms", "Sh+Arms").replace("Chest + Back", "Ch+Back");

export function WeekPlanner({ compact }: { compact?: boolean }) {
  const { s, plan, marks, reload } = useWeekPlan();
  const [day, setDay] = useState<string | null>(null);
  if (!s || !plan) return null;

  async function setMark(iso: string, m: Mark | null) {
    const next = { ...marks };
    if (m) next[iso] = m; else delete next[iso];
    // keep the last ~60 days only
    const cutoff = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    for (const k of Object.keys(next)) if (k < cutoff) delete next[k];
    await send("PUT", "/settings/weekMarks", { value: JSON.stringify(next) });
    track("week_mark", { iso, mark: m });
    reload();
  }

  return (
    <Card title={`This week${plan.summary ? ` · ${plan.summary}` : ""}`} icon={CalendarClock}>
      <div className="grid grid-cols-7 gap-1">
        {plan.days.map((d) => (
          <button key={d.iso} onClick={() => setDay(d.iso)} className={cx("flex min-h-16 flex-col items-center justify-start rounded-lg px-0.5 py-1.5 text-center", TILE[d.kind], d.today && "ring-2 ring-ink")}>
            <span className="text-[10px] uppercase opacity-80">{"SMTWTFS"[d.dow]}</span>
            <span className="text-sm font-bold num leading-tight">{Number(d.iso.slice(8))}</span>
            <span className="mt-0.5 line-clamp-2 text-[9px] leading-tight">
              {d.kind === "football" ? "⚽" : d.kind === "busy" ? "busy" : d.kind === "rest" ? "rest" : d.kind === "past" ? "" : short(d.dayName)}
            </span>
          </button>
        ))}
      </div>
      {!compact && (
        <ul className="mt-3 space-y-1 text-xs">
          {plan.days.filter((d) => d.note).map((d) => (
            <li key={d.iso} className="text-mute"><b className="text-ink">{new Date(`${d.iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short" })}</b> {d.dayName ? `${d.dayName}: ` : ""}{d.note}</li>
          ))}
        </ul>
      )}
      {plan.unplaced.map((u) => (
        <div key={u.dayKey} className="mt-2 rounded-xl bg-warn/10 p-3 text-sm">
          <div className="text-warn">{u.advice}</div>
          {u.action === "skip_sport" || u.action === "legs_lite" ? (
            <Btn kind="soft" icon={Ban} className="mt-2 min-h-10 w-full text-sm" onClick={() => {
              if (!confirm(`Skip ${u.dayName} this week (counts football as your leg day)?`)) return;
              queue("POST", "/missed", { id: uid(), week: s.next?.week, dayKey: u.dayKey, date: today(), excuse: "sport", note: "Football this week — legs loaded", tz: tz(), skip: true }, `skip-sport ${u.dayKey} ${today()}`);
              track("session_skip", { excuse: "sport", dayKey: u.dayKey });
              setTimeout(reload, 800);
            }}>Skip {u.dayName} this week (football)</Btn>
          ) : null}
        </div>
      ))}
      <p className="mt-2 text-[11px] text-faint">Tap a day to mark ⚽ football or busy — the week re-fits itself (legs ≥ 48 h away from football).</p>

      {day && <DaySheet iso={day} mark={marks[day] ?? null} plan={plan} onClose={() => setDay(null)} onMark={(m) => { setMark(day, m); }} />}
    </Card>
  );
}

function DaySheet({ iso, mark, plan, onClose, onMark }: { iso: string; mark: Mark | null; plan: WeekPlanOut; onClose: () => void; onMark: (m: Mark | null) => void }) {
  const d = plan.days.find((x) => x.iso === iso);
  const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short" });
  const past = iso <= today();
  const [min, setMin] = useState<number | null>(90);
  const [int, setInt] = useState<string | null>("normal");
  const [logged, setLogged] = useState(false);
  const { data: body } = useLoad<{ weightKg: number | null }[]>("/body");
  const kg = body?.find((b) => b.weightKg)?.weightKg ?? 80;
  return (
    <Sheet open onClose={onClose} title={label} icon={CalendarClock}>
      {d && <p className="text-sm text-mute">{d.kind === "planned" ? `Planned: ${d.dayName}${d.note ? ` — ${d.note}` : ""}` : d.kind === "done" ? `Done: ${d.dayName}` : d.kind === "football" ? "Football day — no lifting." : d.kind === "busy" ? "Marked busy." : "Rest day."}</p>}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Btn kind={mark === "football" ? "primary" : "soft"} icon={Trophy} onClick={() => onMark(mark === "football" ? null : "football")}>⚽ Football</Btn>
        <Btn kind={mark === "busy" ? "primary" : "soft"} icon={Moon} onClick={() => onMark(mark === "busy" ? null : "busy")}>Busy</Btn>
        <Btn kind="soft" icon={Dumbbell} disabled={!mark} onClick={() => onMark(null)}>Clear</Btn>
      </div>
      {mark === "football" && past && (
        <div className="mt-4 rounded-xl border border-line p-3">
          <div className="text-sm font-semibold">Log the game (counts as cardio)</div>
          <Label>Minutes</Label>
          <Chips small clearable={false} options={[30, 45, 60, 90, 120].map((m) => ({ id: m, label: `${m}` }))} value={min} onChange={setMin} />
          <Label>Intensity</Label>
          <Chips small clearable={false} options={[{ id: "easy", label: "Easy kick-about" }, { id: "normal", label: "Normal game" }, { id: "hard", label: "Hard match" }]} value={int} onChange={setInt} />
          <Btn kind="primary" icon={Check} className="mt-3 w-full" disabled={logged} onClick={() => {
            const met = int === "easy" ? 5 : int === "hard" ? 9 : FOOTBALL_MET;
            queue("PUT", `/cardio/football-${iso}`, { date: iso, protocol: "football", status: "done", minutes: min, kcalEst: Math.round((met * kg * (min ?? 0)) / 60), rpe: int === "easy" ? 4 : int === "hard" ? 9 : 7, note: int }, `football ${iso}`);
            track("football_log", { iso, min, int });
            setLogged(true);
          }}>{logged ? "Logged ✓" : "Save game"}</Btn>
        </div>
      )}
      <p className="mt-4 text-xs text-mute">The planner keeps heavy legs at least a day away from football on both sides, never lifts on a football day, and keeps your rest days unless sessions wouldn't fit.</p>
    </Sheet>
  );
}
