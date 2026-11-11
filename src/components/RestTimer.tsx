import { useEffect, useRef, useState } from "react";
import { track } from "../lib/api";
import { beep, clock, cx, vibrate } from "../lib/util";
import { VOL, type RestPrefs } from "../lib/restPrefs";

// Rest timer that survives refresh/lock-screen: stores the end time, not a countdown.
export interface Rest {
  sessionId: string;
  startedAt: number;
  endAt: number;
  planned: number;
  next: string;
  /** Auto-start is off: the timer waits for a tap on Start. */
  pending?: boolean;
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

export function RestTimer({ rest, setRest, prefs }: { rest: Rest | null; setRest: (r: Rest | null) => void; prefs: RestPrefs }) {
  const [t, setT] = useState(Date.now());
  const fired = useRef(false);
  const ticked = useRef<number | null>(null);

  useEffect(() => {
    fired.current = false;
    ticked.current = null;
    if (!rest) return;
    const i = setInterval(() => setT(Date.now()), 250);
    return () => clearInterval(i);
  }, [rest]);

  useEffect(() => {
    if (!rest || rest.pending) return;
    const left = Math.ceil((rest.endAt - t) / 1000);
    // optional 3-2-1 before the end (short, quieter)
    if (prefs.countdown && prefs.sound && left >= 1 && left <= 3 && ticked.current !== left) { ticked.current = left; beep(VOL[prefs.volume] * 0.6, 660, 0.12); }
    if (!fired.current && t >= rest.endAt) {
      fired.current = true;
      if (prefs.vibrate) vibrate([300, 150, 300]);
      if (prefs.sound) beep(VOL[prefs.volume]);
      track("rest_done", { planned: rest.planned }, rest.sessionId);
    }
  }, [t, rest, prefs]);

  if (!rest) return null;
  if (rest.pending) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card safe-b md:left-60">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-info num">Rest {clock(rest.planned * 1000)}</div>
            <div className="truncate text-xs text-mute">Auto-start is off · next: {rest.next}</div>
          </div>
          <button onClick={() => { const n = Date.now(); setRest({ ...rest, pending: false, startedAt: n, endAt: n + rest.planned * 1000 }); track("rest_start_manual", { planned: rest.planned }, rest.sessionId); }} className="h-12 rounded-xl bg-info px-4 text-sm font-semibold text-black">Start</button>
          <button onClick={() => setRest(null)} className="h-12 w-12 rounded-xl bg-card2 text-sm font-semibold" aria-label="Dismiss">✕</button>
        </div>
      </div>
    );
  }
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
