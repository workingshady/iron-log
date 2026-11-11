export const today = () => localDate(new Date());

export function localDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "8:05 PM" — 12-hour clock with AM/PM. */
export const time12 = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

export const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function clock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function niceDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function restLabel(s: number) {
  if (!s) return "no rest → partner";
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

export const kg = (n: number | null | undefined) => (n == null ? "" : `${+n.toFixed(2)}`);

export function roundTo(n: number, step: number) {
  return Math.max(0, Math.round(n / step) * step);
}

export function vibrate(p: number | number[]) {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* unsupported */
  }
}

let ctx: AudioContext | null = null;
/** iOS only allows sound after a user tap: call this inside a tap handler once. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* no audio */
  }
}
export function beep(volume = 0.25, freq = 880, seconds = 0.5) {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(Math.max(0.001, volume), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + seconds);
  } catch {
    /* no audio */
  }
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * Continuous colour scale for heatmaps / bars: t ∈ [0,1] → the token colour mixed into the card background.
 * 0 stays faint (but visible), 1 is the full colour — so 2 g vs 5 g of creatine, or 8 vs 25 sets, look different.
 */
export function heat(t: number, token = "--color-acc", floor = 18) {
  const p = Math.round(floor + (100 - floor) * Math.max(0, Math.min(1, t)));
  return `color-mix(in srgb, var(${token}) ${p}%, var(--color-card2))`;
}
