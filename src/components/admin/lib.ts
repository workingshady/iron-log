import { useCallback, useEffect, useState } from "react";
import { Unauthorized } from "../../lib/api";

// Admin data helpers. Admin calls are online-only (no offline outbox, no "data changed" broadcast): they read
// aggregates about everyone, and the few writes (suspend, revoke, delete) must be confirmed by the server.

export const tzOff = () => -new Date().getTimezoneOffset();

export async function ax<T = { ok: boolean }>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${url}`, { method, credentials: "same-origin", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401) throw new Unauthorized();
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((out as { error?: string })?.error ?? r.statusText);
  return out as T;
}

/** GET that keeps the previous data while it refetches (no skeleton flash on refresh). */
export function useAdmin<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    if (!url) return;
    setBusy(true);
    ax<T>("GET", url).then((d) => { setData(d); setError(null); }).catch((e) => setError((e as Error).message)).finally(() => setBusy(false));
  }, [url]);
  useEffect(load, [load]);
  return { data, error, busy, reload: load };
}

export const fmt = (n: number) => n.toLocaleString("en-US");
/** 1,284 / 12.9K / 4.2M */
export function compact(n: number) {
  const a = Math.abs(n);
  if (a < 10_000) return fmt(Math.round(n));
  if (a < 1_000_000) return `${+(n / 1000).toFixed(a < 100_000 ? 1 : 0)}K`;
  return `${+(n / 1_000_000).toFixed(1)}M`;
}
export function bytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(b < 10 * 1024 ? 1 : 0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}
/** "Nov 3" from YYYY-MM-DD (or a month "2026-11" → "Nov 26"). */
export function shortDay(iso: string) {
  if (iso.length === 7) { const [y, m] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) + ` '${String(y).slice(2)}`; }
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
export const when = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
export function ago(ms: number | null | undefined) {
  if (!ms) return "never";
  const s = (Date.now() - ms) / 1000;
  if (s < 180) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 60 * 86400) return `${Math.round(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}
/** Human label for an events.type ("session_start" → "Session start"). */
export const evLabel = (s: string) => (s === "pr" ? "PR logged" : (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, " "));

export type Tone = "good" | "warn" | "bad" | "info";
export type Day = { d: string; n: number };
export type Kpis = {
  users: number; suspended: number; activeToday: number; active7: number; active30: number; workoutsWeek: number; workoutsPrev: number;
  setsWeek: number; setsPrev: number; posts: number; photos: number; messagesToday: number; messagesYesterday: number; push: number;
  storageBytes: number; storageLimit: number; storageExact: boolean;
};
export type Board = { id: string; username: string; name: string | null; avatarId: string | null; workouts7: number; workouts30: number; sets7: number; sets30: number; volume30: number; prs30: number; activeDays30: number; weeks: number[]; lastActive: string | null };
export type Overview = {
  today: string; kpis: Kpis; insights: { tone: Tone; text: string }[];
  dau: Day[]; workoutsDaily: Day[]; weeks: { start: string; sets: number; volume: number; workouts: number }[]; messagesDaily: Day[]; postsDaily: Day[];
  signups: { m: string; n: number; total: number }[]; features: { type: string; n: number; users: number }[];
  heatmap: { wd: number; h: number; n: number }[]; plans: { name: string; template: string; users: number }[];
  leaderboard: Board[]; weekStarts: string[]; consistency: { weeks: number; users: number }[];
};
export type UserRow = {
  id: string; username: string; name: string | null; avatarId: string | null; role: string; email: string | null; google: boolean; createdAt: number;
  lastSeen: number | null; lastLogin: number | null; workouts: number; sets: number; prs: number; photos: number; posts: number; friends: number; devices: number; plan: string | null; me: boolean;
};
export type Invite = { code: string; uses: number; maxUses: number; expiresAt: number | null; createdAt: number; active: boolean };
export type UserDetail = {
  user: { id: string; username: string; name: string | null; avatarId: string | null; role: string; email: string | null; google: boolean; createdAt: number; lastSeenAt: number | null; me: boolean };
  plan: { name: string; template: string } | null;
  privacy: { profile: string; workouts: string; photos: string; body: string; leaderboard: boolean };
  bodyweight: { date: string; kg: number } | null;
  counts: Record<string, number>;
  weeks: { start: string; workouts: number; missed: number; sets: number; volume: number; prs: number }[];
  activity: Day[]; features: { type: string; n: number }[]; invites: Invite[];
  logins: { last: number | null; prev: number | null }; devices: { ua: string; createdAt: number; lastOkAt: number | null }[];
  storage: { photoBytes: number; mediaBytes: number };
};
export type SecurityData = {
  invites: (Invite & { creator: string })[]; resets: { username: string; used: boolean; expiresAt: number; createdAt: number }[];
  lockouts: { key: string; fails: number; until: number | null; at: number; locked: boolean }[];
  signIns: { username: string; name: string | null; avatarId: string | null; at: number; which: string }[];
};
export type SystemData = {
  mode: string; storage: { bytes: number; exact: boolean; limit: number; photoBytes: number; mediaBytes: number };
  tables: { name: string; rows: number; estBytes: number }[]; pushSubscriptions: number;
  chats: { total: number; active7: number; byKind: { kind: string; n: number }[] };
  app: { program: string; programName: string; latest: { id: string; date: string; title: string } | null };
  versions: { id: string; users: number; sessions: number; last: string }[];
};
