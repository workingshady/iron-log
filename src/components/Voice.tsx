import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { track } from "../lib/api";
import { cx } from "../lib/util";

/** Voice notes language. "auto" = Arabic, English or both mixed in one sentence (Whisper, with a mixed prompt). */
export type VoiceLang = "auto" | "ar" | "en";
const KEY = "il.voiceLang";
export const VOICE_LANGS: { id: VoiceLang; label: string; hint: string }[] = [
  { id: "auto", label: "عربي + English", hint: "Mixed — best for Egyptian Arabic with gym words in English" },
  { id: "ar", label: "عربي", hint: "Arabic only" },
  { id: "en", label: "English", hint: "English only" },
];
export function getVoiceLang(): VoiceLang {
  try { const v = localStorage.getItem(KEY); return v === "ar" || v === "en" ? v : "auto"; } catch { return "auto"; }
}
export function setVoiceLang(v: VoiceLang) {
  try { localStorage.setItem(KEY, v); } catch { /* private mode */ }
}

const MAX_S = 120;
const pickMime = () => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) ?? "";

/** Phone's own speech recognizer — used only when offline (one language at a time, no mixing). */
function browserSpeech(lang: VoiceLang, onText: (t: string) => void, onEnd: (err?: string) => void) {
  type SR = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void };
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return onEnd("Offline — use the mic on your keyboard.");
  const r = new Ctor();
  r.lang = lang === "en" ? "en-US" : "ar-EG";
  r.interimResults = false;
  r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(" "));
  r.onend = () => onEnd();
  r.onerror = () => onEnd("Voice didn't work — use the mic on your keyboard.");
  r.start();
}

/**
 * Tap to record, tap again to stop → text is added to the note.
 * Online: Whisper on Cloudflare (Arabic, English and mixed). Offline: the phone's recognizer.
 */
export function VoiceButton({ onText, className, label }: { onText: (t: string) => void; className?: string; label?: boolean }) {
  const [st, setSt] = useState<"idle" | "rec" | "busy">("idle");
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => { clearInterval(timer.current); rec.current?.stream.getTracks().forEach((x) => x.stop()); }, []);
  useEffect(() => { if (!err) return; const id = setTimeout(() => setErr(null), 4000); return () => clearTimeout(id); }, [err]);

  async function start() {
    setErr(null);
    const lang = getVoiceLang();
    if (!navigator.onLine || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSt("rec");
      browserSpeech(lang, (t) => { onText(t); track("voice_note", { via: "browser", lang, ok: 1 }); }, (e) => { setSt("idle"); if (e) setErr(e); });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch {
      setErr("Mic blocked — allow the microphone for this site in Chrome settings.");
      return;
    }
    const mime = pickMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    const chunks: Blob[] = [];
    const t0 = Date.now();
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      clearInterval(timer.current);
      stream.getTracks().forEach((x) => x.stop());
      const secs = Math.round((Date.now() - t0) / 1000);
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      if (secs < 1 || blob.size < 800) { setSt("idle"); setErr("Too short — tap, talk, then tap again."); return; }
      setSt("busy");
      try {
        const r = await fetch(`/api/transcribe?lang=${lang}`, { method: "POST", body: blob, headers: { "Content-Type": blob.type }, credentials: "same-origin" });
        const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string; lang?: string };
        if (!r.ok || j.error) throw new Error(j.error ?? "Couldn't transcribe — try again or type it.");
        if (j.text) onText(j.text);
        else setErr("Didn't catch anything — try again a bit closer.");
        track("voice_note", { via: "whisper", lang, detected: j.lang, sec: secs, chars: j.text?.length ?? 0, ok: 1 });
      } catch (e) {
        setErr((e as Error).message || "Couldn't transcribe.");
        track("voice_note", { via: "whisper", lang, sec: secs, ok: 0 });
      }
      setSt("idle");
    };
    rec.current = mr;
    mr.start(1000);
    setSec(0);
    setSt("rec");
    timer.current = window.setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      setSec(s);
      if (s >= MAX_S) mr.state === "recording" && mr.stop();
    }, 250);
  }
  function stop() {
    if (rec.current?.state === "recording") rec.current.stop();
  }

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => (st === "idle" ? start() : st === "rec" ? stop() : undefined)}
        disabled={st === "busy"}
        className={cx(
          "flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm",
          st === "rec" ? "animate-pulse bg-bad font-semibold text-black" : st === "busy" ? "bg-card3 text-mute" : "bg-card2 text-info",
          className,
        )}
        aria-label={st === "rec" ? "Stop recording" : "Speak a note"}
      >
        {st === "rec" ? <Square size={15} fill="currentColor" /> : st === "busy" ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
        {st === "rec" ? <span className="num">{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}</span> : st === "busy" ? (label ? "Writing…" : null) : label ? "Speak" : null}
      </button>
      {err && <span role="status" className="absolute bottom-full right-0 z-20 mb-1 w-56 rounded-lg bg-card3 px-2.5 py-1.5 text-[11px] text-ink shadow-lg">{err}</span>}
    </span>
  );
}

/** Adds spoken text to existing text with a space (or new line for long notes). */
export const appendText = (prev: string | null | undefined, add: string) => {
  const p = (prev ?? "").trimEnd();
  return p ? `${p}${p.length > 80 ? "\n" : " "}${add}` : add;
};
