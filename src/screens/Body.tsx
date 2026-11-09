import { useEffect, useState } from "react";
import { Bed, Beef, Droplets, Footprints, Ruler, Scale, Zap } from "lucide-react";
import { queue, track } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { niceDate, today } from "../lib/util";
import { Btn, Card, Chips, Label, NumInput, PageHead, scale } from "../components/ui";
import { LineChart } from "../components/Chart";

type BodyRow = { date: string; weightKg: number | null; waistCm: number | null; sleepH: number | null; proteinG: number | null; steps: number | null; waterL: number | null; energy: number | null; note: string | null };

const FIELDS = [
  { k: "weightKg", label: "Weight", unit: "kg", icon: Scale, ph: "morning", min: 30, max: 250 },
  { k: "waistCm", label: "Waist", unit: "cm", icon: Ruler, ph: "belly button", min: 40, max: 200 },
  { k: "sleepH", label: "Sleep", unit: "h", icon: Bed, ph: "7-9", min: 0, max: 16 },
  { k: "proteinG", label: "Protein", unit: "g", icon: Beef, ph: "130-175", min: 0, max: 500 },
  { k: "steps", label: "Steps", unit: "", icon: Footprints, ph: "7-10k", min: 0, max: 100000 },
  { k: "waterL", label: "Water", unit: "L", icon: Droplets, ph: "3+", min: 0, max: 15 },
] as const;

export default function Body() {
  const { data, reload } = useLoad<BodyRow[]>("/body");
  const [date, setDate] = useState(today());
  const row = data?.find((r) => r.date === date);
  const [f, setF] = useState<Record<string, string>>({});
  const [energy, setEnergy] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const v = (n: number | null | undefined) => (n == null ? "" : String(n));
    setF({ ...Object.fromEntries(FIELDS.map((x) => [x.k, v(row?.[x.k])])), note: row?.note ?? "" });
    setEnergy(row?.energy ?? null);
  }, [row, date]);

  function save() {
    const out: Record<string, number | string | null> = {};
    for (const x of FIELDS) {
      const s = (f[x.k] ?? "").trim();
      const n = s === "" ? null : Number(s);
      if (n != null && (Number.isNaN(n) || n < x.min || n > x.max)) return alert(`${x.label} looks wrong (${x.min}-${x.max}).`);
      out[x.k] = n;
    }
    queue("PUT", `/body/${date}`, { ...out, energy, note: f.note || null });
    track("body_save", { date });
    setSaved(true);
    setTimeout(() => { setSaved(false); reload(); }, 900);
  }

  const weights = (data ?? []).filter((r) => r.weightKg != null).slice(0, 60).reverse();

  return (
    <div>
      <PageHead icon={Ruler} title="Body & habits" sub="A quick daily check: weight (morning), waist, sleep, protein, steps, water. Fill in only what you know." />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="min-h-12 w-full rounded-xl bg-card2 px-3 outline-none" />
          <div className="mt-1 grid grid-cols-2 gap-x-2">
            {FIELDS.map((x) => (
              <div key={x.k}>
                <Label icon={x.icon}>{x.label}{x.unit && ` (${x.unit})`}</Label>
                <NumInput value={f[x.k] ?? ""} onChange={(v) => setF({ ...f, [x.k]: v })} placeholder={x.ph} />
              </div>
            ))}
          </div>
          <Label icon={Zap}>Energy today (1 low · 5 great)</Label>
          <Chips small options={scale(1, 5)} value={energy} onChange={setEnergy} />
          <textarea value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} placeholder="Note (optional)" className="mt-3 w-full rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
          <Btn kind="primary" className="mt-3 w-full" onClick={save}>{saved ? "Saved ✓" : `Save ${date === today() ? "today" : niceDate(date)}`}</Btn>
        </Card>

        <div className="grid content-start gap-3">
          <Card title="Weight trend" icon={Scale}>
            {weights.length > 1 ? <LineChart points={weights.map((w) => ({ x: niceDate(w.date), y: w.weightKg! }))} unit="kg" /> : <p className="text-sm text-mute">Needs 2+ weigh-ins. Goal: +0.25-0.5 kg/week.</p>}
          </Card>
          {data && data.length > 0 && (
            <Card title="Recent days">
              <table className="w-full text-sm num">
                <thead className="text-left text-xs text-mute"><tr><th className="py-1">Date</th><th>kg</th><th>Waist</th><th>Sleep</th><th>Protein</th></tr></thead>
                <tbody>
                  {data.slice(0, 21).map((r) => (
                    <tr key={r.date} onClick={() => setDate(r.date)} className="cursor-pointer border-t border-line hover:bg-card2">
                      <td className="py-2">{niceDate(r.date)}</td><td>{r.weightKg ?? "—"}</td><td>{r.waistCm ?? "—"}</td><td>{r.sleepH ?? "—"}</td><td>{r.proteinG ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-mute">Tap a row to edit that day.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
