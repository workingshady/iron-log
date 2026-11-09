import { useState } from "react";
import { Check, Trash2, Trophy } from "lucide-react";
import type { AppState } from "../../shared/api";
import { send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { niceDate, today } from "../lib/util";
import { NumInput, PageHead } from "../components/ui";

type TestRow = { id: string; date: string; testKey: string; value: number; unit: string; note: string | null };

export default function Tests() {
  const { data: st } = useLoad<AppState>("/state");
  const { data, reload } = useLoad<TestRow[]>("/tests");
  const [vals, setVals] = useState<Record<string, string>>({});
  if (!st) return null;

  async function save(key: string, unit: string) {
    const v = Number(vals[key]);
    if (!vals[key] || Number.isNaN(v) || v < 0 || v > 1000) return;
    await send("POST", "/tests", { id: uid(), date: today(), testKey: key, value: v, unit });
    track("test_save", { key, value: v });
    setVals({ ...vals, [key]: "" });
    reload();
  }
  async function del(id: string) {
    if (!confirm("Delete this result?")) return;
    await send("DELETE", `/tests/${id}`);
    reload();
  }

  return (
    <div>
      <PageHead icon={Trophy} title="Tests" sub="Max-effort benchmarks. Test at the start, then on Week 4 · Day 6 (test day), and compare." />
      <div className="grid gap-2 md:grid-cols-2">
        {st.tests.map((t) => {
          const hist = (data ?? []).filter((r) => r.testKey === t.key);
          const best = hist.length ? Math.max(...hist.map((h) => h.value)) : null;
          const first = hist[hist.length - 1]?.value;
          const last = hist[0]?.value;
          return (
            <div key={t.key} className="rounded-2xl bg-card p-4">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-mute">
                    {best != null ? <>best <b className="text-ink num">{best}{t.unit === "reps" ? "" : ` ${t.unit}`}</b>{hist.length > 1 && <> · {last! >= first! ? "+" : ""}{Math.round((last! - first!) * 10) / 10} since first</>}</> : "not tested yet"}
                  </div>
                </div>
                <NumInput value={vals[t.key] ?? ""} onChange={(v) => setVals({ ...vals, [t.key]: v })} placeholder={t.unit} className="w-20" />
                <button onClick={() => save(t.key, t.unit)} className="flex h-12 w-12 items-center justify-center rounded-xl bg-acc text-acc-ink" aria-label="Save"><Check size={20} /></button>
              </div>
              {hist.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {hist.slice(0, 6).map((h) => (
                    <span key={h.id} className="inline-flex items-center gap-1.5 rounded-full bg-card2 px-2.5 py-1 text-xs num">
                      {h.value} · {niceDate(h.date)}
                      <button onClick={() => del(h.id)} className="text-faint hover:text-bad" aria-label="Delete"><Trash2 size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
