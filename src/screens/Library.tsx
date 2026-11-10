import { useMemo, useState } from "react";
import { ChevronRight, Library as LibIcon, Search, SlidersHorizontal, X } from "lucide-react";
import type { PlanItem } from "../../shared/api";
import { CURRENT } from "../../program";
import { EXERCISES } from "../../program/exercises";
import { EX_GROUP, GROUPS } from "../../program/groups";
import { EQUIP_LABEL, UNAVAILABLE, defaultRx, equipOf, kindOf, type Equip, type Kind } from "../../program/bank";
import { targetLabel, toItem } from "../../shared/plan";
import { track } from "../lib/api";
import { cx } from "../lib/util";
import { Btn, PageHead, Sheet, Thumb } from "../components/ui";
import { ExerciseSheet } from "../components/ExerciseSheet";

const inPlan = new Set(CURRENT.weeks.flatMap((w) => [...w.days, ...(w.extras ?? [])].flatMap((d) => d.items.map((x) => x.ex))));
const ALL = Object.values(EXERCISES);
type Ex = (typeof ALL)[number];
const KIND_LABEL: Record<Kind, string> = { heavy: "Heavy compound", compound: "Compound", isolation: "Isolation", small: "Small muscle", core: "Core", hold: "Hold / carry" };
type Show = "all" | "plan" | "bank" | "gym";
const SHOW: { id: Show; label: string }[] = [{ id: "all", label: "All" }, { id: "plan", label: "In my plan" }, { id: "bank", label: "Not in plan" }, { id: "gym", label: "Doable at my gym" }];
interface F { groups: string[]; equip: Equip[]; kinds: Kind[]; show: Show }
const EMPTY: F = { groups: [], equip: [], kinds: [], show: "all" };

/** Filtering rules in one place: multi-select within a section (OR), sections combine with AND. */
function matches(e: Ex, f: F, q: string, skip?: keyof F) {
  const t = q.trim().toLowerCase();
  if (t && !e.name.toLowerCase().includes(t) && !e.muscles.toLowerCase().includes(t)) return false;
  if (skip !== "groups" && f.groups.length && !f.groups.includes(EX_GROUP[e.key] ?? "")) return false;
  if (skip !== "equip" && f.equip.length && !f.equip.includes(equipOf(e.key))) return false;
  if (skip !== "kinds" && f.kinds.length && !f.kinds.includes(kindOf(e.key))) return false;
  if (skip !== "show") {
    if (f.show === "plan" && !inPlan.has(e.key)) return false;
    if (f.show === "bank" && inPlan.has(e.key)) return false;
    if (f.show === "gym" && UNAVAILABLE.has(e.key)) return false;
  }
  return true;
}
const toggle = <T,>(a: T[], x: T) => (a.includes(x) ? a.filter((y) => y !== x) : [...a, x]);

