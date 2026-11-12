import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ImagePlus, Keyboard, Mic, Pencil, Reply, SendHorizontal, Smile, Square, Trash2, X } from "lucide-react";
import { cx } from "../../lib/util";
import { displayName, editMessage, getDraft, sendImage, sendSticker, sendText, sendTyping, sendVoice, setDraft, type ChatUser, type Msg } from "../../lib/chat";
import { PhotoEditor, type Edited } from "../PhotoEditor";
import { snippet } from "./Bubble";
import { Tray } from "./Tray";
import { Bars, fmt, MAX_VOICE_MS, toBars, useRecorder, VoicePlayer } from "./Voice";

const desktop = () => typeof matchMedia !== "undefined" && matchMedia("(hover: hover) and (pointer: fine)").matches;
const MAX = 4000;

/**
 * Message input: grows with the text, Enter sends on desktop (Shift+Enter = new line; on phones Enter = new line),
 * emoji / sticker tray, photo (→ PhotoEditor → caption → send), voice note (hold to record & release to send, slide left
 * to cancel; or tap to lock → stop → preview → send), reply + edit bars.
 */
export function Composer({ convId, members, meId, replyTo, onCancelReply, editing, onCancelEdit, onSent, onError, onTray }: {
  convId: string; members: ChatUser[]; meId: string;
  replyTo: Msg | null; onCancelReply: () => void;
  editing: Msg | null; onCancelEdit: () => void;
  onSent: () => void; onError: (msg: string) => void; onTray?: (open: boolean) => void;
}) {
  const [text, setText] = useState(() => getDraft(convId));
  const [tray, setTray] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<Edited | null>(null);
  const [voice, setVoice] = useState<{ blob: Blob; ms: number; peaks: number[]; url: string } | null>(null);
  const [mode, setMode] = useState<"hold" | "locked" | null>(null);
  const [slide, setSlide] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const hold = useRef<{ down: boolean; x: number; t0: number } | null>(null);
  const rec = useRecorder(onError);

  useEffect(() => { onTray?.(tray); }, [tray, onTray]);
  // editing: load the message text; leaving edit mode restores the draft
  useEffect(() => {
    if (editing) { setText(editing.text ?? ""); requestAnimationFrame(() => ta.current?.focus()); }
    else setText(getDraft(convId));
  }, [editing, convId]);
  useEffect(() => { if (replyTo) ta.current?.focus(); }, [replyTo]);
  useEffect(() => { if (!editing) setDraft(convId, text); }, [text, editing, convId]);
  // auto-grow
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
  }, [text]);
  useEffect(() => () => sendTyping(convId, false), [convId]);

  const canSend = !!text.trim() || !!img;

  async function submit() {
    const t = text.trim();
    if (t.length > MAX) { onError(`Messages are up to ${MAX} characters (${t.length})`); return; }
    if (editing) {
      if (!t && editing.kind === "text") return;
      const m = editing;
      onCancelEdit();
      if (t !== (m.text ?? "")) editMessage(convId, m.id, t).catch((e) => onError((e as Error).message));
      return;
    }
    if (img) {
      const cur = img;
      setImg(null);
      setText("");
      try { await sendImage(convId, cur, t, replyTo); } catch (e) { onError((e as Error).message); }
    } else if (t) {
      sendText(convId, t, replyTo);
      setText("");
    } else return;
    onCancelReply();
    onSent();
    if (!desktop()) ta.current?.focus(); // keep the keyboard up on phones
  }

  function insert(s: string) {
    const el = ta.current;
    const a = el?.selectionStart ?? text.length, b = el?.selectionEnd ?? text.length;
    const next = text.slice(0, a) + s + text.slice(b);
    setText(next);
    requestAnimationFrame(() => { if (el && desktop()) { el.focus(); el.setSelectionRange(a + s.length, a + s.length); } });
  }

  // ---- voice
  const started = useRef(false);
  async function begin(locked: boolean) {
    if (locked) hold.current = null;
    started.current = false;
    setMode(locked ? "locked" : "hold");
    setTray(false);
    const ok = await rec.start();
    started.current = ok;
    if (!ok) { setMode(null); hold.current = null; return; }
    if (!locked && !hold.current?.down) setMode("locked"); // released while the permission prompt was open
    sendTyping(convId, true);
  }
  async function finish(send: boolean) {
    const r = await rec.stop();
    setMode(null);
    setSlide(0);
    sendTyping(convId, false);
    if (!r) return;
    if (send) void deliverVoice(r.blob, r.ms, r.peaks);
    else setVoice({ ...r, url: URL.createObjectURL(r.blob) });
  }
  async function deliverVoice(blob: Blob, ms: number, peaks: number[]) {
    try { await sendVoice(convId, blob, ms, peaks, replyTo); onCancelReply(); onSent(); }
    catch (e) { onError((e as Error).message); }
  }
  function cancelVoice() {
    rec.cancel();
    setMode(null);
    setSlide(0);
    setVoice((v) => { if (v) URL.revokeObjectURL(v.url); return null; });
    rec.reset();
    sendTyping(convId, false);
  }
  /** Hold to record: the button under the finger changes, so move / release are tracked on window. */
  const micDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const h = { down: true, x: e.clientX, t0: Date.now() };
    hold.current = h;
    const mv = (ev: PointerEvent) => {
      if (!h.down) return;
      const dx = Math.min(0, ev.clientX - h.x);
      setSlide(dx);
      if (dx < -90) { h.down = false; off(); cancelVoice(); }
    };
    const up = () => {
      off();
      if (!h.down) return;
      h.down = false;
      if (Date.now() - h.t0 < 450 || !started.current) setMode("locked"); // a tap → hands-free recording
      else void finish(true);
    };
    const off = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    void begin(false);
  };

  const recording = rec.state === "rec" || mode !== null;
  const btn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full";
  const replyName = replyTo ? (replyTo.senderId === meId ? "yourself" : displayName(members.find((u) => u.id === replyTo.senderId))) : "";

  return (
    <div className="shrink-0 border-t border-line bg-bg/95 backdrop-blur">
      {(replyTo || editing) && (
        <div className="flex items-center gap-2 px-3 pt-2">
          {editing ? <Pencil size={18} className="shrink-0 text-[var(--ch-acc)]" aria-hidden /> : <Reply size={18} className="shrink-0 text-[var(--ch-acc)]" aria-hidden />}
          <div className="min-w-0 flex-1 border-l-[3px] border-[var(--ch-acc)] pl-2">
            <p className="text-xs font-semibold text-[var(--ch-acc)]">{editing ? "Edit message" : `Replying to ${replyName}`}</p>
            <p className="truncate text-sm text-mute" dir="auto">{snippet((editing ?? replyTo)!)}</p>
          </div>
          <button type="button" className={cx(btn, "text-mute hover:bg-card2")} onClick={editing ? onCancelEdit : onCancelReply} aria-label={editing ? "Cancel editing" : "Cancel reply"}><X size={20} aria-hidden /></button>
        </div>
      )}
      {img && (
        <div className="flex items-center gap-3 px-3 pt-2">
          <img src={img.thumbUrl} alt="Photo to send" className="h-14 w-14 rounded-lg object-cover" />
          <p className="flex-1 text-sm text-mute">Add a caption (optional), then send</p>
          <button type="button" className={cx(btn, "text-mute hover:bg-card2")} onClick={() => setImg(null)} aria-label="Remove photo"><X size={20} aria-hidden /></button>
        </div>
      )}

      <div className="flex items-end gap-1 px-2 py-2 safe-b">
        {voice ? (
          <>
            <button type="button" className={cx(btn, "text-bad hover:bg-card2")} onClick={cancelVoice} aria-label="Delete recording"><Trash2 size={21} aria-hidden /></button>
            <div className="flex min-h-11 flex-1 items-center rounded-3xl bg-card2 px-2 text-ink"><VoicePlayer src={voice.url} durationMs={voice.ms} peaks={voice.peaks} /></div>
            <button type="button" className={cx(btn, "bg-[var(--ch-acc)] text-[var(--ch-ink)]")} aria-label="Send voice message"
              onClick={() => { const v = voice; setVoice(null); rec.reset(); void deliverVoice(v.blob, v.ms, v.peaks); }}>
              <SendHorizontal size={21} aria-hidden />
            </button>
          </>
        ) : recording ? (
          <>
            <button type="button" className={cx(btn, "text-bad hover:bg-card2")} onClick={cancelVoice} aria-label="Cancel recording"><Trash2 size={21} aria-hidden /></button>
            <div className="flex min-h-11 flex-1 items-center gap-2 overflow-hidden rounded-3xl bg-card2 px-3" style={{ transform: slide ? `translateX(${slide / 3}px)` : undefined }}>
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-bad motion-reduce:animate-none" aria-hidden />
              <span className="num w-10 shrink-0 text-sm font-semibold" role="timer" aria-label={`Recording ${fmt(rec.ms)}`}>{fmt(rec.ms)}</span>
              <Bars bars={toBars(rec.levels.length ? rec.levels : [0], Math.max(8, rec.levels.length))} live className="min-w-0 flex-1 justify-end overflow-hidden" />
              {mode === "hold" && <span className="shrink-0 text-xs text-mute">‹ slide to cancel</span>}
            </div>
            {mode === "locked" ? (
              <>
                <button type="button" className={cx(btn, "bg-card2 text-ink")} onClick={() => void finish(false)} aria-label="Stop and preview"><Square size={18} fill="currentColor" aria-hidden /></button>
                <button type="button" className={cx(btn, "bg-[var(--ch-acc)] text-[var(--ch-ink)]")} onClick={() => void finish(true)} aria-label="Send voice message"><SendHorizontal size={21} aria-hidden /></button>
              </>
            ) : (
              <button type="button" className={cx(btn, "scale-125 bg-bad text-black")} aria-label="Release to send" style={{ touchAction: "none" }}>
                <Mic size={21} aria-hidden />
              </button>
            )}
            {rec.ms >= MAX_VOICE_MS - 10_000 && <span className="sr-only" role="status">10 seconds left</span>}
          </>
        ) : (
          <>
            <button type="button" className={cx(btn, "text-mute hover:bg-card2 hover:text-ink")} onClick={() => { const o = !tray; setTray(o); if (o) ta.current?.blur(); else ta.current?.focus(); }}
              aria-label={tray ? "Show keyboard" : "Emoji and stickers"} aria-expanded={tray}>
              {tray ? <Keyboard size={22} aria-hidden /> : <Smile size={22} aria-hidden />}
            </button>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Message</span>
              <textarea
                ref={ta}
                rows={1}
                value={text}
                maxLength={MAX + 200}
                dir="auto"
                enterKeyHint={desktop() ? "send" : "enter"}
                placeholder={editing ? "Edit message" : img ? "Add a caption…" : "Message"}
                onChange={(e) => { setText(e.target.value); sendTyping(convId, !!e.target.value); }}
                onFocus={() => setTray(false)}
                onBlur={() => sendTyping(convId, false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && desktop()) { e.preventDefault(); void submit(); }
                  if (e.key === "Escape" && (editing || replyTo)) { e.preventDefault(); if (editing) onCancelEdit(); else onCancelReply(); }
                }}
                className="block max-h-[148px] min-h-11 w-full resize-none rounded-3xl bg-card2 px-4 py-[10px] text-[16px] leading-6 placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-[var(--ch-acc)]/50"
              />
            </label>
            {!canSend && !editing && (
              <button type="button" className={cx(btn, "text-mute hover:bg-card2 hover:text-ink")} onClick={() => fileIn.current?.click()} aria-label="Send a photo">
                <ImagePlus size={22} aria-hidden />
              </button>
            )}
            {canSend || editing ? (
              <button type="button" className={cx(btn, "bg-[var(--ch-acc)] text-[var(--ch-ink)] disabled:opacity-40")} onClick={() => void submit()} disabled={!canSend && editing?.kind === "text"}
                aria-label={editing ? "Save edit" : "Send"}>
                <SendHorizontal size={21} aria-hidden />
              </button>
            ) : (
              <button type="button" className={cx(btn, "bg-card2 text-ink hover:bg-card3")} aria-label="Record a voice message (hold, or tap for hands-free)"
                onPointerDown={micDown}
                onClick={(e) => { if (e.detail === 0) void begin(true); }} onContextMenu={(e) => e.preventDefault()}
                style={{ touchAction: "none" }}>
                <Mic size={22} aria-hidden />
              </button>
            )}
          </>
        )}
      </div>
      {tray && !recording && !voice && (
        <Tray
          onEmoji={insert}
          onSticker={(id) => { sendSticker(convId, id, replyTo); onCancelReply(); setTray(false); onSent(); }}
        />
      )}
      <input ref={fileIn} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setFile(f); }} />
      {file && (
        <PhotoEditor src={file} mode="post" title="Send a photo" defaultAspect="orig"
          onCancel={() => setFile(null)}
          onDone={(r) => { setFile(null); setImg(r); requestAnimationFrame(() => ta.current?.focus()); }} />
      )}
    </div>
  );
}
