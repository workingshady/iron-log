import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Dumbbell, Info, Swords } from "lucide-react";
import type { LiftDetail, LiftsBoard, MuscleBoard, Period, UserLite } from "../../../shared/social";
import { cx, niceDate } from "../../lib/util";
import { Sheet } from "../ui";
import { UserAvatar } from "./UserAvatar";
import { JoinGate } from "./compete-shared";
import { firstName, localToday, sx } from "./lib";
import { Legend, MultiLine, PersonBars, SERIES } from "./viz";

// "Who lifts more" (Hevy's exercise leaderboard + Strava head-to-head): only exercises at least two of you logged, best
// estimated 1RM (Epley, strict normal/failure sets of 1-12 reps), the best set behind it, and × bodyweight when shared.
// Dumbbell pairs compare PER HAND (what you load), everything else as logged. Up to 3 people at once so colours stay
// distinguishable; each person keeps their colour while selected (you are always blue).

export function LiftCompare() {
  const [b, setB] = useState<LiftsBoard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [slot, setSlot] = useState<Record<string, number>>({});
  const [ex, setEx] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [help, setHelp] = useState(false);
  const load = useCallback(() => { sx<LiftsBoard>("GET", `/compete/lifts?today=${localToday()}`).then((x) => { setB(x); setErr(null); }).catch((e) => setErr((e as Error).message)); }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (!b?.people.length || sel.length) return;
    const ids = b.people.slice(0, 3).map((p) => p.id);
    setSel(ids); setSlot(Object.fromEntries(ids.map((id, i) => [id, i])));
  }, [b, sel.length]);

  const shared = useMemo(() => (b?.lifts ?? []).filter((l) => sel.filter((id) => l.best[id]).length >= 2), [b, sel]);
  useEffect(() => { if (shared.length && (!ex || !shared.some((l) => l.key === ex))) setEx(shared[0].key); }, [shared, ex]);

  if (err) return <p role="alert" className="mt-3 text-sm text-bad">{err}</p>;
  if (!b) return <div aria-busy className="mt-3 space-y-2"><div className="h-12 animate-pulse rounded-2xl bg-card" /><div className="h-56 animate-pulse rounded-3xl bg-card" /></div>;
  if (!b.joined) return <JoinGate onJoined={load} />;
  if (b.people.length < 2) return (
    <div className="mt-4 rounded-3xl bg-card p-6 text-center">
      <Swords size={30} className="mx-auto text-info" aria-hidden />
      <h2 className="mt-2 text-lg font-bold">No one to compare with yet</h2>
      <p className="mx-auto mt-1 max-w-[16rem] text-sm text-mute">Friends show up here once they join the board and share PRs with friends.</p>
    </div>
  );

  const color = (id: string) => SERIES[slot[id] ?? 0];
  const people = b.people.filter((p) => sel.includes(p.id));
  function toggle(u: UserLite, i: number) {
    if (i === 0) return; // you're always in
    if (sel.includes(u.id)) { setSel(sel.filter((x) => x !== u.id)); return; }
    if (sel.length >= 3) return;
    const used = new Set(sel.map((id) => slot[id]));
    const free = [0, 1, 2].find((n) => !used.has(n)) ?? 2;
    setSlot({ ...slot, [u.id]: free }); setSel([...sel, u.id]);
  }
  const lift = shared.find((l) => l.key === ex) ?? null;

  return (
    <>
      <div className="flex items-center gap-2">
        <ul className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Compare with (up to 3)">
          {b.people.map((u, i) => {
            const on = sel.includes(u.id);
            return (
              <li key={u.id}><button type="button" aria-pressed={on} disabled={!on && sel.length >= 3} onClick={() => toggle(u, i)}
                className={cx("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm transition-colors disabled:opacity-40", on ? "bg-card2 font-semibold" : "bg-card text-mute")}
                style={on ? { boxShadow: `inset 0 0 0 2px ${color(u.id)}` } : undefined}>
                <UserAvatar id={u.avatarId} name={u.name ?? u.username} size={30} />{i === 0 ? "You" : firstName(u)}{on && i > 0 && <Check size={14} aria-hidden />}
              </button></li>
            );
          })}
        </ul>
        <button type="button" onClick={() => setHelp(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mute hover:bg-card2" aria-label="How lifts are compared"><Info size={20} aria-hidden /></button>
      </div>

      {sel.length < 2 ? <p className="mt-6 text-center text-sm text-mute">Pick a friend to compare 👆</p> : !shared.length ? (
        <p className="mt-6 text-center text-sm text-mute">No exercise in common yet. Different plans? Try someone else.</p>
      ) : (
        <>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Exercise">
            {shared.slice(0, 8).map((l) => (
              <button key={l.key} type="button" role="radio" aria-checked={ex === l.key} onClick={() => setEx(l.key)}
                className={cx("min-h-11 shrink-0 rounded-full px-3.5 text-sm", ex === l.key ? "bg-ink font-semibold text-bg" : "bg-card text-mute hover:bg-card2")}>{l.name}</button>
            ))}
            {shared.length > 8 && <button type="button" onClick={() => setAll(true)} className="min-h-11 shrink-0 rounded-full bg-card px-3.5 text-sm text-info">All {shared.length}</button>}
          </div>
          {lift && <HeadToHead exKey={lift.key} people={people} bodyweight={b.bodyweight} color={color} />}
          <SharedList lifts={shared} people={people} color={color} onPick={(k) => { setEx(k); window.scrollTo({ top: 0, behavior: "smooth" }); }} active={ex} />
        </>
      )}
      <MuscleCompare color={color} sel={sel} />

      {all && (
        <Sheet open onClose={() => setAll(false)} title="Exercises in common" icon={Dumbbell}>
          <ul>{shared.map((l) => <li key={l.key}><button type="button" onClick={() => { setEx(l.key); setAll(false); }} className={cx("flex min-h-12 w-full items-center gap-2 rounded-xl px-2 text-left text-sm", ex === l.key ? "bg-card2 font-semibold" : "hover:bg-card2")}><span className="flex-1 truncate">{l.name}</span><span className="text-xs text-mute">{l.group}</span></button></li>)}</ul>
        </Sheet>
      )}
      {help && (
        <Sheet open onClose={() => setHelp(false)} title="How lifts are compared" icon={Info}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-mute">
            <li><b className="text-ink">Est. max</b> = Epley: kg × (1 + reps ÷ 30), from your heaviest strict set (1-12 reps, no warm-ups or drop sets).</li>
            <li>Dumbbell pairs are <b className="text-ink">per hand</b>. Bars and machines as logged.</li>
            <li><b className="text-ink">× BW</b> appears for people who share their bodyweight.</li>
            <li>Only friends who joined the board and share PRs with friends.</li>
          </ul>
        </Sheet>
      )}
    </>
  );
}

function HeadToHead({ exKey, people, bodyweight, color }: { exKey: string; people: UserLite[]; bodyweight: Record<string, number>; color: (id: string) => string }) {
  const [d, setD] = useState<LiftDetail | null>(null);
  useEffect(() => { setD(null); sx<LiftDetail>("GET", `/compete/lifts/${encodeURIComponent(exKey)}?today=${localToday()}`).then(setD).catch(() => setD(null)); }, [exKey]);
  if (!d) return <div className="mt-3 h-72 animate-pulse rounded-3xl bg-card" aria-busy aria-label="Loading comparison" />;
  const unit = d.perHand ? "kg / hand" : "kg";
  const vals = people.map((p) => d.best[p.id]?.e1rm ?? 0);
  const top = Math.max(...vals);
  const leader = people.find((p) => (d.best[p.id]?.e1rm ?? 0) === top && top > 0);
  const name = (u: UserLite, i: number) => (i === 0 ? "You" : firstName(u));
  const anyBw = people.some((p) => bodyweight[p.id] && d.best[p.id]);
  return (
    <section className="mt-3 rounded-3xl bg-card p-4" aria-label={`${d.name}: head to head`}>
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1 truncate text-lg font-bold">{d.name}</h3>
        <span className="shrink-0 text-xs text-mute">est. max · {unit}</span>
      </div>
      {leader && <p className="mt-0.5 text-sm text-mute"><b className="text-ink">{leader.id === people[0].id ? "You lead" : `${firstName(leader)} leads`}</b>{people.length > 1 && vals.filter((v) => v > 0).length > 1 ? ` by ${Math.round((top - [...vals].sort((a, z) => z - a)[1]) * 10) / 10} kg` : ""}</p>}
      <div className="mt-3">
        <PersonBars fmt={(v) => `${v}`} rows={people.map((p, i) => ({
          id: p.id, label: name(p, i), color: color(p.id), value: d.best[p.id]?.e1rm ?? null, lead: leader?.id === p.id,
          sub: d.best[p.id] ? `${d.best[p.id].kg}×${d.best[p.id].reps}` : "not yet",
        }))} />
      </div>
      {anyBw && (
        <dl className="mt-3 flex flex-wrap gap-2">
          {people.map((p, i) => d.best[p.id] && bodyweight[p.id] ? (
            <div key={p.id} className="flex items-center gap-1.5 rounded-full bg-card2 px-2.5 py-1 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: color(p.id) }} aria-hidden /><dt className="text-mute">{name(p, i)}</dt>
              <dd className="font-semibold num">{(Math.round(((d.best[p.id].e1rm * (d.perHand ? 2 : 1)) / bodyweight[p.id]) * 100) / 100).toFixed(2)}× BW</dd>
            </div>
          ) : null)}
        </dl>
      )}
      {people.some((p) => (d.series[p.id]?.length ?? 0) > 1) && (
        <div className="mt-4 border-t border-line/60 pt-3">
          <MultiLine unit={unit} lines={people.filter((p) => d.series[p.id]?.length).map((p) => ({ id: p.id, label: name(p, people.indexOf(p)), color: color(p.id), points: d.series[p.id].map((s) => ({ date: s.date, y: s.e1rm })) }))} />
        </div>
      )}
      <p className="mt-2 text-[11px] text-faint">Best sets: {people.map((p, i) => d.best[p.id] ? `${name(p, i)} ${niceDate(d.best[p.id].date)}` : null).filter(Boolean).join(" · ")}</p>
    </section>
  );
}

/** Every shared exercise as a compact row of thin bars (one per person, scaled to that exercise's best). */
function SharedList({ lifts, people, color, onPick, active }: { lifts: LiftsBoard["lifts"]; people: UserLite[]; color: (id: string) => string; onPick: (k: string) => void; active: string | null }) {
  if (lifts.length < 2) return null;
  return (
    <section className="mt-4" aria-labelledby="sl">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 id="sl" className="text-xs font-semibold uppercase tracking-wide text-mute">All lifts in common</h3>
        <Legend items={people.map((p, i) => ({ label: i === 0 ? "You" : firstName(p), color: color(p.id) }))} />
      </div>
      <ul className="divide-y divide-line/50 overflow-hidden rounded-2xl bg-card">
        {lifts.slice(0, 12).map((l) => {
          const max = Math.max(...people.map((p) => l.best[p.id]?.e1rm ?? 0));
          return (
            <li key={l.key}>
              <button type="button" onClick={() => onPick(l.key)} className={cx("flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-card2", active === l.key && "bg-card2")}>
                <span className="w-28 shrink-0 truncate text-sm">{l.name}</span>
                <span className="flex-1 space-y-1" aria-label={people.map((p, i) => `${i === 0 ? "you" : firstName(p)} ${l.best[p.id]?.e1rm ?? "none"}`).join(", ")}>
                  {people.map((p) => (
                    <span key={p.id} className="flex items-center gap-1.5">
                      <span className="h-1.5 flex-1 rounded-full bg-card3/60"><span className="block h-full rounded-full" style={{ width: `${l.best[p.id] ? Math.max(3, (l.best[p.id].e1rm / max) * 100) : 0}%`, background: color(p.id) }} /></span>
                      <span className="w-9 text-right text-[11px] font-semibold num">{l.best[p.id]?.e1rm ?? "–"}</span>
                    </span>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Hard sets per muscle group: grouped thin bars per person. */
function MuscleCompare({ color, sel }: { color: (id: string) => string; sel: string[] }) {
  const [period, setPeriod] = useState<Period>("month");
  const [m, setM] = useState<MuscleBoard | null>(null);
  useEffect(() => { sx<MuscleBoard>("GET", `/compete/muscles?period=${period}&today=${localToday()}`).then(setM).catch(() => setM(null)); }, [period]);
  if (!m?.joined || m.people.length < 2) return null;
  const people = m.people.filter((p) => sel.includes(p.id));
  if (people.length < 2) return null;
  const max = Math.max(1, ...m.groups.flatMap((g) => people.map((p) => g.sets[p.id] ?? 0)));
  return (
    <section className="mt-5" aria-labelledby="mv">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h3 id="mv" className="flex-1 text-xs font-semibold uppercase tracking-wide text-mute">Hard sets per muscle</h3>
        <div role="radiogroup" aria-label="Period" className="flex rounded-lg bg-card p-0.5">
          {(["week", "month", "all"] as const).map((p) => <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => setPeriod(p)} className={cx("min-h-9 rounded-md px-2.5 text-xs", period === p ? "bg-card3 font-semibold" : "text-mute")}>{p === "all" ? "All" : p === "week" ? "Week" : "Month"}</button>)}
        </div>
      </div>
      <div className="rounded-2xl bg-card p-3">
        <Legend items={people.map((p, i) => ({ label: p.id === m.people[0].id ? "You" : firstName(p), color: color(p.id), value: undefined }))} />
        {!m.groups.length ? <p className="py-4 text-center text-sm text-mute">No hard sets in this period.</p> : (
          <ul className="mt-3 space-y-2.5">
            {m.groups.map((g) => (
              <li key={g.group} className="flex items-center gap-2" aria-label={`${g.group}: ${people.map((p) => `${firstName(p)} ${g.sets[p.id] ?? 0}`).join(", ")}`}>
                <span className="w-24 shrink-0 truncate text-xs text-mute">{g.group}</span>
                <span className="flex-1 space-y-[2px]">
                  {people.map((p) => <span key={p.id} className="block h-1.5 rounded-full" style={{ width: `${Math.max(g.sets[p.id] ? 2 : 0, ((g.sets[p.id] ?? 0) / max) * 100)}%`, background: color(p.id) }} />)}
                </span>
                <span className="w-14 shrink-0 text-right text-[11px] text-mute num">{people.map((p) => g.sets[p.id] ?? 0).join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
