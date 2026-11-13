import { useMemo, useState } from "react";
import { Ban, CalendarClock, Check, Dumbbell, Eye, Medal, Moon, Trophy } from "lucide-react";
import { WorkoutPreview } from "./WorkoutPreview";
import type { AppState, HistoryRow, SlotInfo } from "../../shared/api";
import { planWeek, sportName, sportOfMark, weekDates, type Mark, type WeekPlanOut } from "../../shared/weekplan";
import { SPORTS, SPORT_INTENSITY, sportById, sportRowId } from "../../shared/lists";
import { weekConfig } from "../../shared/week";
import { queue, send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, today, tz } from "../lib/util";
import { Btn, Card, Chips, Label, Sheet } from "./ui";

const FOOTBALL_MET = 7; // recreational soccer ≈ 7 METs (Compendium of Physical Activities); other sports: SPORTS[].met

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
    const { weekStart, schedule } = weekConfig(s.settings, s.schedules);
    const dates = weekDates(t, weekStart);
    const wk = s.next?.week;
    const slots = wk ? s.slots.filter((x) => x.week === wk) : [];
    const doneOn: Record<string, string> = {};
    for (const h of hist ?? []) if (h.status === "done" && h.kind !== "extra" && dates.some((d) => d.iso === h.date)) doneOn[h.date] = h.dayName;
    return planWeek({ today: t, dates, schedule, slots, doneOn, marks });
  }, [s, hist, marks]);
  return { s, plan, marks, reload: () => { reloadState(); reloadHist(); } };
}

/**
 * THE next session, for every screen (Home, Plan, Stats, start sheets): today's session if the adapted week trains
 * today, otherwise the next planned day. Follows football / busy / rest marks and your pins (📌). Falls back to the
 * program order (server's `next`) only when the week can't place anything.
 */
export function useNextSession(): { next: SlotInfo | null; iso: string | null; isToday: boolean; adapted: boolean } {
  const { s, plan } = useWeekPlan();
  if (!s) return { next: null, iso: null, isToday: false, adapted: false };
  const slotOf = (key?: string | null) => (key && s.next ? s.slots.find((x) => x.week === s.next!.week && x.dayKey === key && x.status !== "done") ?? null : null);
  const today = plan?.days.find((x) => x.today);
  const day = today?.kind === "planned" ? today : plan?.days.find((x) => x.kind === "planned" && !x.today && x.iso > (today?.iso ?? ""));
  const slot = slotOf(day?.dayKey);
  if (slot && day) return { next: slot, iso: day.iso, isToday: !!day.today, adapted: slot.dayKey !== s.next?.dayKey };
  return { next: s.next, iso: null, isToday: false, adapted: false };
}

const TILE: Record<string, string> = {
  done: "bg-acc/15 text-acc", planned: "bg-info/15 text-info", football: "bg-warn/20 text-warn", sport: "bg-warn/20 text-warn",
  busy: "bg-card3 text-faint", rest: "bg-card2 text-mute", past: "bg-card2 text-faint",
};
const short = (name?: string) => (name ?? "").replace("Shoulders + Arms", "Sh+Arms").replace("Chest + Back", "Ch+Back");

