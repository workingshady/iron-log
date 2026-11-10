import { useState } from "react";
import { CalendarRange, Check, Clock, Flame, FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import type { DashboardData } from "../../shared/api";
import { queue, send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, localDate, niceDate, time12, today } from "../lib/util";
import { Btn, Card, Label, NumInput, PageHead, Sheet, Stat } from "../components/ui";
import { Heatmap } from "../components/Heatmap";

type Row = { id: string; date: string; amount: number; at: number };

export default function Creatine() {
  const { data: d, reload: reloadD } = useLoad<DashboardData>(`/dashboard?today=${today()}`);
  const { data: rows, reload, setData } = useLoad<Row[]>("/intake?item=creatine");
  const [custom, setCustom] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const target = d?.creatine?.target ?? 5;
  const todays = (rows ?? []).filter((r) => r.date === today());
  const g = Math.round(todays.reduce((a, r) => a + r.amount, 0) * 10) / 10;
  const pct = Math.min(100, (g / target) * 100);

  function add(amount: number) {
    if (!(amount > 0 && amount <= 50)) return alert("Enter 0.5-50 g");
    const last = (rows ?? []).filter((r) => r.date === today()).sort((a, b) => b.at - a.at)[0];
    if (last && Date.now() - last.at < 2000) return; // double-tap guard
    if (last && Date.now() - last.at < 10 * 60_000 && !confirm(`You logged ${last.amount} g a few minutes ago. Add another ${amount} g?`)) return;
    const row = { id: uid(), date: today(), item: "creatine", amount, unit: "g", at: Date.now() };
    setData([{ ...row }, ...(rows ?? [])]);
    queue("POST", "/intake", row, `intake ${row.id}`);
    track("creatine_add", { g: amount });
    setCustom("");
    setTimeout(() => { reload(); reloadD(); }, 800);
  }
  async function del(id: string) {
    setData((rows ?? []).filter((r) => r.id !== id));
    await send("DELETE", `/intake/${id}`);
    track("creatine_delete", { id });
    reloadD();
  }

  // last 30 days list (grouped)
  const byDay = new Map<string, number>();
  (rows ?? []).forEach((r) => byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amount));

  return (
    <div>
      <PageHead icon={FlaskConical} title="Creatine" sub={`Creatine monohydrate: ${target} g every day, any time. Consistency matters more than timing.`} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="md:col-span-2">
          <div className="flex items-center gap-5">
            <Ring pct={pct} ok={g >= target} />
            <div>
              <div className="text-4xl font-bold num">{g}<span className="text-lg text-mute"> / {target} g</span></div>
              <div className="text-sm text-mute">{g >= target ? "Done for today ✓" : `${Math.round((target - g) * 10) / 10} g to go today`}</div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[3, 5, 10].map((x) => (
              <Btn key={x} kind="soft" icon={Plus} className={x === target ? "!bg-vio !text-black" : ""} onClick={() => add(x)}>{x} g</Btn>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <NumInput value={custom} onChange={setCustom} placeholder="other g" />
            <Btn kind="soft" icon={Plus} onClick={() => add(Number(custom))} disabled={!custom}>Add</Btn>
          </div>
          {todays.length > 0 && (
            <div className="mt-4 space-y-1">
              {todays.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg bg-card2 px-3 py-2 text-sm">
                  <Check size={15} className="text-vio" />
                  <button onClick={() => setEditing(r)} className="flex flex-1 items-center gap-2 text-left num" aria-label="Edit time">
                    <span className="font-semibold">{r.amount} g</span>
                    <span className="inline-flex items-center gap-1 text-mute"><Clock size={13} />{time12(r.at)}</span>
                    <Pencil size={13} className="text-info" />
                  </button>
                  <button onClick={() => del(r.id)} className="-my-2 -mr-2 flex h-11 w-11 items-center justify-center text-faint hover:text-bad" aria-label="Delete"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          <Stat icon={Flame} tone="vio" value={d?.creatine?.streak ?? 0} label={`days in a row at ${target} g+`} />
          <Stat icon={CalendarRange} tone="vio" value={[...byDay.values()].filter((x) => x >= target).length} label="days on target (all time)" />
        </div>

        <Card title="Creatine calendar" icon={CalendarRange} className="md:col-span-3">
          <Heatmap mode="creatine" grams={d?.creatine?.days} target={target} />
        </Card>

        <Card title="Recent days" className="md:col-span-3">
          {[...byDay.entries()].slice(0, 14).map(([date, grams]) => (
            <div key={date} className="border-b border-line py-2 text-sm last:border-0">
              <div className="flex justify-between">
                <span className="text-mute">{niceDate(date)}</span>
                <span className={grams >= target ? "font-semibold text-vio num" : "num"}>{Math.round(grams * 10) / 10} g</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(rows ?? []).filter((r) => r.date === date).sort((x, y) => x.at - y.at).map((r) => (
                  <button key={r.id} onClick={() => setEditing(r)} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-card2 px-3 text-xs num">
                    {r.amount} g · {time12(r.at)} <Pencil size={11} className="text-info" />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!byDay.size && <p className="text-sm text-mute">Nothing logged yet. Tap a button above.</p>}
          <p className="mt-3 text-xs text-mute">Change the daily target in Settings.</p>
        </Card>
      </div>
      {editing && <EditDose row={editing} onClose={() => setEditing(null)} onSaved={(r) => { setData((rows ?? []).map((x) => (x.id === r.id ? r : x))); setEditing(null); setTimeout(() => { reload(); reloadD(); }, 700); }} onDelete={() => { del(editing.id); setEditing(null); }} />}
    </div>
  );
}

/** Edit grams, date and time (12-hour clock with AM/PM). */
function EditDose({ row, onClose, onSaved, onDelete }: { row: Row; onClose: () => void; onSaved: (r: Row) => void; onDelete: () => void }) {
  const d0 = new Date(row.at);
  const [amount, setAmount] = useState(String(row.amount));
  const [date, setDate] = useState(row.date);
  const [hour, setHour] = useState(((d0.getHours() + 11) % 12) + 1); // 1-12
  const [minute, setMinute] = useState(d0.getMinutes());
  const [pm, setPm] = useState(d0.getHours() >= 12);
  function save() {
    const a = Number(amount);
    if (!(a > 0 && a <= 50)) return alert("Enter 0.5-50 g");
    const [y, m, d] = date.split("-").map(Number);
    const h24 = (hour % 12) + (pm ? 12 : 0);
    const at = new Date(y, m - 1, d, h24, minute).getTime();
    if (at > Date.now() + 60_000) return alert("That time is in the future.");
    const r = { ...row, amount: a, date: localDate(new Date(at)), at };
    queue("PUT", `/intake/${row.id}`, { amount: a, at, date: r.date }, `intake-edit ${row.id}`);
    track("creatine_edit", { id: row.id, amount: a, at });
    onSaved(r);
  }
  const sel = "min-h-12 rounded-xl bg-card2 px-2 text-center text-lg font-semibold num outline-none focus:ring-2 focus:ring-vio";
  return (
    <Sheet open onClose={onClose} title="Edit creatine dose" icon={Pencil}>
      <Label>Grams</Label>
      <NumInput value={amount} onChange={setAmount} />
      <Label>Date</Label>
      <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="min-h-12 w-full rounded-xl bg-card2 px-3 outline-none" />
      <Label icon={Clock}>Time taken</Label>
      <div className="flex items-center gap-2">
        <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={cx(sel, "flex-1")} aria-label="Hour">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <span className="text-lg font-bold">:</span>
        <select value={minute} onChange={(e) => setMinute(Number(e.target.value))} className={cx(sel, "flex-1")} aria-label="Minute">
          {Array.from({ length: 60 }, (_, i) => i).map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
        </select>
        <div className="flex rounded-xl bg-card2 p-1">
          {(["AM", "PM"] as const).map((x) => (
            <button key={x} onClick={() => setPm(x === "PM")} className={cx("h-10 w-12 rounded-lg text-sm font-semibold", (x === "PM") === pm ? "bg-vio text-black" : "text-mute")}>{x}</button>
          ))}
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2">
        <Btn kind="danger" icon={Trash2} onClick={() => confirm("Delete this dose?") && onDelete()}>Delete</Btn>
        <Btn kind="primary" icon={Check} className="col-span-2" onClick={save}>Save</Btn>
      </div>
    </Sheet>
  );
}

function Ring({ pct, ok }: { pct: number; ok: boolean }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0 -rotate-90">
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--color-card3)" strokeWidth="8" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--color-vio)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .4s" }} />
      {ok && <path d="M30 42l8 8 16-16" stroke="var(--color-vio)" strokeWidth="5" fill="none" transform="rotate(90 42 42)" />}
    </svg>
  );
}
