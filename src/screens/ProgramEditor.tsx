import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, ChevronDown, CircleAlert, Minus, PencilRuler, Plus, Repeat, Save, Trash2, Undo2 } from "lucide-react";
import { EXERCISES } from "../../program/exercises";
import { defaultRx, smartAlts } from "../../program/bank";
import { dayMinutes, nextDayKey, rebuild, registerCustom, validateUserProgram, type CustomEx, type DItem, type Design, type UserProgram } from "../../program/templates";
import { send } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { useMe } from "../lib/me";
import { refreshProgram } from "../lib/program";
import { cx } from "../lib/util";
import { go } from "../nav";
import { Badge, Btn, Card, Chips, Empty, Label, NumInput, PageHead, SectionHead, Sheet } from "../components/ui";
import { ExercisePicker } from "../components/program/ExercisePicker";
import { VolumeBars, restLabel, rirLabel, schemeLabel } from "../components/program/PlanBits";

interface Loaded { id: string; name: string; active: boolean; version: string; program: UserProgram }
type Draft = { name: string; design: Design; custom: CustomEx[] };

const DRAFT_KEY = (id: string) => `il_prog_draft_${id}`;
const REST = [0, 45, 60, 75, 90, 120, 150, 180, 240];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Edit one of your plans (#/program/<id>): days, exercises, sets, reps, RIR, rest, notes. One normal week is edited; the 4-week wave is automatic. */
export default function ProgramEditor({ id }: { id: string }) {
  const { data, error, setData } = useLoad<Loaded>(`/programs/${id}`);
  const me = useMe();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [base, setBase] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);
  const [item, setItem] = useState<{ d: number; i: number } | null>(null);
  const [picker, setPicker] = useState<{ d: number; i?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverErr, setServerErr] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [restore, setRestore] = useState<Draft | null>(null);
  const [showVol, setShowVol] = useState(false);

  // first load → editable copy (+ offer an unsaved draft from last time)
  useEffect(() => {
    if (!data?.program || draft) return;
    registerCustom(data.program.custom);
    const d: Draft = { name: data.program.name, design: clone(data.program.design), custom: clone(data.program.custom ?? []) };
    setDraft(d);
    setBase(JSON.stringify(d));
    setOpen(d.design.days[0]?.key ?? null);
    try {
      const s = localStorage.getItem(DRAFT_KEY(id));
      if (s && s !== JSON.stringify(d)) { const r = JSON.parse(s) as Draft; registerCustom(r.custom); setRestore(r); }
    } catch { /* bad JSON */ }
  }, [data, draft, id]);

  const dirty = !!draft && JSON.stringify(draft) !== base;
  // unsaved-changes guard: keep a local draft, warn on reload/close and on in-app links
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!draft) return;
    try { if (dirty) localStorage.setItem(DRAFT_KEY(id), JSON.stringify(draft)); else localStorage.removeItem(DRAFT_KEY(id)); } catch { /* storage */ }
  }, [draft, dirty, id]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; } };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href^='#']");
      if (a && dirtyRef.current && !confirm("You have unsaved changes. Leave without saving? (A draft is kept on this phone.)")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, []);

  const errs = useMemo(() => (draft ? validateUserProgram(rebuild({ id, version: data?.version }, { name: draft.name, design: draft.design, custom: draft.custom })) : []), [draft, id, data?.version]);

  if (error && !data) return <><Back /><Empty icon={CircleAlert}>{error === "Not found" ? "This plan doesn't exist or isn't yours." : error}</Empty></>;
  if (!draft || !data) return <p className="py-20 text-center text-mute">Loading…</p>;

  const set = (fn: (d: Draft) => void) => { const n = clone(draft); fn(n); setDraft(n); setSaved(null); setServerErr([]); };
  const days = draft.design.days;
  const moveDay = (k: number, dir: -1 | 1) => set((d) => { const j = k + dir; if (j < 0 || j >= d.design.days.length) return; [d.design.days[k], d.design.days[j]] = [d.design.days[j], d.design.days[k]]; });
  const toItem = (key: string): DItem => {
    const r = defaultRx(key);
    const rir = Array.isArray(r.rir) ? r.rir[1] : r.rir;
    const it: DItem = { ex: key, sets: r.sets, rest: r.rest };
    if (r.reps !== undefined) it.reps = r.reps;
    if (r.seconds != null) { it.seconds = r.seconds; it.rir = null; }
    if (r.meters != null) { it.meters = r.meters; it.rir = null; }
    if (rir != null && r.seconds == null && r.meters == null) it.rir = rir;
    return it;
  };
  async function save() {
    if (!draft || errs.length) return;
    setSaving(true); setServerErr([]);
    const used = new Set(draft.design.days.flatMap((d) => d.items.map((x) => x.ex)));
    const body = { ...draft, custom: draft.custom.filter((c) => used.has(c.key)) };
    try {
      const r = await send<{ version: string }>("PUT", `/programs/${id}`, body);
      setBase(JSON.stringify(draft));
      try { localStorage.removeItem(DRAFT_KEY(id)); } catch { /* storage */ }
      setSaved(r.version);
      setData({ ...data!, name: draft.name, version: r.version, program: { ...data!.program, name: draft.name, version: r.version, design: draft.design, custom: body.custom } });
      if (data!.active) void refreshProgram();
    } catch (e) {
      const x = e as Error;
      setServerErr([e instanceof TypeError ? "You're offline. Your draft is kept on this phone — save when you're back online." : x.message]);
    } finally { setSaving(false); }
  }
  const cur = item ? days[item.d]?.items[item.i] : null;

  return (
    <div className="pb-28">
      <Back dirty={dirty} />
      <PageHead icon={PencilRuler} title="Edit plan" sub="One normal week. Week 1 ramps in, Week 3 adds a set, Week 4 deloads — automatically."
        right={data.active ? <Badge tone="acc">Active</Badge> : undefined} />

      {restore && (
        <Card className="mb-3 border-warn/40">
          <p className="text-sm">You have unsaved changes from last time.</p>
          <div className="mt-3 flex gap-2">
            <Btn kind="ghost" className="flex-1" onClick={() => { setRestore(null); try { localStorage.removeItem(DRAFT_KEY(id)); } catch { /* */ } }}>Discard</Btn>
            <Btn kind="soft" icon={Undo2} className="flex-1" onClick={() => { setDraft(restore); setRestore(null); }}>Restore</Btn>
          </div>
        </Card>
      )}

      <Label>Plan name</Label>
      <input value={draft.name} onChange={(e) => set((d) => { d.name = e.target.value.slice(0, 60); })} aria-invalid={!draft.name.trim()}
        className="min-h-12 w-full rounded-xl bg-card2 px-3 text-lg font-semibold outline-none focus:ring-2 focus:ring-acc" />

      <SectionHead right={<button type="button" onClick={() => setShowVol(true)} className="-my-3 inline-flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-info"><BarChart3 size={14} aria-hidden />Weekly volume</button>}>
        {days.length} training days
      </SectionHead>
      <ol className="space-y-3">
        {days.map((day, k) => {
          const isOpen = open === day.key;
          const dayErrs = errs.filter((e) => e.startsWith(`Day ${k + 1}`));
          return (
            <li key={day.key} className={cx("rounded-2xl border bg-card", dayErrs.length ? "border-bad/50" : "border-line/60")}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : day.key)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card2 text-sm font-bold num">{k + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{day.name || "Untitled day"}</span>
                  <span className="block truncate text-xs text-mute num">{day.items.length} exercises · {day.items.reduce((a, x) => a + x.sets, 0)} sets · ~{dayMinutes(day)} min</span>
                </span>
                <ChevronDown size={18} className={cx("shrink-0 text-faint motion-safe:transition-transform", isOpen && "rotate-180")} aria-hidden />
              </button>
              {isOpen && (
                <div className="border-t border-line/60 px-4 pb-4 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block"><span className="mb-1 block text-xs text-mute">Name</span>
                      <input value={day.name} onChange={(e) => set((d) => { d.design.days[k].name = e.target.value.slice(0, 40); })} className="min-h-11 w-full rounded-xl bg-card2 px-3 outline-none focus:ring-2 focus:ring-acc" /></label>
                    <label className="block"><span className="mb-1 block text-xs text-mute">Focus</span>
                      <input value={day.focus} onChange={(e) => set((d) => { d.design.days[k].focus = e.target.value.slice(0, 80); })} placeholder="e.g. Chest + back" className="min-h-11 w-full rounded-xl bg-card2 px-3 outline-none placeholder:text-faint focus:ring-2 focus:ring-acc" /></label>
                  </div>
                  {dayErrs.map((e) => <p key={e} role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-bad"><CircleAlert size={14} className="mt-px shrink-0" aria-hidden />{e.replace(/^Day \d+( \([^)]*\))?:? ?·? ?/, "")}</p>)}
                  <ul className="mt-3 divide-y divide-line/50">
                    {day.items.map((it, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => setItem({ d: k, i })} className="flex min-h-12 w-full items-center gap-2 py-2 text-left hover:bg-card2/50">
                          {it.tag && <span className="w-6 shrink-0 text-[11px] font-semibold text-info">{it.tag}</span>}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{EXERCISES[it.ex]?.name ?? <span className="text-bad">Unknown: {it.ex}</span>}</span>
                            <span className="block truncate text-xs text-mute num">{[rirLabel(it), `rest ${restLabel(it.rest)}`, it.heavy && "big lift", it.fin && "finisher"].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="shrink-0 font-semibold num">{schemeLabel(it)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Btn kind="soft" icon={Plus} className="mt-2 w-full" onClick={() => setPicker({ d: k })}>Add exercise</Btn>
                  <div className="mt-3 flex gap-2">
                    <Btn kind="ghost" icon={ArrowUp} label="Move day up" disabled={k === 0} onClick={() => moveDay(k, -1)} />
                    <Btn kind="ghost" icon={ArrowDown} label="Move day down" disabled={k === days.length - 1} onClick={() => moveDay(k, 1)} />
                    <Btn kind="danger" icon={Trash2} className="ml-auto" disabled={days.length <= 1}
                      onClick={() => (!day.items.length || confirm(`Remove ${day.name || "this day"} and its ${day.items.length} exercises?`)) && set((d) => { d.design.days.splice(k, 1); })}>Remove day</Btn>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {days.length < 7 && (
        <Btn kind="ghost" icon={Plus} className="mt-3 w-full" onClick={() => { const key = nextDayKey(draft.design); set((d) => { d.design.days.push({ key, name: `Day ${d.design.days.length + 1}`, focus: "", items: [] }); }); setOpen(key); }}>Add training day</Btn>
      )}

      <SectionHead>Weekly volume</SectionHead>
      <Card><VolumeBars design={draft.design} compact /><button type="button" onClick={() => setShowVol(true)} className="mt-2 min-h-11 text-xs font-medium text-info">What do the colours mean?</button></Card>

      {/* sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 pb-3 pt-3 backdrop-blur safe-b md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto max-w-lg">
          {(errs.length > 0 || serverErr.length > 0) && (
            <p role="alert" className="mb-2 flex items-start gap-1.5 text-xs text-bad"><CircleAlert size={14} className="mt-px shrink-0" aria-hidden />{serverErr[0] ?? errs[0]}{errs.length > 1 ? ` (+${errs.length - 1} more)` : ""}</p>
          )}
          {saved && !dirty && <p role="status" className="mb-2 text-xs text-acc">Saved · v{saved}{data.active ? " · your next workout uses it" : ""}</p>}
          <Btn kind="primary" icon={Save} className="w-full" disabled={!dirty || saving || errs.length > 0} onClick={save}>{saving ? "Saving…" : dirty ? "Save changes" : "No changes"}</Btn>
        </div>
      </div>

      <ItemSheet it={cur} n={item ? days[item.d].items.length : 0} idx={item?.i ?? 0}
        onClose={() => setItem(null)}
        onChange={(it) => item && set((d) => { d.design.days[item.d].items[item.i] = it; })}
        onMove={(dir) => item && set((d) => { const a = d.design.days[item.d].items; const j = item.i + dir; if (j < 0 || j >= a.length) return; [a[item.i], a[j]] = [a[j], a[item.i]]; setItem({ d: item.d, i: j }); })}
        onRemove={() => { if (!item) return; set((d) => { d.design.days[item.d].items.splice(item.i, 1); }); setItem(null); }}
        onSwap={() => item && setPicker({ d: item.d, i: item.i })} />

      <ExercisePicker open={!!picker} uid={me?.id ?? null} title={picker?.i != null ? "Swap exercise" : `Add to ${picker ? days[picker.d]?.name : ""}`}
        suggest={picker?.i != null ? smartAlts(days[picker.d].items[picker.i].ex) : []}
        onClose={() => setPicker(null)}
        onCreate={(c) => { registerCustom([c]); set((d) => { d.custom = [...d.custom.filter((x) => x.key !== c.key), c]; }); }}
        onPick={(key) => {
          const p = picker!;
          setDraft((prev) => {
            if (!prev) return prev;
            const n = clone(prev);
            const items = n.design.days[p.d].items;
            if (p.i != null) { const old = items[p.i]; const fresh = toItem(key); items[p.i] = { ...fresh, sets: old.sets, tag: old.tag, fin: old.fin }; }
            else items.push(toItem(key));
            return n;
          });
          setSaved(null);
          setPicker(null);
        }} />

      <Sheet open={showVol} onClose={() => setShowVol(false)} title="Hard sets per week" icon={BarChart3}>
        <VolumeBars design={draft.design} />
        <ul className="mt-4 space-y-1.5 text-xs text-mute">
          <li><b className="text-bad">Too low</b> — under ~6 sets: little growth for that muscle.</li>
          <li><b className="text-warn">Minimum</b> — 6-10: keeps or slowly builds; fine for 2-3 day plans.</li>
          <li><b className="text-acc">Good</b> — 10-20: where most people grow best.</li>
          <li><b className="text-info">High</b> — over 20: only if you recover well; more isn't always better.</li>
        </ul>
        <p className="mt-3 text-[11px] text-faint">Based on Schoenfeld 2017 and Pelland 2024 (dose-response of weekly sets). Keep any one muscle to ~10 hard sets per session.</p>
      </Sheet>
    </div>
  );
}

function Back({ dirty }: { dirty?: boolean }) {
  return (
    <button type="button" onClick={() => (!dirty || confirm("You have unsaved changes. Leave without saving? (A draft is kept on this phone.)")) && go("/programs")}
      className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-mute hover:text-ink">
      <ArrowLeft size={18} aria-hidden />Programs
    </button>
  );
}

function ItemSheet({ it, n, idx, onClose, onChange, onMove, onRemove, onSwap }: {
  it: DItem | null; n: number; idx: number; onClose: () => void; onChange: (it: DItem) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void; onSwap: () => void;
}) {
  const e = it ? EXERCISES[it.ex] : null;
  const metric = e?.metric;
  const timed = metric === "time" || it?.seconds != null;
  const dist = metric === "distance" || it?.meters != null;
  const lo = it ? (Array.isArray(it.reps) ? it.reps[0] : typeof it.reps === "number" ? it.reps : null) : null;
  const hi = it ? (Array.isArray(it.reps) ? it.reps[1] : typeof it.reps === "number" ? it.reps : null) : null;
  const [loS, setLo] = useState(""), [hiS, setHi] = useState("");
  useEffect(() => { setLo(lo != null ? String(lo) : ""); setHi(hi != null ? String(hi) : ""); }, [it?.ex, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!it) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const up = (p: Partial<DItem>) => onChange({ ...it, ...p });
  const commitReps = (a: string, b: string) => {
    const x = Math.round(Number(a)), y = Math.round(Number(b || a));
    if (!x) return;
    up({ reps: y && y !== x ? [Math.min(x, y), Math.max(x, y)] : x });
  };
  return (
    <Sheet open={!!it} onClose={onClose} title={e?.name ?? it.ex} icon={PencilRuler}>
      <p className="-mt-1 text-xs text-mute">{e?.muscles}</p>
      <Label>Sets (normal week)</Label>
      <div className="flex items-center gap-3">
        <Btn kind="soft" icon={Minus} label="One set fewer" disabled={it.sets <= 1} onClick={() => up({ sets: it.sets - 1 })} />
        <span className="w-10 text-center text-2xl font-bold num" aria-live="polite">{it.sets}</span>
        <Btn kind="soft" icon={Plus} label="One set more" disabled={it.sets >= 10} onClick={() => up({ sets: it.sets + 1 })} />
        <span className="text-[11px] leading-tight text-faint">W1 {it.sets >= 3 ? it.sets - 1 : it.sets} · W3 {it.sets + (!it.heavy && !it.fin && it.sets <= 4 ? 1 : 0)} · W4 {Math.max(1, Math.ceil(it.sets / 2))}</span>
      </div>
      {timed ? (
        <><Label>Seconds per set</Label><NumInput value={String(it.seconds ?? 30)} onChange={(v) => up({ seconds: Math.max(5, Math.min(600, Math.round(Number(v) || 0))) })} className="w-28" /></>
      ) : dist ? (
        <><Label>Meters per set</Label><NumInput value={String(it.meters ?? 30)} onChange={(v) => up({ meters: Math.max(5, Math.min(500, Math.round(Number(v) || 0))) })} className="w-28" /></>
      ) : (
        <>
          <Label>Rep range</Label>
          {it.reps === null ? (
            <div className="flex items-center gap-3"><Badge tone="info">As many as possible</Badge><Btn kind="ghost" onClick={() => up({ reps: [8, 12] })}>Use a range</Btn></div>
          ) : (
            <div className="flex items-center gap-2">
              <NumInput value={loS} onChange={(v) => { setLo(v); commitReps(v, hiS); }} className="w-20" placeholder="8" />
              <span className="text-mute">to</span>
              <NumInput value={hiS} onChange={(v) => { setHi(v); commitReps(loS, v); }} className="w-20" placeholder="12" />
              <Btn kind="ghost" className="ml-auto" onClick={() => up({ reps: null })}>Max reps</Btn>
            </div>
          )}
          <p className="mt-1 text-[11px] text-faint">Reach the top on every set at the target RIR → the app adds weight next time.</p>
        </>
      )}
      {!it.fin && (
        <>
          <Label>Reps in reserve (how many left in the tank)</Label>
          <Chips small clearable={false} options={[{ id: -1, label: "None" }, ...[0, 1, 2, 3, 4].map((r) => ({ id: r, label: String(r) }))]} value={it.rir === null ? -1 : it.rir ?? (it.heavy ? 2 : 1)} onChange={(v) => v != null && up({ rir: v === -1 ? null : v })} />
        </>
      )}
      <Label>Rest after each set</Label>
      <Chips small clearable={false} options={REST.map((s) => ({ id: s, label: s === 0 ? "Superset" : restLabel(s) }))} value={REST.includes(it.rest) ? it.rest : null} onChange={(v) => v != null && up({ rest: v })} />
      <Label>Note</Label>
      <input value={it.tech ?? ""} onChange={(ev) => up({ tech: ev.target.value.slice(0, 160) || undefined })} placeholder="e.g. 2 s down, pause at the stretch" className="min-h-11 w-full rounded-xl bg-card2 px-3 text-sm outline-none placeholder:text-faint focus:ring-2 focus:ring-acc" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Toggle on={!!it.heavy} onClick={() => up({ heavy: !it.heavy || undefined })} title="Big lift" sub="Never to failure" />
        <Toggle on={!!it.fin} onClick={() => up({ fin: !it.fin || undefined })} title="Finisher" sub="Shown at the end" />
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2">
        <Btn kind="soft" stack icon={Repeat} onClick={onSwap}>Swap</Btn>
        <Btn kind="soft" stack icon={ArrowUp} disabled={idx === 0} onClick={() => onMove(-1)}>Up</Btn>
        <Btn kind="soft" stack icon={ArrowDown} disabled={idx >= n - 1} onClick={() => onMove(1)}>Down</Btn>
        <Btn kind="danger" stack icon={Trash2} onClick={onRemove}>Remove</Btn>
      </div>
      <Btn kind="primary" className="mt-4 w-full" onClick={onClose}>Done</Btn>
    </Sheet>
  );
}

function Toggle({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className={cx("flex min-h-14 items-center gap-2 rounded-xl border px-3 text-left", on ? "border-acc/60 bg-acc/10" : "border-line hover:bg-card2")}>
      <span className={cx("h-5 w-9 shrink-0 rounded-full p-0.5 motion-safe:transition-colors", on ? "bg-acc" : "bg-card3")} aria-hidden>
        <span className={cx("block h-4 w-4 rounded-full bg-ink motion-safe:transition-transform", on && "translate-x-4 bg-acc-ink")} />
      </span>
      <span className="min-w-0"><span className="block text-sm font-medium">{title}</span><span className="block text-[11px] text-mute">{sub}</span></span>
    </button>
  );
}

