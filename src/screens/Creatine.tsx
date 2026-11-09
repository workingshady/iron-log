import { useState } from "react";
import { CalendarRange, Check, Flame, FlaskConical, Plus, Trash2 } from "lucide-react";
import type { DashboardData } from "../../shared/api";
import { queue, send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { niceDate, today } from "../lib/util";
import { Btn, Card, NumInput, PageHead, Stat } from "../components/ui";
import { Heatmap } from "../components/Heatmap";

type Row = { id: string; date: string; amount: number; at: number };

export default function Creatine() {
  const { data: d, reload: reloadD } = useLoad<DashboardData>(`/dashboard?today=${today()}`);
  const { data: rows, reload, setData } = useLoad<Row[]>("/intake?item=creatine");
  const [custom, setCustom] = useState("");
  const target = d?.creatine.target ?? 5;
  const todays = (rows ?? []).filter((r) => r.date === today());
  const g = Math.round(todays.reduce((a, r) => a + r.amount, 0) * 10) / 10;
  const pct = Math.min(100, (g / target) * 100);

  function add(amount: number) {
    if (!(amount > 0 && amount <= 50)) return alert("Enter 0.5-50 g");
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
                  <span className="flex-1 num">{r.amount} g · {new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <button onClick={() => del(r.id)} className="-my-2 -mr-2 flex h-11 w-11 items-center justify-center text-faint hover:text-bad" aria-label="Delete"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          <Stat icon={Flame} tone="vio" value={d?.creatine.streak ?? 0} label={`days in a row at ${target} g+`} />
          <Stat icon={CalendarRange} tone="vio" value={[...byDay.values()].filter((x) => x >= target).length} label="days on target (all time)" />
        </div>

        <Card title="Creatine calendar" icon={CalendarRange} className="md:col-span-3">
          <Heatmap mode="creatine" grams={d?.creatine.days} target={target} />
        </Card>

        <Card title="Recent days" className="md:col-span-3">
          {[...byDay.entries()].slice(0, 14).map(([date, grams]) => (
            <div key={date} className="flex justify-between border-b border-line py-2 text-sm last:border-0">
              <span className="text-mute">{niceDate(date)}</span>
              <span className={grams >= target ? "font-semibold text-vio num" : "num"}>{Math.round(grams * 10) / 10} g</span>
            </div>
          ))}
          {!byDay.size && <p className="text-sm text-mute">Nothing logged yet. Tap a button above.</p>}
          <p className="mt-3 text-xs text-mute">Change the daily target in Settings.</p>
        </Card>
      </div>
    </div>
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
