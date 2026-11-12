import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { cx } from "../../lib/util";

// Voice notes: recorder (MediaRecorder + AnalyserNode for the live waveform) and player (waveform progress,
// tap/drag/arrow-key seeking, speed 1× / 1.5× / 2×). Only one note plays at a time.

export const MAX_VOICE_MS = 120_000;
const BARS = 36;
const pickMime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) ?? "";
export const fmt = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Squash any number of levels (0..1) into n bars. */
export function toBars(levels: number[], n = BARS): number[] {
  if (!levels.length) return Array(n).fill(0.08);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * levels.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / n));
    let m = 0;
    for (let j = a; j < b; j++) m = Math.max(m, levels[j] ?? 0);
    out.push(m);
  }
  const top = Math.max(...out, 0.01);
  return out.map((v) => Math.max(0.08, Math.min(1, v / top)));
}

// ---------------------------------------------------------------- recorder

export type RecState = "idle" | "rec" | "done";
export function useRecorder(onError: (msg: string) => void) {
  const [state, setState] = useState<RecState>("idle");
  const [ms, setMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const r = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; t0: number; timer: number; chunks: Blob[]; levels: number[]; cancel: boolean; resolve?: (v: { blob: Blob; ms: number; peaks: number[] } | null) => void } | null>(null);

  const cleanup = () => {
    const x = r.current;
    if (!x) return;
    clearInterval(x.timer);
    x.stream.getTracks().forEach((tr) => tr.stop());
    void x.ctx.close().catch(() => {});
  };
  useEffect(() => () => { if (r.current) { r.current.cancel = true; if (r.current.mr.state === "recording") r.current.mr.stop(); cleanup(); } }, []);

  async function start() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) { onError("Voice notes aren't supported in this browser."); return false; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch {
      onError("Microphone blocked — allow it for this site in the browser settings.");
      return false;
    }
    const mime = pickMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const x = { mr, stream, ctx, t0: Date.now(), timer: 0, chunks: [] as Blob[], levels: [] as number[], cancel: false } as NonNullable<typeof r.current>;
    r.current = x;
    mr.ondataavailable = (e) => { if (e.data.size) x.chunks.push(e.data); };
    mr.onstop = () => {
      cleanup();
      const dur = Date.now() - x.t0;
      const blob = new Blob(x.chunks, { type: (mr.mimeType || mime || "audio/webm").split(";")[0] });
      if (x.cancel) { setState("idle"); x.resolve?.(null); return; }
      if (dur < 700 || blob.size < 600) { setState("idle"); onError("Too short — hold to record."); x.resolve?.(null); return; }
      setState("done");
      x.resolve?.({ blob, ms: Math.min(dur, MAX_VOICE_MS), peaks: toBars(x.levels) });
    };
    mr.start(500);
    setMs(0); setLevels([]); setState("rec");
    x.timer = window.setInterval(() => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      x.levels.push(Math.sqrt(sum / buf.length));
      const el = Date.now() - x.t0;
      setMs(el);
      setLevels(x.levels.slice(-BARS));
      if (el >= MAX_VOICE_MS && mr.state === "recording") mr.stop();
    }, 100);
    return true;
  }
  /** Stop and get the recording (null if cancelled / too short). */
  function stop(): Promise<{ blob: Blob; ms: number; peaks: number[] } | null> {
    const x = r.current;
    if (!x || x.mr.state !== "recording") return Promise.resolve(null);
    return new Promise((res) => { x.resolve = res; x.mr.stop(); });
  }
  function cancel() {
    const x = r.current;
    if (!x) return;
    x.cancel = true;
    if (x.mr.state === "recording") x.mr.stop(); else setState("idle");
  }
  const reset = () => setState("idle");
  return { state, ms, levels, start, stop, cancel, reset };
}

