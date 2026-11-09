import { useState } from "react";
import { Check, Hand, Hourglass, Medal, PersonStanding, Shield, Timer, Trash2, Trophy, TrendingUp, type LucideIcon } from "lucide-react";
import type { AppState } from "../../shared/api";
import { send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, niceDate, today } from "../lib/util";
import { NumInput, PageHead } from "../components/ui";

type TestRow = { id: string; date: string; testKey: string; value: number; unit: string; note: string | null };

const ICON: Record<string, LucideIcon> = {
  pullups: TrendingUp, dead_hang: Hand, neg_time: Hourglass, dips: Medal, support_hold: Shield, pushups: PersonStanding, hollow: Timer, plank: Timer,
};
const unitLabel = (u: string) => (u === "reps" ? "reps" : u === "s" ? "seconds" : u);
const fmt = (v: number, u: string) => `${v}${u === "reps" ? "" : ` ${u}`}`;

export default function Tests() {
  const { data: st } = useLoad<AppState>("/state");
  const { data, reload } = useLoad<TestRow[]>("/tests");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  if (!st) return <p className="py-20 text-center text-mute">Loading…</p>;

  async function save(key: string, unit: string) {
    const raw = vals[key] ?? "";
    const v = Number(raw);
    if (raw.trim() === "" || Number.isNaN(v) || v < 0 || v > 1000) return alert("Enter a number (0-1000).");
    await send("POST", "/tests", { id: uid(), date: today(), testKey: key, value: v, unit });
    track("test_save", { key, value: v });
    setVals({ ...vals, [key]: "" });
    setSaved(key);
    setTimeout(() => setSaved(null), 1500);
    reload();
  }
  async function del(id: string) {
    if (!confirm("Delete this result?")) return;
    await send("DELETE", `/tests/${id}`);
    reload();
  }

  const done = st.tests.filter((t) => (data ?? []).some((r) => r.testKey === t.key)).length;

  return (
    <div>
      <PageHead icon={Trophy} title="Tests" sub="Max-effort benchmarks. Test once at the start and again on Week 4 · Day 6 (test day), then compare." />
      <p className="mb-4 text-sm text-mute">{done}/{st.tests.length} tested · type your result and tap ✓. Each save is dated so you can see progress.</p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {st.tests.map((t) => {
          const hist = (data ?? []).filter((r) => r.testKey === t.key); // newest first
          const Icon = ICON[t.key] ?? Trophy;
          const best = hist.length ? Math.max(...hist.map((h) => h.value)) : null;
          const first = hist[hist.length - 1]?.value;
          const latest = hist[0]?.value;
          const change = hist.length > 1 ? Math.round((latest - first) * 10) / 10 : null;
          return (
            <section key={t.key} className="rounded-2xl bg-card p-4">
              <header className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2"><Icon size={18} className={best != null ? "text-acc" : "text-mute"} /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold leading-tight">{t.name}</h2>
                  <p className="text-xs text-mute">{best == null ? "Not tested yet" : <>Best <b className="text-ink num">{fmt(best, t.unit)}</b>{change != null && <span className={cx("ml-1", change > 0 ? "text-acc" : change < 0 ? "text-bad" : "")}>({change > 0 ? "+" : ""}{change} since first)</span>}</>}</p>
                </div>
              </header>

              <div className="mt-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <NumInput value={vals[t.key] ?? ""} onChange={(v) => setVals({ ...vals, [t.key]: v })} placeholder="0" className="w-full pr-16" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-mute">{unitLabel(t.unit)}</span>
                </div>
                <button
                  onClick={() => save(t.key, t.unit)}
                  className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition", saved === t.key ? "bg-acc/30 text-acc" : "bg-acc text-acc-ink")}
                  aria-label={`Save ${t.name}`}
                >
                  <Check size={20} />
                </button>
              </div>

              {hist.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {hist.slice(0, 6).map((h) => (
                    <li key={h.id} className="inline-flex items-center gap-1.5 rounded-full bg-card2 py-1 pl-2.5 pr-1.5 text-xs num">
                      <b>{fmt(h.value, t.unit)}</b><span className="text-mute">{niceDate(h.date)}</span>
                      <button onClick={() => del(h.id)} className="-my-1 flex h-8 w-8 items-center justify-center rounded-full text-faint hover:text-bad" aria-label="Delete result"><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
