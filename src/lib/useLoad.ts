import { useCallback, useEffect, useState } from "react";
import { cache, get } from "./api";

/** GET with a localStorage fallback so screens still open offline. */
export function useLoad<T>(url: string) {
  const [data, setData] = useState<T | null>(() => cache.get<T>(url));
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    get<T>(url)
      .then((d) => {
        setData(d);
        setError(null);
        cache.set(url, d);
      })
      .catch((e) => setError((e as Error).message));
  }, [url]);
  useEffect(reload, [reload]);
  useEffect(() => {
    window.addEventListener("il:changed", reload);
    const vis = () => document.visibilityState === "visible" && reload(); // fresh data when you come back to the app
    document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("il:changed", reload); document.removeEventListener("visibilitychange", vis); };
  }, [reload]);
  return { data, error, reload, setData };
}