/** Labelled filter section: title + chips with live counts; options with 0 results are disabled. */
function Section<T extends string>({ title, hint, options, value, onToggle }: { title: string; hint?: string; options: { id: T; label: string; n: number }[]; value: T[]; onToggle: (id: T) => void }) {
  return (
    <section className="border-t border-line/60 py-3 first:border-0 first:pt-0">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-[11px] text-faint">{value.length ? `${value.length} selected` : hint ?? "any"}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button key={o.id} disabled={!on && o.n === 0} onClick={() => onToggle(o.id)}
              className={cx("min-h-10 rounded-full border px-3 text-sm disabled:opacity-35", on ? "border-acc bg-acc/15 font-semibold text-acc" : "border-line text-ink")}>
              {o.label} <span className={cx("num text-xs", on ? "text-acc/80" : "text-faint")}>{o.n}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Every exercise (in the plan or not): search, filter, open for video, cues, next weight and alternatives. */
export default function Library() {
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>(EMPTY);
  const [draft, setDraft] = useState<F | null>(null); // filters being edited in the sheet
  const [open, setOpen] = useState<PlanItem | null>(null);

  const list = useMemo(() => ALL.filter((e) => matches(e, f, q)).sort((a, b) => GROUPS.indexOf(EX_GROUP[a.key] as never) - GROUPS.indexOf(EX_GROUP[b.key] as never) || a.name.localeCompare(b.name)), [f, q]);
  const quick = useMemo(() => GROUPS.map((g) => ({ id: g, label: g, n: ALL.filter((e) => EX_GROUP[e.key] === g && matches(e, f, q, "groups")).length })).filter((x) => x.n > 0), [f, q]);
  const count = (d: F) => ALL.filter((e) => matches(e, d, q)).length;
  const nActive = f.groups.length + f.equip.length + f.kinds.length + (f.show !== "all" ? 1 : 0);
  const applied: { label: string; clear: () => void }[] = [
    ...f.groups.map((g) => ({ label: g, clear: () => setF({ ...f, groups: f.groups.filter((x) => x !== g) }) })),
    ...f.equip.map((x) => ({ label: EQUIP_LABEL[x], clear: () => setF({ ...f, equip: f.equip.filter((y) => y !== x) }) })),
    ...f.kinds.map((x) => ({ label: KIND_LABEL[x], clear: () => setF({ ...f, kinds: f.kinds.filter((y) => y !== x) }) })),
    ...(f.show !== "all" ? [{ label: SHOW.find((s) => s.id === f.show)!.label, clear: () => setF({ ...f, show: "all" }) }] : []),
  ];

  return (
    <div>
      <PageHead icon={LibIcon} title="Exercise library" sub={`${ALL.length} exercises · video, cues, alternatives, start weight`} />

      {/* pinned: search + Filters, then the main filter (muscle) as one swipe row, then what's applied */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-line/60 bg-bg/95 px-4 pb-2 pt-1 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <div className="flex gap-2">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-card px-3">
            <Search size={16} className="shrink-0 text-mute" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercise or muscle" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
            {q && <button onClick={() => setQ("")} aria-label="Clear search" className="text-mute"><X size={16} /></button>}
          </label>
          <button onClick={() => setDraft(f)} className={cx("relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm", nActive ? "bg-acc/15 font-semibold text-acc" : "bg-card text-mute")}>
            <SlidersHorizontal size={16} />Filters{nActive ? <span className="num">({nActive})</span> : null}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-faint">Muscle</span>
          <div className="-mr-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-4 [scrollbar-width:none] md:mr-0 md:flex-wrap md:pr-0">
            {quick.map((x) => {
              const on = f.groups.includes(x.id);
              return (
                <button key={x.id} onClick={() => setF({ ...f, groups: toggle(f.groups, x.id) })}
                  className={cx("min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-xs", on ? "bg-acc font-semibold text-acc-ink" : "bg-card2 text-mute")}>
                  {x.label} <span className={cx("num", on ? "opacity-70" : "text-faint")}>{x.n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {applied.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {applied.map((a) => (
              <button key={a.label} onClick={a.clear} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-card3 pl-2.5 pr-1.5 text-[11px]" aria-label={`Remove ${a.label}`}>
                {a.label}<X size={12} className="text-mute" />
              </button>
            ))}
            <button onClick={() => setF(EMPTY)} className="min-h-8 px-1.5 text-[11px] text-info">Clear all</button>
          </div>
        )}
        <div className="mt-1.5 text-[11px] text-faint num">{list.length} of {ALL.length} exercises</div>
      </div>

      {/* results grouped by muscle */}
      <div className="md:grid md:grid-cols-2 md:gap-x-3">
        {list.map((e, i) => {
          const g = EX_GROUP[e.key] ?? "Other";
          const head = i === 0 || (EX_GROUP[list[i - 1].key] ?? "Other") !== g;
          const rx = defaultRx(e.key);
          return (
            <div key={e.key} className="contents">
              {head && <h3 className="mb-1 mt-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-mute md:col-span-2">{g} <span className="font-normal text-faint num">· {list.filter((x) => (EX_GROUP[x.key] ?? "Other") === g).length}</span></h3>}
              <button onClick={() => { setOpen(toItem(e.key, rx)); track("library_open", { ex: e.key }); }} className="mb-1.5 flex w-full items-center gap-3 rounded-xl bg-card p-2 text-left active:bg-card2">
                <Thumb yt={Array.isArray(e.yt) ? e.yt[0] : e.yt} className="h-10 w-14" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{e.name}</span>
                  <span className="block truncate text-[11px] text-mute">
                    {EQUIP_LABEL[equipOf(e.key)]} · {targetLabel(rx)}
                    {inPlan.has(e.key) && <span className="text-acc"> · in plan</span>}
                    {UNAVAILABLE.has(e.key) && <span className="text-bad"> · not at your gym</span>}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-faint" />
              </button>
            </div>
          );
        })}
      </div>
      {!list.length && <p className="py-10 text-center text-sm text-mute">Nothing matches — remove a filter.</p>}
      <p className="mt-3 text-center text-[11px] text-faint">To do one today: in a workout tap <b>+ Add exercise</b>.</p>

      {/* filter sheet: labelled sections, live counts, one apply button */}
      {draft && (
        <Sheet open onClose={() => setDraft(null)} title="Filters" icon={SlidersHorizontal}>
          <Section title="Muscle" options={GROUPS.map((g) => ({ id: g as string, label: g, n: ALL.filter((e) => EX_GROUP[e.key] === g && matches(e, draft, q, "groups")).length }))} value={draft.groups} onToggle={(id) => setDraft({ ...draft, groups: toggle(draft.groups, id) })} />
          <Section title="Equipment" options={(Object.keys(EQUIP_LABEL) as Equip[]).map((x) => ({ id: x, label: EQUIP_LABEL[x], n: ALL.filter((e) => equipOf(e.key) === x && matches(e, draft, q, "equip")).length }))} value={draft.equip} onToggle={(id) => setDraft({ ...draft, equip: toggle(draft.equip, id) })} />
          <Section title="Type" hint="heavy → small" options={(Object.keys(KIND_LABEL) as Kind[]).map((x) => ({ id: x, label: KIND_LABEL[x], n: ALL.filter((e) => kindOf(e.key) === x && matches(e, draft, q, "kinds")).length }))} value={draft.kinds} onToggle={(id) => setDraft({ ...draft, kinds: toggle(draft.kinds, id) })} />
          <section className="border-t border-line/60 py-3">
            <h3 className="mb-2 text-sm font-semibold">Show</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {SHOW.map((s) => (
                <button key={s.id} onClick={() => setDraft({ ...draft, show: s.id })} className={cx("min-h-10 rounded-xl border text-sm", draft.show === s.id ? "border-acc bg-acc/15 font-semibold text-acc" : "border-line")}>{s.label}</button>
              ))}
            </div>
          </section>
          <div className="sticky bottom-0 -mx-1 grid grid-cols-[auto_1fr] gap-2 bg-card px-1 pb-1 pt-2">
            <Btn kind="soft" onClick={() => setDraft(EMPTY)}>Reset</Btn>
            <Btn kind="primary" onClick={() => { setF(draft); setDraft(null); track("library_filter", { ...draft }); }}>Show {count(draft)} exercises</Btn>
          </div>
        </Sheet>
      )}
      {open && <ExerciseSheet item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
