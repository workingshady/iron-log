import { useState } from "react";
import { CalendarDays, Check, Clock, Play } from "lucide-react";
import type { AppState, Lifts, PlanItem, SlotInfo } from "../../shared/api";
import { recommend } from "../../shared/recommend";
import { kg } from "../lib/util";
import { CURRENT } from "../../program";
import { targetLabel, toItem } from "../../shared/plan";
import { useLoad } from "../lib/useLoad";
import { cx, restLabel } from "../lib/util";
import { Badge, Btn, PageHead, Thumb } from "../components/ui";
import { HowTo } from "../components/HowTo";
import { TechNote } from "../components/Terms";
import { StartSheet } from "../components/StartSheets";
import { BodyMap } from "../components/BodyMap";
import { Card } from "../components/ui";
import { Activity, ChevronDown } from "lucide-react";

export default function Plan() {
  const { data: s } = useLoad<AppState>("/state");
  const { data: lifts } = useLoad<Lifts>("/lifts");
  const [wk, setWk] = useState<number | null>(null);
  const [how, setHow] = useState<PlanItem | null>(null);
  const [start, setStart] = useState<SlotInfo | null>(null);
  const [showMap, setShowMap] = useState(false);
  const curWeek = wk ?? s?.next?.week ?? 1;
  const week = CURRENT.weeks.find((w) => w.n === curWeek)!;
  const slot = (key: string) => s?.slots.find((x) => x.week === curWeek && x.dayKey === key);

  return (
    <div>
      <PageHead icon={CalendarDays} title="Plan" sub={`${CURRENT.name} · v${CURRENT.version} — every week, day and exercise`} />

      <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-card p-1">
        {CURRENT.weeks.map((w) => (
          <button key={w.n} onClick={() => setWk(w.n)} className={cx("rounded-lg px-1 py-2 text-center", curWeek === w.n ? "bg-card3" : "text-mute")}>
            <div className="text-sm font-semibold">Week {w.n}</div>
            <div className="truncate text-[11px] text-mute">{w.name}</div>
          </button>
        ))}
      </div>
      <p className="mb-4 rounded-xl bg-info/10 px-4 py-3 text-sm text-info">{week.brief}</p>
      <p className="-mt-2 mb-4 text-xs text-mute">→ = recommended weight from your last session (green = go up, blue = same / beat reps, amber = lighter). Empty until you've logged that exercise once.</p>

      <Card className="mb-4">
        <button onClick={() => setShowMap(!showMap)} className="flex w-full items-center gap-2 text-left text-sm font-semibold text-mute">
          <Activity size={16} />
          <span className="flex-1">Muscles hit by Week {curWeek} (planned sets)</span>
          <ChevronDown size={16} className={cx("transition", showMap && "rotate-180")} />
        </button>
        {showMap && (
          <div className="mt-3">
            <BodyMap exSets={week.days.flatMap((d) => d.items).reduce<Record<string, number>>((a, x) => ({ ...a, [x.ex]: (a[x.ex] ?? 0) + x.sets }), {})} caption="If you complete every set this week" />
          </div>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {week.days.map((d) => {
          const sl = slot(d.key);
          const isNext = s?.next?.week === curWeek && s?.next?.dayKey === d.key;
          return (
            <section key={d.key} className={cx("rounded-2xl bg-card", isNext && "ring-1 ring-info/60")}>
              <header className="flex items-center gap-3 border-b border-line p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{d.name}</h2>
                    {sl?.status === "done" && <Badge tone="acc"><Check size={11} /> done</Badge>}
                    {sl?.status === "skipped" && <Badge>skipped</Badge>}
                    {isNext && <Badge tone="info">next</Badge>}
                  </div>
                  <div className="truncate text-xs text-mute">{d.focus} · {d.items.reduce((a, x) => a + x.sets, 0)} sets</div>
                </div>
                {sl && !s?.active && (
                  <Btn kind={isNext ? "primary" : "soft"} icon={Play} className="min-h-10 px-3 text-sm" onClick={() => setStart(sl)}>Start</Btn>
                )}
              </header>
              <ul>
                {d.items.map((rx, i) => {
                  const item = toItem(rx.ex, rx);
                  const rec = recommend(rx.ex, rx, lifts?.hist ?? {}, { deload: /deload/i.test(week.name), step: item.step });
                  const recText = rec.weightKg != null ? `${kg(rec.weightKg)} kg` : rec.seconds ? `${rec.seconds} s` : rec.reps && rec.kind !== "start" ? `${rec.reps} reps` : "";
                  const grouped = rx.tag && d.items[i + 1]?.tag?.[0] === rx.tag[0];
                  return (
                    <li key={i} className={cx("flex items-center gap-3 px-4 py-2.5", grouped ? "pb-1" : "border-b border-line/60 last:border-0")}>
                      <button onClick={() => setHow(item)} className="shrink-0" aria-label={`How to ${item.name}`}>
                        <Thumb yt={item.yt[0]} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button onClick={() => setHow(item)} className="block w-full truncate text-left text-sm font-semibold">
                          {rx.tag && <span className="mr-1.5 rounded bg-card3 px-1.5 text-[11px] text-mute">{rx.tag}</span>}
                          {item.name}
                        </button>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs text-mute num">
                          <span>{targetLabel(rx)}</span>
                          <span className="inline-flex items-center gap-1"><Clock size={11} />{restLabel(rx.rest)}</span>
                          {recText && <span className={rec.kind === "up" ? "text-acc" : rec.kind === "down" ? "text-warn" : "text-info"} title={rec.why}>→ {recText}</span>}
                        </div>
                        {rx.tech && <TechNote text={rx.tech} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {how && <HowTo item={how} open onClose={() => setHow(null)} />}
      <StartSheet open={!!start} slot={start} kind={start && !(s?.next?.week === start.week && s?.next?.dayKey === start.dayKey) ? (start.status === "open" ? "picked" : "extra") : "planned"} onClose={() => setStart(null)} />
    </div>
  );
}
