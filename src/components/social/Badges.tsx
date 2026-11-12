import { useCallback, useEffect, useState } from "react";
import { Bell, Users } from "lucide-react";
import { cx } from "../../lib/util";
import { sx, useFocusRefresh } from "./lib";

/** Unread notifications (+ pending friend requests) for nav badges. Polls every 60 s while visible and on focus. */
let shared = { count: 0, requests: 0 };
const subs = new Set<(v: typeof shared) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
async function poll() {
  try { shared = await (await fetch("/api/notifications/unread", { credentials: "same-origin" })).json(); subs.forEach((f) => f(shared)); } catch { /* offline */ }
}
export function useUnread() {
  const [v, setV] = useState(shared);
  useEffect(() => {
    subs.add(setV);
    if (subs.size === 1) { void poll(); timer = setInterval(() => document.visibilityState === "visible" && void poll(), 60_000); }
    const on = () => void poll();
    window.addEventListener("il:social", on);
    return () => { subs.delete(setV); window.removeEventListener("il:social", on); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
  }, []);
  useFocusRefresh(useCallback(() => void poll(), []));
  return v;
}
/** Force a refresh (e.g. after marking notifications read). */
export const refreshUnread = () => void poll();

/** Small red count dot for a nav icon. Renders nothing at 0. Put it inside a `relative` wrapper around the icon. */
export function UnreadBadge({ className }: { className?: string }) {
  const { count } = useUnread();
  if (!count) return null;
  return (
    <span className={cx("absolute -right-1.5 -top-1 min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] font-bold leading-[18px] text-black num", className)} aria-label={`${count} new`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Heart/bell button for a page header (Feed, Home): opens #/notifications, shows the unread count. */
export function NotifBell() {
  const { count } = useUnread();
  return (
    <a href="#/notifications" className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label={count ? `Activity, ${count} new` : "Activity"}>
      <Bell size={24} aria-hidden />
      {count > 0 && <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-bad px-1 text-center text-[10px] font-bold leading-[18px] text-black num" aria-hidden>{count > 99 ? "99+" : count}</span>}
    </a>
  );
}

/** "12 friends" link for your own Profile (stats row or under the bio). Shows pending requests too. */
export function FriendsCount({ className }: { className?: string }) {
  const [n, setN] = useState<number | null>(null);
  const { requests } = useUnread();
  const load = useCallback(() => { sx<{ friends: unknown[] }>("GET", "/friends").then((r) => setN(r.friends.length)).catch(() => {}); }, []);
  useEffect(load, [load]);
  useFocusRefresh(load);
  return (
    <a href="#/friends" className={cx("inline-flex min-h-11 items-center gap-1.5 text-sm", className)}>
      <Users size={16} className="text-mute" aria-hidden />
      <span className="font-semibold num">{n ?? "–"}</span><span className="text-mute">friend{n === 1 ? "" : "s"}</span>
      {requests > 0 && <span className="ml-1 rounded-full bg-bad/15 px-2 py-0.5 text-[11px] font-semibold text-bad">{requests} request{requests === 1 ? "" : "s"}</span>}
    </a>
  );
}
