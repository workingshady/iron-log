import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Crown, Flame, Info, LogOut, TrendingUp } from "lucide-react";
import { GROUPS } from "../../../program/groups";
import { METRIC, METRICS, needsMuscle, type Board, type BoardRow, type MetricId, type Period } from "../../../shared/social";
import { cx } from "../../lib/util";
import { Sparkline } from "../Chart";
import { Btn, Sheet } from "../ui";
import { UserAvatar } from "./UserAvatar";
import { CheerButton, JoinGate, METRIC_ICON, fmtMetric } from "./compete-shared";
import { firstName, localToday, sx, useFocusRefresh } from "./lib";
import { MEDAL } from "./viz";

// Leaderboard (Strava club board + Duolingo league feel): podium for the top 3, every row has a bar against the leader,
// an 8-week sparkline and a streak flame; your row is highlighted with a concrete "X to pass Omar" nudge. Opt-in with
// reciprocity, zero = "getting started" (never last place), cheers instead of taunts.
const PERIODS: { id: Period; label: string }[] = [{ id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "all", label: "All time" }];
const BOARD_METRICS = METRICS.filter((m) => m.id !== "cardio_sessions" && m.id !== "muscle_volume");

export function Leaderboard() {
  const [metric, setMetric] = useState<MetricId>(() => (sessionStorage.getItem("il:metric") as MetricId) || "workouts");
  const [period, setPeriod] = useState<Period>("week");
  const [muscle, setMuscle] = useState("Back");
  const [b, setB] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  useEffect(() => { try { sessionStorage.setItem("il:metric", metric); } catch { /* ignore */ } }, [metric]);
  const url = `/compete/board?metric=${metric}&period=${period}&today=${localToday()}${needsMuscle(metric) ? `&muscle=${encodeURIComponent(muscle)}` : ""}`;
  const load = useCallback(() => { sx<Board>("GET", url).then((x) => { setB(x); setErr(null); }).catch((e) => setErr((e as Error).message)); }, [url]);
  useEffect(load, [load]);
  useFocusRefresh(load, 60_000);
  const loading = !b || b.metric !== metric || (metric !== "streak" && b.period !== period);

  async function leave() { try { await sx("PUT", "/privacy", { leaderboard: false }); load(); } catch (e) { setErr((e as Error).message); } }

  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="What counts">
        {BOARD_METRICS.map((x) => {
          const Icon = METRIC_ICON[x.id];
          const on = metric === x.id;
          return (
            <button key={x.id} type="button" role="radio" aria-checked={on} onClick={() => setMetric(x.id)}
              className={cx("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors", on ? "bg-ink font-semibold text-bg" : "bg-card text-mute hover:bg-card2")}>
              <Icon size={15} aria-hidden />{x.short}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {metric !== "streak" ? (
          <div role="radiogroup" aria-label="Period" className="flex flex-1 rounded-xl bg-card p-1">
            {PERIODS.map((p) => <button key={p.id} type="button" role="radio" aria-checked={period === p.id} onClick={() => setPeriod(p.id)} className={cx("min-h-10 flex-1 rounded-lg text-sm", period === p.id ? "bg-card3 font-semibold" : "text-mute")}>{p.label}</button>)}
          </div>
        ) : <p className="flex-1 px-1 text-sm text-mute">Weeks in a row with 2+ sessions</p>}
        {needsMuscle(metric) && (
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className="min-h-12 max-w-32 rounded-xl bg-card px-2 text-sm" aria-label="Muscle group">
            {GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        )}
        <button type="button" onClick={() => setInfo(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mute hover:bg-card2" aria-label="How it's counted"><Info size={20} aria-hidden /></button>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}

      {b == null ? <BoardSkeleton /> : !b.joined ? <JoinGate onJoined={load} /> : (
        <div className={cx("transition-opacity", loading && "opacity-50")}>
          <Podium rows={b.rows} metric={metric} />
          <Nudge rows={b.rows} metric={metric} />
          <ol className="mt-3 space-y-1.5" aria-label={`${METRIC[metric].label} ranking`}>
            {b.rows.map((r) => <Row key={r.user.id} r={r} metric={metric} max={Math.max(1, ...b.rows.map((x) => x.value))} />)}
          </ol>
          {b.rows.length <= 1 && <p className="mt-4 text-center text-sm text-mute">Just you so far. Invite your gym buddies 💪</p>}
          {b.hidden > 0 && <p className="mt-3 text-center text-xs text-faint">{b.hidden} friend{b.hidden === 1 ? " hasn't" : "s haven't"} joined yet</p>}
        </div>
      )}
      {info && (
        <Sheet open onClose={() => setInfo(false)} title="How it's counted" icon={Info}>
          <ul className="space-y-2.5 text-sm">{BOARD_METRICS.map((x) => { const I = METRIC_ICON[x.id]; return <li key={x.id} className="flex gap-2.5"><I size={16} className="mt-0.5 shrink-0 text-mute" aria-hidden /><span><b>{x.label}</b> <span className="text-mute">{x.help}</span></span></li>; })}</ul>
          <p className="mt-3 text-xs text-faint">From what you log, any plan. Weeks run Sat → Fri. Lines = last 8 weeks.</p>
          {b?.joined && <Btn kind="danger" icon={LogOut} className="mt-4 w-full" onClick={() => { setInfo(false); void leave(); }}>Leave the leaderboard</Btn>}
        </Sheet>
      )}
    </>
  );
}

function Podium({ rows, metric }: { rows: BoardRow[]; metric: MetricId }) {
  const top = rows.filter((r) => r.rank > 0).slice(0, 3);
  if (top.length < 2) return null;
  const order = [top[1], top[0], top[2]];
  const h = [64, 92, 48];
  return (
    <section aria-label="Top 3" className="mt-4 grid grid-cols-3 items-end gap-2 px-1">
      {order.map((r, i) => {
        if (!r) return <span key={i} />;
        const medal = MEDAL[r.rank - 1] ?? MEDAL[2];
        const first = r.rank === 1;
        return (
          <a key={r.user.id} href={r.me ? "#/profile" : `#/u/${encodeURIComponent(r.user.username)}`} className="flex min-w-0 flex-col items-center" aria-label={`Rank ${r.rank}: ${r.me ? "you" : r.user.name || r.user.username}, ${fmtMetric(metric, r.value)}`}>
            {first && <Crown size={22} className="mb-0.5 fill-current" style={{ color: medal }} aria-hidden />}
            <span className="rounded-full p-[3px]" style={{ background: medal }}>
              <span className="block rounded-full bg-bg p-[2px]"><UserAvatar id={r.user.avatarId} name={r.user.name ?? r.user.username} size={first ? 64 : 50} /></span>
            </span>
            <span className={cx("mt-1.5 w-full truncate text-center text-sm", r.me ? "font-bold text-acc" : "font-semibold")}>{r.me ? "You" : firstName(r.user)}</span>
            <span className="text-xs text-mute num">{fmtMetric(metric, r.value)}</span>
            <span className="mt-1.5 flex w-full items-start justify-center rounded-t-2xl pt-2 text-lg font-extrabold num"
              style={{ height: h[i], background: `linear-gradient(to bottom, color-mix(in srgb, ${medal} 45%, var(--color-card2)), var(--color-card))`, color: medal }} aria-hidden>{r.rank}</span>
          </a>
        );
      })}
    </section>
  );
}

/** One concrete, reachable goal: the gap to the person right above you (or your lead when you're #1). */
function Nudge({ rows, metric }: { rows: BoardRow[]; metric: MetricId }) {
  const i = rows.findIndex((r) => r.me);
  const me = rows[i];
  if (!me || rows.length < 2) return null;
  const above = [...rows.slice(0, i)].reverse().find((r) => r.value > me.value);
  const below = rows.find((r) => !r.me && r.value < me.value);
  let text: React.ReactNode, pct = 1;
  if (!me.value) { text = <>Log a session to get on the board</>; pct = 0; }
  else if (above) { text = <><b className="num">{fmtMetric(metric, above.value - me.value)}</b> to pass <b>{firstName(above.user)}</b></>; pct = me.value / above.value; }
  else if (below) text = <>You lead by <b className="num">{fmtMetric(metric, me.value - below.value)}</b> 🔥</>;
  else text = <>Tied at the top. Break it!</>;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl bg-acc/10 px-3 py-2.5 ring-1 ring-acc/30" role="status">
      <TrendingUp size={20} className="shrink-0 text-acc" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm">{text}</div>
        {above && <div className="mt-1.5 h-1.5 rounded-full bg-card3"><div className="h-full rounded-full bg-acc" style={{ width: `${Math.max(4, pct * 100)}%` }} /></div>}
      </div>
      <span className="shrink-0 text-2xl font-extrabold text-acc num" aria-label={`You're number ${me.rank || "unranked"}`}>#{me.rank || "–"}</span>
    </div>
  );
}

function Row({ r, metric, max }: { r: BoardRow; metric: MetricId; max: number }) {
  const move = r.rank && r.prevRank ? r.prevRank - r.rank : null;
  const medal = r.rank >= 1 && r.rank <= 3 ? MEDAL[r.rank - 1] : null;
  return (
    <li className={cx("flex min-h-16 items-center gap-2.5 rounded-2xl py-2 pl-2.5 pr-1", r.me ? "bg-acc/10 ring-1 ring-acc/40" : "bg-card")} aria-current={r.me ? "true" : undefined}>
      <span className="flex w-7 shrink-0 flex-col items-center">
        <span className="text-base font-extrabold num" style={medal ? { color: medal } : undefined} aria-label={r.rank ? `Rank ${r.rank}` : "Not ranked yet"}>{r.rank || "–"}</span>
        {move != null && move !== 0 && (move > 0 ? <ArrowUp size={12} className="text-acc" aria-label={`up ${move}`} /> : <ArrowDown size={12} className="text-faint" aria-label={`down ${-move}`} />)}
      </span>
      <a href={r.me ? "#/profile" : `#/u/${encodeURIComponent(r.user.username)}`} className="flex min-w-0 flex-1 items-center gap-2.5">
        <UserAvatar id={r.user.avatarId} name={r.user.name ?? r.user.username} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{r.me ? "You" : r.user.name || r.user.username}</span>
            {(r.streak ?? 0) >= 2 && <span className="inline-flex shrink-0 items-center text-xs font-semibold text-warn num" aria-label={`${r.streak} week streak`}><Flame size={13} className="fill-warn" aria-hidden />{r.streak}</span>}
          </span>
          <span className="mt-1.5 block h-1.5 rounded-full bg-card3/70"><span className={cx("block h-full rounded-full", r.me ? "bg-acc" : "bg-mute/70")} style={{ width: `${r.value ? Math.max(3, (r.value / max) * 100) : 0}%`, ...(medal && !r.me ? { background: medal } : {}) }} /></span>
        </span>
      </a>
      <span className="flex w-16 shrink-0 flex-col items-end gap-0.5">
        <span className={cx("text-sm font-bold num", !r.value && "text-faint")}>{r.value ? fmtMetric(metric, r.value) : "–"}</span>
        {r.trend && r.trend.some(Boolean) && <Sparkline values={r.trend} w={48} h={16} tone={r.me ? "var(--color-acc)" : "var(--color-mute)"} />}
      </span>
      {!r.me ? <CheerButton user={r.user} /> : <span className="w-11" />}
    </li>
  );
}

function BoardSkeleton() {
  return (
    <div aria-busy aria-label="Loading leaderboard">
      <div className="mt-4 grid grid-cols-3 items-end gap-2">{[64, 92, 48].map((h, i) => <div key={i} className="flex flex-col items-center gap-2"><span className="h-14 w-14 animate-pulse rounded-full bg-card2" /><span className="w-full animate-pulse rounded-t-2xl bg-card" style={{ height: h }} /></div>)}</div>
      <ul className="mt-3 space-y-1.5">{[0, 1, 2].map((k) => <li key={k} className="h-16 animate-pulse rounded-2xl bg-card" />)}</ul>
    </div>
  );
}
