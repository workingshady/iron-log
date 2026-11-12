import { useEffect, useState } from "react";
import { get } from "./api";

/** The logged-in person (from /api/me), shared by the avatar buttons, Home greeting and Profile. */
export interface Me { id: string; username: string; name: string | null; avatarId: string | null; role?: string }

let me: Me | null = (() => { try { return JSON.parse(localStorage.getItem("il:me") ?? "null") as Me | null; } catch { return null; } })();
const subs = new Set<(m: Me | null) => void>();

export function setMe(m: Me | null) {
  me = m;
  try { localStorage.setItem("il:me", JSON.stringify(m)); } catch { /* private mode */ }
  subs.forEach((f) => f(m));
}

/** Re-read /api/me (after editing the profile or changing the avatar). */
export const refreshMe = () => get<{ user: Me | null }>("/me").then((r) => setMe(r.user)).catch(() => {});

export function useMe() {
  const [m, set] = useState(me);
  useEffect(() => { subs.add(set); return () => void subs.delete(set); }, []);
  return m;
}

/** Ask the service worker to drop cached photos (logout = privacy; delete = gone everywhere). */
export function forgetPhotos(id?: string) {
  navigator.serviceWorker?.controller?.postMessage(id ? { type: "photos:forget", id } : { type: "photos:clear" });
}
