import { useState } from "react";
import { CalendarRange, Check, ChevronRight, Flag, GitBranch, NotebookPen, Pencil, Play, Scale, TrendingUp, Trophy } from "lucide-react";
import type { AppState } from "../../shared/api";
import { HISTORY } from "../../program/history";
import { send, track } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, kg, niceDate, today } from "../lib/util";
import { Badge, Btn, Card, Empty, PageHead, Sheet } from "../components/ui";
import { go } from "../nav";

export interface BlockStats {
  sessions: { done: number; missed: number; skipped: number; extra: number; planned: number };
  adherence: number | null; progress: number; sets: number; volume: number; avgMinutes: number | null; prs: number; pains: number;
  bodyKg: { start: number | null; end: number | null }; versions: string[];
  lifts: { exKey: string; name: string; start: number; best: number; pct: number }[]; weeksDone: number[];
}
export interface Block {
  id: string; n: number; name: string; programId: string; startVersion: string; startDate: string; endDate: string | null; status: "active" | "done";
  goal: string | null; notes: string | null; review: string | null; baseline: { bodyKg: number | null; e1rm: Record<string, number> } | null; stats: BlockStats;
  sessions?: { id: string; date: string; week: number; dayName: string; status: string; kind: string; version: string }[];
}

const verOf = (id: string) => id.split("@")[1] ?? id;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5) + 1;

