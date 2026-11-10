import { useState, type ReactNode } from "react";
import {
  BookOpen, Calculator, CheckCircle2, Scale, ChevronDown, ExternalLink, Flame, Footprints, HelpCircle, ListChecks, Route, ShieldAlert, Sparkles, Target, Utensils, Workflow, XCircle,
  type LucideIcon,
} from "lucide-react";
import { CARDIO_GUIDE, GROW_RULES, VERDICTS, KG_ENTRY, REC_RULES, REC_MATH, NUTRITION, PULLUP_ROADMAP, SAFETY, SESSION_FLOW, TERMS, WARMUP, WHAT_IF, WHY_V2 } from "../../program/learn";
import { CURRENT } from "../../program";
import { cx } from "../lib/util";
import { PageHead } from "../components/ui";

// Colour = type of content (same meaning as everywhere in the app):
// green = how to do it · amber = rules you must follow · blue = explanations & reference · red = safety
type Tone = "acc" | "warn" | "info" | "bad";
const TONE: Record<Tone, { bar: string; icon: string; label: string }> = {
  acc: { bar: "bg-acc", icon: "text-acc", label: "How to" },
  warn: { bar: "bg-warn", icon: "text-warn", label: "Rules" },
  info: { bar: "bg-info", icon: "text-info", label: "Reference" },
  bad: { bar: "bg-bad", icon: "text-bad", label: "Safety" },
};

