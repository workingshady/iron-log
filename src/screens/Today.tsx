import { useEffect, useState } from "react";
import type { AppState, Readiness, Session, SessionBundle, SlotInfo } from "../../shared/api";
import { buildPlan } from "../../shared/plan";
import { CURRENT, programVersionId } from "../../program";
import { EXCUSES, READINESS } from "../../shared/lists";
import { cache, queue, send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { clock, cx, today, tz } from "../lib/util";
import { Btn, Chips, Label, Sheet, scale } from "../components/ui";
import { go } from "../App";

export default function Today() {
  const { data: s, error, reload } = useLoad<AppState>("/state");
  const [sheet, setSheet] = useState<null | "start" | "missed" | "pick">(null);
  const [target, setTarget] = useState<SlotInfo | null>(null);

  if (!s) return <p className="py-20 text-center text-mute">{error ?? "Loading…"}</p>;

  const next = s.next;
  const week = next ? s.weeks.find((w) => w.n === next.week) : null;
  const weekSlots = next ? s.slots.filter((x) => x.week === next.week) : [];
  const sched = s.settings.schedule ? s.schedules[s.settings.schedule] : null;
  const todayPlan = sched?.[new Date().getDay()];

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Today</h1>
        <span className="text-xs text-mute">{s.program.name} · v{s.program.version}</span>
      </header>

      {s.active && <ActiveCard a={s.active} />}

      {next ? (
        <section className="rounded-2xl bg-card p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-mute">
            Week {next.week} · {week?.name}
            {todayPlan === "rest" && <span className="ml-2 text-warn">· rest day on your schedule</span>}
          </div>
          <div className="mt-1 text-3xl font-bold">{next.dayName}</div>
          <div className="mt-1 text-sm text-mute">{next.focus}</div>
          <div className="mt-1 text-sm text-mute">{next.items} exercises</div>
          {!s.active && (
            <Btn kind="primary" className="mt-5 w-full text-lg" onClick={() => { setTarget(next); setSheet("start"); }}>
              Start workout
            </Btn>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn kind="soft" onClick={() => { setTarget(next); setSheet("missed"); }}>Can't train</Btn>
            <Btn kind="soft" onClick={() => setSheet("pick")}>Other day</Btn>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl bg-card p-5">
          <div className="text-2xl font-bold">Program complete 🎉</div>
          <p className="mt-2 text-sm text-mute">Do your re-tests (Me → Tests), run <code>npm run export</code> and ask Claude for the next version.</p>
        </section>
      )}

      {week && (
        <section className="rounded-2xl bg-card p-4">
          <div className="flex gap-1.5">
            {weekSlots.map((x) => (
              <div key={x.dayKey} className="flex-1 text-center">
                <div className={cx("mx-auto h-2 rounded-full", x.status === "done" ? "bg-acc" : x.status === "skipped" ? "bg-mute" : x === next ? "bg-ink" : "bg-line")} />
                <div className="mt-1.5 truncate text-[11px] text-mute">{x.dayName}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-mute">{week.brief}</p>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat n={s.thisWeek.done} label="done · 7d" />
        <Stat n={s.thisWeek.missed} label="missed · 7d" />
        <Stat n={s.thisWeek.minutes} label="minutes · 7d" />
      </section>

      <StartSheet open={sheet === "start"} slot={target} kind={target && target !== next ? (target.status === "open" ? "picked" : "extra") : "planned"} onClose={() => setSheet(null)} />
      <MissedSheet open={sheet === "missed"} slot={target} onClose={() => setSheet(null)} onDone={reload} />
      <PickSheet open={sheet === "pick"} s={s} onClose={() => setSheet(null)} onPick={(x) => { setTarget(x); setSheet("start"); }} />
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl bg-card py-3">
      <div className="text-xl font-bold num">{n}</div>
      <div className="text-[11px] text-mute">{label}</div>
    </div>
  );
}

function ActiveCard({ a }: { a: NonNullable<AppState["active"]> }) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <a href={`#/s/${a.id}`} className="flex items-center justify-between rounded-2xl border border-acc bg-acc/10 p-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-acc">In progress</div>
        <div className="text-lg font-semibold">W{a.week} · {a.dayName}</div>
      </div>
      <div className="text-2xl font-bold num">{a.startedAt ? clock(t - a.startedAt) : ""}</div>
    </a>
  );
}

function StartSheet({ open, slot, kind, onClose }: { open: boolean; slot: SlotInfo | null; kind: "planned" | "picked" | "extra"; onClose: () => void }) {
  const [r, setR] = useState<Readiness>({});
  const [busy, setBusy] = useState(false);
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
      // offline: build the session on the phone, sync when back online
      queue("POST", "/sessions", body, `start ${id}`);
      const plan = buildPlan(CURRENT, slot!.week, slot!.dayKey);
      const session: Session = {
        id, programVersionId: programVersionId(CURRENT), week: slot!.week, dayKey: slot!.dayKey, dayName: plan.name, status: "active", kind,
        date: body.date, startedAt, endedAt: null, plan: plan.items, readiness: body.readiness, rpe: null, bodyweight: null, excuse: null, note: null,
      };
      cache.set(`bundle_${id}`, { session, sets: [], last: {} } satisfies SessionBundle);
    }
    track("session_start", { week: slot!.week, dayKey: slot!.dayKey, kind, readiness: r }, id);
    go(`/s/${id}`);
  }
  return (
    <Sheet open={open} onClose={onClose} title={`W${slot.week} · ${slot.dayName}${kind === "extra" ? " (extra)" : ""}`}>
      <p className="text-sm text-mute">How do you feel? Optional — 5 = best.</p>
      {READINESS.map((q) => (
        <div key={q.id}>
          <Label>{q.label}</Label>
          <Chips small options={scale(1, 5)} value={r[q.id] ?? null} onChange={(v) => setR({ ...r, [q.id]: v ?? undefined })} />
        </div>
      ))}
      <Btn kind="primary" className="mt-6 w-full text-lg" onClick={start} disabled={busy}>
        {busy ? "Starting…" : "Start · timer begins"}
      </Btn>
    </Sheet>
  );
}

function MissedSheet({ open, slot, onClose, onDone }: { open: boolean; slot: SlotInfo | null; onClose: () => void; onDone: () => void }) {
  const [excuse, setExcuse] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [skip, setSkip] = useState(false);
  if (!slot) return null;
  async function save() {
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
    <Sheet open={open} onClose={onClose} title="Can't train today">
      <Label>Why?</Label>
      <Chips small options={EXCUSES.map((e) => ({ id: e.id, label: e.label }))} value={excuse} onChange={setExcuse} />
      <Label>Note (optional)</Label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} className="mt-1 h-5 w-5 accent-[#c8f560]" />
        <span>
          Drop <b>{slot.dayName}</b> from the plan
          <span className="block text-mute">Off (default): {slot.dayName} stays next — the week just stretches.</span>
        </span>
      </label>
      <Btn kind="primary" className="mt-5 w-full" disabled={!excuse} onClick={save}>Save</Btn>
    </Sheet>
  );
}

function PickSheet({ open, s, onClose, onPick }: { open: boolean; s: AppState; onClose: () => void; onPick: (x: SlotInfo) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Pick a session">
      {s.weeks.map((w) => (
        <div key={w.n} className="mb-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-mute">Week {w.n} · {w.name}</div>
          <div className="grid grid-cols-3 gap-2">
            {s.slots.filter((x) => x.week === w.n).map((x) => (
              <button
                key={x.dayKey}
                onClick={() => onPick(x)}
                className={cx("min-h-12 rounded-xl border px-2 text-sm", x.status === "done" ? "border-acc/40 text-acc" : x.status === "skipped" ? "border-line text-mute line-through" : "border-line")}
              >
                {x.dayName}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-mute">Done sessions start as an extra (doesn't change your plan position).</p>
    </Sheet>
  );
}
