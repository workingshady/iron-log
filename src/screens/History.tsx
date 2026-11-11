import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, Clock, Dumbbell, FlaskConical, Footprints, GitCompare, History as HistoryIcon, NotebookPen, Scale, Search, Weight, X } from "lucide-react";
import type { AppState, DashboardData, HistoryRow, SessionBundle, SetLog } from "../../shared/api";
import { EXCUSES } from "../../shared/lists";
import { EXERCISES } from "../../program/exercises";
import { shownKg, totalKg, loadOf } from "../../shared/load";
import { e1rm } from "../../shared/recommend";
import { get, track } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { clock, cx, kg, niceDate, today } from "../lib/util";
import { Badge, Btn, Card, Empty, PageHead, Sheet } from "../components/ui";
import { EXCUSE_ICON } from "../components/StartSheets";
import { weekConfig, orderedDows, DOW } from "../../shared/week";
import { go } from "../nav";

type Kind = "all" | "workouts" | "missed";
const isMiss = (r: HistoryRow) => r.status === "missed" || r.status === "skipped";

export default function History() {
  const { data, error } = useLoad<HistoryRow[]>("/history");
  const { data: d } = useLoad<DashboardData>(`/dashboard?today=${today()}`);
  const { data: s } = useLoad<AppState>("/state");
  const { data: notes } = useLoad<{ date: string }[]>("/notes");
  const [kind, setKind] = useState<Kind>("all");
  const [day, setDay] = useState<string | null>(null); // day type, e.g. "Push"
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null); // date opened in the day sheet
  const [cmpMode, setCmpMode] = useState(false);
  const [cmp, setCmp] = useState<string[]>([]);
  const [showCmp, setShowCmp] = useState(false);
  const weekStart = s ? weekConfig(s.settings, s.schedules).weekStart : 1;

  const dayTypes = useMemo(() => [...new Set((data ?? []).map((r) => r.dayName))], [data]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((r) =>
      (kind === "all" || (kind === "missed" ? isMiss(r) : !isMiss(r))) &&
      (!day || r.dayName === day) &&
      (!t || r.dayName.toLowerCase().includes(t) || (r.note ?? "").toLowerCase().includes(t) || (r.exKeys ?? []).some((k) => (EXERCISES[k]?.name ?? k).toLowerCase().includes(t))));
  }, [data, kind, day, q]);
  if (!data) return <p className="py-20 text-center text-mute">{error ?? "Loading…"}</p>;

  // grouped by calendar month (newest first); each header shows the block(s) and totals for that month
  const groups = new Map<string, HistoryRow[]>();
  rows.forEach((r) => groups.set(r.date.slice(0, 7), [...(groups.get(r.date.slice(0, 7)) ?? []), r]));
  const toggleCmp = (id: string) => setCmp((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 2 ? [c[1], id] : [...c, id]));
  // quick compare: this workout vs the previous one of the same day type
  const prevSame = (r: HistoryRow) => data.find((x) => x.dayName === r.dayName && !isMiss(x) && x.id !== r.id && (x.date < r.date || (x.date === r.date && (x.startedAt ?? 0) < (r.startedAt ?? 0))));

  return (
    <div>
      <PageHead icon={HistoryIcon} title="History" sub="Calendar, search, compare — tap a day or a workout" />

      <Card className="mb-4"><MonthCalendar d={d} notes={notes ?? []} weekStart={weekStart} onPick={(iso) => { setPicked(iso); track("history_day", { iso }); }} /></Card>

      {/* search + filters (labelled rows) */}
      <label className="mb-2 flex min-h-11 items-center gap-2 rounded-xl bg-card px-3">
        <Search size={16} className="shrink-0 text-mute" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercise, day or note" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
        {q && <button onClick={() => setQ("")} aria-label="Clear" className="text-mute"><X size={16} /></button>}
      </label>
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-card p-1 text-sm">
        {(["all", "workouts", "missed"] as Kind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cx("min-h-10 rounded-lg capitalize", kind === k ? "bg-card3 font-semibold" : "text-mute")}>{k}</button>
        ))}
      </div>
      <div className="mb-3 flex items-center gap-2">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-faint">Day</span>
        <div className="-mr-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-4 [scrollbar-width:none]">
          {dayTypes.map((n) => (
            <button key={n} onClick={() => setDay(day === n ? null : n)} className={cx("min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-xs", day === n ? "bg-acc font-semibold text-acc-ink" : "bg-card2 text-mute")}>{n}</button>
          ))}
        </div>
      </div>
      <div className="mb-3 flex items-center justify-between text-[11px] text-faint">
        <span className="num">{rows.length} of {data.length}</span>
        <button onClick={() => { setCmpMode(!cmpMode); setCmp([]); }} className={cx("inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs", cmpMode ? "bg-info/15 text-info" : "bg-card2 text-mute")}>
          <GitCompare size={13} />{cmpMode ? "Cancel compare" : "Compare 2 workouts"}
        </button>
      </div>
      {cmpMode && <p className="mb-3 rounded-xl bg-info/10 px-3 py-2 text-xs text-info">Tap two workouts to compare ({cmp.length}/2).</p>}

      {!rows.length && <Empty icon={HistoryIcon}>{q || day || kind !== "all" ? "Nothing matches." : "Finished workouts and missed days show up here."}</Empty>}

      <div className="space-y-5">
        {[...groups.entries()].map(([ym, list]) => {
          const done = list.filter((r) => !isMiss(r) && r.status === "done");
          const blocksIn = [...new Set(list.map((r) => r.blockName).filter(Boolean))];
          return (
          <section key={ym}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-sm font-bold">{new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
              {blocksIn.length > 0 && <button onClick={() => go("/months")} className="text-[11px] text-info">{blocksIn.join(" · ")}</button>}
              <span className="ml-auto text-[11px] text-mute num">{done.length} workouts · {Math.round(done.reduce((a, r) => a + r.volume, 0) / 100) / 10}t</span>
            </div>
            <div className="space-y-2">
              {list.map((r) => {
                if (isMiss(r)) {
                  const Ic = EXCUSE_ICON[r.excuse ?? "other"] ?? EXCUSE_ICON.other;
                  return (
                    <div key={r.id} className="flex items-center gap-3 rounded-xl border border-dashed border-bad/40 px-4 py-3 text-sm">
                      <Ic size={18} className="shrink-0 text-bad" />
                      <span className="min-w-0 flex-1">
                        <span className="block">{r.status === "skipped" ? "Skipped" : "Missed"} {r.dayName} · <span className="text-bad">{EXCUSES.find((e) => e.id === r.excuse)?.label ?? r.excuse}</span></span>
                        {r.note && <span dir="auto" className="bidi block truncate text-xs text-mute">{r.note}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-mute">{niceDate(r.date)}</span>
                    </div>
                  );
                }
                const sel = cmp.includes(r.id);
                const prev = prevSame(r);
                return (
                  <div key={r.id} className={cx("flex items-center gap-1 rounded-xl bg-card pr-1", sel && "ring-2 ring-info")}>
                    <button onClick={() => (cmpMode ? toggleCmp(r.id) : go(`/s/${r.id}`))} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left">
                      <div className="w-12 shrink-0 text-center">
                        <div className="text-[11px] uppercase text-mute">{niceDate(r.date).split(" ")[0].replace(",", "")}</div>
                        <div className="text-lg font-bold num">{r.date.slice(8)}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-semibold">
                          <span className="truncate">{r.dayName}</span>
                          <span className="shrink-0 text-[10px] font-normal text-faint num">W{r.week}{r.version ? ` · v${r.version.split("@")[1]}` : ""}</span>
                          {r.kind !== "planned" && <Badge>{r.kind}</Badge>}
                          {r.status === "abandoned" && <Badge tone="warn">partial</Badge>}
                          {r.status === "active" && <Badge tone="warn">in progress</Badge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-mute num">
                          {r.startedAt && r.endedAt && <span className="inline-flex items-center gap-1"><Clock size={11} />{clock(r.endedAt - r.startedAt)}</span>}
                          <span className="inline-flex items-center gap-1"><Dumbbell size={11} />{r.sets} sets</span>
                          <span className="inline-flex items-center gap-1"><Weight size={11} />{r.volume.toLocaleString()} kg</span>
                          {r.rpe && <span>effort {r.rpe}/10</span>}
                          {r.pains > 0 && <span className="inline-flex items-center gap-1 text-bad"><AlertTriangle size={11} />{r.pains} pain</span>}
                        </div>
                      </div>
                      {cmpMode ? <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", sel ? "border-info bg-info text-black" : "border-line")}>{sel ? cmp.indexOf(r.id) + 1 : ""}</span> : <ChevronRight size={18} className="shrink-0 text-faint" />}
                    </button>
                    {!cmpMode && prev && (
                      <button onClick={() => { setCmp([prev.id, r.id]); setShowCmp(true); track("compare_quick", { a: prev.id, b: r.id }); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-info hover:bg-card2" aria-label={`Compare with previous ${r.dayName}`} title={`vs ${niceDate(prev.date)}`}>
                        <ArrowLeftRight size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          );
        })}
      </div>

      {cmpMode && cmp.length === 2 && (
        <div className="fixed inset-x-0 bottom-20 z-30 px-4 md:bottom-6 md:left-60">
          <Btn kind="primary" icon={GitCompare} className="mx-auto w-full max-w-md shadow-lg" onClick={() => { setShowCmp(true); track("compare_open", { a: cmp[0], b: cmp[1] }); }}>Compare these 2</Btn>
        </div>
      )}
      {showCmp && cmp.length === 2 && <CompareSheet a={cmp[0]} b={cmp[1]} rows={data} onClose={() => { setShowCmp(false); setCmpMode(false); setCmp([]); }} />}
      {picked && <DaySheet iso={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- month calendar

/** Month grid: workouts (green = done, amber = partial, red ring = missed), with dots for cardio (blue), creatine (violet) and notes (grey). */
function MonthCalendar({ d, notes, weekStart, onPick }: { d: DashboardData | null; notes: { date: string }[]; weekStart: number; onPick: (iso: string) => void }) {
  const [ym, setYm] = useState(() => today().slice(0, 7));
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() - weekStart + 7) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)];
  const noteDays = new Set(notes.map((n) => n.date));
  const shift = (k: number) => { const t = new Date(Date.UTC(y, m - 1 + k, 1)); setYm(t.toISOString().slice(0, 7)); };
  const t = today();
  const target = d?.creatine?.target ?? 5;
  const label = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <CalendarDays size={16} className="text-mute" />
        <span className="flex-1 font-semibold">{label}</span>
        <button onClick={() => shift(-1)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-card2" aria-label="Previous month"><ChevronLeft size={18} /></button>
        <button onClick={() => setYm(t.slice(0, 7))} className="min-h-10 rounded-lg bg-card2 px-3 text-xs text-mute">Today</button>
        <button onClick={() => shift(1)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-card2" aria-label="Next month"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-faint">{orderedDows(weekStart).map((w) => <div key={w}>{DOW[w].slice(0, 2)}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e${i}`} />;
          const w = d?.days?.[iso];
          const done = w?.status === "done", part = w?.status === "abandoned" || w?.status === "active", miss = w && !done && !part;
          const cr = d?.creatine?.days?.[iso] ?? 0, ca = d?.cardioDays?.[iso] ?? 0;
          const future = iso > t;
          return (
            <button key={iso} disabled={future} onClick={() => onPick(iso)}
              className={cx("relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs num", done ? "bg-acc/20 font-bold text-acc" : part ? "bg-warn/20 text-warn" : "bg-card2 text-ink", miss && "ring-1 ring-inset ring-bad/70", iso === t && "outline outline-2 outline-info", future && "opacity-30")}>
              {Number(iso.slice(8))}
              <span className="absolute bottom-1 flex gap-0.5">
                {ca > 0 && <span className="h-1 w-1 rounded-full bg-info" />}
                {cr > 0 && <span className={cx("h-1 w-1 rounded-full", cr >= target ? "bg-vio" : "bg-vio/40")} />}
                {noteDays.has(iso) && <span className="h-1 w-1 rounded-full bg-mute" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-mute">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-acc/40" />workout</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-warn/40" />partial</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded ring-1 ring-inset ring-bad/70" />missed</span>
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-info" />cardio</span>
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-vio" />creatine</span>
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-mute" />notes</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one day

type DayData = {
  date: string;
  sessions: { id: string; dayName: string; week: number; status: string; kind: string; excuse: string | null; note: string | null; rpe: number | null; minutes: number | null; volume: number;
    exercises: { exKey: string; name: string; sets: { kg: number | null; reps: number | null; seconds: number | null; kind: string; rir: number | null }[]; notes: string[]; pain: boolean }[] }[];
  cardio: { id: string; protocol: string; status: string; minutes: number | null; kcal: number | null; note: string | null }[];
  creatine: { grams: number; entries: { amount: number; at: number }[] };
  body: { weightKg: number | null; waistCm: number | null; sleepH: number | null; proteinG: number | null; steps: number | null; waterL: number | null; energy: number | null; note: string | null } | null;
  journal: { id: string; text: string; tags: string | null; mood: number | null }[];
};
const MOODS = ["😣", "😕", "😐", "🙂", "😄"];

function DaySheet({ iso, onClose }: { iso: string; onClose: () => void }) {
  const { data } = useLoad<DayData>(`/day/${iso}`);
  const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const empty = data && !data.sessions.length && !data.cardio.length && !data.creatine.grams && !data.body && !data.journal.length;
  const fmt = (x: DayData["sessions"][number]["exercises"][number]["sets"][number], ex: string) =>
    `${x.kind === "D" ? "↓" : ""}${x.kg != null ? `${kg(x.kg)}${loadOf(ex) === "pair" ? "/h" : ""}×` : ""}${x.reps ?? (x.seconds ? `${x.seconds}s` : "")}`;
  return (
    <Sheet open onClose={onClose} title={label} icon={CalendarDays}>
      {!data && <p className="text-sm text-mute">Loading…</p>}
      {empty && <p className="text-sm text-mute">Nothing logged this day.</p>}
      {data?.sessions.map((x) => (
        <section key={x.id} className="mb-3 rounded-xl bg-card2 p-3">
          <div className="flex items-center gap-2">
            <Dumbbell size={15} className={x.status === "done" ? "text-acc" : x.status === "missed" || x.status === "skipped" ? "text-bad" : "text-warn"} />
            <span className="min-w-0 flex-1 truncate font-semibold">W{x.week} · {x.dayName}</span>
            {(x.status === "done" || x.status === "abandoned" || x.status === "active") && <button onClick={() => go(`/s/${x.id}`)} className="text-xs text-info">open →</button>}
          </div>
          {x.status === "missed" || x.status === "skipped" ? (
            <p className="mt-1 text-xs text-bad">{x.status} · {EXCUSES.find((e) => e.id === x.excuse)?.label ?? x.excuse}</p>
          ) : (
            <>
              <p className="mt-0.5 text-[11px] text-mute num">{x.minutes != null ? `${x.minutes} min · ` : ""}{x.volume.toLocaleString()} kg{x.rpe ? ` · effort ${x.rpe}/10` : ""}</p>
              <ul className="mt-1.5 space-y-1">
                {x.exercises.map((e, i) => (
                  <li key={i} className="text-xs">
                    <span className="font-medium">{e.name}</span>{e.pain && <span className="text-bad"> · pain</span>}
                    <span className="block text-mute num">{e.sets.map((y) => fmt(y, e.exKey)).join(" · ")}</span>
                    {e.notes.length > 0 && <span dir="auto" className="bidi block truncate text-[11px] text-faint">“{e.notes.join(" · ")}”</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {x.note && <p dir="auto" className="bidi mt-1.5 text-xs text-ink/80">{x.note}</p>}
        </section>
      ))}
      {!!data?.cardio.length && (
        <section className="mb-3 rounded-xl bg-card2 p-3">
          <div className="mb-1 flex items-center gap-2 font-semibold"><Footprints size={15} className="text-info" />Cardio</div>
          {data.cardio.map((c) => <p key={c.id} className="text-xs text-mute">{c.protocol === "football" ? "⚽ Football" : c.protocol.replace(/_/g, " ")} · {c.status}{c.minutes ? ` · ${Math.round(c.minutes)} min` : ""}{c.kcal ? ` · ~${c.kcal} kcal` : ""}{c.note ? ` · ${c.note}` : ""}</p>)}
        </section>
      )}
      {!!data?.creatine.grams && (
        <section className="mb-3 flex items-center gap-2 rounded-xl bg-card2 p-3 text-sm">
          <FlaskConical size={15} className="text-vio" />Creatine <b className="num">{data.creatine.grams} g</b>
          <span className="text-xs text-mute">({data.creatine.entries.map((e) => new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })).join(", ")})</span>
        </section>
      )}
      {data?.body && (
        <section className="mb-3 rounded-xl bg-card2 p-3 text-xs">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Scale size={15} className="text-vio" />Body</div>
          <p className="text-mute num">{[data.body.weightKg && `${data.body.weightKg} kg`, data.body.waistCm && `waist ${data.body.waistCm} cm`, data.body.sleepH && `sleep ${data.body.sleepH} h`, data.body.proteinG && `protein ${data.body.proteinG} g`, data.body.steps && `${data.body.steps} steps`, data.body.waterL && `${data.body.waterL} L water`, data.body.energy && `energy ${data.body.energy}/5`].filter(Boolean).join(" · ") || "—"}</p>
          {data.body.note && <p dir="auto" className="bidi mt-1">{data.body.note}</p>}
        </section>
      )}
      {!!data?.journal.length && (
        <section className="mb-3 rounded-xl bg-card2 p-3">
          <div className="mb-1 flex items-center gap-2 font-semibold"><NotebookPen size={15} className="text-acc" />Journal</div>
          {data.journal.map((j) => <p key={j.id} dir="auto" className="bidi mb-1 whitespace-pre-wrap text-xs">{j.mood ? `${MOODS[j.mood - 1]} ` : ""}{j.text}</p>)}
        </section>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- compare two workouts

function CompareSheet({ a, b, rows, onClose }: { a: string; b: string; rows: HistoryRow[]; onClose: () => void }) {
  const [A, setA] = useState<SessionBundle | null>(null);
  const [B, setB] = useState<SessionBundle | null>(null);
  // older one on the left
  const [L, R] = useMemo(() => {
    const ra = rows.find((x) => x.id === a), rb = rows.find((x) => x.id === b);
    return (ra?.date ?? "") <= (rb?.date ?? "") ? [a, b] : [b, a];
  }, [a, b, rows]);
  useEffect(() => { get<SessionBundle>(`/sessions/${L}`).then(setA).catch(() => {}); get<SessionBundle>(`/sessions/${R}`).then(setB).catch(() => {}); }, [L, R]);
  const work = (x: SessionBundle | null) => (x?.sets ?? []).filter((y) => !y.deleted && y.kind !== "W");
  const vol = (ss: SetLog[]) => Math.round(ss.reduce((p, y) => p + totalKg(y) * (y.reps ?? 0), 0));
  const best = (ss: SetLog[]) => Math.max(0, ...ss.filter((y) => (y.kind === "N" || y.kind === "F") && y.strict !== 0 && (y.reps ?? 0) <= 12).map((y) => { const w = shownKg(y); return w && y.reps ? e1rm(w, y.reps) : 0; }));
  const exKeys = [...new Set([...(B?.session.plan ?? []).map((p) => p.ex), ...(A?.session.plan ?? []).map((p) => p.ex)])].filter((k) => work(A).some((y) => y.exKey === k) || work(B).some((y) => y.exKey === k));
  const dur = (x: SessionBundle | null) => (x?.session.startedAt && x.session.endedAt ? Math.round((x.session.endedAt - x.session.startedAt) / 60000) : null);
  const Delta = ({ v, unit = "", good = 1 }: { v: number | null; unit?: string; good?: 1 | -1 }) => v == null || Math.abs(v) < 0.05 ? <span className="text-faint">=</span> : <span className={cx("font-semibold", v * good > 0 ? "text-acc" : "text-warn")}>{v > 0 ? "+" : ""}{Number.isInteger(v) ? v : v.toFixed(1)}{unit}</span>;
  const fmtSets = (ss: SetLog[]) => ss.map((y) => `${y.kind === "D" ? "↓" : ""}${shownKg(y) != null ? `${kg(shownKg(y)!)}×` : ""}${y.reps ?? (y.seconds ? `${y.seconds}s` : "")}`).join(" ");
  const head = (x: SessionBundle | null) => (x ? `${x.session.dayName} · ${niceDate(x.session.date)}` : "…");
  return (
    <Sheet open onClose={onClose} title="Compare workouts" icon={GitCompare}>
      {!(A && B) ? <p className="text-sm text-mute">Loading…</p> : (
        <>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-xs">
            <div className="rounded-lg bg-card2 p-2"><div className="font-semibold">{head(A)}</div><div className="text-mute">W{A.session.week}</div></div>
            <ArrowLeftRight size={14} className="text-faint" />
            <div className="rounded-lg bg-info/10 p-2"><div className="font-semibold text-info">{head(B)}</div><div className="text-mute">W{B.session.week}</div></div>
          </div>
          {/* totals */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { l: "volume kg", a: vol(work(A)), b: vol(work(B)), good: 1 as const },
              { l: "work sets", a: work(A).filter((y) => y.kind === "N" || y.kind === "F").length, b: work(B).filter((y) => y.kind === "N" || y.kind === "F").length, good: 1 as const },
              { l: "minutes", a: dur(A), b: dur(B), good: -1 as const },
            ].map((x) => (
              <div key={x.l} className="rounded-xl bg-card2 p-2">
                <div className="text-sm font-bold num">{x.b ?? "—"}</div>
                <div className="text-[10px] text-mute num">{x.a ?? "—"} → <Delta v={x.a != null && x.b != null ? x.b - x.a : null} good={x.good} /></div>
                <div className="text-[10px] text-faint">{x.l}</div>
              </div>
            ))}
          </div>
          {/* per exercise */}
          <ul className="mt-3 space-y-1.5">
            {exKeys.map((k) => {
              const sa = work(A).filter((y) => y.exKey === k), sb = work(B).filter((y) => y.exKey === k);
              const ea = best(sa), eb = best(sb);
              return (
                <li key={k} className="rounded-xl bg-card2 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{EXERCISES[k]?.name ?? k}</span>
                    {ea > 0 && eb > 0 && <span className="text-[11px] num">est. max <Delta v={Math.round((eb - ea) * 10) / 10} unit=" kg" /></span>}
                    {(!sa.length || !sb.length) && <Badge>{!sa.length ? "new" : "not done"}</Badge>}
                  </div>
                  <div className="mt-1 grid grid-cols-[2.5rem_1fr_auto] gap-x-2 gap-y-0.5 text-[11px] num">
                    <span className="text-mute">{niceDate(A.session.date).split(",")[0]}</span><span className="truncate text-mute">{fmtSets(sa) || "—"}</span><span className="text-mute">{vol(sa) || ""}</span>
                    <span className="text-info">{niceDate(B.session.date).split(",")[0]}</span><span className="truncate">{fmtSets(sb) || "—"}</span><span><Delta v={sa.length && sb.length ? vol(sb) - vol(sa) : null} /></span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[10px] text-faint">Volume = kg × reps of work sets (drops included, warm-ups not). Est. max from strict sets ≤12 reps. Dumbbells per hand.</p>
        </>
      )}
    </Sheet>
  );
}
