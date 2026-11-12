import { useState } from "react";
import { VoiceButton, appendText } from "./Voice";
import {
  Battery, Bed, Briefcase, CalendarOff, Clock, Frown, HeartPulse, Moon, Plane, Play, Sun, Thermometer, Users, Warehouse, Zap, CircleHelp,
  type LucideIcon,
} from "lucide-react";
import type { AppState, Readiness, Session, SessionBundle, SlotInfo } from "../../shared/api";
import { EXCUSES, READINESS } from "../../shared/lists";
import { buildPlan } from "../../shared/plan";
import { programVersionId } from "../../program";
import { useProgram } from "../lib/program";
import { cache, queue, send, track, uid } from "../lib/api";
import { cx, today, tz } from "../lib/util";
import { Btn, Chips, Label, Sheet, scale } from "./ui";
import { go } from "../nav";

export const EXCUSE_ICON: Record<string, LucideIcon> = {
  busy: Clock, work: Briefcase, tired: Battery, sleep: Bed, sore: Zap, pain: HeartPulse, sick: Thermometer, motivation: Frown,
  travel: Plane, family: Users, gym: Warehouse, weather: Sun, fasting: Moon, planned: CalendarOff, other: CircleHelp,
};
export const excuseOptions = EXCUSES.map((e) => ({ id: e.id as string, label: e.label, icon: EXCUSE_ICON[e.id] }));

const READY_HINT: Record<string, [string, string]> = {
  sleep: ["awful", "great"], energy: ["empty", "full"], mood: ["low", "great"], stress: ["very stressed", "calm"], soreness: ["very sore", "fresh"],
};

export function StartSheet({ open, slot, kind, onClose }: { open: boolean; slot: SlotInfo | null; kind: "planned" | "picked" | "extra"; onClose: () => void }) {
  const [r, setR] = useState<Readiness>({});
  const [busy, setBusy] = useState(false);
  const program = useProgram(); // the plan this user trains (default = CURRENT)
  if (!slot) return null;
  async function start() {
    setBusy(true);
    const id = uid();
    const startedAt = Date.now();
    const body = { id, week: slot!.week, dayKey: slot!.dayKey, kind, date: today(), tz: tz(), readiness: Object.keys(r).length ? r : null, startedAt };
    try {
      await send("POST", "/sessions", body);
    } catch (e) {
      if (!(e instanceof TypeError)) { alert((e as Error).message); setBusy(false); return; }
      // offline: build the session on the phone, sync later
      queue("POST", "/sessions", body, `start ${id}`);
      const plan = buildPlan(program, slot!.week, slot!.dayKey);
      const session: Session = {
        id, programVersionId: programVersionId(program), week: slot!.week, dayKey: slot!.dayKey, dayName: plan.name, status: "active", kind,
        date: body.date, startedAt, endedAt: null, plan: plan.items, readiness: body.readiness, rpe: null, bodyweight: null, excuse: null, note: null,
      };
      cache.set(`bundle_${id}`, { session, sets: [], last: {}, best: {}, feedback: {} } satisfies SessionBundle);
    }
    track("session_start", { week: slot!.week, dayKey: slot!.dayKey, kind, readiness: r }, id);
    setBusy(false);
    go(`/s/${id}`);
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Week ${slot.week} · ${slot.dayName}${kind === "extra" ? " (extra)" : ""}`} icon={Play}>
      <p className="text-sm text-mute">Quick check-in (optional). It helps the monthly review see why some days are weaker.</p>
      {READINESS.map((q) => (
        <div key={q.id}>
          <div className="mb-1.5 mt-4 flex justify-between text-xs text-mute">
            <span className="font-medium uppercase tracking-wide">{q.label.replace(/ \(.*\)/, "")}</span>
            <span>1 = {READY_HINT[q.id][0]} · 5 = {READY_HINT[q.id][1]}</span>
          </div>
          <Chips small options={scale(1, 5)} value={r[q.id] ?? null} onChange={(v) => setR({ ...r, [q.id]: v ?? undefined })} />
        </div>
      ))}
      <Btn kind="primary" icon={Play} className="mt-6 w-full text-lg" onClick={start} disabled={busy}>
        {busy ? "Starting…" : "Start — clock begins"}
      </Btn>
    </Sheet>
  );
}

export function MissedSheet({ open, slot, onClose, onDone }: { open: boolean; slot: SlotInfo | null; onClose: () => void; onDone: () => void }) {
  const [excuse, setExcuse] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [skip, setSkip] = useState(false);
  if (!slot) return null;
  function save() {
    const id = uid();
    queue("POST", "/missed", { id, week: slot!.week, dayKey: slot!.dayKey, date: today(), excuse, note: note || null, tz: tz(), skip }, `missed ${id}`);
    track(skip ? "session_skip" : "session_missed", { excuse, week: slot!.week, dayKey: slot!.dayKey }, id);
    setExcuse(null);
    setNote("");
    setSkip(false);
    onClose();
    setTimeout(onDone, 800);
  }
  return (
    <Sheet open={open} onClose={onClose} title="Can't train today" icon={CalendarOff}>
      <p className="text-sm text-mute">No guilt — just log why. Patterns here shape next month's plan.</p>
      <Label>Reason</Label>
      <Chips small tone="bad" options={excuseOptions} value={excuse} onChange={setExcuse} />
      <Label>Note (optional)</Label>
      <div className="flex gap-1.5">
        <textarea dir="auto" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="min-w-0 flex-1 rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
        <VoiceButton onText={(t) => setNote((v) => appendText(v, t))} />
      </div>
      <label className="mt-4 flex items-start gap-3 rounded-xl bg-card2 p-3 text-sm">
        <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#c8f560]" />
        <span>
          Drop <b>{slot.dayName}</b> from the plan
          <span className="block text-mute">Leave off (normal): {slot.dayName} stays next and the week just stretches.</span>
        </span>
      </label>
      <Btn kind="primary" className="mt-5 w-full" disabled={!excuse} onClick={save}>Save</Btn>
    </Sheet>
  );
}

export function PickSheet({ open, s, onClose, onPick }: { open: boolean; s: AppState; onClose: () => void; onPick: (x: SlotInfo) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Pick a session">
      {s.weeks.map((w) => (
        <div key={w.n} className="mb-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-mute">Week {w.n} · {w.name}</div>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
            {s.slots.filter((x) => x.week === w.n).map((x) => (
              <button
                key={x.dayKey}
                onClick={() => onPick(x)}
                className={cx("min-h-12 rounded-xl px-2 text-sm", x.status === "done" ? "bg-acc/15 text-acc" : x.status === "skipped" ? "bg-card2 text-faint line-through" : "bg-card2 hover:bg-card3")}
              >
                {x.dayName}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-mute">Green = done. Doing a done session again counts as an extra and doesn't move your place in the plan.</p>
    </Sheet>
  );
}
