import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Flag, Info, Loader2, LogOut, Minus, Plus, Trash2, Trophy, UserPlus, Users, Zap } from "lucide-react";
import { GROUPS } from "../../program/groups";
import { METRIC, METRICS, addDays, type Board, type Challenge, type MetricId, type Period, type UserLite } from "../../shared/social";
import { Btn, Chips, Empty, PageHead, Sheet } from "../components/ui";
import { UserAvatar } from "../components/social/UserAvatar";
import { INPUT, fmtNum, kgShort, localToday, sx, useFocusRefresh } from "../components/social/lib";
import { uid } from "../lib/api";
import { cx, niceDate } from "../lib/util";

// Leaderboard + challenges. Research-led choices (see the Social report): opt-in with reciprocity (join to see), small
// friend groups only, plan-independent metrics (consistency %, per-muscle sets) so different plans compare fairly,
// zero = "getting started" instead of last place, your own row highlighted, movement arrows vs the previous period,
// cheers (kudos) instead of taunts.

const fmt = (m: MetricId, v: number) => (m === "volume" ? kgShort(v) : m === "consistency" ? `${v}%` : m === "streak" ? `${v} wk` : m.endsWith("minutes") ? `${fmtNum(v)} min` : fmtNum(v));
const PERIODS: { id: Period; label: string }[] = [{ id: "week", label: "This week" }, { id: "month", label: "This month" }, { id: "all", label: "All time" }];

export default function Compete() {
  const [tab, setTab] = useState<"board" | "challenges">(() => (sessionStorage.getItem("il:compete") as "board") || "board");
  useEffect(() => { try { sessionStorage.setItem("il:compete", tab); } catch { /* ignore */ } }, [tab]);
  return (
    <div className="md:mx-auto md:max-w-xl">
      <PageHead icon={Trophy} title="Compete" sub="Friendly competition with friends who opted in. Any plan counts." />
      <div role="tablist" aria-label="Compete" className="mb-4 flex rounded-xl bg-card p-1">
        {([["board", "Leaderboard"], ["challenges", "Challenges"]] as const).map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("min-h-11 flex-1 rounded-lg text-sm", tab === id ? "bg-card3 font-semibold" : "text-mute")}>{l}</button>
        ))}
      </div>
      <div role="tabpanel">{tab === "board" ? <Leaderboard /> : <Challenges />}</div>
    </div>
  );
}

// ---------------------------------------------------------------- leaderboard

