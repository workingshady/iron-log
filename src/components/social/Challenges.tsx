import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Crown, Flag, Hourglass, Loader2, LogOut, Plus, Trash2, Trophy, UserPlus, Users } from "lucide-react";
import { GROUPS } from "../../../program/groups";
import { METRIC, METRICS, addDays, needsMuscle, weekStartOf, type Challenge, type MetricId, type UserLite } from "../../../shared/social";
import { uid } from "../../lib/api";
import { cx, niceDate } from "../../lib/util";
import { Btn, Chips, Sheet } from "../ui";
import { UserAvatar } from "./UserAvatar";
import { CheerButton, METRIC_ICON, fmtMetric } from "./compete-shared";
import { INPUT, confetti, firstName, localToday, sx, useFocusRefresh } from "./lib";
import { MEDAL, Ring } from "./viz";

// Challenges: visual cards (rings per member, countdown, your bar), one-tap join, quick templates, a celebration when
// it ends. "Reach a goal" challenges are cooperative (everyone who gets there wins), "Most" is a race.

interface Template { emoji: string; title: string; metric: MetricId; target: number | null; muscle?: string; days: "week" | number }
const TEMPLATES: Template[] = [
  { emoji: "🏋️", title: "Most workouts this week", metric: "workouts", target: null, days: "week" },
  { emoji: "🦍", title: "1,000 kg back volume", metric: "muscle_volume", target: 1000, muscle: "Back", days: 7 },
  { emoji: "🏃", title: "3 cardio sessions", metric: "cardio_sessions", target: 3, days: "week" },
  { emoji: "🔥", title: "100 hard sets", metric: "hard_sets", target: 100, days: 28 },
  { emoji: "🦵", title: "Leg week", metric: "muscle_sets", target: null, muscle: "Quads", days: 7 },
];
const range = (t: Template) => { const today = localToday(); if (t.days === "week") { const s = weekStartOf(today); return { start: s, end: addDays(s, 6) }; } return { start: today, end: addDays(today, t.days - 1) }; };

const daysLeft = (end: string) => Math.round((Date.parse(`${end}T12:00:00`) - Date.parse(`${localToday()}T12:00:00`)) / 864e5);
function when(c: Challenge) {
  if (c.status === "upcoming") return { text: `Starts ${niceDate(c.startDate)}`, tone: "bg-info/15 text-info" };
  if (c.status === "finished") return { text: "Finished", tone: "bg-card2 text-mute" };
  const d = daysLeft(c.endDate);
  return { text: d <= 0 ? "Last day!" : `${d}d left`, tone: d <= 1 ? "bg-bad/15 text-bad" : "bg-acc/15 text-acc" };
}
const goal = (c: { metric: MetricId; target: number | null; muscle: string | null }) => `${c.target ? `Reach ${fmtMetric(c.metric, c.target)}` : "Most wins"} · ${METRIC[c.metric]?.short ?? c.metric}${c.muscle ? ` · ${c.muscle}` : ""}`;

