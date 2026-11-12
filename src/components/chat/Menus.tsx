import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Download, Pencil, Plus, Reply, Share2, SmilePlus, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Sheet } from "../ui";
import { UserAvatar as Avatar } from "../social/UserAvatar";
import { cx, time12 } from "../../lib/util";
import { displayName, mediaUrl, type ChatUser, type Msg } from "../../lib/chat";
import { emojiName, QUICK } from "./emoji";
import { EmojiPicker } from "./Tray";
import { snippet } from "./Bubble";

/** Long-press / "More actions" sheet: quick reactions (+ full picker), reply, copy, edit, who reacted, delete. */
export function MessageMenu({ m, album, picker, mine, meId, onClose, onReact, onReply, onEdit, onDelete, onCopied, onWho }: {
  m: Msg | null; album?: Msg[] | null; picker?: boolean; mine: boolean; meId: string; onClose: () => void;
  onReact: (e: string) => void; onReply: () => void; onEdit: () => void; onDelete: () => void; onCopied: () => void; onWho: () => void;
}) {
  const [more, setMore] = useState(!!picker);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setMore(!!picker); setConfirm(false); }, [m?.id, picker]);
  if (!m) return null;
  const pending = album ? album.some((x) => x.status) : !!m.status;
  const canReact = !m.deleted && !pending && m.kind !== "system";
  const canEdit = mine && !m.deleted && !pending && !album && (m.kind === "text" || (m.kind === "image" && !!m.text));
  const canCopy = !m.deleted && !!m.text && !album;
  const nReact = Object.values(m.reactions ?? {}).reduce((a, u) => a + u.length, 0);
  const act = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] hover:bg-card2";
  return (
    <Sheet open onClose={onClose} title={more ? "Pick a reaction" : "Message"}>
      {more ? (
        <div className="h-[min(380px,58dvh)]"><EmojiPicker autoFocus label="All emoji" onPick={(e) => { onReact(e); onClose(); }} /></div>
      ) : (
        <>
          <p className="mb-3 line-clamp-3 rounded-xl bg-card2 px-3 py-2 text-sm text-mute" dir="auto">{album ? `📷 ${album.length} photos` : snippet(m)}</p>
          {canReact && (
            <div className="mb-2 flex items-center justify-between gap-1" role="group" aria-label="React">
              {QUICK.map((e) => {
                const on = m.reactions[e]?.includes(meId);
                return (
                  <button key={e} type="button" onClick={() => { onReact(e); onClose(); }} aria-pressed={on} aria-label={`React ${emojiName(e)}`}
                    className={cx("flex h-12 w-12 items-center justify-center rounded-full text-[27px] leading-none transition active:scale-90 motion-reduce:transform-none", on ? "bg-card3 ring-2 ring-acc/60" : "hover:bg-card2")}>
                    {e}
                  </button>
                );
              })}
              <button type="button" onClick={() => setMore(true)} aria-label="More reactions" className="flex h-12 w-12 items-center justify-center rounded-full bg-card2 text-mute hover:text-ink"><Plus size={20} aria-hidden /></button>
            </div>
          )}
          <div className="flex flex-col">
            {canReact && <button type="button" className={act} onClick={() => { onReply(); onClose(); }}><Reply size={19} aria-hidden className="text-mute" /> Reply</button>}
            {canCopy && (
              <button type="button" className={act} onClick={() => { void navigator.clipboard?.writeText(m.text ?? "").then(() => onCopied(), () => onCopied()); onClose(); }}>
                <Copy size={19} aria-hidden className="text-mute" /> Copy text
              </button>
            )}
            {canEdit && <button type="button" className={act} onClick={() => { onEdit(); onClose(); }}><Pencil size={19} aria-hidden className="text-mute" /> Edit</button>}
            {nReact > 0 && <button type="button" className={act} onClick={onWho}><SmilePlus size={19} aria-hidden className="text-mute" /> Reactions <span className="ml-auto text-sm tabular-nums text-mute">{nReact}</span></button>}
            {mine && !m.deleted && (confirm ? (
              <div className="mt-1 flex gap-2">
                <button type="button" className="min-h-12 flex-1 rounded-xl border border-line font-semibold" onClick={() => setConfirm(false)}>Cancel</button>
                <button type="button" autoFocus className="min-h-12 flex-1 rounded-xl bg-bad font-semibold text-black" onClick={() => { onDelete(); onClose(); }}>{album ? `Delete ${album.length} photos` : "Delete for everyone"}</button>
              </div>
            ) : (
              <button type="button" className={cx(act, "text-bad")} onClick={() => (pending && !album ? (onDelete(), onClose()) : setConfirm(true))}>
                <Trash2 size={19} aria-hidden /> {pending && !album ? "Discard" : album ? `Delete ${album.length} photos for everyone` : "Delete for everyone"}
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Who reacted: tabs per emoji, avatars + names; your own row removes yours. */
export function ReactorsSheet({ m, start, members, meId, onClose, onToggle }: { m: Msg | null; start?: string; members: ChatUser[]; meId: string; onClose: () => void; onToggle: (e: string) => void }) {
  const [tab, setTab] = useState<string>("all");
  useEffect(() => setTab(start ?? "all"), [m?.id, start]);
  if (!m) return null;
  const rx = Object.entries(m.reactions ?? {});
  const rows = rx.flatMap(([e, us]) => us.map((u) => ({ e, u }))).filter((r) => tab === "all" || r.e === tab);
  const total = rx.reduce((a, [, u]) => a + u.length, 0);
  const by = new Map(members.map((u) => [u.id, u]));
  return (
    <Sheet open onClose={onClose} title="Reactions">
      <div role="tablist" aria-label="Filter by emoji" className="mb-2 flex gap-1 overflow-x-auto pb-1">
        {[["all", `All ${total}`], ...rx.map(([e, u]) => [e, `${e} ${u.length}`])].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} aria-label={id === "all" ? `All, ${total}` : `${emojiName(id)}, ${label.split(" ")[1]}`}
            className={cx("min-h-11 shrink-0 rounded-full px-3.5 text-[15px] font-semibold tabular-nums", tab === id ? "bg-card3 text-ink" : "text-mute hover:bg-card2")}>{label}</button>
        ))}
      </div>
      {!rows.length && <p className="py-6 text-center text-sm text-mute">No reactions</p>}
      <ul className="flex flex-col">
        {rows.map(({ e, u }) => {
          const user = by.get(u);
          const me = u === meId;
          return (
            <li key={`${e}-${u}`}>
              <button type="button" disabled={!me} onClick={() => { onToggle(e); if (rows.length <= 1) onClose(); }}
                className={cx("flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left", me && "hover:bg-card2")}
                aria-label={me ? `You reacted ${emojiName(e)}. Remove` : `${displayName(user)} reacted ${emojiName(e)}`}>
                <Avatar id={user?.avatarId} name={user?.name ?? user?.username} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{me ? "You" : displayName(user)}</span>
                  {me && <span className="block text-xs text-mute">Tap to remove</span>}
                </span>
                <span className="text-2xl" aria-hidden>{e}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

// ---------------------------------------------------------------- full-screen photo viewer

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Photo viewer: swipe (or ← →) between the chat's photos, swipe down / Esc to close, pinch / double-tap / wheel / + − to zoom,
 * drag to pan when zoomed, save (download) and share (Web Share with the file, where supported).
 */
export function ImageViewer({ items, index, onIndex, onClose, sender }: { items: Msg[]; index: number; onIndex: (i: number) => void; onClose: () => void; sender: (m: Msg) => string }) {
  const m = items[index];
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 });
  const [drag, setDrag] = useState({ x: 0, y: 0, on: false });
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef<{ x: number; y: number; z: typeof z; d0?: number; mode: "swipe" | "pan" | "pinch" | null; t: number } | null>(null);
  const lastTap = useRef(0);
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => { setZ({ s: 1, x: 0, y: 0 }); setLoaded(false); }, [index]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 2500); return () => clearTimeout(t); }, [note]);
  const go = (d: number) => { const n = index + d; if (n >= 0 && n < items.length) onIndex(n); };
  const zoomTo = (s: number, cx0 = 0, cy0 = 0) => setZ((o) => {
    const ns = clamp(s, 1, 4);
    if (ns === 1) return { s: 1, x: 0, y: 0 };
    const k = ns / o.s; // keep the point under the finger / cursor still
    return { s: ns, x: cx0 - (cx0 - o.x) * k, y: cy0 - (cy0 - o.y) * k };
  });
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "+" || e.key === "=") zoomTo(z.s * 1.5);
      else if (e.key === "-") zoomTo(z.s / 1.5);
      else if (e.key === "0") zoomTo(1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  // keep keyboard focus inside the dialog
  useEffect(() => {
    const f = (e: FocusEvent) => { if (stage.current && !stage.current.closest("[role=dialog]")!.contains(e.target as Node)) (stage.current.closest("[role=dialog]")!.querySelector("button") as HTMLElement | null)?.focus(); };
    document.addEventListener("focusin", f);
    return () => document.removeEventListener("focusin", f);
  }, []);
  if (!m) return null;
  const thumb = m.local?.previewUrl ?? (m.mediaId ? mediaUrl(m.mediaId, true) : "");
  const full = m.mediaId && !m.status ? mediaUrl(m.mediaId) : thumb;
  const local = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...ptrs.current.values()];
    if (ps.length === 2) gest.current = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2, z, d0: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), mode: "pinch", t: Date.now() };
    else gest.current = { x: e.clientX, y: e.clientY, z, mode: null, t: Date.now() };
  };
  const move = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId) || !gest.current) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gest.current;
    const ps = [...ptrs.current.values()];
    if (g.mode === "pinch" && ps.length === 2 && g.d0) {
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const c = local({ clientX: g.x, clientY: g.y });
      const ns = clamp(g.z.s * (d / g.d0), 1, 4), k = ns / g.z.s;
      setZ(ns === 1 ? { s: 1, x: 0, y: 0 } : { s: ns, x: c.x - (c.x - g.z.x) * k, y: c.y - (c.y - g.z.y) * k });
      return;
    }
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.mode && Math.hypot(dx, dy) > 8) g.mode = g.z.s > 1 ? "pan" : "swipe";
    if (g.mode === "pan") setZ({ ...g.z, x: g.z.x + dx, y: g.z.y + dy });
    if (g.mode === "swipe") setDrag({ x: Math.abs(dx) > Math.abs(dy) ? dx : 0, y: Math.abs(dy) >= Math.abs(dx) ? Math.max(0, dy) : 0, on: true });
  };
  const up = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    const g = gest.current;
    if (!g) return;
    if (g.mode === "swipe") {
      const w = stage.current?.clientWidth ?? 360;
      if (drag.y > 120) onClose();
      else if (drag.x < -w * 0.2) go(1);
      else if (drag.x > w * 0.2) go(-1);
    } else if (!g.mode && ptrs.current.size === 0 && e.pointerType !== "mouse") {
      const now = Date.now();
      if (now - lastTap.current < 300) { const c = local(e); zoomTo(z.s > 1 ? 1 : 2.5, c.x, c.y); lastTap.current = 0; } else lastTap.current = now;
    }
    setDrag({ x: 0, y: 0, on: false });
    gest.current = ptrs.current.size ? { ...g, mode: g.mode === "pinch" ? "pan" : g.mode, z, x: [...ptrs.current.values()][0].x, y: [...ptrs.current.values()][0].y } : null;
  };

  async function blob() {
    const r = await fetch(full, { credentials: "same-origin" });
    if (!r.ok) throw new Error("Couldn't load the photo");
    return r.blob();
  }
  const fname = `iron-log-${new Date(m.createdAt).toISOString().slice(0, 10)}-${m.id.slice(0, 6)}.jpg`;
  async function save() {
    try {
      const b = await blob();
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      setNote("Saved to downloads");
    } catch (e) { setNote((e as Error).message); }
  }
  async function share() {
    try {
      const f = new File([await blob()], fname, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], text: m.text ?? undefined });
      else await save();
    } catch (e) { if ((e as Error).name !== "AbortError") setNote("Couldn't share this photo"); }
  }
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  const btn = "flex h-12 w-12 items-center justify-center rounded-full text-white hover:bg-white/10";
  const nav = "absolute top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 md:flex";
  const fade = drag.y ? Math.max(0.3, 1 - drag.y / 400) : 1;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" style={{ backgroundColor: `rgba(0,0,0,${fade})` }} role="dialog" aria-modal="true" aria-label={`Photo ${index + 1} of ${items.length}`}>
      <div className="flex shrink-0 items-center gap-1 px-1 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onClose} autoFocus className={btn} aria-label="Close photo"><X size={24} aria-hidden /></button>
        <div className="min-w-0 flex-1 text-white">
          <p className="truncate text-sm font-semibold">{sender(m)}</p>
          <p className="truncate text-xs tabular-nums text-white/75">{new Date(m.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {time12(m.createdAt)}{items.length > 1 ? ` · ${index + 1} / ${items.length}` : ""}</p>
        </div>
        <button type="button" onClick={() => zoomTo(z.s > 1 ? 1 : 2.5)} className={cx(btn, "hidden md:flex")} aria-label={z.s > 1 ? "Zoom out" : "Zoom in"}>{z.s > 1 ? <ZoomOut size={22} aria-hidden /> : <ZoomIn size={22} aria-hidden />}</button>
        {canShare && <button type="button" onClick={() => void share()} className={btn} aria-label="Share photo"><Share2 size={21} aria-hidden /></button>}
        <button type="button" onClick={() => void save()} className={btn} aria-label="Save photo"><Download size={22} aria-hidden /></button>
      </div>
      <div ref={stage} className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onDoubleClick={(e) => { const c = local(e); zoomTo(z.s > 1 ? 1 : 2.5, c.x, c.y); }}
        onWheel={(e) => { const c = local(e); zoomTo(z.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), c.x, c.y); }}>
        <div className={cx("absolute inset-0", !drag.on && !gest.current && !reduce && "transition-transform duration-200")}
          style={{ transform: `translate(${drag.x + z.x}px, ${drag.y + z.y}px) scale(${z.s})` }}>
          {/* thumbnail first (already cached), full photo fades in over it */}
          <img src={thumb} alt="" aria-hidden className={cx("absolute inset-0 m-auto max-h-full max-w-full object-contain", loaded && "invisible")} draggable={false} />
          <img src={full} alt={m.text ? `Photo: ${m.text}` : "Photo"} onLoad={() => setLoaded(true)} draggable={false}
            className={cx("absolute inset-0 h-full w-full object-contain transition-opacity", loaded ? "opacity-100" : "opacity-0", z.s > 1 ? "cursor-grab" : "cursor-zoom-in")} />
        </div>
        {index > 0 && <button type="button" className={cx(nav, "left-2")} onClick={() => go(-1)} aria-label="Previous photo"><ChevronLeft size={26} aria-hidden /></button>}
        {index < items.length - 1 && <button type="button" className={cx(nav, "right-2")} onClick={() => go(1)} aria-label="Next photo"><ChevronRight size={26} aria-hidden /></button>}
        {note && <p role="status" className="absolute inset-x-0 bottom-4 mx-auto w-max max-w-[90%] rounded-full bg-white/15 px-4 py-2 text-sm text-white backdrop-blur">{note}</p>}
      </div>
      {items.length > 1 && (
        <div className="flex shrink-0 justify-center gap-1.5 py-2 md:hidden" aria-hidden>
          {items.length <= 12 && items.map((x, i) => <span key={x.id} className={cx("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-white" : "w-1.5 bg-white/40")} />)}
        </div>
      )}
      {m.text && <p className="max-h-[25dvh] shrink-0 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 text-center text-[15px] text-white" dir="auto">{m.text}</p>}
      <span className="sr-only" aria-live="polite">{`Photo ${index + 1} of ${items.length}${m.text ? `: ${m.text}` : ""}`}</span>
    </div>
  );
}