function Leaderboard() {
  const [metric, setMetric] = useState<MetricId>("workouts");
  const [period, setPeriod] = useState<Period>("week");
  const [muscle, setMuscle] = useState("Back");
  const [b, setB] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [info, setInfo] = useState(false);
  const url = `/compete/board?metric=${metric}&period=${period}&today=${localToday()}${metric === "muscle_sets" ? `&muscle=${encodeURIComponent(muscle)}` : ""}`;
  const load = useCallback(() => { sx<Board>("GET", url).then((x) => { setB(x); setErr(null); }).catch((e) => setErr((e as Error).message)); }, [url]);
  useEffect(load, [load]);
  useFocusRefresh(load, 60_000);

  async function join(on: boolean) {
    setJoining(true);
    try { await sx("PUT", "/privacy", { leaderboard: on }); load(); } catch (e) { setErr((e as Error).message); } finally { setJoining(false); }
  }
  const m = METRIC[metric];

  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="What counts">
        {METRICS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={metric === x.id} onClick={() => setMetric(x.id)}
            className={cx("min-h-11 shrink-0 rounded-full border px-3 text-sm", metric === x.id ? "border-acc bg-acc font-semibold text-acc-ink" : "border-line hover:bg-card2")}>{x.short}</button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {metric !== "streak" && (
          <div role="radiogroup" aria-label="Period" className="flex flex-1 rounded-xl bg-card p-1">
            {PERIODS.map((p) => <button key={p.id} type="button" role="radio" aria-checked={period === p.id} onClick={() => setPeriod(p.id)} className={cx("min-h-10 flex-1 rounded-lg text-xs", period === p.id ? "bg-card3 font-semibold" : "text-mute")}>{p.label}</button>)}
          </div>
        )}
        {metric === "muscle_sets" && (
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="min-h-11 rounded-xl bg-card2 px-2 text-sm" aria-label="Muscle group">
            {GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        )}
        <button type="button" onClick={() => setInfo(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mute hover:bg-card2" aria-label="How it's counted"><Info size={20} aria-hidden /></button>
      </div>
      <p className="mt-2 px-1 text-xs text-mute">{m.help}</p>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}

      {b == null ? <ul aria-busy className="mt-3 space-y-2">{[0, 1, 2].map((k) => <li key={k} className="h-16 animate-pulse rounded-2xl bg-card" />)}</ul>
        : !b.joined ? (
          <div className="mt-4 rounded-2xl bg-card p-5 text-center">
            <Trophy size={32} className="mx-auto text-warn" aria-hidden />
            <h2 className="mt-2 text-lg font-semibold">Join the friends leaderboard</h2>
            <p className="mx-auto mt-1 max-w-xs text-sm text-mute">Only friends who joined see it, and only totals (never notes, pain or bodyweight). Leave any time in Privacy.</p>
            <Btn kind="primary" icon={joining ? Loader2 : Check} className="mt-4 w-full" disabled={joining} onClick={() => join(true)}>Join</Btn>
          </div>
        ) : (
          <>
            <p className="sr-only" role="status" aria-live="polite">{b.rows.find((r) => r.me)?.rank ? `You're number ${b.rows.find((r) => r.me)!.rank} of ${b.rows.length}` : ""}</p>
            <ol className="mt-3 space-y-1.5" aria-label={`${m.label} ranking`}>
              {b.rows.map((r) => <BoardRowView key={r.user.id} r={r} metric={metric} />)}
            </ol>
            {b.rows.length <= 1 && <p className="mt-3 text-center text-sm text-mute">Nobody else has joined yet. Invite friends from the gym. It's more fun together.</p>}
            {b.hidden > 0 && <p className="mt-3 text-center text-xs text-faint">{b.hidden} friend{b.hidden === 1 ? " hasn't" : "s haven't"} joined the leaderboard.</p>}
            <p className="mt-1 text-center text-xs text-faint">Refreshes every minute · weeks run Sat-Fri · a rest week is fine, just come back 💪</p>
          </>
        )}
      {info && (
        <Sheet open onClose={() => setInfo(false)} title="How it's counted" icon={Info}>
          <ul className="space-y-2 text-sm">{METRICS.map((x) => <li key={x.id}><b>{x.label}:</b> <span className="text-mute">{x.help}</span></li>)}</ul>
          <p className="mt-3 text-xs text-faint">Everything comes from what you log, whatever plan you follow. Arrows compare with the same point of the previous period.</p>
          {b?.joined && <Btn kind="danger" icon={LogOut} className="mt-4 w-full" onClick={() => { setInfo(false); void join(false); }}>Leave the leaderboard</Btn>}
        </Sheet>
      )}
    </>
  );
}

function BoardRowView({ r, metric }: { r: Board["rows"][number]; metric: MetricId }) {
  const move = r.rank && r.prevRank ? r.prevRank - r.rank : null;
  const medal = r.rank === 1 ? "bg-warn text-black" : r.rank === 2 ? "bg-[#c9ced6] text-black" : r.rank === 3 ? "bg-[#d39a6a] text-black" : "bg-card2 text-mute";
  return (
    <li className={cx("flex min-h-16 items-center gap-3 rounded-2xl px-3 py-2", r.me ? "bg-acc/10 ring-1 ring-acc/50" : "bg-card")} aria-current={r.me ? "true" : undefined}>
      <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold num", r.rank ? medal : "bg-card2 text-faint")} aria-label={r.rank ? `Rank ${r.rank}` : "Not ranked yet"}>{r.rank || "–"}</span>
      <a href={r.me ? "#/profile" : `#/u/${encodeURIComponent(r.user.username)}`} className="flex min-w-0 flex-1 items-center gap-2.5">
        <UserAvatar id={r.user.avatarId} name={r.user.name ?? r.user.username} size={38} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{r.me ? "You" : r.user.name || r.user.username}</span>
          <span className="block text-xs text-mute">{r.value ? fmt(metric, r.value) : "Getting started"}</span>
        </span>
      </a>
      {move != null && (
        <span className={cx("inline-flex items-center text-xs num", move > 0 ? "text-acc" : move < 0 ? "text-mute" : "text-faint")} aria-label={move > 0 ? `up ${move}` : move < 0 ? `down ${-move}` : "no change"}>
          {move > 0 ? <ArrowUp size={14} aria-hidden /> : move < 0 ? <ArrowDown size={14} aria-hidden /> : <Minus size={14} aria-hidden />}{move !== 0 ? Math.abs(move) : ""}
        </span>
      )}
      {!r.me && <CheerButton user={r.user} />}
    </li>
  );
}

/** Kudos for the week: 1 per friend per day → they get a notification. */
export function CheerButton({ user, challengeId }: { user: UserLite; challengeId?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  async function cheer() {
    setState("busy");
    try { await sx("POST", `/cheer/${encodeURIComponent(user.id)}`, { challengeId }); setState("done"); setMsg(`Cheered ${user.username}`); }
    catch (e) { setState("done"); setMsg((e as Error).message); }
  }
  return (
    <>
      <button type="button" onClick={cheer} disabled={state !== "idle"} className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", state === "done" ? "text-warn" : "text-mute hover:bg-card2 hover:text-warn")} aria-label={state === "done" ? `Cheered ${user.username}` : `Cheer ${user.username} on`}>
        {state === "busy" ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Zap size={18} className={state === "done" ? "fill-warn" : ""} aria-hidden />}
      </button>
      <span className="sr-only" role="status">{msg ?? ""}</span>
    </>
  );
}

// ---------------------------------------------------------------- challenges

function Challenges() {
  const [list, setList] = useState<Challenge[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => { sx<Challenge[]>("GET", `/challenges?today=${localToday()}`).then((x) => { setList(x); setErr(null); }).catch((e) => setErr((e as Error).message)); }, []);
  useEffect(load, [load]);
  useFocusRefresh(load, 60_000);
  const sel = list?.find((c) => c.id === open) ?? null;
  return (
    <>
      <Btn kind="primary" icon={Plus} className="w-full" onClick={() => setCreate(true)}>New challenge</Btn>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      {list == null ? <ul aria-busy className="mt-3 space-y-2">{[0, 1].map((k) => <li key={k} className="h-28 animate-pulse rounded-2xl bg-card" />)}</ul>
        : list.length === 0 ? <div className="mt-4"><Empty icon={Flag}>No challenges yet. Start one: “most hard sets this month”, “20 workouts by New Year”, “back sets week”.</Empty></div>
          : <ul className="mt-3 space-y-2">{list.map((c) => <li key={c.id}><ChallengeCard c={c} onOpen={() => setOpen(c.id)} /></li>)}</ul>}
      {create && <CreateChallenge onClose={() => setCreate(false)} onDone={() => { setCreate(false); load(); }} />}
      {sel && <ChallengeSheet c={sel} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

const daysLeft = (end: string) => Math.round((Date.parse(`${end}T12:00:00`) - Date.parse(`${localToday()}T12:00:00`)) / 864e5);
const statusText = (c: Challenge) => c.status === "upcoming" ? `Starts ${niceDate(c.startDate)}` : c.status === "finished" ? `Ended ${niceDate(c.endDate)}` : daysLeft(c.endDate) === 0 ? "Last day!" : `${daysLeft(c.endDate)} day${daysLeft(c.endDate) === 1 ? "" : "s"} left`;
const goalText = (c: Challenge) => `${c.target ? `Reach ${fmt(c.metric, c.target)}` : "Most wins"} · ${METRIC[c.metric]?.label ?? c.metric}${c.muscle ? ` (${c.muscle})` : ""}`;

function ChallengeCard({ c, onOpen }: { c: Challenge; onOpen: () => void }) {
  const mine = c.members.find((m) => m.me);
  const lead = c.members[0];
  const max = c.target ?? Math.max(1, ...c.members.map((m) => m.value));
  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-2xl bg-card p-4 text-left hover:bg-card2">
      <div className="flex items-start gap-2">
        <Flag size={18} className={cx("mt-0.5 shrink-0", c.status === "finished" ? "text-mute" : "text-warn")} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{c.title}</div>
          <div className="text-xs text-mute">{goalText(c)}</div>
        </div>
        <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", c.status === "running" ? "bg-acc/15 text-acc" : c.status === "upcoming" ? "bg-info/15 text-info" : "bg-card2 text-mute")}>{statusText(c)}</span>
      </div>
      {mine ? (
        <div className="mt-3">
          <div className="flex justify-between text-xs"><span className="text-mute">You{mine.rank ? ` · #${mine.rank} of ${c.members.length}` : ""}</span><span className="font-semibold num">{fmt(c.metric, mine.value)}{c.target ? ` / ${fmt(c.metric, c.target)}` : ""}</span></div>
          <Progress value={mine.value} max={max} label={`Your progress in ${c.title}`} done={mine.done} />
        </div>
      ) : (
        <p className="mt-2 text-xs text-info">{c.canJoin ? "Tap to see and join" : ""}</p>
      )}
      <div className="mt-2 flex items-center gap-1">
        <span className="flex -space-x-2">{c.members.slice(0, 5).map((m) => <UserAvatar key={m.user.id} id={m.user.avatarId} name={m.user.name ?? m.user.username} size={22} className="ring-2 ring-card" />)}</span>
        <span className="ml-1 text-xs text-mute">{c.members.length} in{c.status === "finished" && c.winners.length ? ` · 🏆 ${c.members.filter((m) => c.winners.includes(m.user.id)).map((m) => (m.me ? "you" : m.user.username)).join(", ")}` : lead && lead.rank ? ` · ${lead.me ? "you lead" : `${lead.user.username} leads`}` : ""}</span>
      </div>
    </button>
  );
}

function Progress({ value, max, label, done }: { value: number; max: number; label: string; done?: boolean }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-card3" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={cx("h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", done ? "bg-acc" : "bg-warn")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ChallengeSheet({ c, onClose, onChanged }: { c: Challenge; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const max = c.target ?? Math.max(1, ...c.members.map((m) => m.value));
  async function act(method: string, path: string, close = false) {
    setBusy(true); setErr(null);
    try { await sx(method, `/challenges/${c.id}${path}`); onChanged(); if (close) onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose} title={c.title} icon={Flag}>
      <p className="text-sm text-mute">{goalText(c)}</p>
      <p className="text-xs text-faint">{niceDate(c.startDate)} → {niceDate(c.endDate)} · {statusText(c)} · by {c.mine ? "you" : `@${c.createdBy.username}`}</p>
      {c.status === "finished" && c.winners.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-warn/10 p-3 text-sm"><Trophy size={18} className="text-warn" aria-hidden /><span>{c.target ? "Finished the goal: " : "Winner: "}<b>{c.members.filter((m) => c.winners.includes(m.user.id)).map((m) => (m.me ? "You" : m.user.name || m.user.username)).join(", ")}</b></span></div>
      )}
      <ol className="mt-3 space-y-2" aria-label="Standings">
        {c.members.map((m) => (
          <li key={m.user.id} className={cx("rounded-xl p-2.5", m.me ? "bg-acc/10" : "bg-card2")}>
            <div className="flex items-center gap-2">
              <span className="w-6 text-center text-sm font-bold text-mute num">{m.rank || "–"}</span>
              <UserAvatar id={m.user.avatarId} name={m.user.name ?? m.user.username} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.me ? "You" : m.user.name || m.user.username}{m.done && <Check size={14} className="ml-1 inline text-acc" aria-label="goal reached" />}</span>
              <span className="text-sm num">{fmt(c.metric, m.value)}</span>
              {!m.me && c.status === "running" && <CheerButton user={m.user} challengeId={c.id} />}
            </div>
            <Progress value={m.value} max={max} label={`${m.me ? "Your" : `${m.user.username}'s`} progress`} done={m.done} />
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-faint">Joining shares your {METRIC[c.metric]?.label.toLowerCase()} total for these dates with the other members. Nothing else.</p>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <div className="mt-4 space-y-2">
        {c.canJoin && <Btn kind="primary" icon={busy ? Loader2 : Check} className="w-full" disabled={busy} onClick={() => act("POST", "/join")}>Join challenge</Btn>}
        {c.joined && c.status !== "finished" && <Btn kind="soft" icon={UserPlus} className="w-full" onClick={() => setInviting(true)}>Invite friends</Btn>}
        {c.joined && !c.mine && c.status !== "finished" && <Btn kind="ghost" icon={LogOut} className="w-full" disabled={busy} onClick={() => confirm("Leave this challenge?") && act("DELETE", "/join", true)}>Leave</Btn>}
        {c.mine && <Btn kind="danger" icon={Trash2} className="w-full" disabled={busy} onClick={() => confirm("Delete this challenge for everyone?") && act("DELETE", "", true)}>Delete challenge</Btn>}
      </div>
      {inviting && <InviteSheet exclude={c.members.map((m) => m.user.id)} onClose={() => setInviting(false)} onPick={async (ids) => { await sx("POST", `/challenges/${c.id}/invite`, { userIds: ids }); setInviting(false); }} />}
    </Sheet>
  );
}

function FriendPicker({ exclude, picked, setPicked }: { exclude: string[]; picked: string[]; setPicked: (f: (p: string[]) => string[]) => void }) {
  const [friends, setFriends] = useState<UserLite[] | null>(null);
  useEffect(() => { sx<{ friends: UserLite[] }>("GET", "/friends").then((r) => setFriends(r.friends)).catch(() => setFriends([])); }, []);
  const list = (friends ?? []).filter((f) => !exclude.includes(f.id));
  if (friends == null) return <p className="text-sm text-mute" role="status">Loading friends…</p>;
  if (!list.length) return <p className="text-sm text-mute">No friends to invite. <a href="#/friends" className="text-info underline">Add friends</a></p>;
  return (
    <ul className="space-y-1">{list.map((f) => {
      const on = picked.includes(f.id);
      return (
        <li key={f.id}><button type="button" role="checkbox" aria-checked={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== f.id) : [...p, f.id]))} className={cx("flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left", on ? "bg-acc/10" : "hover:bg-card2")}>
          <UserAvatar id={f.avatarId} name={f.name ?? f.username} size={32} /><span className="min-w-0 flex-1 truncate text-sm">{f.name || f.username} <span className="text-mute">@{f.username}</span></span>
          <span className={cx("flex h-6 w-6 items-center justify-center rounded-md border", on ? "border-acc bg-acc text-acc-ink" : "border-line")} aria-hidden>{on && <Check size={14} />}</span>
        </button></li>
      );
    })}</ul>
  );
}

function InviteSheet({ exclude, onClose, onPick }: { exclude: string[]; onClose: () => void; onPick: (ids: string[]) => Promise<void> }) {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <Sheet open onClose={onClose} title="Invite friends" icon={Users}>
      <FriendPicker exclude={exclude} picked={picked} setPicked={setPicked} />
      <Btn kind="primary" className="mt-4 w-full" disabled={!picked.length} onClick={() => void onPick(picked)}>Invite {picked.length || ""}</Btn>
    </Sheet>
  );
}

function CreateChallenge({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const today = localToday();
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<MetricId>("hard_sets");
  const [mode, setMode] = useState<"most" | "target">("most");
  const [target, setTarget] = useState("");
  const [muscle, setMuscle] = useState("Back");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 27));
  const [vis, setVis] = useState<"friends" | "invite">("friends");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const opts = METRICS.filter((m) => m.challenge);
  async function save() {
    setBusy(true); setErr(null);
    try {
      await sx("POST", "/challenges", { id: uid(), title: title.trim() || `${METRIC[metric].label}${metric === "muscle_sets" ? ` · ${muscle}` : ""}`, metric, target: mode === "target" ? Number(target) : null, muscle: metric === "muscle_sets" ? muscle : null, startDate: start, endDate: end, visibility: vis, invite: picked });
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose} title="New challenge" icon={Flag}>
      <label className="block"><span className="mb-1 block text-[11px] text-mute">Name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} dir="auto" placeholder="e.g. December back attack" className={INPUT} /></label>
      <div className="mt-3"><span className="mb-1 block text-[11px] text-mute">What counts</span>
        <Chips clearable={false} small options={opts.map((m) => ({ id: m.id, label: m.short }))} value={metric} onChange={(v) => v && setMetric(v as MetricId)} />
        <p className="mt-1 text-[11px] text-faint">{METRIC[metric].help}</p></div>
      {metric === "muscle_sets" && (
        <label className="mt-3 block"><span className="mb-1 block text-[11px] text-mute">Muscle group</span>
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className={INPUT}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></label>
      )}
      <div className="mt-3"><span className="mb-1 block text-[11px] text-mute">How to win</span>
        <Chips clearable={false} options={[{ id: "most", label: "Most wins" }, { id: "target", label: "Reach a goal" }]} value={mode} onChange={(v) => setMode((v ?? "most") as "most")} />
        {mode === "target" && <input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))} placeholder={`Goal (${METRIC[metric].unit || "count"})`} aria-label="Goal" className={cx(INPUT, "mt-2")} />}
        <p className="mt-1 text-[11px] text-faint">{mode === "target" ? "Everyone who reaches it wins. Cooperative and fair across levels." : "Highest total at the end wins."}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label><span className="mb-1 block text-[11px] text-mute">Start</span><input type="date" value={start} min={addDays(today, -7)} onChange={(e) => setStart(e.target.value)} className={INPUT} /></label>
        <label><span className="mb-1 block text-[11px] text-mute">End</span><input type="date" value={end} min={start} max={addDays(start, 92)} onChange={(e) => setEnd(e.target.value)} className={INPUT} /></label>
      </div>
      <div className="mt-3"><span className="mb-1 block text-[11px] text-mute">Who can join</span>
        <Chips clearable={false} options={[{ id: "friends", label: "All my friends" }, { id: "invite", label: "Invited only" }]} value={vis} onChange={(v) => setVis((v ?? "friends") as "friends")} /></div>
      <div className="mt-3"><span className="mb-1 block text-[11px] text-mute">Invite</span><FriendPicker exclude={[]} picked={picked} setPicked={setPicked} /></div>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <Btn kind="primary" icon={busy ? Loader2 : Check} className="mt-4 w-full" disabled={busy || (mode === "target" && !(Number(target) > 0))} onClick={save}>Create</Btn>
    </Sheet>
  );
}
