import { useState } from "react";
import { BookOpen, ChevronDown, Flame, HelpCircle, ListChecks, ShieldAlert, Signal, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LEVELS, NUTRITION, SAFETY, TERMS, WARMUP, WHAT_IF } from "../../program/learn";
import { CURRENT } from "../../program";
import { cx } from "../lib/util";
import { PageHead } from "../components/ui";

export default function Learn() {
  const [open, setOpen] = useState<string | null>("terms");
  const [done, setDone] = useState<Record<number, boolean>>({});
  const S = ({ id, icon: Icon, title, sub, children }: { id: string; icon: LucideIcon; title: string; sub: string; children: React.ReactNode }) => (
    <section className="rounded-2xl bg-card">
      <button onClick={() => setOpen(open === id ? null : id)} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card2"><Icon size={18} className="text-info" /></div>
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-mute">{sub}</div>
        </div>
        <ChevronDown size={18} className={cx("text-mute transition", open === id && "rotate-180")} />
      </button>
      {open === id && <div className="border-t border-line p-4">{children}</div>}
    </section>
  );

  return (
    <div>
      <PageHead icon={BookOpen} title="Learn" sub="Everything from your program in short pieces. Tap a topic." />
      <div className="grid gap-3 lg:grid-cols-2">
        <S id="terms" icon={HelpCircle} title="Words & set types" sub="RIR, superset, drop set, rest-pause, myo-reps…">
          <dl className="space-y-3">
            {TERMS.map((t) => (
              <div key={t.key}>
                <dt className="font-semibold">{t.name}</dt>
                <dd className="text-sm text-mute">{t.short}{t.how ? ` ${t.how}` : ""}</dd>
              </div>
            ))}
          </dl>
        </S>
        <S id="warmup" icon={Flame} title="Warm-up (every session, 8-10 min)" sub="Includes wrist prep, never skip it">
          <ul className="space-y-1">
            {WARMUP.map((w, i) => (
              <li key={i}>
                <label className="flex min-h-10 items-center gap-3 text-sm">
                  <input type="checkbox" checked={!!done[i]} onChange={(e) => setDone({ ...done, [i]: e.target.checked })} className="h-5 w-5 accent-[#c8f560]" />
                  <span className={done[i] ? "text-faint line-through" : ""}>{w}</span>
                </label>
              </li>
            ))}
          </ul>
        </S>
        <S id="levels" icon={Signal} title="Pull-up & dip levels" sub="Move up a level as soon as you hit it">
          {[LEVELS.pullup, LEVELS.dip].map((l) => (
            <div key={l.title} className="mb-4 last:mb-0">
              <div className="mb-2 text-sm font-semibold">{l.title}</div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-mute"><tr><th className="py-1 pr-2">Strict reps</th><th className="pr-2">Heavy day</th><th>Day 5</th></tr></thead>
                <tbody>{l.rows.map((r) => <tr key={r[0]} className="border-t border-line align-top"><td className="py-2 pr-2 font-semibold num">{r[0]}</td><td className="pr-2">{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
              </table>
            </div>
          ))}
          <p className="text-xs text-mute">Bonus for your first pull-up: on rest days do 3-5 dead hangs + 3-5 sets of scap pulls through the day, never to failure.</p>
        </S>
        <S id="whatif" icon={ListChecks} title="What if…" sub="Missed days, short on time, pain, home, Ramadan…">
          <dl className="space-y-3">{WHAT_IF.map(([q, a]) => <div key={q}><dt className="text-sm font-semibold">{q}</dt><dd className="text-sm text-mute">{a}</dd></div>)}</dl>
        </S>
        <S id="food" icon={Utensils} title="Nutrition, sleep & recovery" sub="Protein, calories, creatine, sleep, water">
          <table className="w-full text-sm"><tbody>{NUTRITION.map(([k, v]) => <tr key={k} className="border-b border-line/60 align-top last:border-0"><td className="py-2 pr-3 font-semibold">{k}</td><td className="py-2 text-mute">{v}</td></tr>)}</tbody></table>
        </S>
        <S id="safety" icon={ShieldAlert} title="Safety & rules" sub="Read once, remember always">
          <ul className="space-y-2 text-sm">{[...SAFETY, ...CURRENT.rules].map((s) => <li key={s} className="flex gap-2"><span className="text-info">•</span>{s}</li>)}</ul>
        </S>
      </div>
    </div>
  );
}