/** One card per month (block): progress, adherence, volume, PRs, strength change, bodyweight, plan versions used. */
export default function Months() {
  const { data, reload } = useLoad<Block[]>("/blocks");
  const { data: s } = useLoad<AppState>("/state");
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!data) return <p className="py-20 text-center text-mute">Loading…</p>;
  const active = data.find((b) => b.status === "active");

  return (
    <div>
      <PageHead icon={CalendarRange} title="Months" sub="Each 4-week block saved with its numbers, versions and notes" />
      {!data.length && <Empty icon={CalendarRange}>Your first month starts with your first workout.</Empty>}
      <div className="space-y-3">
        {data.map((b) => <MonthCard key={b.id} b={b} onOpen={() => setOpen(b.id)} />)}
      </div>
      {active && (
        <Card className="mt-4">
          <div className="text-sm font-semibold">Finished the 4 weeks?</div>
          <p className="mt-1 text-xs text-mute">Starting the next month saves this one (frozen numbers), and the plan goes back to Week 1 with your weights carried over. Say "review" to Claude first to get the next version.</p>
          <Btn kind="soft" icon={Play} className="mt-3 w-full" disabled={!!s?.active} onClick={() => setConfirm(true)}>{s?.active ? "Finish the workout in progress first" : `Start Month ${active.n + 1}`}</Btn>
        </Card>
      )}
      {open && <MonthSheet id={open} onClose={() => { setOpen(null); reload(); }} />}
      {confirm && active && (
        <Sheet open onClose={() => setConfirm(false)} title={`Start Month ${active.n + 1}?`} icon={Flag}>
          <p className="text-sm text-mute">{active.name} closes today with {active.stats.sessions.done} of {active.stats.sessions.planned} workouts done. Its numbers are saved and stay viewable here. Nothing is deleted.</p>
          {active.stats.progress < 75 && <p className="mt-2 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">Only {active.stats.progress}% of this month is done — usually you'd finish Week 4 first.</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Btn kind="soft" onClick={() => setConfirm(false)}>Cancel</Btn>
            <Btn kind="primary" onClick={async () => {
              const r = await send<{ n?: number; error?: string }>("POST", "/blocks/next", { date: today() }).catch((e) => ({ error: String(e) }));
              if ((r as { error?: string }).error) return alert((r as { error: string }).error);
              track("block_next", { from: active.n });
              setConfirm(false); reload(); go("/plan");
            }}>Start Month {active.n + 1}</Btn>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function MonthCard({ b, onOpen }: { b: Block; onOpen: () => void }) {
  const st = b.stats;
  const top = st.lifts.filter((l) => l.pct !== 0).slice(0, 3);
  return (
    <button onClick={onOpen} className={cx("block w-full rounded-2xl bg-card p-4 text-left active:bg-card2", b.status === "active" && "ring-1 ring-acc/50")}>
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold">{b.name}</span>
        {b.status === "active" ? <Badge tone="acc">current</Badge> : <Badge>done</Badge>}
        <span className="flex-1" />
        <ChevronRight size={16} className="text-faint" />
      </div>
      <div className="text-xs text-mute num">{niceDate(b.startDate)} → {b.endDate ? niceDate(b.endDate) : "now"} · {days(b.startDate, b.endDate ?? today())} days · v{verOf(b.startVersion)}{st.versions.length > 1 ? ` → v${verOf(st.versions[st.versions.length - 1])}` : ""}</div>
      {/* progress through the 4 weeks */}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-card3"><div className="h-2 rounded-full bg-acc" style={{ width: `${Math.min(100, st.progress)}%` }} /></div>
        <span className="text-xs text-mute num">{st.sessions.done}/{st.sessions.planned}</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
        {[
          { v: st.adherence != null ? `${st.adherence}%` : "—", l: "adherence" },
          { v: st.volume >= 1000 ? `${(st.volume / 1000).toFixed(1)}t` : `${st.volume}`, l: "volume" },
          { v: String(st.prs), l: "PRs" },
          { v: st.avgMinutes != null ? `${st.avgMinutes}′` : "—", l: "avg time" },
        ].map((x) => <div key={x.l} className="rounded-lg bg-card2 py-1.5"><div className="text-sm font-bold num">{x.v}</div><div className="text-[10px] text-mute">{x.l}</div></div>)}
      </div>
      {top.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 text-[11px] num">
          {top.map((l) => <span key={l.exKey} className={cx("rounded-full px-2 py-0.5", l.pct > 0 ? "bg-acc/15 text-acc" : "bg-warn/15 text-warn")}>{l.name.split(" ").slice(-2).join(" ")} {l.pct > 0 ? "+" : ""}{l.pct}%</span>)}
        </div>
      )}
    </button>
  );
}

function MonthSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: b, reload } = useLoad<Block>(`/blocks/${id}`);
  const [edit, setEdit] = useState<null | "goal" | "notes">(null);
  const [text, setText] = useState("");
  if (!b) return <Sheet open onClose={onClose} title="Month" icon={CalendarRange}><p className="text-sm text-mute">Loading…</p></Sheet>;
  const st = b.stats;
  const save = async (k: "goal" | "notes") => { await send("PUT", `/blocks/${b.id}`, { [k]: text.trim() || null }); setEdit(null); reload(); track("block_note", { k }); };
  const vers = st.versions.length ? st.versions : [b.startVersion];
  return (
    <Sheet open onClose={onClose} title={b.name} icon={CalendarRange}>
      <p className="-mt-1 text-xs text-mute num">{niceDate(b.startDate)} → {b.endDate ? niceDate(b.endDate) : "now"} · {b.status === "active" ? "in progress" : "finished"}</p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { v: `${st.sessions.done}/${st.sessions.planned}`, l: "workouts" },
          { v: st.adherence != null ? `${st.adherence}%` : "—", l: "adherence" },
          { v: `${st.sets}`, l: "work sets" },
          { v: `${st.volume.toLocaleString()}`, l: "volume kg" },
          { v: `${st.prs}`, l: "PRs" },
          { v: `${st.sessions.missed + st.sessions.skipped}`, l: "missed / skipped" },
        ].map((x) => <div key={x.l} className="rounded-xl bg-card2 p-2"><div className="font-bold num">{x.v}</div><div className="text-[10px] text-mute">{x.l}</div></div>)}
      </div>

      {(st.bodyKg.start != null || b.baseline?.bodyKg != null) && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-card2 p-3 text-sm">
          <Scale size={15} className="text-vio" />Bodyweight
          <span className="ml-auto num">{st.bodyKg.start ?? b.baseline?.bodyKg ?? "—"} → <b>{st.bodyKg.end ?? "—"}</b> kg</span>
        </div>
      )}

      <h3 className="mb-1.5 mt-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mute"><TrendingUp size={13} />Strength this month (est. max)</h3>
      {!st.lifts.length && <p className="text-xs text-mute">No weighted sets yet.</p>}
      <ul className="space-y-1">
        {st.lifts.map((l) => (
          <li key={l.exKey} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{l.name}</span>
            <span className="text-xs text-mute num">{kg(l.start)} → </span>
            <span className="font-semibold num">{kg(l.best)}</span>
            <span className={cx("w-14 text-right text-xs num", l.pct > 0 ? "text-acc" : l.pct < 0 ? "text-warn" : "text-faint")}>{l.pct > 0 ? "+" : ""}{l.pct}%</span>
          </li>
        ))}
      </ul>

      <h3 className="mb-1.5 mt-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-mute"><GitBranch size={13} />Plan versions used</h3>
      <ul className="space-y-1.5">
        {vers.map((v) => {
          const h = HISTORY.find((x) => x.id === v);
          return <li key={v} className="rounded-lg bg-card2 px-3 py-2 text-xs"><b className="num">v{verOf(v)}</b>{h ? ` · ${h.title}` : ""}</li>;
        })}
      </ul>

      {(["goal", "notes"] as const).map((k) => (
        <div key={k} className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-mute">
            <span className="flex items-center gap-1.5">{k === "goal" ? <Flag size={13} /> : <NotebookPen size={13} />}{k === "goal" ? "Goal for this month" : "Notes"}</span>
            {edit !== k && <button onClick={() => { setEdit(k); setText(b[k] ?? ""); }} className="flex min-h-9 items-center gap-1 px-1 normal-case tracking-normal text-info"><Pencil size={12} />edit</button>}
          </div>
          {edit === k ? (
            <div>
              <textarea dir="auto" value={text} onChange={(e) => setText(e.target.value)} rows={3} className="w-full rounded-xl bg-card2 p-3 text-sm outline-none focus:ring-2 focus:ring-acc" placeholder={k === "goal" ? "e.g. bench 80×6, first pull-up negative 5 s" : "life, sleep, what went well…"} />
              <div className="mt-2 grid grid-cols-2 gap-2"><Btn kind="soft" onClick={() => setEdit(null)}>Cancel</Btn><Btn kind="primary" icon={Check} onClick={() => save(k)}>Save</Btn></div>
            </div>
          ) : <p dir="auto" className="bidi whitespace-pre-wrap text-sm text-ink/90">{b[k] || <span className="text-faint">—</span>}</p>}
        </div>
      ))}

      {b.review && (
        <div className="mt-4 rounded-xl border border-info/30 bg-info/5 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-info"><Trophy size={13} />Review</div>
          <p className="whitespace-pre-wrap text-sm">{b.review}</p>
        </div>
      )}

      {!!b.sessions?.length && (
        <>
          <h3 className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-mute">Workouts</h3>
          <ul className="divide-y divide-line/60">
            {b.sessions.map((x) => (
              <li key={x.id}>
                <button onClick={() => x.status !== "missed" && x.status !== "skipped" && go(`/s/${x.id}`)} className="flex w-full items-center gap-2 py-2 text-left text-sm">
                  <span className={cx("h-2 w-2 shrink-0 rounded-full", x.status === "done" ? "bg-acc" : x.status === "missed" || x.status === "skipped" ? "bg-bad" : "bg-warn")} />
                  <span className="w-20 shrink-0 text-xs text-mute">{niceDate(x.date)}</span>
                  <span className="min-w-0 flex-1 truncate">W{x.week} · {x.dayName}{x.kind === "extra" ? " (extra)" : ""}</span>
                  <span className="text-[10px] text-faint num">v{verOf(x.version)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
