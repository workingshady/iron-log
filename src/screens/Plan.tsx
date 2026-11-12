import { useMemo, useState } from "react";
import { projectProgram, projLabel } from "../../shared/project";
import { Activity, CalendarDays, Check, ChevronDown, Clock, Eye, Info, Play } from "lucide-react";
import { WorkoutPreview } from "../components/WorkoutPreview";
import { useNextSession } from "../components/WeekPlanner";
import { track } from "../lib/api";
import type { AppState, Lifts, PlanItem, SlotInfo } from "../../shared/api";
import type { DayPlan } from "../../program/types";
import { recommend } from "../../shared/recommend";
import { useProgram } from "../lib/program";
import { targetLabel, toItem } from "../../shared/plan";
import { useLoad } from "../lib/useLoad";
import { cx, kg, restLabel } from "../lib/util";
import { Badge, Btn, Card, PageHead, Sheet, Thumb } from "../components/ui";
import { ExerciseSheet } from "../components/ExerciseSheet";
import { EX_GROUP } from "../../program/groups";
import { TechNote } from "../components/Terms";
import { StartSheet } from "../components/StartSheets";
import { BodyMap } from "../components/BodyMap";
import { WeekPlanner } from "../components/WeekPlanner";
import { HISTORY } from "../../program/history";
import { GitBranch, CalendarRange } from "lucide-react";
import { go } from "../nav";
import { niceDate } from "../lib/util";

/** Rough session length: each set ≈ 40 s of work + its rest; superset partners share the rest. */
const estMinutes = (d: DayPlan) => Math.round(d.items.reduce((a, x) => a + x.sets * (40 + x.rest), 0) / 60) + 8; // + warm-up

