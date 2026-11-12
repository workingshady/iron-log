import { useEffect, useState } from "react";
import { get } from "./api";

/**
 * Unread counts for the nav badges: activity (likes, comments, requests, cheers) + chat messages.
 * Polls every 60 s and whenever the app comes back to the foreground; silent when offline or an endpoint is missing.
 */
export function useBadges(enabled: boolean) {
  const [b, setB] = useState({ notifications: 0, chats: 0, total: 0 });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const one = (url: string) => get<{ count: number }>(url).then((r) => r.count ?? 0).catch(() => 0);
    const load = async () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      const [n, c] = await Promise.all([one("/notifications/unread"), one("/chats/unread")]);
      if (alive) setB({ notifications: n, chats: c, total: n + c });
    };
    load();
    const t = setInterval(load, 60_000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("il:badges", load);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); window.removeEventListener("il:badges", load); };
  }, [enabled]);
  return b;
}

/** Ask the nav to refresh its badges now (after reading a chat / opening Activity). */
export const refreshBadges = () => window.dispatchEvent(new Event("il:badges"));
