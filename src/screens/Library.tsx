import { useMemo, useState } from "react";
import { Library as LibIcon, Search, X } from "lucide-react";
import type { AppState } from "../../shared/api";
import { CURRENT } from "../../program";
import { EXERCISES } from "../../program/exercises";
import { EX_GROUP, GROUPS } from "../../program/groups";
import { EQUIP_LABEL, UNAVAILABLE, defaultRx, equipOf, kindOf, type Equip } from "../../program/bank";
import { targetLabel, toItem } from "../../shared/plan";
import type { PlanItem } from "../../shared/api";
import { useLoad } from "../lib/useLoad";
import { Chips, PageHead, Thumb } from "../components/ui";
import { ExerciseSheet } from "../components/ExerciseSheet";

const inPlan = new Set(CURRENT.weeks.flatMap((w) => [...w.days, ...(w.extras ?? [])].flatMap((d) => d.items.map((x) => x.ex))));

/** Every exercise (in the plan or not): filter by muscle / equipment, open for video, cues, next weight, alternatives. */
export default function Library() {
  const { data: s } = useLoad<AppState>("/state");
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState<string | null>(null);
  const [eq, setEq] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  const [open, setOpen] = useState<PlanItem | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return Object.values(EXERCISES)
      .filter((e) => !t || e.name.toLowerCase().includes(t) || e.muscles.toLowerCase().includes(t))
      .filter((e) => (!grp || EX_GROUP[e.key] === grp) && (!eq || equipOf(e.key) === eq) && (!only || (only === "plan" ? inPlan.has(e.key) : !inPlan.has(e.key))))
      .sort((a, b) => (EX_GROUP[a.key] ?? "").localeCompare(EX_GROUP[b.key] ?? "") || a.name.localeCompare(b.name));
  }, [q, grp, eq, only]);

  return (
    <div>
      <PageHead icon={LibIcon} title="Exercise library" sub={`${Object.keys(EXERCISES).length} exercises with videos, cues, alternatives and a starting weight — in the plan or not.`} />
      <label className="mb-2 flex min-h-12 items-center gap-2 rounded-xl bg-card px-3">
        <Search size={16} className="text-mute" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an exercise or muscle" className="min-w-0 flex-1 bg-transparent outline-none" />
        {q && <button onClick={() => setQ("")} aria-label="Clear" className="text-mute"><X size={16} /></button>}
      </label>
      <div className="-mx-1 mb-1.5 overflow-x-auto px-1"><Chips small options={GROUPS.map((g) => ({ id: g, label: g }))} value={grp} onChange={setGrp} /></div>
      <div className="-mx-1 mb-1.5 overflow-x-auto px-1"><Chips small options={(Object.keys(EQUIP_LABEL) as Equip[]).map((x) => ({ id: x, label: EQUIP_LABEL[x] }))} value={eq} onChange={setEq} /></div>
      <div className="mb-2"><Chips small options={[{ id: "plan", label: "In my plan" }, { id: "bank", label: "Not in plan" }]} value={only} onChange={setOnly} /></div>
      <p className="mb-2 text-[11px] text-faint">{list.length} shown · to do one today: in a workout tap <b>+ Add exercise</b>{s?.active ? "" : " (start any workout first)"}</p>
      <div className="grid gap-1.5 md:grid-cols-2">
        {list.map((e) => {
          const rx = defaultRx(e.key);
          return (
            <button key={e.key} onClick={() => setOpen(toItem(e.key, rx))} className="flex items-center gap-3 rounded-xl bg-card p-2.5 text-left hover:bg-card2">
              <Thumb yt={Array.isArray(e.yt) ? e.yt[0] : e.yt} className="h-11 w-16" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{e.name}</span>
                <span className="block truncate text-[11px] text-mute">{EX_GROUP[e.key] ?? "—"} · {EQUIP_LABEL[equipOf(e.key)]} · {kindOf(e.key)} · {targetLabel(rx)}</span>
              </span>
              {inPlan.has(e.key) && <span className="shrink-0 rounded-full bg-acc/15 px-2 py-0.5 text-[10px] text-acc">plan</span>}
              {UNAVAILABLE.has(e.key) && <span className="shrink-0 rounded-full bg-bad/15 px-2 py-0.5 text-[10px] text-bad">not at your gym</span>}
            </button>
          );
        })}
      </div>
      {open && <ExerciseSheet item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
