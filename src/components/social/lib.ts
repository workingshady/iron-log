import { useEffect, useRef } from "react";
import { Unauthorized } from "../../lib/api";

// Social helpers. Social writes need a connection (they're about other people, not your own log), so they don't use the
// offline outbox; they also don't fire the global "data changed" event (a like shouldn't re-fetch every screen).

/** Image of a photo someone shared with you (or your own / a profile photo). Server checks friendship + visibility. */
export const socialPhotoUrl = (id: string, thumb = false) => `/api/social/photos/${encodeURIComponent(id)}/img${thumb ? "?s=t" : ""}`;

export async function sx<T = { ok: boolean }>(method: string, url: string, body?: unknown): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("You're offline. Try again when connected.");
  const r = await fetch(`/api${url}`, { method, credentials: "same-origin", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401) throw new Unauthorized();
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((out as { error?: string })?.error ?? r.statusText);
  window.dispatchEvent(new Event("il:social")); // badges / counts listen to this
  return out as T;
}

/** Local date (YYYY-MM-DD) so "this week" matches the phone's calendar. */
export const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** "now", "5m", "3h", "2d", "Nov 3" (Instagram-style relative time). */
export function ago(ms: number, long = false) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return long ? "just now" : "now";
  if (s < 3600) { const m = Math.round(s / 60); return long ? `${m} minute${m === 1 ? "" : "s"} ago` : `${m}m`; }
  if (s < 86400) { const h = Math.round(s / 3600); return long ? `${h} hour${h === 1 ? "" : "s"} ago` : `${h}h`; }
  if (s < 7 * 86400) { const d = Math.round(s / 86400); return long ? `${d} day${d === 1 ? "" : "s"} ago` : `${d}d`; }
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(Date.now() - ms > 300 * 864e5 ? { year: "numeric" } : {}) });
}
export const fullTime = (ms: number) => new Date(ms).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export function lastSeen(ms: number | null | undefined) {
  if (!ms) return null;
  const s = (Date.now() - ms) / 1000;
  return s < 180 ? "Active now" : `Active ${ago(ms, true)}`;
}

export const fmtNum = (n: number) => n.toLocaleString("en-US");
export const kgShort = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)} t` : `${fmtNum(n)} kg`);

export const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Run `f` when the app comes back to the foreground, and every `everyMs` while visible. */
export function useFocusRefresh(f: () => void, everyMs?: number) {
  const ref = useRef(f);
  ref.current = f;
  useEffect(() => {
    const vis = () => document.visibilityState === "visible" && ref.current();
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", vis);
    const iv = everyMs ? setInterval(() => document.visibilityState === "visible" && ref.current(), everyMs) : null;
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", vis); if (iv) clearInterval(iv); };
  }, [everyMs]);
}

/** Pull-to-refresh at the top of the page (touch). Returns the current pull distance for an indicator. */
export function usePullRefresh(onRefresh: () => Promise<unknown> | void, setPull: (n: number) => void) {
  useEffect(() => {
    let y0: number | null = null, d = 0;
    const start = (e: TouchEvent) => { y0 = window.scrollY <= 0 ? e.touches[0].clientY : null; d = 0; };
    const move = (e: TouchEvent) => { if (y0 == null) return; d = Math.max(0, Math.min(110, (e.touches[0].clientY - y0) * 0.5)); setPull(d); };
    const end = () => { if (y0 != null && d >= 64) void onRefresh(); y0 = null; d = 0; setPull(0); };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    return () => { window.removeEventListener("touchstart", start); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", end); };
  }, [onRefresh, setPull]);
}

export const INPUT = "min-h-11 w-full rounded-xl bg-card2 px-3 text-sm text-ink outline-none placeholder:text-faint focus:ring-2 focus:ring-acc";
