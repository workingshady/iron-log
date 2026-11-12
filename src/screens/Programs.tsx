import { useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Dumbbell, Home as HomeIcon, ListChecks, Pencil, Play, RotateCcw, ShieldCheck, Sparkles, Trash2, User } from "lucide-react";
import { CURRENT } from "../../program";
import type { Group } from "../../program/groups";
import { rankTemplates, templateById, type Answers, type EquipLevel, type Goal, type Level, type Scored } from "../../program/templates";
import { send } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { refreshProgram, useProgram } from "../lib/program";
import { go } from "../nav";
import { cx } from "../lib/util";
import { Badge, Btn, Card, Chips, Label, PageHead, SectionHead, Sheet } from "../components/ui";
import { DesignPreview, VolumeBars } from "../components/program/PlanBits";

interface PlanRow { id: string; name: string; template: string | null; active: boolean; days: number; version: string; minutes: number | null; dayNames: string[]; updatedAt: number }
interface Mine { activeId: string | null; default: { id: string; name: string; version: string; days: number }; plans: PlanRow[] }

const QUIZ_KEY = "il_prog_quiz";
const DEFAULT_ANS: Answers = { days: 4, minutes: 60, goal: "muscle", level: "beginner", equipment: "gym", focus: [] };
const loadAns = (): Answers => { try { return { ...DEFAULT_ANS, ...(JSON.parse(localStorage.getItem(QUIZ_KEY) ?? "{}") as Partial<Answers>) }; } catch { return DEFAULT_ANS; } };
const FOCUS: Group[] = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings/Glutes", "Calves", "Core"];
const LEVEL_LABEL: Record<Level, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const EQUIP: Record<EquipLevel, { label: string; icon: typeof Dumbbell }> = { gym: { label: "Gym", icon: Dumbbell }, dumbbells: { label: "Dumbbells", icon: HomeIcon }, bodyweight: { label: "Bodyweight", icon: User } };