export default function Plan() {
  const { data: s } = useLoad<AppState>("/state");
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const [wk, setWk] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [how, setHow] = useState<PlanItem | null>(null);
  const [start, setStart] = useState<SlotInfo | null>(null);
  const [vers, setVers] = useState(false);
  const [preview, setPreview] = useState<{ week: number; dayKey: string; slot: SlotInfo | null } | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [legend, setLegend] = useState(false);
  const [view, setView] = useState<"days" | "weeks">("days");
  const program = useProgram(); // the plan this user trains (default = CURRENT)
  const curWeek = wk ?? s?.next?.week ?? 1;
  const week = program.weeks.find((w) => w.n === curWeek)!;
  const slot = (key: string) => s?.slots.find((x) => x.week === curWeek && x.dayKey === key);
  // "Up next" follows the adapted week (football, busy, your pins), same as Home
  const nx = useNextSession();
  const nextKey = nx.next?.week === curWeek ? nx.next.dayKey : null;
  const nextWhen = nx.iso ? (nx.isToday ? "today" : new Date(`${nx.iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })) : null;
  // weights for every week: the engine run forward from your real history (assumes each session goes as recommended)
  const progWeek = s?.next?.week ?? 1;
  const proj = useMemo(() => {
    if (!lifts || !s) return {};
    const done = new Set(s.slots.filter((x) => x.status === "done").map((x) => `${x.week}:${x.dayKey}`));
    return projectProgram(program, lifts.hist, { fromWeek: progWeek, done, bodyKg: Number(s.settings.bodyKg) || null, includeExtras: true });
  }, [lifts, s, progWeek, program]);
  const doneSlot = (w: number, key: string) => !!s?.slots.find((x) => x.week === w && x.dayKey === key && x.status === "done");
  const expanded = openDay ?? nextKey ?? week.days.find((d) => slot(d.key)?.status !== "done")?.key ?? week.days[0].key;

  return (
    <div className="min-w-0">
      <PageHead icon={CalendarDays} title="Plan" sub={`${program.name} · v${program.version}`} right={<a href="#/programs" className="flex min-h-11 shrink-0 items-center rounded-full border border-line px-3 text-xs font-semibold text-info hover:bg-card2">Change plan</a>} />

      {/* which month you're in + what changed in the plan */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button onClick={() => go("/months")} className="flex min-h-14 items-center gap-2.5 rounded-2xl bg-card px-3 text-left active:bg-card2">
          <CalendarRange size={18} className="shrink-0 text-acc" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{s?.block?.name ?? "Month 1"}</span>
            <span className="block truncate text-[11px] text-mute">since {s?.block ? niceDate(s.block.startDate) : "—"} · {(s?.slots ?? []).filter((x) => x.status === "done").length}/{(s?.slots ?? []).length} done</span>
          </span>
        </button>
        <button onClick={() => { setVers(true); track("versions_open", {}); }} className="flex min-h-14 items-center gap-2.5 rounded-2xl bg-card px-3 text-left active:bg-card2">
          <GitBranch size={18} className="shrink-0 text-info" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">v{program.version}</span>
            <span className="block truncate text-[11px] text-mute">{HISTORY[0]?.title ?? "Versions & changes"}</span>
          </span>
        </button>
      </div>
      {s && !s.next && !s.active && (
        <Card className="mb-3 border border-acc/40">
          <div className="font-semibold">All 4 weeks done 🎉</div>
          <p className="mt-1 text-xs text-mute">Say "review" to Claude for the next version, then start the next month — the plan goes back to Week 1 with your weights carried over.</p>
          <Btn kind="primary" icon={CalendarRange} className="mt-3 w-full" onClick={() => go("/months")}>Finish {s.block?.name ?? "this month"} → next month</Btn>
        </Card>
      )}

      <div className="mb-3"><WeekPlanner /></div>

      {/* view switch */}
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-card p-1 text-sm">
        <button onClick={() => setView("days")} className={cx("min-h-10 rounded-lg", view === "days" ? "bg-card3 font-semibold" : "text-mute")}>This week's days</button>
        <button onClick={() => setView("weeks")} className={cx("min-h-10 rounded-lg", view === "weeks" ? "bg-card3 font-semibold" : "text-mute")}>4-week progression</button>
      </div>

      {view === "weeks" && (
        <div className="space-y-3">
          {program.order.map((key) => {
            const dayAt = (n: number) => program.weeks.find((w) => w.n === n)?.days.find((d) => d.key === key);
            const base = dayAt(1)!;
            const exs = [...new Set(program.weeks.flatMap((w) => w.days.find((d) => d.key === key)?.items.map((x) => x.ex) ?? []))];
            return (
              <section key={key} className="overflow-hidden rounded-2xl bg-card">
                <div className="px-4 pt-3 font-bold">{base.name} <span className="text-xs font-normal text-mute">· {base.focus}</span></div>
                <div className="overflow-x-auto px-2 pb-3">
                  <table className="mt-2 w-full min-w-[340px] text-xs num">
                    <thead>
                      <tr className="text-mute">
                        <th className="px-2 py-1 text-left font-normal">Exercise</th>
                        {program.weeks.map((w) => <th key={w.n} className={cx("px-1 py-1 font-normal", w.n === curWeek && "text-info")}>W{w.n}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {exs.map((ex) => (
                        <tr key={ex} className="border-t border-line/60">
                          <td className="max-w-[9rem] truncate px-2 py-1.5 text-left">
                            <button onClick={() => { const rx = base.items.find((x) => x.ex === ex) ?? dayAt(curWeek)?.items.find((x) => x.ex === ex); if (rx) setHow(toItem(ex, rx)); }} className="truncate text-left underline decoration-line underline-offset-2">{toItem(ex, { sets: 1, rest: 0 }).name}</button>
                          </td>
                          {program.weeks.map((w) => {
                            const rx = dayAt(w.n)?.items.find((x) => x.ex === ex);
                            const idx = dayAt(w.n)?.items.findIndex((x) => x.ex === ex) ?? -1;
                            const pj = proj[`${w.n}:${key}:${idx}`];
                            const isDone = doneSlot(w.n, key);
                            return (
                              <td key={w.n} className={cx("px-1 py-1.5 text-center align-top", w.n === curWeek && "bg-info/10 text-ink", !rx && "text-faint")}>
                                {rx ? targetLabel({ ...rx, rir: undefined }) : "—"}
                                {rx && (isDone ? <span className="block text-[10px] text-acc">✓ done</span> : pj ? <span className={cx("block text-[10px]", pj.kind === "deload" ? "text-info" : pj.kind === "up" ? "text-acc" : "text-mute")}>{projLabel(ex, pj)}</span> : null)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          <p className="text-xs text-mute">Sets × reps per week, and under it the weight for that week (/h = per hand): this week's is today's recommendation, later weeks are projected by the app's own rules from your real history, assuming each session goes as suggested. Beat a target → later weeks move up; miss → they wait. Week 3 is the hardest, Week 4 the deload (~10% lighter).</p>
        </div>
      )}

      {view === "days" && (<>
      {/* weeks */}
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-card p-1">
        {program.weeks.map((w) => (
          <button key={w.n} onClick={() => { setWk(w.n); setOpenDay(null); }} className={cx("min-w-0 rounded-lg px-1 py-2 text-center", curWeek === w.n ? "bg-card3" : "text-mute")}>
            <div className="text-sm font-semibold">W{w.n}</div>
            <div className="truncate text-[11px] text-mute">{w.name}</div>
          </button>
        ))}
      </div>
      <div className="mb-3 flex items-start gap-2 rounded-xl bg-info/10 px-3 py-2.5 text-sm text-info">
        <span className="min-w-0 flex-1">{week.brief}</span>
        <button onClick={() => setLegend(true)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" aria-label="What do the colours mean"><Info size={16} /></button>
      </div>

      {/* days: one open at a time */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:items-start">
        {week.days.map((d) => {
          const sl = slot(d.key);
          const isNext = nextKey === d.key;
          const open = expanded === d.key;
          const main = d.items.filter((x) => !x.finisher);
          return (
            <section key={d.key} className={cx("min-w-0 overflow-hidden rounded-2xl bg-card", isNext && "ring-1 ring-info/60")}>
              <button onClick={() => setOpenDay(open ? "__none" : d.key)} className="flex w-full items-center gap-3 p-4 text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h2 className="text-lg font-bold">{d.name}</h2>
                    {sl?.status === "done" && <Badge tone="acc"><Check size={11} /> done</Badge>}
                    {sl?.status === "skipped" && <Badge>skipped</Badge>}
                    {isNext && <Badge tone="info">next{nextWhen ? ` · ${nextWhen}` : ""}</Badge>}
                  </div>
                  <div className="text-xs text-mute">{d.focus}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(() => {
                      const m = new Map<string, number>();
                      main.forEach((x) => { const g = EX_GROUP[x.ex]; if (g) m.set(g, (m.get(g) ?? 0) + x.sets); });
                      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g, n]) => <span key={g} className="rounded-full bg-card2 px-2 py-0.5 text-[10px] text-mute num">{g} {n}</span>);
                    })()}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-mute num">
                    <span>{main.length} exercises</span>
                    <span>{main.reduce((a, x) => a + x.sets, 0)} sets</span>
                    <span className="inline-flex items-center gap-1"><Clock size={11} />~{estMinutes(d)} min</span>
                  </div>
                </div>
                <ChevronDown size={18} className={cx("shrink-0 text-mute transition", open && "rotate-180")} />
              </button>

              {!open && (
                <div className="flex gap-1.5 overflow-hidden px-4 pb-4">
                  {main.slice(0, 5).map((x, i) => {
                    const it = toItem(x.ex, x);
                    return <Thumb key={i} yt={it.yt[0]} className="h-9 w-12" />;
                  })}
                  {main.length > 5 && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card2 text-xs text-mute">+{main.length - 5}</div>}
                </div>
              )}

              {open && (
                <>
                  <div className="grid grid-cols-[auto_1fr] gap-2 px-4 pb-3">
                    <Btn kind="soft" icon={Eye} onClick={() => { setPreview({ week: week.n, dayKey: d.key, slot: sl ?? null }); track("preview_open", { from: "plan", dayKey: d.key }); }}>Preview</Btn>
                    {sl && !s?.active ? <Btn kind={isNext ? "primary" : "soft"} icon={Play} className="w-full" onClick={() => setStart(sl)}>Start {d.name}</Btn> : <span />}
                  </div>
                  <ul className="border-t border-line">
                    {d.items.map((rx, i) => {
                      const item = toItem(rx.ex, rx);
                      // this week: today's recommendation · later weeks: the projected weight for that week
                      const pj = week.n > progWeek ? proj[`${week.n}:${d.key}:${i}`] : undefined;
                      const rec = recommend(rx.ex, rx, lifts?.hist ?? {}, { deload: /deload/i.test(week.name), step: item.step });
                      const recText = pj ? `≈ ${projLabel(rx.ex, pj)}` : rec.weightKg != null ? `${kg(rec.weightKg)} kg` : rec.seconds ? `${rec.seconds} s` : rec.reps && rec.kind !== "start" ? `${rec.reps} reps` : "";
                      const grouped = rx.tag && d.items[i + 1]?.tag?.[0] === rx.tag[0];
                      const firstFinisher = rx.finisher && !d.items[i - 1]?.finisher;
                      return (
                        <li key={i} className="min-w-0">
                          {firstFinisher && <div className="bg-warn/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-warn">Finishers · small muscles</div>}
                          <div className={cx("flex min-w-0 items-center gap-3 px-4 py-2.5", grouped ? "pb-1" : "border-b border-line/60", rx.finisher && "bg-card2/40")}>
                            <button onClick={() => setHow(item)} className="shrink-0" aria-label={`How to ${item.name}`}>
                              <Thumb yt={item.yt[0]} className="h-10 w-14" />
                            </button>
                            <div className="min-w-0 flex-1">
                              <button onClick={() => setHow(item)} className="flex w-full min-w-0 items-center gap-1.5 text-left text-sm font-semibold">
                                {rx.tag && <span className="shrink-0 rounded bg-card3 px-1.5 text-[11px] text-mute">{rx.tag}</span>}
                                <span className="truncate">{item.name}</span>
                              </button>
                              <div className="flex flex-wrap items-center gap-x-2.5 text-xs text-mute num">
                                <span>{targetLabel(rx)}</span>
                                <span className="inline-flex items-center gap-0.5"><Clock size={10} />{restLabel(rx.rest)}</span>
                                {recText && <span className={rec.kind === "up" ? "text-acc" : rec.kind === "down" ? "text-warn" : "text-info"}>→ {recText}</span>}
                              </div>
                              {rx.tech && <div className="min-w-0 break-words"><TechNote text={rx.tech} /></div>}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          );
        })}
      </div>

      </>)}

      {/* optional extras */}
      {(week.extras ?? []).map((x) => (
        <section key={x.key} className="mt-3 rounded-2xl border border-dashed border-vio/40 bg-card p-4">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-lg font-bold">{x.name} <span className="ml-1 rounded-full bg-vio/15 px-2 py-0.5 text-[11px] font-medium text-vio">optional extra</span></h2>
            <Btn kind="soft" icon={Eye} className="min-h-10 px-3 text-sm" onClick={() => setPreview({ week: curWeek, dayKey: x.key, slot: { week: curWeek, dayKey: x.key, dayName: x.name, focus: x.focus, items: x.items.length, status: "open" } })}>Preview</Btn>
            {!s?.active && <Btn kind="soft" icon={Play} className="min-h-10 px-3 text-sm" onClick={() => setStart({ week: curWeek, dayKey: x.key, dayName: x.name, focus: x.focus, items: x.items.length, status: "open" })}>Start</Btn>}
          </div>
          <p className="text-xs text-mute">{x.focus} · after Chest+Back / Shoulders+Arms or on a rest day — never before Pull.</p>
          <a href="#/extra" className="mt-1 inline-flex min-h-9 items-center text-xs text-info">Tracker: this week, skip, history →</a>
          <ul className="mt-2 space-y-1.5">
            {x.items.map((rx, i) => {
              const it = toItem(rx.ex, rx);
              return (
                <li key={i} className="flex items-center gap-3">
                  <button onClick={() => setHow(it)} className="shrink-0"><Thumb yt={it.yt[0]} className="h-9 w-12" /></button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{it.name}</div>
                    <div className="text-xs text-mute num">{targetLabel(rx)} · {restLabel(rx.rest)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* muscle map */}
      <Card className="mt-3">
        <button onClick={() => setShowMap(!showMap)} className="flex w-full items-center gap-2 text-left text-sm font-semibold text-mute">
          <Activity size={16} />
          <span className="flex-1">Muscles hit in Week {curWeek}</span>
          <ChevronDown size={16} className={cx("transition", showMap && "rotate-180")} />
        </button>
        {showMap && (
          <div className="mt-3">
            <BodyMap exSets={week.days.flatMap((d) => d.items).reduce<Record<string, number>>((a, x) => ({ ...a, [x.ex]: (a[x.ex] ?? 0) + x.sets }), {})} caption="If you complete every set this week" />
          </div>
        )}
      </Card>

      <Sheet open={legend} onClose={() => setLegend(false)} title="Reading the plan" icon={Info}>
        <ul className="space-y-2 text-sm">
          <li><b>4×8-10 @RIR1</b> — 4 sets of 8-10 reps, stop with ~1 rep left.</li>
          <li><Clock size={12} className="inline" /> <b>2:00</b> — rest after each set. "no rest → partner" = superset.</li>
          <li><span className="text-acc">→ 57.5 kg</span> go up · <span className="text-info">→ 55 kg</span> same weight, beat your reps · <span className="text-warn">→ 52.5 kg</span> lighter. Shows after you've logged the exercise once.</li>
          <li><span className="text-warn">Orange text</span> = technique for that exercise; tap <Info size={12} className="inline text-info" /> for what it means.</li>
          <li><b>Finishers</b> = small muscles (grip, wrists, neck, push-ups), done last.</li>
          <li>Tap a thumbnail or name for the how-to video.</li>
        </ul>
      </Sheet>

      {how && <ExerciseSheet item={how} onClose={() => setHow(null)} />}
      {preview && <WorkoutPreview week={preview.week} dayKey={preview.dayKey} onClose={() => setPreview(null)} onStart={preview.slot ? () => { setStart(preview.slot); setPreview(null); } : undefined} />}
      {vers && (
        <Sheet open onClose={() => setVers(false)} title="Plan versions" icon={GitBranch}>
          <p className="-mt-1 mb-3 text-xs text-mute">Every change to your plan, newest first — what changed and the data or research behind it. Your workouts keep the version they were done with.</p>
          <ol className="relative space-y-3 border-l border-line pl-4">
            {HISTORY.map((h, i) => (
              <li key={h.id} className="relative">
                <span className={cx("absolute -left-[21px] top-1 h-3 w-3 rounded-full ring-4 ring-card", i === 0 ? "bg-acc" : h.kind === "major" ? "bg-info" : "bg-card3")} />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-bold num">v{h.version}</span>
                  {i === 0 && <Badge tone="acc">current</Badge>}
                  {h.kind === "major" && <Badge tone="info">new program</Badge>}
                  <span className="text-[11px] text-mute num">{niceDate(h.date)}</span>
                </div>
                <div className="text-sm font-semibold">{h.title}</div>
                <p className="mt-0.5 text-[11px] text-mute"><b className="text-ink/80">Why:</b> {h.why}</p>
                <ul className="mt-1 space-y-0.5">{h.changes.map((c) => <li key={c} className="flex gap-1.5 text-xs"><span className="text-acc">•</span><span>{c}</span></li>)}</ul>
              </li>
            ))}
          </ol>
        </Sheet>
      )}
      <StartSheet open={!!start} slot={start} kind={start?.dayKey.startsWith("X") ? "extra" : start && !(nx.next?.week === start.week && nx.next?.dayKey === start.dayKey) && !(s?.next?.week === start.week && s?.next?.dayKey === start.dayKey) ? (start.status === "open" ? "picked" : "extra") : "planned"} onClose={() => setStart(null)} />
    </div>
  );
}
