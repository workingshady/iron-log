export const today = () => localDate(new Date());

export function localDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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
export function beep() {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  } catch {
    /* no audio */
  }
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