/** Pick a plan that fits your week (questionnaire → ranked templates), switch between your plans, or go back to the default plan. */
export default function Programs() {
  const program = useProgram();
  const { data: mine, reload } = useLoad<Mine>("/programs");
  const [ans, setAnsState] = useState<Answers>(loadAns);
  const [all, setAll] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [use, setUse] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; name: string; active: boolean } | null>(null);
  const [manage, setManage] = useState<PlanRow | "default" | null>(null);
  const setAns = (a: Partial<Answers>) => {
    const n = { ...ans, ...a };
    setAnsState(n);
    try { localStorage.setItem(QUIZ_KEY, JSON.stringify(n)); } catch { /* private mode */ }
  };
  const ranked = useMemo(() => rankTemplates(ans), [ans]);
  const shown = all ? ranked : ranked.slice(0, 3);
  const onDefault = mine ? !mine.activeId : program === CURRENT;
  const activeRow = mine?.plans.find((p) => p.active);

  return (
    <div className="pb-6">
      <PageHead icon={ListChecks} title="Programs" sub="Pick a plan that fits your week, then make it yours" />

      <Card className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-acc/15 text-acc" aria-hidden><Play size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-mute">Training now</span>
          <span className="block truncate font-semibold">{program.name}</span>
          <span className="block text-xs text-mute num">{program.order.length} days/week · v{program.version}{onDefault ? " · default plan" : ""}</span>
        </span>
        {activeRow && <Btn kind="soft" icon={Pencil} onClick={() => go(`/program/${activeRow.id}`)}>Edit</Btn>}
      </Card>

      <SectionHead>Find a plan</SectionHead>
      <Card>
        <Label>Days per week</Label>
        <Chips small clearable={false} options={[2, 3, 4, 5, 6].map((d) => ({ id: d, label: String(d) }))} value={ans.days} onChange={(v) => v && setAns({ days: v })} />
        <Label>Minutes per workout</Label>
        <Chips small clearable={false} options={[30, 45, 60, 75, 90].map((d) => ({ id: d, label: String(d) }))} value={ans.minutes} onChange={(v) => v && setAns({ minutes: v })} />
        <Label>Main goal</Label>
        <Chips clearable={false} options={[{ id: "muscle", label: "Build muscle" }, { id: "strength", label: "Get stronger" }, { id: "general", label: "Fit & healthy" }] as { id: Goal; label: string }[]} value={ans.goal} onChange={(v) => v && setAns({ goal: v })} />
        <Label>Experience</Label>
        <Chips clearable={false} options={(Object.keys(LEVEL_LABEL) as Level[]).map((l) => ({ id: l, label: LEVEL_LABEL[l] }))} value={ans.level} onChange={(v) => v && setAns({ level: v })} />
        <p className="mt-1 text-[11px] text-faint">Beginner = under ~1 year of steady lifting. Advanced = several years, slow progress.</p>
        <Label>Equipment</Label>
        <Chips clearable={false} options={(Object.keys(EQUIP) as EquipLevel[]).map((e) => ({ id: e, label: EQUIP[e].label, icon: EQUIP[e].icon }))} value={ans.equipment} onChange={(v) => v && setAns({ equipment: v })} />
        <Label>Extra focus (optional)</Label>
        <div className="flex flex-wrap gap-2">
          {FOCUS.map((g) => {
            const on = ans.focus.includes(g);
            return (
              <button key={g} type="button" aria-pressed={on} onClick={() => setAns({ focus: on ? ans.focus.filter((x) => x !== g) : [...ans.focus, g] })}
                className={cx("min-h-11 rounded-full border px-3 text-sm", on ? "border-acc bg-acc font-semibold text-acc-ink" : "border-line hover:bg-card2")}>
                {g === "Hamstrings/Glutes" ? "Glutes & hams" : g}
              </button>
            );
          })}
        </div>
      </Card>

      <SectionHead right={<span className="text-xs text-mute num">{ranked.length} match your equipment</span>}>Best matches</SectionHead>
      <ul className="space-y-3">
        {shown.map((r, i) => <li key={r.meta.id}><PlanCard r={r} best={i === 0} onOpen={() => setPreview(r.meta.id)} /></li>)}
      </ul>
      {ranked.length > 3 && <Btn kind="ghost" className="mt-3 w-full" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${ranked.length} plans`}</Btn>}

      <SectionHead>My plans</SectionHead>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
        <li>
          <button type="button" onClick={() => setManage("default")} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-card2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{CURRENT.name}</span>
              <span className="block text-xs text-mute num">Default plan · {CURRENT.order.length} days · v{CURRENT.version}</span>
            </span>
            {onDefault ? <Badge tone="acc"><Check size={12} aria-hidden />Active</Badge> : null}
            <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
          </button>
        </li>
        {(mine?.plans ?? []).map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setManage(p)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-card2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block truncate text-xs text-mute num">{p.days} days{p.minutes ? ` · ~${p.minutes} min` : ""} · v{p.version}{p.template ? ` · from ${templateById(p.template)?.meta.name ?? p.template}` : ""}</span>
              </span>
              {p.active && <Badge tone="acc"><Check size={12} aria-hidden />Active</Badge>}
              <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {mine && !mine.plans.length && <p className="mt-2 px-1 text-xs text-mute">Plans you pick or copy show up here. You can keep several and switch any time.</p>}

      <PreviewSheet id={preview} onClose={() => setPreview(null)} onUse={(id) => { setPreview(null); setUse(id); }} />
      <UseSheet id={use} onDefault={onDefault} currentName={program.name} onClose={() => setUse(null)} onDone={(d) => { setUse(null); setDone(d); reload(); }} />
      <DoneSheet done={done} onClose={() => setDone(null)} />
      <ManageSheet row={manage} onDefault={onDefault} onClose={() => setManage(null)} onChanged={() => { setManage(null); reload(); }} />
    </div>
  );
}

function PlanCard({ r, best, onOpen }: { r: Scored; best: boolean; onOpen: () => void }) {
  const m = r.meta;
  return (
    <button type="button" onClick={onOpen} className={cx("w-full rounded-2xl border bg-card p-4 text-left transition hover:bg-card2 motion-safe:active:scale-[.99]", best ? "border-acc/50" : "border-line/60")}>
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-lg font-semibold">{m.name}</h3>
        {best && <Badge tone="acc"><Sparkles size={12} aria-hidden />Best fit</Badge>}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Badge tone="info">{m.days} days</Badge>
        <Badge>~{r.minutes} min</Badge>
        <Badge>{m.levels.map((l) => LEVEL_LABEL[l]).join(" / ")}</Badge>
        <Badge>{EQUIP[m.equipment].label}</Badge>
      </div>
      <p className="mt-2 text-sm text-mute">{m.blurb}</p>
      {!!r.reasons.length && (
        <ul className="mt-2 space-y-0.5">
          {r.reasons.map((x) => <li key={x} className="flex items-center gap-1.5 text-xs text-acc"><Check size={13} aria-hidden />{x}</li>)}
        </ul>
      )}
      <span className="mt-3 flex items-center gap-1 text-xs font-medium text-info">See the plan <ChevronRight size={14} aria-hidden /></span>
    </button>
  );
}

function PreviewSheet({ id, onClose, onUse }: { id: string | null; onClose: () => void; onUse: (id: string) => void }) {
  const t = id ? templateById(id) : null;
  return (
    <Sheet open={!!t} onClose={onClose} title={t?.meta.name} icon={ListChecks}>
      {t && (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="info">{t.meta.split}</Badge>
            <Badge>{t.meta.days} days/week</Badge>
            <Badge>{EQUIP[t.meta.equipment].label}</Badge>
          </div>
          <h3 className="mt-4 text-sm font-semibold">Why this plan</h3>
          <p className="mt-1 text-sm text-mute">{t.meta.why}</p>
          <p className="mt-2 text-xs text-faint">4-week cycle: Week 1 ramp-in (a set less), Week 2 build, Week 3 overload, Week 4 deload. Then repeat a little heavier.</p>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Your week</h3>
          <DesignPreview design={t.design} />
          <h3 className="mb-2 mt-5 text-sm font-semibold">Hard sets per muscle per week</h3>
          <VolumeBars design={t.design} />
          <div className="sticky bottom-0 -mx-4 mt-5 bg-card px-4 pb-1 pt-3 md:-mx-6 md:px-6">
            <Btn kind="primary" icon={Play} className="w-full" onClick={() => onUse(t.meta.id)}>Use this plan</Btn>
          </div>
        </>
      )}
    </Sheet>
  );
}

function UseSheet({ id, onDefault, currentName, onClose, onDone }: { id: string | null; onDefault: boolean; currentName: string; onClose: () => void; onDone: (d: { id: string; name: string; active: boolean }) => void }) {
  const t = id ? templateById(id) : null;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function create(activate: boolean) {
    if (!t) return;
    setBusy(true); setErr(null);
    try {
      const r = await send<{ id: string }>("POST", "/programs", { template: t.meta.id, name: name.trim() || undefined, activate });
      if (activate) await refreshProgram();
      onDone({ id: r.id, name: name.trim() || t.meta.name, active: activate });
      setName("");
    } catch (e) {
      setErr(e instanceof TypeError ? "You're offline. Switching plans needs a connection." : (e as Error).message);
    } finally { setBusy(false); }
  }
  return (
    <Sheet open={!!t} onClose={onClose} title="Switch plan" icon={ShieldCheck}>
      {t && (
        <>
          <div className="rounded-xl border border-acc/30 bg-acc/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-acc"><ShieldCheck size={16} aria-hidden />Your data stays safe</p>
            <ul className="mt-1.5 space-y-1 text-mute">
              <li>• {onDefault ? <>Your plan <b className="text-ink">{currentName}</b></> : <>Your current plan</>}, every workout, PR and weight suggestion stay saved. Nothing is deleted.</li>
              <li>• A new month starts with <b className="text-ink">{t.meta.name}</b> at Week 1.</li>
              <li>• Switch back any time: Programs → My plans{onDefault ? " → default plan" : ""}.</li>
            </ul>
          </div>
          <Label>Name (optional)</Label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t.meta.name} className="min-h-12 w-full rounded-xl bg-card2 px-3 outline-none placeholder:text-faint focus:ring-2 focus:ring-acc" />
          {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
          <Btn kind="primary" icon={Play} className="mt-5 w-full" disabled={busy} onClick={() => create(true)}>{busy ? "Saving…" : "Start this plan"}</Btn>
          <Btn kind="ghost" className="mt-2 w-full" disabled={busy} onClick={() => create(false)}>Save to My plans without switching</Btn>
        </>
      )}
    </Sheet>
  );
}

function DoneSheet({ done, onClose }: { done: { id: string; name: string; active: boolean } | null; onClose: () => void }) {
  return (
    <Sheet open={!!done} onClose={onClose} title={done?.active ? "You're all set" : "Saved"} icon={Check}>
      {done && (
        <>
          <p className="text-sm text-mute">{done.active ? <>You're now training <b className="text-ink">{done.name}</b>. Your next workout is Day 1 of Week 1.</> : <><b className="text-ink">{done.name}</b> is in My plans. Switch to it whenever you're ready.</>}</p>
          <p className="mt-2 text-sm text-mute">Want different days, exercises or sets? Customise it — the 4-week wave and deload adjust automatically.</p>
          <Btn kind="primary" icon={Pencil} className="mt-5 w-full" onClick={() => { onClose(); go(`/program/${done.id}`); }}>Customise</Btn>
          {done.active && <Btn kind="ghost" className="mt-2 w-full" onClick={() => { onClose(); go("/plan"); }}>See my plan</Btn>}
        </>
      )}
    </Sheet>
  );
}

function ManageSheet({ row, onDefault, onClose, onChanged }: { row: PlanRow | "default" | null; onDefault: boolean; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const isDef = row === "default";
  const r = isDef ? null : row;
  const active = isDef ? onDefault : !!r?.active;
  const close = () => { setSure(false); setErr(null); onClose(); };
  async function run(method: string, url: string, body?: unknown, after?: (out: { id?: string }) => void) {
    setBusy(true); setErr(null);
    try {
      const out = await send<{ id?: string }>(method, url, body);
      await refreshProgram();
      setSure(false);
      onChanged();
      after?.(out);
    } catch (e) {
      setErr(e instanceof TypeError ? "You're offline. Try again with a connection." : (e as Error).message);
    } finally { setBusy(false); }
  }
  return (
    <Sheet open={!!row} onClose={close} title={isDef ? CURRENT.name : r?.name} icon={ListChecks}>
      {row && (
        <>
          <p className="text-sm text-mute">
            {isDef ? `The default plan · ${CURRENT.order.length} days · v${CURRENT.version}.` : `${r!.days} days: ${r!.dayNames.join(" · ")}.`}
            {active ? " You're training this plan now." : ""}
          </p>
          {!active && (
            <>
              <p className="mt-3 rounded-xl bg-card2 p-3 text-xs text-mute">Switching starts a new month at Week 1. All your workouts and logs stay saved.</p>
              <Btn kind="primary" icon={isDef ? RotateCcw : Play} className="mt-4 w-full" disabled={busy}
                onClick={() => (isDef ? run("POST", "/programs/default") : run("POST", `/programs/${r!.id}/activate`))}>
                {isDef ? "Back to the default plan" : "Train this plan"}
              </Btn>
            </>
          )}
          {r && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Btn kind="soft" stack icon={Pencil} onClick={() => { close(); go(`/program/${r.id}`); }}>Edit</Btn>
              <Btn kind="soft" stack icon={Copy} disabled={busy} onClick={() => run("POST", "/programs", { from: r.id })}>Duplicate</Btn>
              <Btn kind="danger" stack icon={Trash2} disabled={busy} onClick={() => setSure(true)}>Delete</Btn>
            </div>
          )}
          {r && sure && (
            <div role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad/10 p-3">
              <p className="text-sm">Delete <b>{r.name}</b>? Your logged workouts stay.{r.active ? " You'll go back to the default plan." : ""}</p>
              <div className="mt-3 flex gap-2">
                <Btn kind="ghost" className="flex-1" onClick={() => setSure(false)}>Keep it</Btn>
                <Btn kind="danger" className="flex-1" disabled={busy} onClick={() => run("DELETE", `/programs/${r.id}`)}>Delete</Btn>
              </div>
            </div>
          )}
          {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
        </>
      )}
    </Sheet>
  );
}

