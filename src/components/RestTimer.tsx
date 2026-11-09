import { useEffect, useRef, useState } from "react";
import { track } from "../lib/api";
import { beep, clock, cx, vibrate } from "../lib/util";

// Rest timer that survives refresh/lock-screen: stores the end time, not a countdown.
export interface Rest {
  sessionId: string;
  startedAt: number;
  endAt: number;
  planned: number;
  next: string;
}
const KEY = "il_rest";

export function loadRest(): Rest | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}
export function saveRest(r: Rest | null) {
  try {
    if (r) localStorage.setItem(KEY, JSON.stringify(r));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function RestTimer({ rest, setRest }: { rest: Rest | null; setRest: (r: Rest | null) => void }) {
  const [t, setT] = useState(Date.now());
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
    if (!rest) return;
    const i = setInterval(() => setT(Date.now()), 250);
    return () => clearInterval(i);
  }, [rest]);

  useEffect(() => {
    if (rest && !fired.current && t >= rest.endAt) {
      fired.current = true;
      vibrate([300, 150, 300]);
      beep();
      track("rest_done", { planned: rest.planned }, rest.sessionId);
    }
  }, [t, rest]);

  if (!rest) return null;
  const left = rest.endAt - t;
  const over = left <= 0;
  const pct = Math.min(100, ((t - rest.startedAt) / (rest.endAt - rest.startedAt)) * 100);

  const adjust = (d: number) => {
    const r = { ...rest, endAt: rest.endAt + d * 1000 };
    setRest(r);
    track("rest_adjust", { by: d }, rest.sessionId);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card safe-b md:left-60">
      <div className="h-1 bg-line">
        <div className={cx("h-1 transition-[width]", over ? "bg-acc" : "bg-info")} style={{ width: `${pct}%` }} />
      </div>
      <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className={cx("text-3xl font-bold num", over ? "text-acc" : "text-info")}>{over ? `GO · +${clock(-left)}` : clock(left)}</div>
          <div className="truncate text-xs text-mute">Resting · next: {rest.next}</div>
        </div>
        <button onClick={() => adjust(-15)} className="h-12 w-12 rounded-xl bg-card2 text-sm font-semibold">−15</button>
        <button onClick={() => adjust(15)} className="h-12 w-12 rounded-xl bg-card2 text-sm font-semibold">+15</button>
        <button
          onClick={() => {
            track("rest_skip", { at: Math.round((t - rest.startedAt) / 1000) }, rest.sessionId);
            setRest(null);
          }}
          className="h-12 rounded-xl bg-card2 px-3 text-sm font-semibold"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