export function WeekPlanner({ compact }: { compact?: boolean }) {
  const { s, plan, marks, reload } = useWeekPlan();
  const [day, setDay] = useState<string | null>(null);
  if (!s || !plan) return null;

  async function setMark(iso: string, m: Mark | null) {
    // a logged game belongs to its mark: changing / clearing the sport deletes that day's row
    const was = sportOfMark(marks[iso]), now = sportOfMark(m);
    if (was && was.id !== now?.id) queue("DELETE", `/cardio/${sportRowId(was.id, iso)}`, undefined, `sport-del ${was.id} ${iso}`);
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
          <button key={d.iso} onClick={() => setDay(d.iso)} aria-label={`${new Date(`${d.iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", day: "numeric", timeZone: "UTC" })}: ${d.sport ? sportById(d.sport)?.label ?? d.kind : d.dayName ?? d.kind}`} className={cx("flex min-h-16 flex-col items-center justify-start rounded-lg px-0.5 py-1.5 text-center", TILE[d.kind], d.today && "ring-2 ring-ink")}>
            <span className="text-[10px] uppercase opacity-80">{"SMTWTFS"[d.dow]}</span>
            <span className="text-sm font-bold num leading-tight">{Number(d.iso.slice(8))}</span>
            <span className="mt-0.5 line-clamp-2 text-[9px] leading-tight">
              {d.kind === "football" || d.kind === "sport" ? sportById(d.sport)?.emoji ?? "🏅" : d.kind === "busy" ? "busy" : d.kind === "rest" ? "rest" : d.kind === "past" ? "" : short(d.dayName)}{(d.kind === "done" || d.kind === "planned") && d.sport ? ` ${sportById(d.sport)?.emoji ?? ""}` : ""}{d.pinned ? " 📌" : ""}
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
              const sp = u.sport ?? "football";
              if (!confirm(`Skip ${u.dayName} this week (counts ${sp} as your leg day)?`)) return;
              queue("POST", "/missed", { id: uid(), week: s.next?.week, dayKey: u.dayKey, date: today(), excuse: "sport", note: `${sp.charAt(0).toUpperCase()}${sp.slice(1)} this week — legs loaded`, tz: tz(), skip: true }, `skip-sport ${u.dayKey} ${today()}`);
              track("session_skip", { excuse: "sport", dayKey: u.dayKey });
              setTimeout(reload, 800);
            }}>Skip {u.dayName} this week ({u.sport ?? "football"})</Btn>
          ) : null}
        </div>
      ))}
      <p className="mt-2 text-[11px] text-faint">Tap a day: ⚽ football, another sport, busy, or pick the session yourself (📌). The rest re-fits around it.</p>

      {day && <DaySheet iso={day} week={s.next?.week} mark={marks[day] ?? null} plan={plan} open={(s.next ? s.slots.filter((x) => x.week === s.next!.week && x.status === "open") : [])} onClose={() => setDay(null)} onMark={(m) => { setMark(day, m); }} />}
    </Card>
  );
}

