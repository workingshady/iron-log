import { useMemo, useState } from "react";
import { Plus, Search, Sparkles } from "lucide-react";
import { EXERCISES } from "../../../program/exercises";
import { EX_GROUP, GROUPS, type Group } from "../../../program/groups";
import { MUSCLE_LABEL, type Muscle } from "../../../program/muscles";
import { EQUIP_LABEL, equipOf, type Equip } from "../../../program/bank";
import type { CustomEx } from "../../../program/templates";
import type { Metric } from "../../../program";
import { Btn, Chips, Label, Sheet } from "../ui";
import { cx } from "../../lib/util";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "ex";
/** Same rule as the server (worker/routes/programs.ts cleanCustom): "c-<user>-<name>-<rand>". */
export const customKey = (uid: string, name: string) => `c-${slug(uid).slice(0, 20)}-${slug(name)}-${crypto.randomUUID().slice(0, 4)}`;

const METRICS: { id: Metric; label: string }[] = [{ id: "weight_reps", label: "Weight × reps" }, { id: "reps", label: "Bodyweight reps" }, { id: "time", label: "Hold (seconds)" }];
const MUSCLE_PICK: Muscle[] = ["chest", "upper-back", "front-deltoids", "back-deltoids", "trapezius", "biceps", "triceps", "forearm", "abs", "obliques", "quadriceps", "hamstring", "gluteal", "calves", "adductor", "lower-back", "neck"];

/** Search the exercise bank (+ filters by muscle group and equipment) or make your own exercise. */
export function ExercisePicker({ open, onClose, onPick, title = "Add exercise", suggest = [], uid, onCreate }: {
  open: boolean; onClose: () => void; onPick: (key: string) => void; title?: string; suggest?: string[];
  uid: string | null; onCreate: (c: CustomEx) => void;
}) {
  const [q, setQ] = useState("");
  const [g, setG] = useState<Group | null>(null);
  const [eq, setEq] = useState<Equip | null>(null);
  const [make, setMake] = useState(false);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return Object.values(EXERCISES)
      .filter((e) => (!t || e.name.toLowerCase().includes(t) || e.muscles.toLowerCase().includes(t)) && (!g || EX_GROUP[e.key] === g) && (!eq || equipOf(e.key) === eq))
      .sort((a, b) => GROUPS.indexOf(EX_GROUP[a.key] as Group) - GROUPS.indexOf(EX_GROUP[b.key] as Group) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, g, eq, open]);
  const sug = suggest.filter((k) => EXERCISES[k]);

  return (
    <Sheet open={open} onClose={onClose} title={make ? "New exercise" : title} icon={make ? Sparkles : Search}>
      {make ? (
        <CustomForm uid={uid} initialName={q} onCancel={() => setMake(false)} onSave={(c) => { onCreate(c); setMake(false); onPick(c.key); }} />
      ) : (
        <>
          <label className="flex min-h-12 items-center gap-2 rounded-xl bg-card2 px-3 focus-within:ring-2 focus-within:ring-acc">
            <Search size={18} className="shrink-0 text-mute" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises or muscles" aria-label="Search exercises" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" />
          </label>
          <Label>Muscle</Label>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <Chips small options={GROUPS.map((x) => ({ id: x, label: x }))} value={g} onChange={setG} />
          </div>
          <Label>Equipment</Label>
          <Chips small options={(Object.keys(EQUIP_LABEL) as Equip[]).filter((x) => x !== "other").map((x) => ({ id: x, label: EQUIP_LABEL[x] }))} value={eq} onChange={setEq} />
          {!!sug.length && !q && !g && !eq && (
            <>
              <Label>Best swaps</Label>
              <ul className="space-y-1">{sug.map((k) => <Row key={k} k={k} onPick={onPick} hl />)}</ul>
            </>
          )}
          <Label>{list.length} exercises</Label>
          <ul className="space-y-1">
            {list.slice(0, 80).map((e) => <Row key={e.key} k={e.key} onPick={onPick} />)}
          </ul>
          {list.length > 80 && <p className="mt-2 text-center text-xs text-mute">Search or filter to see more.</p>}
          <Btn kind="ghost" icon={Plus} className="mt-4 w-full" onClick={() => setMake(true)}>Not here? Make your own</Btn>
        </>
      )}
    </Sheet>
  );
}

function Row({ k, onPick, hl }: { k: string; onPick: (k: string) => void; hl?: boolean }) {
  const e = EXERCISES[k];
  return (
    <li>
      <button type="button" onClick={() => onPick(k)} className={cx("flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-card2 active:bg-card3", hl && "bg-card2")}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{e.name}{k.startsWith("c-") && <span className="ml-1.5 text-[11px] text-vio">custom</span>}</span>
          <span className="block truncate text-xs text-mute">{EX_GROUP[k] ?? "—"} · {EQUIP_LABEL[equipOf(k)]} · {e.muscles}</span>
        </span>
        <Plus size={18} className="shrink-0 text-faint" aria-hidden />
      </button>
    </li>
  );
}

function CustomForm({ uid, initialName, onCancel, onSave }: { uid: string | null; initialName: string; onCancel: () => void; onSave: (c: CustomEx) => void }) {
  const [name, setName] = useState(initialName);
  const [metric, setMetric] = useState<Metric>("weight_reps");
  const [group, setGroup] = useState<Group | null>(null);
  const [p, setP] = useState<Muscle[]>([]);
  const ok = name.trim().length >= 2 && group && p.length && uid;
  return (
    <div>
      <Label>Name</Label>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Pendulum Squat" className="min-h-12 w-full rounded-xl bg-card2 px-3 outline-none focus:ring-2 focus:ring-acc" />
      <Label>How you log it</Label>
      <Chips options={METRICS} value={metric} onChange={(v) => v && setMetric(v)} clearable={false} />
      <Label>Counts for (muscle group)</Label>
      <Chips small options={GROUPS.map((x) => ({ id: x, label: x }))} value={group} onChange={setGroup} />
      <Label>Main muscles (for weekly volume)</Label>
      <div className="flex flex-wrap gap-2">
        {MUSCLE_PICK.map((m) => (
          <button key={m} type="button" aria-pressed={p.includes(m)} onClick={() => setP(p.includes(m) ? p.filter((x) => x !== m) : [...p, m].slice(-3))}
            className={cx("min-h-10 rounded-full border px-3 text-sm", p.includes(m) ? "border-acc bg-acc font-semibold text-acc-ink" : "border-line hover:bg-card2")}>
            {MUSCLE_LABEL[m]}
          </button>
        ))}
      </div>
      {!uid && <p className="mt-3 text-xs text-bad">Log in again to create exercises.</p>}
      <div className="mt-5 flex gap-2">
        <Btn kind="ghost" className="flex-1" onClick={onCancel}>Back</Btn>
        <Btn kind="primary" className="flex-1" disabled={!ok} onClick={() => ok && onSave({ key: customKey(uid!, name), name: name.trim(), metric, group: group!, p })}>Add exercise</Btn>
      </div>
    </div>
  );
}
