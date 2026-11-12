import { useState } from "react";
import { Activity, Check, Clock3, Dumbbell, Flame, Footprints, HeartPulse, Layers, Loader2, Target, Trophy, Weight, Zap, type LucideIcon } from "lucide-react";
import type { MetricId, UserLite } from "../../../shared/social";
import { cx } from "../../lib/util";
import { fmtNum, kgShort, sx } from "./lib";

export const METRIC_ICON: Record<MetricId, LucideIcon> = {
  workouts: Dumbbell, consistency: Target, hard_sets: Layers, volume: Weight, minutes: Clock3, streak: Flame, prs: Trophy,
  cardio_minutes: HeartPulse, cardio_sessions: Footprints, muscle_sets: Activity, muscle_volume: Weight,
};

export const fmtMetric = (m: MetricId, v: number) =>
  m === "volume" || m === "muscle_volume" ? kgShort(v) : m === "consistency" ? `${v}%` : m === "streak" ? `${v} wk` : m === "minutes" || m === "cardio_minutes" ? `${fmtNum(v)} min` : fmtNum(v);

/** Reciprocity gate: you see the board (and lift comparisons) once you join it yourself. */
export function JoinGate({ onJoined }: { onJoined: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function join() {
    setBusy(true);
    try { await sx("PUT", "/privacy", { leaderboard: true }); onJoined(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="relative mt-3 overflow-hidden rounded-3xl bg-card p-6 text-center">
      <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full bg-warn/20 blur-3xl" aria-hidden />
      <div className="relative">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warn text-black" aria-hidden><Trophy size={30} /></span>
        <h2 className="mt-3 text-xl font-bold">Compete with friends</h2>
        <p className="mx-auto mt-1 max-w-[16rem] text-sm text-mute">Only friends who joined see totals and lifts. Never notes, pain or weight. Leave any time.</p>
        {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
        <button type="button" onClick={join} disabled={busy} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-acc font-semibold text-acc-ink disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Check size={18} aria-hidden />}Join the board
        </button>
      </div>
    </div>
  );
}

/** Kudos for the week: 1 per friend per day → they get a notification. */
export function CheerButton({ user, challengeId, label }: { user: UserLite; challengeId?: string; label?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  async function cheer(e: React.MouseEvent) {
    e.stopPropagation();
    setState("busy");
    try { await sx("POST", `/cheer/${encodeURIComponent(user.id)}`, { challengeId }); setMsg(`Cheered ${user.username}`); navigator.vibrate?.(10); }
    catch (er) { setMsg((er as Error).message); }
    setState("done");
  }
  return (
    <>
      <button type="button" onClick={cheer} disabled={state !== "idle"} title={msg ?? undefined}
        className={cx(label ? "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold" : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full", state === "done" ? "text-warn" : label ? "bg-warn/15 text-warn" : "text-mute hover:bg-card2 hover:text-warn")}
        aria-label={state === "done" ? `Cheered ${user.username}` : `Cheer ${user.username} on`}>
        {state === "busy" ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Zap size={18} className={state === "done" ? "fill-warn" : ""} aria-hidden />}
        {label && (state === "done" ? "Cheered" : label)}
      </button>
      <span className="sr-only" role="status">{msg ?? ""}</span>
    </>
  );
}