export function Challenges() {
  const [list, setList] = useState<Challenge[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [create, setCreate] = useState<Template | "blank" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => { sx<Challenge[]>("GET", `/challenges?today=${localToday()}`).then((x) => { setList(x); setErr(null); }).catch((e) => setErr((e as Error).message)); }, []);
  useEffect(load, [load]);
  useFocusRefresh(load, 60_000);
  const sel = list?.find((c) => c.id === open) ?? null;
  async function join(c: Challenge) {
    setList((l) => (l ?? []).map((x) => (x.id === c.id ? { ...x, joined: true, canJoin: false } : x))); // optimistic
    try { await sx("POST", `/challenges/${c.id}/join`); load(); } catch (e) { setErr((e as Error).message); load(); }
  }
  const live = list?.filter((c) => c.status !== "finished") ?? [];
  const done = list?.filter((c) => c.status === "finished") ?? [];
  return (
    <>
      <section aria-labelledby="tpl">
        <h2 id="tpl" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-mute">Start one</h2>
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <li><button type="button" onClick={() => setCreate("blank")} className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-sm text-acc hover:bg-card"><Plus size={22} aria-hidden />Custom</button></li>
          {TEMPLATES.map((t) => (
            <li key={t.title}><button type="button" onClick={() => setCreate(t)} className="flex h-24 w-32 shrink-0 flex-col justify-between rounded-2xl bg-card p-3 text-left hover:bg-card2">
              <span className="text-2xl leading-none" aria-hidden>{t.emoji}</span><span className="text-sm font-semibold leading-tight">{t.title}</span>
            </button></li>
          ))}
        </ul>
      </section>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      {list == null ? <ul aria-busy className="mt-4 space-y-3">{[0, 1].map((k) => <li key={k} className="h-44 animate-pulse rounded-3xl bg-card" />)}</ul>
        : list.length === 0 ? (
          <div className="mt-4 rounded-3xl bg-card p-6 text-center"><Flag size={28} className="mx-auto text-warn" aria-hidden /><p className="mt-2 font-semibold">No challenges yet</p><p className="text-sm text-mute">Pick a template above. Friends join with one tap.</p></div>
        ) : (
          <>
            <ul className="mt-4 space-y-3">{live.map((c) => <li key={c.id}><ChallengeCard c={c} onOpen={() => setOpen(c.id)} onJoin={() => join(c)} /></li>)}</ul>
            {done.length > 0 && (
              <section className="mt-5" aria-labelledby="fin">
                <h2 id="fin" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-mute">Finished</h2>
                <ul className="space-y-3">{done.map((c) => <li key={c.id}><ChallengeCard c={c} onOpen={() => setOpen(c.id)} onJoin={() => {}} /></li>)}</ul>
              </section>
            )}
          </>
        )}
      {create && <CreateChallenge tpl={create === "blank" ? null : create} onClose={() => setCreate(null)} onDone={() => { setCreate(null); load(); }} />}
      {sel && <ChallengeSheet c={sel} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

function ChallengeCard({ c, onOpen, onJoin }: { c: Challenge; onOpen: () => void; onJoin: () => void }) {
  const mine = c.members.find((m) => m.me);
  const max = c.target ?? Math.max(1, ...c.members.map((m) => m.value));
  const w = when(c);
  const Icon = METRIC_ICON[c.metric] ?? Flag;
  const won = c.status === "finished" && mine && c.winners.includes(mine.user.id);
  const lead = c.members[0];
  return (
    <article className={cx("relative overflow-hidden rounded-3xl bg-card", won && "ring-1 ring-warn/60")}>
      {won && <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-warn/25 blur-3xl" aria-hidden />}
      <button type="button" onClick={onOpen} className="relative block w-full p-4 text-left" aria-label={`${c.title}. ${goal(c)}. ${w.text}`}>
        <div className="flex items-start gap-3">
          <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", c.status === "finished" ? "bg-card2 text-mute" : "bg-warn/15 text-warn")} aria-hidden><Icon size={22} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-bold">{c.title}</h3>
            <p className="truncate text-xs text-mute">{goal(c)}</p>
          </div>
          <span className={cx("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold num", w.tone)}>{c.status === "running" && <Hourglass size={12} aria-hidden />}{w.text}</span>
        </div>
        {won && <p className="mt-3 flex items-center gap-2 rounded-2xl bg-warn/15 px-3 py-2 text-sm font-semibold text-warn"><Trophy size={16} aria-hidden />{c.target ? "Goal smashed!" : "You won!"} 🏆</p>}
        {c.status === "finished" && !won && c.winners.length > 0 && <p className="mt-3 text-sm text-mute">🏆 {c.members.filter((m) => c.winners.includes(m.user.id)).map((m) => (m.me ? "You" : firstName(m.user))).join(", ")}</p>}

        {/* members as progress rings */}
        <ul className="mt-3 flex gap-3 pt-1" aria-label="Members">
          {c.members.slice(0, 5).map((m) => (
            <li key={m.user.id} className="flex w-12 shrink-0 flex-col items-center gap-1">
              <span className="relative">
                <Ring value={m.value} max={max} size={48} stroke={3.5} color={m.done ? "var(--color-acc)" : m.me ? "var(--color-acc)" : "var(--color-info)"}>
                  <UserAvatar id={m.user.avatarId} name={m.user.name ?? m.user.username} size={38} />
                </Ring>
                {m.rank === 1 && m.value > 0 && <Crown size={14} className="absolute -top-2 left-1/2 -translate-x-1/2 fill-current" style={{ color: MEDAL[0] }} aria-label="leading" />}
                {m.done && <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-acc text-acc-ink" aria-label="goal reached"><Check size={10} strokeWidth={3} /></span>}
              </span>
              <span className={cx("w-full truncate text-center text-[11px]", m.me ? "font-semibold text-ink" : "text-mute")}>{m.me ? "You" : firstName(m.user)}</span>
            </li>
          ))}
          {c.members.length > 5 && <li className="flex h-12 items-center text-xs text-mute">+{c.members.length - 5}</li>}
        </ul>

        {mine && c.status !== "upcoming" && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-mute">{mine.rank ? <>You're <b className="text-ink">#{mine.rank}</b>{lead && !lead.me && lead.value > mine.value ? <> · {fmtMetric(c.metric, lead.value - mine.value)} behind {firstName(lead.user)}</> : null}</> : "Get your first one in"}</span>
              <span className="font-bold num">{fmtMetric(c.metric, mine.value)}{c.target ? <span className="font-normal text-mute"> / {fmtMetric(c.metric, c.target)}</span> : null}</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-card3" role="progressbar" aria-label="Your progress" aria-valuemin={0} aria-valuemax={max} aria-valuenow={mine.value}>
              <div className={cx("h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none", mine.done ? "bg-acc" : "bg-gradient-to-r from-acc/70 to-acc")} style={{ width: `${Math.min(100, (mine.value / Math.max(1, max)) * 100)}%` }} />
            </div>
          </div>
        )}
      </button>
      {c.canJoin && (
        <div className="relative px-4 pb-4"><button type="button" onClick={onJoin} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-acc font-semibold text-acc-ink active:scale-[.98]"><Plus size={18} aria-hidden />Join</button></div>
      )}
    </article>
  );
}

function ChallengeSheet({ c, onClose, onChanged }: { c: Challenge; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const hero = useRef<HTMLDivElement>(null);
  const max = c.target ?? Math.max(1, ...c.members.map((m) => m.value));
  const mine = c.members.find((m) => m.me);
  const won = c.status === "finished" && mine && c.winners.includes(mine.user.id);
  useEffect(() => { if (won) setTimeout(() => confetti(hero.current, 30), 200); }, [won]);
  async function act(method: string, path: string, close = false) {
    setBusy(true); setErr(null);
    try { await sx(method, `/challenges/${c.id}${path}`); onChanged(); if (close) onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const w = when(c);
  return (
    <Sheet open onClose={onClose} title={c.title} icon={Flag}>
      <div ref={hero} className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", w.tone)}>{w.text}</span>
        <span className="text-mute">{goal(c)}</span>
      </div>
      <p className="mt-1 text-xs text-faint">{niceDate(c.startDate)} → {niceDate(c.endDate)} · by {c.mine ? "you" : `@${c.createdBy.username}`}</p>
      {c.status === "finished" && c.winners.length > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl p-3" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--color-warn) 22%, transparent), transparent)" }}>
          <Trophy size={26} className="text-warn" aria-hidden />
          <span className="text-sm">{won ? <b>{c.target ? "You made it! 🎉" : "You won! 🎉"}</b> : <>{c.target ? "Made it: " : "Winner: "}<b>{c.members.filter((m) => c.winners.includes(m.user.id)).map((m) => m.user.name || m.user.username).join(", ")}</b></>}</span>
        </div>
      )}
      <ol className="mt-3 space-y-2" aria-label="Standings">
        {c.members.map((m) => (
          <li key={m.user.id} className={cx("flex items-center gap-3 rounded-2xl p-2.5", m.me ? "bg-acc/10" : "bg-card2")}>
            <span className="w-5 text-center text-sm font-extrabold num" style={m.rank >= 1 && m.rank <= 3 ? { color: MEDAL[m.rank - 1] } : undefined}>{m.rank || "–"}</span>
            <Ring value={m.value} max={max} size={44} stroke={3.5} color={m.done || m.me ? "var(--color-acc)" : "var(--color-info)"}><UserAvatar id={m.user.avatarId} name={m.user.name ?? m.user.username} size={34} /></Ring>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{m.me ? "You" : m.user.name || m.user.username}{m.done && <Check size={14} className="ml-1 inline text-acc" aria-label="goal reached" />}</span>
              <span className="block text-xs text-mute num">{fmtMetric(c.metric, m.value)}{c.target ? ` of ${fmtMetric(c.metric, c.target)}` : ""}</span>
            </span>
            {!m.me && c.status === "running" && <CheerButton user={m.user} challengeId={c.id} />}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-faint">Members see each other's {METRIC[c.metric]?.label.toLowerCase()} for these dates. Nothing else.</p>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <div className="mt-4 space-y-2">
        {c.canJoin && <Btn kind="primary" icon={busy ? Loader2 : Plus} className="w-full" disabled={busy} onClick={() => act("POST", "/join")}>Join</Btn>}
        {c.joined && c.status !== "finished" && <Btn kind="soft" icon={UserPlus} className="w-full" onClick={() => setInviting(true)}>Invite friends</Btn>}
        <div className="flex gap-2">
          {c.joined && !c.mine && c.status !== "finished" && <Btn kind="ghost" icon={LogOut} className="flex-1" disabled={busy} onClick={() => confirm("Leave this challenge?") && act("DELETE", "/join", true)}>Leave</Btn>}
          {c.mine && <Btn kind="danger" icon={Trash2} className="flex-1" disabled={busy} onClick={() => confirm("Delete this challenge for everyone?") && act("DELETE", "", true)}>Delete</Btn>}
        </div>
      </div>
      {inviting && <InviteSheet exclude={c.members.map((m) => m.user.id)} onClose={() => setInviting(false)} onPick={async (ids) => { await sx("POST", `/challenges/${c.id}/invite`, { userIds: ids }); setInviting(false); }} />}
    </Sheet>
  );
}

function FriendPicker({ exclude, picked, setPicked }: { exclude: string[]; picked: string[]; setPicked: (f: (p: string[]) => string[]) => void }) {
  const [friends, setFriends] = useState<UserLite[] | null>(null);
  useEffect(() => { sx<{ friends: UserLite[] }>("GET", "/friends").then((r) => setFriends(r.friends)).catch(() => setFriends([])); }, []);
  const list = (friends ?? []).filter((f) => !exclude.includes(f.id));
  if (friends == null) return <div className="h-14 animate-pulse rounded-xl bg-card2" aria-busy />;
  if (!list.length) return <p className="text-sm text-mute">No friends to invite. <a href="#/friends" className="text-info underline">Add friends</a></p>;
  return (
    <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">{list.map((f) => {
      const on = picked.includes(f.id);
      return (
        <li key={f.id}><button type="button" role="checkbox" aria-checked={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== f.id) : [...p, f.id]))} className="flex w-16 flex-col items-center gap-1">
          <span className={cx("relative rounded-full p-[2px]", on ? "bg-acc" : "bg-transparent")}>
            <UserAvatar id={f.avatarId} name={f.name ?? f.username} size={48} />
            {on && <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-acc text-acc-ink" aria-hidden><Check size={12} strokeWidth={3} /></span>}
          </span>
          <span className="w-full truncate text-center text-[11px]">{firstName(f)}</span>
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

function CreateChallenge({ tpl, onClose, onDone }: { tpl: Template | null; onClose: () => void; onDone: () => void }) {
  const today = localToday();
  const r0 = tpl ? range(tpl) : { start: today, end: addDays(today, 27) };
  const [title, setTitle] = useState(tpl?.title ?? "");
  const [metric, setMetric] = useState<MetricId>(tpl?.metric ?? "hard_sets");
  const [mode, setMode] = useState<"most" | "target">(tpl?.target ? "target" : "most");
  const [target, setTarget] = useState(tpl?.target ? String(tpl.target) : "");
  const [muscle, setMuscle] = useState(tpl?.muscle ?? "Back");
  const [start, setStart] = useState(r0.start);
  const [end, setEnd] = useState(r0.end);
  const [vis, setVis] = useState<"friends" | "invite">("friends");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [custom, setCustom] = useState(!tpl);
  const opts = METRICS.filter((m) => m.challenge);
  async function save() {
    setBusy(true); setErr(null);
    try {
      await sx("POST", "/challenges", { id: uid(), title: title.trim() || `${METRIC[metric].label}${needsMuscle(metric) ? ` · ${muscle}` : ""}`, metric, target: mode === "target" ? Number(target) : null, muscle: needsMuscle(metric) ? muscle : null, startDate: start, endDate: end, visibility: vis, invite: picked });
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose} title={tpl ? `${tpl.emoji} ${tpl.title}` : "New challenge"} icon={tpl ? undefined : Flag}>
      {tpl && !custom ? (
        <div className="rounded-2xl bg-card2 p-3 text-sm">
          <p className="font-semibold">{goal({ metric, target: mode === "target" ? Number(target) : null, muscle: needsMuscle(metric) ? muscle : null })}</p>
          <p className="text-mute">{niceDate(start)} → {niceDate(end)} · all friends can join</p>
          <button type="button" onClick={() => setCustom(true)} className="mt-1 min-h-11 text-sm text-info">Customise</button>
        </div>
      ) : (
        <>
          <label className="block"><span className="mb-1 block text-[11px] text-mute">Name</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} dir="auto" placeholder="e.g. December back attack" className={INPUT} /></label>
          <div className="mt-3"><span className="mb-1 block text-[11px] text-mute">What counts</span>
            <Chips clearable={false} small options={opts.map((m) => ({ id: m.id, label: m.short, icon: METRIC_ICON[m.id] }))} value={metric} onChange={(v) => v && setMetric(v as MetricId)} /></div>
          {needsMuscle(metric) && (
            <label className="mt-3 block"><span className="mb-1 block text-[11px] text-mute">Muscle group</span>
              <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className={INPUT}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></label>
          )}
          <div className="mt-3"><span className="mb-1 block text-[11px] text-mute">How to win</span>
            <Chips clearable={false} options={[{ id: "most", label: "Most wins" }, { id: "target", label: "Reach a goal" }]} value={mode} onChange={(v) => setMode((v ?? "most") as "most")} />
            {mode === "target" && <input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))} placeholder={`Goal (${METRIC[metric].unit || "count"})`} aria-label="Goal" className={cx(INPUT, "mt-2")} />}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label><span className="mb-1 block text-[11px] text-mute">Start</span><input type="date" value={start} min={addDays(today, -7)} onChange={(e) => setStart(e.target.value)} className={INPUT} /></label>
            <label><span className="mb-1 block text-[11px] text-mute">End</span><input type="date" value={end} min={start} max={addDays(start, 92)} onChange={(e) => setEnd(e.target.value)} className={INPUT} /></label>
          </div>
          <div className="mt-3"><span className="mb-1 block text-[11px] text-mute">Who can join</span>
            <Chips clearable={false} options={[{ id: "friends", label: "All friends" }, { id: "invite", label: "Invited only" }]} value={vis} onChange={(v) => setVis((v ?? "friends") as "friends")} /></div>
        </>
      )}
      <div className="mt-4"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-mute">Invite</span><FriendPicker exclude={[]} picked={picked} setPicked={setPicked} /></div>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <Btn kind="primary" icon={busy ? Loader2 : Flag} className="mt-4 w-full" disabled={busy || (mode === "target" && !(Number(target) > 0))} onClick={save}>Start challenge</Btn>
    </Sheet>
  );
}
