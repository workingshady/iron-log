import { useState } from "react";
import { Activity, CalendarDays, Check, ChevronDown, Clock, Info, Play } from "lucide-react";
import type { AppState, Lifts, PlanItem, SlotInfo } from "../../shared/api";
import type { DayPlan } from "../../program/types";
import { recommend } from "../../shared/recommend";
import { CURRENT } from "../../program";
import { targetLabel, toItem } from "../../shared/plan";
import { useLoad } from "../lib/useLoad";
import { cx, kg, restLabel } from "../lib/util";
import { Badge, Btn, Card, PageHead, Sheet, Thumb } from "../components/ui";
import { HowTo } from "../components/HowTo";
import { TechNote } from "../components/Terms";
import { StartSheet } from "../components/StartSheets";
import { BodyMap } from "../components/BodyMap";

/** Rough session length: each set ≈ 40 s of work + its rest; superset partners share the rest. */
const estMinutes = (d: DayPlan) => Math.round(d.items.reduce((a, x) => a + x.sets * (40 + x.rest), 0) / 60) + 8; // + warm-up

export default function Plan() {
  const { data: s } = useLoad<AppState>("/state");
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const [wk, setWk] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [how, setHow] = useState<PlanItem | null>(null);
  const [start, setStart] = useState<SlotInfo | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [legend, setLegend] = useState(false);
  const curWeek = wk ?? s?.next?.week ?? 1;
  const week = CURRENT.weeks.find((w) => w.n === curWeek)!;
  const slot = (key: string) => s?.slots.find((x) => x.week === curWeek && x.dayKey === key);
  const nextKey = s?.next?.week === curWeek ? s.next.dayKey : null;
  const expanded = openDay ?? nextKey ?? week.days.find((d) => slot(d.key)?.status !== "done")?.key ?? week.days[0].key;

  return (
    <div className="min-w-0">
      <PageHead icon={CalendarDays} title="Plan" sub={`${CURRENT.name} · v${CURRENT.version}`} />

      {/* weeks */}
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-card p-1">
        {CURRENT.weeks.map((w) => (
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
                    {isNext && <Badge tone="info">next</Badge>}
                  </div>
                  <div className="text-xs text-mute">{d.focus}</div>
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
                  {sl && !s?.active && (
                    <div className="px-4 pb-3">
                      <Btn kind={isNext ? "primary" : "soft"} icon={Play} className="w-full" onClick={() => setStart(sl)}>Start {d.name}</Btn>
                    </div>
                  )}
                  <ul className="border-t border-line">
                    {d.items.map((rx, i) => {
                      const item = toItem(rx.ex, rx);
                      const rec = recommend(rx.ex, rx, lifts?.hist ?? {}, { deload: /deload/i.test(week.name), step: item.step });
                      const recText = rec.weightKg != null ? `${kg(rec.weightKg)} kg` : rec.seconds ? `${rec.seconds} s` : rec.reps && rec.kind !== "start" ? `${rec.reps} reps` : "";
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

      {how && <HowTo item={how} open onClose={() => setHow(null)} />}
      <StartSheet open={!!start} slot={start} kind={start && !(s?.next?.week === start.week && s?.next?.dayKey === start.dayKey) ? (start.status === "open" ? "picked" : "extra") : "planned"} onClose={() => setStart(null)} />
    </div>
  );
}