export default function Learn() {
  const [open, setOpen] = useState<string | null>("flow");
  const [done, setDone] = useState<Record<number, boolean>>({});

  const S = ({ id, tone, icon: Icon, title, sub, children }: { id: string; tone: Tone; icon: LucideIcon; title: string; sub: string; children: ReactNode }) => (
    <section id={id} className="overflow-hidden rounded-2xl bg-card">
      <button onClick={() => setOpen(open === id ? null : id)} className="flex w-full items-center gap-3 p-4 text-left">
        <span className={cx("h-10 w-1 shrink-0 rounded-full", TONE[tone].bar)} />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2"><Icon size={19} className={TONE[tone].icon} /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-mute">{sub}</div>
        </div>
        <ChevronDown size={18} className={cx("shrink-0 text-mute transition", open === id && "rotate-180")} />
      </button>
      {open === id && <div className="border-t border-line p-4">{children}</div>}
    </section>
  );

  return (
    <div>
      <PageHead icon={BookOpen} title="Learn" sub="Everything behind your plan · tap a topic" />
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
        {(Object.keys(TONE) as Tone[]).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5"><span className={cx("h-2.5 w-2.5 rounded-full", TONE[t].bar)} />{TONE[t].label}</span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <S id="flow" tone="acc" icon={Workflow} title="How a training day flows" sub="7 steps from check-in to finish">
          <ol className="relative space-y-3 border-l border-line pl-5">
            {SESSION_FLOW.map((f, i) => (
              <li key={f.step} className="relative">
                <span className="absolute -left-[29px] flex h-6 w-6 items-center justify-center rounded-full bg-acc text-[11px] font-bold text-acc-ink">{i + 1}</span>
                <div className="font-semibold">{f.step}</div>
                <div className="text-sm text-mute">{f.what}</div>
              </li>
            ))}
          </ol>
        </S>

        <S id="kg" tone="acc" icon={Scale} title="How to enter weight" sub="Barbell vs EZ bar vs dumbbells vs machine — per hand or total?">
          <div className="space-y-2">
            {KG_ENTRY.map((k) => (
              <div key={k.what} className="rounded-xl bg-card2 p-3 text-sm">
                <div className="font-semibold">{k.what}</div>
                <div className="mt-0.5">{k.enter}</div>
                <div className="mt-1 rounded-lg bg-acc/10 px-2.5 py-1.5 text-xs text-acc">e.g. {k.example}</div>
              </div>
            ))}
          </div>
          <a href="#/settings" className="mt-2 inline-block text-sm text-info">Set your bar weights →</a>
        </S>

        <S id="recs" tone="info" icon={Calculator} title="How today's weight is picked" sub="Every rule behind the recommended weight, with examples">
          <div className="space-y-2">
            {REC_RULES.map((r) => (
              <div key={r.rule} className="rounded-xl bg-card2 p-3 text-sm">
                <div className={cx("font-semibold", r.tone === "up" ? "text-acc" : r.tone === "down" ? "text-warn" : r.tone === "hold" ? "text-info" : "text-ink")}>{r.rule}</div>
                <div className="text-mute">{r.when}</div>
                <div className="mt-1 text-xs">e.g. {r.example}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-line p-3 text-xs text-mute">
            <div className="mb-1 font-semibold text-ink">The math</div>
            <ul className="space-y-1">{REC_MATH.map((m) => <li key={m}>• {m}</li>)}</ul>
          </div>
          <a href="#/stats" className="mt-2 inline-block text-sm text-info">See recommended vs actual →</a>
        </S>

        <S id="rules" tone="warn" icon={Target} title="Rules that make you grow" sub="Counting, form, finishing every set — with examples">
          <div className="space-y-3">
            {GROW_RULES.map((r) => (
              <div key={r.rule} className="rounded-xl bg-card2 p-3">
                <div className="font-semibold">{r.rule}</div>
                <div className="text-xs text-mute">{r.why}</div>
                <div className="mt-2 flex gap-2 text-sm"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-acc" />{r.good}</div>
                <div className="mt-1 flex gap-2 text-sm text-mute"><XCircle size={16} className="mt-0.5 shrink-0 text-bad" />{r.bad}</div>
              </div>
            ))}
            <ul className="space-y-1.5 text-sm">{CURRENT.rules.map((r) => <li key={r} className="flex gap-2"><span className="text-warn">•</span>{r}</li>)}</ul>
          </div>
        </S>

        <S id="terms" tone="info" icon={HelpCircle} title="Words & set types" sub="RIR, superset, drop set, rest-pause, myo-reps… with examples">
          <dl className="space-y-3">
            {TERMS.map((t) => (
              <div key={t.key}>
                <dt className="font-semibold">{t.name}</dt>
                <dd className="text-sm text-mute">{t.short}{t.how ? ` ${t.how}` : ""}</dd>
                {t.example && <dd className="mt-1 rounded-lg bg-info/10 px-2.5 py-1.5 text-xs text-info">Example: {t.example}</dd>}
              </div>
            ))}
          </dl>
        </S>

        <S id="why" tone="info" icon={Sparkles} title={`Why ${CURRENT.name} is built this way`} sub="What was wrong with v1, what changed, and the evidence">
          <div className="space-y-3">
            {WHY_V2.map((w) => (
              <div key={w.point} className="rounded-xl bg-card2 p-3 text-sm">
                <div className="flex gap-2 text-mute"><XCircle size={15} className="mt-0.5 shrink-0 text-bad" />{w.point}</div>
                <div className="mt-1 flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-acc" />{w.fix}</div>
                <a href={w.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-info">{w.ref} <ExternalLink size={11} /></a>
              </div>
            ))}
          </div>
        </S>

        <S id="verdicts" tone="info" icon={Sparkles} title="Is this the best exercise?" sub="Honest verdict for every main lift — e.g. do I have to bench?">
          <p className="mb-3 text-sm text-mute">Free weights and machines build the same muscle when effort and volume match (Haugen 2023). Barbells win for maximal strength, dumbbells for stretch, machines for safe, strict near-failure sets.</p>
          <ul className="space-y-2">
            {VERDICTS.map((v) => (
              <li key={v.ex} className="rounded-xl bg-card2 p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  <span className={cx("rounded-full px-2 py-0.5 text-[11px]", v.verdict === "keep" ? "bg-acc/15 text-acc" : v.verdict === "changed" ? "bg-warn/15 text-warn" : "bg-info/15 text-info")}>{v.verdict}</span>
                  {v.ex}
                </div>
                <div className="mt-1 text-mute">{v.why}</div>
              </li>
            ))}
          </ul>
        </S>

        <S id="pullup" tone="acc" icon={Route} title="Pull-up roadmap (no bands needed)" sub="From zero to weighted pull-ups, step by step">
          <ol className="space-y-2">
            {PULLUP_ROADMAP.map((r, i) => (
              <li key={r.stage} className={cx("rounded-xl p-3", i === 0 ? "bg-acc/10 ring-1 ring-acc/40" : "bg-card2")}>
                <div className="font-semibold">{r.stage}{i === 0 && <span className="ml-2 text-xs text-acc">you are here</span>}</div>
                <div className="text-sm">{r.do}</div>
                <div className="mt-1 text-xs text-mute">Move on when: {r.next}</div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-mute">Track it in Tests: pull-up attempt, dead hang, pulldown reps at 80% bodyweight.</p>
        </S>

        <S id="cardio" tone="info" icon={Footprints} title="Cardio guide" sub="When, how often, which kind, how hard">
          <table className="w-full text-sm"><tbody>{CARDIO_GUIDE.map(([k, v]) => <tr key={k} className="border-b border-line/60 align-top last:border-0"><td className="py-2 pr-3 font-semibold">{k}</td><td className="py-2 text-mute">{v}</td></tr>)}</tbody></table>
          <a href="#/cardio" className="mt-2 inline-block text-sm text-info">Open today's cardio →</a>
        </S>

        <S id="warmup" tone="acc" icon={Flame} title="Warm-up (every session, 8-10 min)" sub="Includes wrist prep — never skip it">
          <ul className="space-y-1">
            {WARMUP.map((w, i) => (
              <li key={i}>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" checked={!!done[i]} onChange={(e) => setDone({ ...done, [i]: e.target.checked })} className="h-5 w-5 accent-[#c8f560]" />
                  <span className={done[i] ? "text-faint line-through" : ""}>{w}</span>
                </label>
              </li>
            ))}
          </ul>
        </S>

        <S id="whatif" tone="info" icon={ListChecks} title="What if…" sub="Missed days, short on time, pain, home, Ramadan…">
          <dl className="space-y-3">{WHAT_IF.map(([q, a]) => <div key={q}><dt className="text-sm font-semibold">{q}</dt><dd className="text-sm text-mute">{a}</dd></div>)}</dl>
        </S>

        <S id="food" tone="info" icon={Utensils} title="Nutrition, sleep & recovery" sub="Protein, calories, creatine, sleep, water">
          <table className="w-full text-sm"><tbody>{NUTRITION.map(([k, v]) => <tr key={k} className="border-b border-line/60 align-top last:border-0"><td className="py-2 pr-3 font-semibold">{k}</td><td className="py-2 text-mute">{v}</td></tr>)}</tbody></table>
        </S>

        <S id="safety" tone="bad" icon={ShieldAlert} title="Safety" sub="Read once, remember always">
          <ul className="space-y-2 text-sm">{SAFETY.map((s) => <li key={s} className="flex gap-2"><span className="text-bad">•</span>{s}</li>)}</ul>
        </S>
      </div>
    </div>
  );
}
