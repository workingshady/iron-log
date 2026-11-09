import { useEffect, useState } from "react";
import type { AppState } from "../../shared/api";
import { queue, send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, niceDate, today } from "../lib/util";
import { Btn, Chips, Label, NumInput, scale } from "../components/ui";

type Tab = "body" | "tests" | "story" | "plan";

export default function Me() {
  const [tab, setTab] = useState<Tab>("body");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Me</h1>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-card p-1 text-sm">
        {(["body", "tests", "story", "plan"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx("min-h-10 rounded-lg capitalize", tab === t ? "bg-card2 font-semibold" : "text-mute")}>{t}</button>
        ))}
      </div>
      {tab === "body" && <Body />}
      {tab === "tests" && <Tests />}
      {tab === "story" && <Story />}
      {tab === "plan" && <Plan />}
    </div>
  );
}

// ---------------------------------------------------------------- body

type BodyRow = { date: string; weightKg: number | null; waistCm: number | null; sleepH: number | null; proteinG: number | null; steps: number | null; creatine: number | null; waterL: number | null; energy: number | null; note: string | null };

function Body() {
  const { data, reload } = useLoad<BodyRow[]>("/body");
  const [date, setDate] = useState(today());
  const row = data?.find((r) => r.date === date);
  const [f, setF] = useState<Record<string, string>>({});
  const [energy, setEnergy] = useState<number | null>(null);
  const [creatine, setCreatine] = useState(false);

  useEffect(() => {
    const v = (n: number | null | undefined) => (n == null ? "" : String(n));
    setF({ weightKg: v(row?.weightKg), waistCm: v(row?.waistCm), sleepH: v(row?.sleepH), proteinG: v(row?.proteinG), steps: v(row?.steps), waterL: v(row?.waterL), note: row?.note ?? "" });
    setEnergy(row?.energy ?? null);
    setCreatine(!!row?.creatine);
  }, [row, date]);

  function save() {
    const n = (s: string) => (s.trim() === "" ? null : Number(s));
    const w = n(f.weightKg ?? "");
    if (w != null && (w < 30 || w > 250)) return alert("Weight looks wrong.");
    const body = { weightKg: w, waistCm: n(f.waistCm ?? ""), sleepH: n(f.sleepH ?? ""), proteinG: n(f.proteinG ?? ""), steps: n(f.steps ?? ""), waterL: n(f.waterL ?? ""), energy, creatine: creatine ? 1 : 0, note: f.note || null };
    queue("PUT", `/body/${date}`, body);
    track("body_save", { date });
    setTimeout(reload, 800);
  }
  const fld = (k: string, label: string, ph = "") => (
    <div><Label>{label}</Label><NumInput value={f[k] ?? ""} onChange={(v) => setF({ ...f, [k]: v })} placeholder={ph} /></div>
  );

  return (
    <div className="space-y-3">
      <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="min-h-12 w-full rounded-xl bg-card2 px-3 outline-none" />
      <div className="grid grid-cols-2 gap-2">
        {fld("weightKg", "Weight kg", "morning")}
        {fld("waistCm", "Waist cm", "belly button")}
        {fld("sleepH", "Sleep h")}
        {fld("proteinG", "Protein g", "130-175")}
        {fld("steps", "Steps")}
        {fld("waterL", "Water L")}
      </div>
      <Label>Energy</Label>
      <Chips small options={scale(1, 5)} value={energy} onChange={setEnergy} />
      <label className="flex min-h-12 items-center gap-3 rounded-xl bg-card2 px-3">
        <input type="checkbox" checked={creatine} onChange={(e) => setCreatine(e.target.checked)} className="h-5 w-5 accent-[#c8f560]" /> Creatine taken
      </label>
      <textarea value={f.note ?? ""} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} placeholder="Note" className="w-full rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
      <Btn kind="primary" className="w-full" onClick={save}>Save {date === today() ? "today" : niceDate(date)}</Btn>

      {data && data.length > 0 && (
        <table className="mt-2 w-full text-sm num">
          <thead className="text-left text-xs text-mute"><tr><th className="py-1">Date</th><th>kg</th><th>Waist</th><th>Sleep</th><th>Protein</th></tr></thead>
          <tbody>
            {data.slice(0, 30).map((r) => (
              <tr key={r.date} className="border-t border-line" onClick={() => setDate(r.date)}>
                <td className="py-2">{niceDate(r.date)}</td><td>{r.weightKg ?? "—"}</td><td>{r.waistCm ?? "—"}</td><td>{r.sleepH ?? "—"}</td><td>{r.proteinG ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- tests

type TestRow = { id: string; date: string; testKey: string; value: number; unit: string; note: string | null };

function Tests() {
  const { data: st } = useLoad<AppState>("/state");
  const { data, reload } = useLoad<TestRow[]>("/tests");
  const [vals, setVals] = useState<Record<string, string>>({});
  if (!st) return null;
  async function save(key: string, unit: string) {
    const v = Number(vals[key]);
    if (vals[key] == null || vals[key] === "" || Number.isNaN(v)) return;
    await send("POST", "/tests", { id: uid(), date: today(), testKey: key, value: v, unit });
    track("test_save", { key, value: v });
    setVals({ ...vals, [key]: "" });
    reload();
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-mute">Do these on Week 1 Day 1 and again on Week 4 Day 6.</p>
      {st.tests.map((t) => {
        const hist = (data ?? []).filter((r) => r.testKey === t.key);
        return (
          <div key={t.key} className="rounded-xl bg-card p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-mute num">
                  {hist.length ? hist.slice(0, 4).map((h) => `${h.value}${t.unit === "reps" ? "" : t.unit} (${niceDate(h.date)})`).join(" · ") : "not tested yet"}
                </div>
              </div>
              <NumInput value={vals[t.key] ?? ""} onChange={(v) => setVals({ ...vals, [t.key]: v })} placeholder={t.unit} className="w-20" />
              <button onClick={() => save(t.key, t.unit)} className="h-12 w-12 rounded-xl bg-acc font-bold text-acc-ink">✓</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- story (journal)

type J = { id: string; date: string; text: string; tags: string | null };
const STORY_TAGS = ["win", "struggle", "pain", "life", "food", "sleep", "idea"];

function Story() {
  const { data, reload } = useLoad<J[]>("/journal");
  const [text, setText] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  async function save() {
    if (!text.trim()) return;
    await send("POST", "/journal", { id: uid(), date: today(), text: text.trim(), tags: tag });
    track("journal_add", { tag });
    setText("");
    setTag(null);
    reload();
  }
  return (
    <div className="space-y-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="How's it going? Wins, pain, life, what you want to change…" className="w-full rounded-xl bg-card2 p-3 outline-none focus:ring-2 focus:ring-acc" />
      <Chips small options={STORY_TAGS.map((t) => ({ id: t, label: t }))} value={tag} onChange={setTag} />
      <Btn kind="primary" className="w-full" onClick={save} disabled={!text.trim()}>Add to story</Btn>
      {(data ?? []).map((j) => (
        <div key={j.id} className="rounded-xl bg-card p-3">
          <div className="mb-1 text-xs text-mute">{niceDate(j.date)}{j.tags ? ` · ${j.tags}` : ""}</div>
          <div className="whitespace-pre-wrap text-sm">{j.text}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- plan / settings / export

function Plan() {
  const { data: s, reload } = useLoad<AppState>("/state");
  if (!s) return null;
  async function setSchedule(v: string) {
    await send("PUT", "/settings/schedule", { value: v });
    track("setting", { schedule: v });
    reload();
  }
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-mute">Program</div>
        <div className="text-lg font-semibold">{s.program.name}</div>
        <div className="text-xs text-mute">version {s.program.version}</div>
        <p className="mt-2 text-sm">{s.program.changelog}</p>
      </section>

      <section>
        <Label>Weekly schedule</Label>
        <div className="grid gap-2">
          {Object.entries(s.schedules).map(([name, days]) => (
            <button key={name} onClick={() => setSchedule(name)} className={cx("rounded-xl border p-3 text-left", s.settings.schedule === name ? "border-acc" : "border-line")}>
              <div className="font-semibold">{name}</div>
              <div className="mt-1 flex gap-1 text-[11px]">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                  <span key={d} className={cx("flex-1 rounded py-1 text-center", days[i] === "rest" ? "bg-card2 text-mute" : "bg-acc/15 text-acc")}>{d}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-card p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-mute">Rules</div>
        <ul className="space-y-1.5 text-sm">{s.program.rules.map((r) => <li key={r}>• {r}</li>)}</ul>
      </section>

      <section className="grid gap-2">
        <a href="/api/export" className="flex min-h-12 items-center justify-center rounded-xl border border-line font-semibold">Download all data (JSON)</a>
        <p className="text-xs text-mute">Your data is yours: everything (sets, notes, clicks, excuses, body, tests, story) in one file. Claude reads the same data with <code>npm run export</code>.</p>
      </section>
    </div>
  );
}
