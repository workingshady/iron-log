import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Download, Pencil, Plus, Reply, Trash2, X } from "lucide-react";
import { Sheet } from "../ui";
import { cx } from "../../lib/util";
import { mediaUrl, type Msg } from "../../lib/chat";
import { QUICK } from "./emoji";
import { EmojiPicker } from "./Tray";
import { snippet } from "./Bubble";

/** Long-press / right-click menu: quick reactions (+ full picker), reply, copy, edit, delete. */
export function MessageMenu({ m, mine, meId, onClose, onReact, onReply, onEdit, onDelete }: {
  m: Msg | null; mine: boolean; meId: string; onClose: () => void;
  onReact: (e: string) => void; onReply: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setMore(false); setConfirm(false); setCopied(false); }, [m?.id]);
  if (!m) return null;
  const canReact = !m.deleted && !m.status && m.kind !== "system";
  const canEdit = mine && !m.deleted && !m.status && (m.kind === "text" || ((m.kind === "image") && !!m.text));
  const canCopy = !m.deleted && !!m.text;
  const act = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] hover:bg-card2";
  return (
    <Sheet open onClose={onClose} title={more ? "Pick a reaction" : undefined}>
      {more ? (
        <div className="h-[min(360px,55dvh)]"><EmojiPicker autoFocus onPick={(e) => { onReact(e); onClose(); }} /></div>
      ) : (
        <>
          <p className="mb-3 line-clamp-3 rounded-xl bg-card2 px-3 py-2 text-sm text-mute" dir="auto">{snippet(m)}</p>
          {canReact && (
            <div className="mb-2 flex items-center justify-between gap-1" role="group" aria-label="React">
              {QUICK.map((e) => {
                const on = m.reactions[e]?.includes(meId);
                return (
                  <button key={e} type="button" onClick={() => { onReact(e); onClose(); }} aria-pressed={on} aria-label={`React ${e}`}
                    className={cx("flex h-11 w-11 items-center justify-center rounded-full text-[26px] leading-none transition active:scale-90 motion-reduce:active:scale-100", on ? "bg-card3 ring-2 ring-acc/60" : "hover:bg-card2")}>
                    {e}
                  </button>
                );
              })}
              <button type="button" onClick={() => setMore(true)} aria-label="More reactions" className="flex h-11 w-11 items-center justify-center rounded-full bg-card2 text-mute hover:text-ink"><Plus size={20} aria-hidden /></button>
            </div>
          )}
          <div className="flex flex-col">
            {canReact && <button type="button" className={act} onClick={() => { onReply(); onClose(); }}><Reply size={19} aria-hidden className="text-mute" /> Reply</button>}
            {canCopy && (
              <button type="button" className={act} onClick={() => { void navigator.clipboard?.writeText(m.text ?? "").then(() => { setCopied(true); setTimeout(onClose, 500); }); }}>
                {copied ? <Check size={19} aria-hidden className="text-acc" /> : <Copy size={19} aria-hidden className="text-mute" />} {copied ? "Copied" : "Copy text"}
              </button>
            )}
            {canEdit && <button type="button" className={act} onClick={() => { onEdit(); onClose(); }}><Pencil size={19} aria-hidden className="text-mute" /> Edit</button>}
            {mine && !m.deleted && (confirm ? (
              <div className="mt-1 flex gap-2">
                <button type="button" className="min-h-12 flex-1 rounded-xl border border-line font-semibold" onClick={() => setConfirm(false)}>Cancel</button>
                <button type="button" className="min-h-12 flex-1 rounded-xl bg-bad font-semibold text-black" onClick={() => { onDelete(); onClose(); }}>Delete for everyone</button>
              </div>
            ) : (
              <button type="button" className={cx(act, "text-bad")} onClick={() => (m.status ? (onDelete(), onClose()) : setConfirm(true))}>
                <Trash2 size={19} aria-hidden /> {m.status ? "Discard" : "Delete for everyone"}
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Full-screen photo viewer (← → between the chat's photos, Esc / X to close, double-tap to zoom). */
export function ImageViewer({ items, index, onIndex, onClose }: { items: Msg[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const m = items[index];
  const [zoom, setZoom] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setZoom(false); setLoaded(false); }, [index]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [index, items.length, onClose, onIndex]);
  if (!m) return null;
  const thumb = m.local?.previewUrl ?? (m.mediaId ? mediaUrl(m.mediaId, true) : "");
  const full = m.mediaId && !m.status ? mediaUrl(m.mediaId) : thumb;
  const nav = "absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70";
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Photo">
      <div className="flex shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onClose} autoFocus className="flex h-12 w-12 items-center justify-center rounded-full text-white hover:bg-white/10" aria-label="Close photo"><X size={24} aria-hidden /></button>
        <span className="text-sm tabular-nums text-white/70">{items.length > 1 ? `${index + 1} / ${items.length}` : ""}</span>
        {full ? <a href={full} download className="flex h-12 w-12 items-center justify-center rounded-full text-white hover:bg-white/10" aria-label="Download photo"><Download size={22} aria-hidden /></a> : <span className="w-12" />}
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto" onDoubleClick={() => setZoom((z) => !z)}>
        {/* thumbnail first (already cached), full photo fades in over it */}
        <img src={thumb} alt="" aria-hidden className={cx("absolute inset-0 m-auto max-h-full max-w-full object-contain", loaded && "invisible")} />
        <img src={full} alt={m.text ?? "Photo"} onLoad={() => setLoaded(true)} draggable={false}
          className={cx("relative m-auto block object-contain transition-opacity", zoom ? "max-w-none cursor-zoom-out" : "h-full w-full cursor-zoom-in", loaded ? "opacity-100" : "opacity-0")} />
        {index > 0 && <button type="button" className={cx(nav, "left-2")} onClick={() => onIndex(index - 1)} aria-label="Previous photo"><ChevronLeft size={26} aria-hidden /></button>}
        {index < items.length - 1 && <button type="button" className={cx(nav, "right-2")} onClick={() => onIndex(index + 1)} aria-label="Next photo"><ChevronRight size={26} aria-hidden /></button>}
      </div>
      {m.text && <p className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-center text-[15px] text-white" dir="auto">{m.text}</p>}
    </div>
  );
}