export function Bars({ bars, progress = 0, className, live }: { bars: number[]; progress?: number; className?: string; live?: boolean }) {
  return (
    <span className={cx("flex h-8 items-center gap-[2px] overflow-hidden", className)} aria-hidden>
      {bars.map((v, i) => (
        <span key={i} className={cx("w-[3px] min-w-[1.5px] shrink rounded-full", live ? "bg-bad" : (i + 0.5) / bars.length <= progress ? "bg-current" : "bg-current opacity-35")}
          style={{ height: `${Math.round(8 + v * 92)}%` }} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------- player

const peakCache = new Map<string, number[]>();
const blobCache = new Map<string, string>();
let current: HTMLAudioElement | null = null;

async function loadAudio(src: string): Promise<{ url: string; peaks: number[] }> {
  if (blobCache.has(src) && peakCache.has(src)) return { url: blobCache.get(src)!, peaks: peakCache.get(src)! };
  let url = src, peaks: number[] = Array(BARS).fill(0.3);
  if (!src.startsWith("blob:")) {
    const r = await fetch(src, { credentials: "same-origin" });
    if (!r.ok) throw new Error("Couldn't load the voice note");
    const blob = await r.blob();
    url = URL.createObjectURL(blob);
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const ab = await ctx.decodeAudioData(await blob.arrayBuffer());
      void ctx.close();
      const ch = ab.getChannelData(0);
      const step = Math.max(1, Math.floor(ch.length / 400));
      const lv: number[] = [];
      for (let i = 0; i < ch.length; i += step) { let s = 0; const e = Math.min(ch.length, i + step); for (let j = i; j < e; j += 4) s += ch[j] * ch[j]; lv.push(Math.sqrt(s / ((e - i) / 4))); }
      peaks = toBars(lv);
    } catch { /* keep flat bars */ }
  }
  blobCache.set(src, url);
  peakCache.set(src, peaks);
  return { url, peaks };
}

export function VoicePlayer({ src, durationMs, peaks: given, mine, label = "voice message" }: { src: string; durationMs: number; peaks?: number[]; mine?: boolean; label?: string }) {
  const [peaks, setPeaks] = useState<number[] | null>(given ?? peakCache.get(src) ?? null);
  const [st, setSt] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle");
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState(1);
  const audio = useRef<HTMLAudioElement | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const dur = Math.max(1, durationMs);

  // fetch + decode for the waveform when the bubble scrolls into view
  useEffect(() => {
    if (peaks || !box.current) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); loadAudio(src).then((r) => setPeaks(r.peaks)).catch(() => setPeaks(Array(BARS).fill(0.3))); }
    });
    io.observe(box.current);
    return () => io.disconnect();
  }, [src, peaks]);
  useEffect(() => () => { cancelAnimationFrame(raf.current); audio.current?.pause(); }, []);

  const tick = () => {
    const a = audio.current;
    if (!a) return;
    setPos(a.currentTime * 1000);
    if (!a.paused) raf.current = requestAnimationFrame(tick);
  };
  async function ensure() {
    if (audio.current) return audio.current;
    setSt("loading");
    const { url, peaks: p } = await loadAudio(src);
    if (!given) setPeaks(p);
    const a = new Audio(url);
    a.preload = "auto";
    a.onended = () => { setSt("idle"); setPos(0); };
    a.onpause = () => { cancelAnimationFrame(raf.current); setSt((s) => (s === "playing" ? "paused" : s)); };
    a.onplay = () => { setSt("playing"); raf.current = requestAnimationFrame(tick); };
    audio.current = a;
    return a;
  }
  async function toggle() {
    try {
      const a = await ensure();
      if (!a.paused) { a.pause(); return; }
      if (current && current !== a) current.pause();
      current = a;
      a.playbackRate = rate;
      await a.play();
    } catch { setSt("error"); }
  }
  async function seek(ratio: number) {
    try {
      const a = await ensure();
      a.currentTime = Math.max(0, Math.min(1, ratio)) * (dur / 1000);
      setPos(a.currentTime * 1000);
      if (st === "loading") setSt("paused");
    } catch { setSt("error"); }
  }
  const cycle = () => { const r = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; setRate(r); if (audio.current) audio.current.playbackRate = r; };
  const progress = Math.min(1, pos / dur);
  const playing = st === "playing";

  return (
    <span ref={box} className="flex w-[min(15rem,62vw)] items-center gap-2 py-0.5">
      <button type="button" onClick={toggle} aria-label={`${playing ? "Pause" : "Play"} ${label}, ${fmt(dur)}`}
        className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", mine ? "bg-black/15" : "bg-white/10")}>
        {st === "loading" ? <Loader2 size={20} className="animate-spin" aria-hidden /> : playing ? <Pause size={20} fill="currentColor" aria-hidden /> : <Play size={20} fill="currentColor" className="translate-x-px" aria-hidden />}
      </button>
      <span className="min-w-0 flex-1">
        <span
          role="slider" tabIndex={0} aria-label={`Position in ${label}`} aria-valuemin={0} aria-valuemax={Math.round(dur / 1000)} aria-valuenow={Math.round(pos / 1000)} aria-valuetext={`${fmt(pos)} of ${fmt(dur)}`}
          className="block cursor-pointer touch-none"
          onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); void seek((e.clientX - r.left) / r.width); }}
          onKeyDown={(e) => {
            const to = e.key === "ArrowRight" || e.key === "ArrowUp" ? pos + 5000 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? pos - 5000 : e.key === "Home" ? 0 : e.key === "End" ? dur - 100 : null;
            if (to !== null) { e.preventDefault(); e.stopPropagation(); void seek(to / dur); }
            if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); void toggle(); }
          }}
        >
          <Bars bars={peaks ?? Array(BARS).fill(0.12)} progress={progress} />
        </span>
        <span className="mt-0.5 flex items-center justify-between text-[11px] tabular-nums opacity-75">
          <span>{st === "error" ? "Can't play" : fmt(playing || pos ? pos : dur)}</span>
        </span>
      </span>
      <button type="button" onClick={cycle} aria-label={`Playback speed ${rate} times. Change speed`}
        className={cx("flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums", mine ? "bg-black/10" : "bg-white/10")}>
        {rate}×
      </button>
    </span>
  );
}