function DaySheet({ iso, week, mark, plan, open, onClose, onMark }: { iso: string; week?: number; mark: Mark | null; plan: WeekPlanOut; open: { dayKey: string; dayName: string }[]; onClose: () => void; onMark: (m: Mark | null) => void }) {
  const d = plan.days.find((x) => x.iso === iso);
  const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short" });
  const past = iso <= today();
  const [min, setMin] = useState<number | null>(90);
  const [int, setInt] = useState<keyof typeof SPORT_INTENSITY | null>("normal");
  const [note, setNote] = useState("");
  const [logged, setLogged] = useState(false);
  const [picking, setPicking] = useState(false);
  const sport = sportOfMark(mark);
  const isFootball = mark === "football";
  const [preview, setPreview] = useState(false);
  const { data: body } = useLoad<{ weightKg: number | null }[]>("/body");
  const kg = body?.find((b) => b.weightKg)?.weightKg ?? 80;
  return (
    <Sheet open onClose={onClose} title={label} icon={CalendarClock}>
      {d && <p className="text-sm text-mute">{d.kind === "planned" ? `Planned: ${d.dayName}${d.note ? ` — ${d.note}` : ""}` : d.kind === "done" ? `Done: ${d.dayName}` : d.kind === "football" || d.kind === "sport" ? `${sportById(d.sport)?.label ?? "Sport"} day — no lifting.` : d.kind === "busy" ? "Marked busy." : "Rest day."}</p>}
      {d?.kind === "planned" && d.dayKey && week && (
        <Btn kind="soft" icon={Eye} className="mt-2 w-full" onClick={() => { setPreview(true); track("preview_open", { from: "week", dayKey: d.dayKey }); }}>Preview {d.dayName}</Btn>
      )}
      {preview && d?.dayKey && week && <WorkoutPreview week={week} dayKey={d.dayKey} onClose={() => setPreview(false)} />}
      {iso >= today() && !sport && mark !== "busy" && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs text-mute">Plan this day yourself</div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => onMark(null)} className={cx("min-h-10 rounded-full border px-3 text-sm", !mark ? "border-acc bg-acc/10 text-acc" : "border-line")}>Auto</button>
            <button onClick={() => onMark("rest")} className={cx("min-h-10 rounded-full border px-3 text-sm", mark === "rest" ? "border-acc bg-acc/10 text-acc" : "border-line")}>Rest</button>
            {open.map((o) => (
              <button key={o.dayKey} onClick={() => onMark(`pin:${o.dayKey}`)} className={cx("min-h-10 rounded-full border px-3 text-sm", mark === `pin:${o.dayKey}` ? "border-acc bg-acc/10 text-acc" : "border-line")}>{o.dayName}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-faint">Your choice is fixed; the rest of the week re-fits around it. Legs can't be pinned next to football.</p>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Btn kind={isFootball ? "primary" : "soft"} icon={Trophy} onClick={() => { setPicking(false); setLogged(false); onMark(isFootball ? null : "football"); }}>⚽ Football</Btn>
        <Btn kind={sport && !isFootball ? "primary" : picking ? "primary" : "soft"} icon={Medal} onClick={() => setPicking(!picking)}>{sport && !isFootball ? `${sport.emoji} ${sport.label}` : "Other sport"}</Btn>
        <Btn kind={mark === "busy" ? "primary" : "soft"} icon={Moon} onClick={() => onMark(mark === "busy" ? null : "busy")}>Busy</Btn>
        <Btn kind="soft" icon={Dumbbell} disabled={!mark} onClick={() => { setLogged(false); onMark(null); }}>Clear</Btn>
      </div>
      {picking && (
        <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label="Pick a sport">
          {SPORTS.filter((x) => x.id !== "football").map((x) => (
            <button key={x.id} type="button" aria-pressed={sport?.id === x.id && !isFootball}
              onClick={() => { setPicking(false); setLogged(false); onMark(`sport:${x.id}`); track("sport_mark", { iso, sport: x.id }); }}
              className={cx("flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-center text-xs leading-tight", sport?.id === x.id && !isFootball ? "border-acc bg-acc/10 font-semibold text-acc" : "border-line text-ink hover:bg-card2")}>
              <span className="text-lg leading-none" aria-hidden>{x.emoji}</span>
              <span className="mt-1 w-full truncate">{x.label}</span>
            </button>
          ))}
        </div>
      )}
      {sport && past && !picking && (
        <div className="mt-4 rounded-xl border border-line p-3">
          <div className="text-sm font-semibold">Log {isFootball ? "the game" : sportName(sport)} (counts as cardio)</div>
          <Label>Minutes</Label>
          <Chips clearable={false} options={[30, 45, 60, 90, 120].map((m) => ({ id: m, label: `${m}` }))} value={min} onChange={setMin} />
          <Label>Intensity</Label>
          <Chips clearable={false} options={isFootball ? [{ id: "easy" as const, label: "Easy kick-about" }, { id: "normal" as const, label: "Normal game" }, { id: "hard" as const, label: "Hard match" }] : [{ id: "easy" as const, label: "Easy" }, { id: "normal" as const, label: "Normal" }, { id: "hard" as const, label: "Hard" }]} value={int} onChange={setInt} />
          <Label>Note</Label>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="optional" aria-label="Note" className="min-h-11 w-full min-w-0 rounded-lg bg-card2 px-3 text-sm outline-none focus:ring-2 focus:ring-acc" />
          <Btn kind="primary" icon={Check} className="mt-3 w-full" disabled={logged} onClick={() => {
            const i = SPORT_INTENSITY[int ?? "normal"];
            const met = isFootball ? (int === "easy" ? 5 : int === "hard" ? 9 : FOOTBALL_MET) : sport.met * i.k;
            queue("PUT", `/cardio/${sportRowId(sport.id, iso)}`, { date: iso, protocol: sport.id, status: "done", minutes: min, kcalEst: Math.round((met * kg * (min ?? 0)) / 60), rpe: i.rpe, note: note.trim() || int }, `${isFootball ? "football" : `sport ${sport.id}`} ${iso}`);
            track(isFootball ? "football_log" : "sport_log", { iso, sport: sport.id, min, int });
            setLogged(true);
          }}>{logged ? "Logged ✓" : "Save"}</Btn>
        </div>
      )}
      <p className="mt-4 text-xs text-mute">No lifting on a sport day. Leg-heavy sports keep heavy Legs a day away on both sides; shoulder-heavy ones push presses back a day.</p>
    </Sheet>
  );
}
