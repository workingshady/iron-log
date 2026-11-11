import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity, Camera, ChevronLeft, ChevronRight, Dumbbell, ExternalLink, Image as ImageIcon, ImagePlus, Loader2, NotebookPen, Pencil, Trash2, TrendingUp, UserRound, Wrench, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { forgetPhotos, refreshMe } from "../lib/me";
import { cx, niceDate, today } from "../lib/util";
import { Btn, Chips, Sheet } from "./ui";
import { PhotoEditor, type Edited } from "./PhotoEditor";

// One photo system for the whole app:
//   PhotoTiles  → the same 64 px rounded squares everywhere a note has photos (sets, machines, journal)
//   PhotoGrid   → 3-column square grid (Profile, like Instagram)
//   Lightbox    → full-screen viewer: swipe / ← → between photos, caption, date, edit, delete, set as profile photo
// Images are compressed on the phone (≤1280 px + a 360 px square thumbnail) and are immutable per id, so the
// browser + service worker cache them forever — grids load the thumbnail, the viewer loads the full photo once.

export type RefKind = "set" | "exercise" | "journal" | "session" | "progress" | "avatar" | "other";
export interface PhotoMeta { id: string; refKind: string; refId: string | null; exKey: string | null; sessionId: string | null; date: string; caption: string | null; w: number | null; h: number | null; bytes: number | null; createdAt: number }
export const photoUrl = (id: string, thumb = false) => `/api/photos/${id}/img${thumb ? "?s=t" : ""}`;

export const KIND: Record<string, { label: string; icon: typeof Camera }> = {
  progress: { label: "Progress", icon: TrendingUp },
  set: { label: "Form", icon: Dumbbell },
  exercise: { label: "Machine", icon: Wrench },
  journal: { label: "Journal", icon: NotebookPen },
  session: { label: "Workout", icon: Activity },
  avatar: { label: "Profile", icon: UserRound },
  other: { label: "Other", icon: ImageIcon },
};

// ---------------------------------------------------------------- compress + upload

const MAX_IN = 40 * 1024 * 1024;

async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const b = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { src: b, w: b.width, h: b.height, done: () => b.close() };
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { URL.revokeObjectURL(url); throw new Error("Can't read this photo (HEIC?). Pick a JPEG, or set the camera to “Most compatible”."); }
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }
}

/** Full photo (longest side ≤ 1280 px, JPEG, usually 150-350 KB) + a 360 px centre-square thumbnail (~20 KB) for grids. */
export async function compress(file: File) {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error("That file isn't a photo.");
  if (file.size > MAX_IN) throw new Error("Photo is over 40 MB.");
  const { src, w: W, h: H, done } = await decode(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(W, H));
    const w = Math.round(W * scale), h = Math.round(H * scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d")!;
    g.fillStyle = "#111"; g.fillRect(0, 0, w, h); // transparent PNG → dark, not black blocks
    g.drawImage(src, 0, 0, w, h);
    let q = 0.75, dataUrl = c.toDataURL("image/jpeg", q);
    while (dataUrl.length > 600_000 && q > 0.4) { q -= 0.1; dataUrl = c.toDataURL("image/jpeg", q); }
    const TW = 360, TH = 480, sc = Math.max(TW / W, TH / H);
    const t = document.createElement("canvas");
    t.width = TW; t.height = TH;
    const tg = t.getContext("2d")!;
    tg.fillStyle = "#111"; tg.fillRect(0, 0, TW, TH);
    tg.drawImage(src, (TW - W * sc) / 2, (TH - H * sc) / 2, W * sc, H * sc);
    return { dataUrl, thumbUrl: t.toDataURL("image/jpeg", 0.7), w, h };
  } finally {
    done();
  }
}

/** Upload a photo: an edited result from PhotoEditor (normal path) or a raw file (compressed here). */
export async function uploadPhoto(input: File | Edited, meta: { refKind: RefKind; refId?: string | null; exKey?: string | null; sessionId?: string | null; caption?: string | null; date?: string }) {
  if (!navigator.onLine) throw new Error("Offline — photos need a connection.");
  const { dataUrl, thumbUrl, w, h } = input instanceof File ? await compress(input) : input;
  const id = uid();
  await send("POST", "/photos", { id, refKind: meta.refKind, refId: meta.refId ?? null, exKey: meta.exKey ?? null, sessionId: meta.sessionId ?? null, caption: meta.caption ?? null, date: meta.date ?? today(), dataUrl, thumbUrl, w, h });
  track("photo_add", { refKind: meta.refKind, kb: Math.round(dataUrl.length / 1365) });
  return id;
}

const errText = (e: unknown) => String((e as Error)?.message || e).slice(0, 140);

// ---------------------------------------------------------------- pieces

/** Lazy, async-decoded image that fades in over a grey placeholder (no layout jump). */
export function PhotoImg({ id, thumb = true, alt = "", className }: { id: string; thumb?: boolean; alt?: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <img src={photoUrl(id, thumb)} alt={alt} loading="lazy" decoding="async" draggable={false} onLoad={() => setOk(true)}
      className={cx("h-full w-full object-cover transition-opacity duration-200", ok ? "opacity-100" : "opacity-0", className)} />
  );
}

const TILE = "relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-card3";

/** Up to `max` uniform tiles (+N on the last); tap one → full-screen viewer. Same look in sets, machines and journal. */
export function PhotoTiles({ photos, max = 4, onChanged, children }: { photos: PhotoMeta[]; max?: number; onChanged?: () => void; children?: ReactNode }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = photos.slice(0, max);
  const more = photos.length - shown.length;
  return (
    <>
      <ul className="flex flex-wrap items-center gap-2" aria-label={`${photos.length} photo${photos.length === 1 ? "" : "s"}`}>
        {shown.map((p, i) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(i)} className={cx(TILE, "focus-visible:ring-2 focus-visible:ring-acc")} aria-label={`Open photo ${i + 1} of ${photos.length}${p.caption ? `: ${p.caption}` : ""}`}>
              <PhotoImg id={p.id} />
              {i === shown.length - 1 && more > 0 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">+{more}</span>}
            </button>
          </li>
        ))}
        {children}
      </ul>
      {open != null && <Lightbox items={photos} start={open} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </>
  );
}

/** Photos of one thing (a set, a machine setup, a journal entry) + an "add" tile. Uploads right away with a live preview. */
export function PhotoStrip({ refKind, refId, exKey, sessionId, label = "Photo" }: { refKind: RefKind; refId: string; exKey?: string | null; sessionId?: string | null; label?: string; compact?: boolean }) {
  const q = refKind === "exercise" ? `ex=${encodeURIComponent(refId)}` : `ref=${encodeURIComponent(refId)}`;
  const { data, reload } = useLoad<PhotoMeta[]>(`/photos?${q}`);
  const list = (data ?? []).filter((p) => (refKind === "exercise" ? p.refKind === "exercise" : true));
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null); // preview of the photo being saved
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<File | null>(null);

  async function add(x: Edited) {
    setEditing(null); setErr(null);
    setBusy(x.thumbUrl);
    try {
      await uploadPhoto(x, { refKind, refId, exKey: exKey ?? (refKind === "exercise" ? refId : null), sessionId });
      reload();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PhotoTiles photos={list} onChanged={reload}>
        {busy && (
          <li className={TILE} aria-live="polite">
            <img src={busy} alt="" className="h-full w-full object-cover opacity-60" />
            <span className="absolute inset-0 flex items-center justify-center"><Loader2 size={18} className="animate-spin" aria-label="Saving photo" /></span>
          </li>
        )}
        <li>
          <button type="button" onClick={() => input.current?.click()} disabled={!!busy}
            className={cx(list.length || busy ? "w-16" : "px-4", "flex h-16 items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-xs text-info hover:bg-card2 disabled:opacity-50")}>
            {list.length ? <ImagePlus size={18} aria-hidden /> : <Camera size={18} aria-hidden />}
            {list.length || busy ? <span className="sr-only">Add photo</span> : label}
          </button>
        </li>
      </PhotoTiles>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { setEditing(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      {err && <p role="alert" className="mt-1 text-[11px] text-bad">{err}</p>}
      {editing && <PhotoEditor src={editing} onCancel={() => setEditing(null)} onDone={add} />}
    </div>
  );
}

/** Instagram-style 3-column square grid. Progress photos show their date; other kinds show a small type icon. */
export function PhotoGrid({ photos, onOpen }: { photos: PhotoMeta[]; onOpen: (i: number) => void }) {
  return (
    <ul className="grid grid-cols-3 gap-0.5 md:gap-1" aria-label="Photos">
      {photos.map((p, i) => {
        const K = KIND[p.refKind] ?? KIND.other;
        return (
          <li key={p.id}>
            <button type="button" onClick={() => onOpen(i)} className="relative block aspect-[3/4] w-full overflow-hidden bg-card3 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-acc"
              aria-label={`${K.label} photo, ${niceDate(p.date)}${p.caption ? `: ${p.caption}` : ""}`}>
              <PhotoImg id={p.id} />
              {p.refKind !== "progress" && <K.icon size={14} className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]" aria-hidden />}
              <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[10px] font-medium text-white num" aria-hidden>
                {new Date(`${p.date}T12:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "short" })}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- full-screen viewer

const linkOf = (p: PhotoMeta) => (p.sessionId ? `#/s/${p.sessionId}` : p.refKind === "journal" ? "#/journal" : p.refKind === "exercise" ? "#/library" : null);

/**
 * Full-screen photo viewer. Swipe left/right (or ← → keys, or the arrow buttons) to move, swipe down / Esc to close.
 * A real modal: focus moves in, Tab stays inside, focus returns to the tile on close, the page behind can't scroll.
 */
export function Lightbox({ items, start, onClose, onChanged }: { items: PhotoMeta[]; start: number; onClose: () => void; onChanged?: () => void }) {
  const [i, setI] = useState(Math.min(start, items.length - 1));
  const [edit, setEdit] = useState<{ caption: string; date: string } | null>(null);
  const [zoom, setZoom] = useState(false);
  const [dx, setDx] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number; dy: number } | null>(null);
  const p = items[Math.min(i, items.length - 1)];
  const n = items.length;
  const go = (d: number) => { if (n < 2 || zoom) return; setI((x) => (x + d + n) % n); setEdit(null); setMsg(null); };

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => { document.body.style.overflow = overflow; opener?.focus?.({ preventScroll: true }); };
  }, []);
  useEffect(() => { if (!items.length) onClose(); else if (i >= items.length) setI(items.length - 1); }, [items.length, i, onClose]);
  // preload the neighbours so swiping is instant (they come from cache next time anyway)
  useEffect(() => { [i - 1, i + 1].forEach((k) => { const q = items[(k + n) % n]; if (q && n > 1) new Image().src = photoUrl(q.id); }); }, [i, items, n]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); if (edit) setEdit(null); else if (zoom) setZoom(false); else onClose(); }
      else if (!edit && e.key === "ArrowRight") go(1);
      else if (!edit && e.key === "ArrowLeft") go(-1);
      else if (e.key === "Tab" && root.current) {
        const f = [...root.current.querySelectorAll<HTMLElement>("button, a[href], input, textarea")].filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  });
  if (!p) return null;
  const K = KIND[p.refKind] ?? KIND.other;
  const link = linkOf(p);

  async function save() {
    if (!edit) return;
    await send("PUT", `/photos/${p.id}`, { caption: edit.caption.trim() || null, date: edit.date || p.date });
    track("photo_edit", {});
    setEdit(null); setMsg("Saved"); onChanged?.();
  }
  async function del() {
    if (!confirm("Delete this photo? This can't be undone.")) return;
    await send("DELETE", `/photos/${p.id}`);
    forgetPhotos(p.id);
    track("photo_delete", { refKind: p.refKind });
    refreshMe();
    onChanged?.();
    if (n <= 1) onClose();
  }
  async function makeAvatar() {
    await send("PUT", "/profile", { avatarId: p.id });
    await refreshMe();
    track("avatar_set", { from: p.refKind });
    setMsg("Profile photo updated");
    onChanged?.();
  }

  return (
    <div ref={root} role="dialog" aria-modal="true" aria-label={`${K.label} photo ${i + 1} of ${n}`} className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      {/* top bar */}
      <div className="flex items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button ref={closeBtn} type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close photo"><X size={22} aria-hidden /></button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-semibold">{niceDate(p.date)}</div>
          <div className="text-[11px] text-white/60 num" aria-live="polite">{K.label}{n > 1 ? ` · ${i + 1} / ${n}` : ""}</div>
        </div>
        <button type="button" onClick={() => setZoom((z) => !z)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label={zoom ? "Fit to screen" : "Zoom in"} aria-pressed={zoom}>
          {zoom ? <ZoomOut size={20} aria-hidden /> : <ZoomIn size={20} aria-hidden />}
        </button>
      </div>

      {/* image + swipe */}
      <div
        className={cx("relative min-h-0 flex-1 select-none", zoom ? "overflow-auto" : "flex items-center justify-center overflow-hidden touch-pan-y")}
        onPointerDown={(e) => { if (!zoom) touch.current = { x: e.clientX, y: e.clientY, dy: 0 }; }}
        onPointerMove={(e) => { const t = touch.current; if (!t) return; const ddx = e.clientX - t.x; t.dy = e.clientY - t.y; if (Math.abs(ddx) > Math.abs(t.dy)) setDx(ddx); }}
        onPointerUp={() => { const t = touch.current; touch.current = null; if (!t) return; if (dx < -60) go(1); else if (dx > 60) go(-1); else if (t.dy > 110) onClose(); setDx(0); }}
        onPointerCancel={() => { touch.current = null; setDx(0); }}
      >
        <img key={p.id} src={photoUrl(p.id)} alt={p.caption ?? `${K.label} photo from ${niceDate(p.date)}`} draggable={false} onDoubleClick={() => setZoom((z) => !z)}
          style={zoom ? undefined : { transform: `translateX(${dx}px)`, transition: dx ? "none" : "transform .2s" }}
          className={zoom ? "max-w-none w-[200%]" : "max-h-full max-w-full object-contain"} />
        {n > 1 && !zoom && (
          <>
            <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 md:flex" aria-label="Previous photo"><ChevronLeft size={22} aria-hidden /></button>
            <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 md:flex" aria-label="Next photo"><ChevronRight size={22} aria-hidden /></button>
          </>
        )}
      </div>

      {/* dots */}
      {n > 1 && n <= 12 && (
        <div className="flex justify-center gap-1.5 py-2" aria-hidden>
          {items.map((x, k) => <span key={x.id} className={cx("h-1.5 rounded-full transition-all", k === i ? "w-4 bg-white" : "w-1.5 bg-white/35")} />)}
        </div>
      )}

      {/* caption + actions */}
      <div className="max-h-[45dvh] overflow-y-auto bg-gradient-to-t from-black via-black to-black/80 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        {edit ? (
          <div className="mx-auto max-w-lg space-y-2">
            <label className="block text-[11px] text-white/60">Caption
              <textarea dir="auto" autoFocus value={edit.caption} maxLength={500} onChange={(e) => setEdit({ ...edit, caption: e.target.value })} rows={3}
                className="mt-1 w-full rounded-xl bg-white/10 p-3 text-sm text-white outline-none focus:ring-2 focus:ring-acc" placeholder="e.g. seat 4, pin 6 · week 3 front pose" />
            </label>
            <label className="block text-[11px] text-white/60">Date
              <input type="date" value={edit.date} max={today()} onChange={(e) => setEdit({ ...edit, date: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl bg-white/10 px-3 text-sm text-white outline-none [color-scheme:dark]" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Btn kind="soft" onClick={() => setEdit(null)}>Cancel</Btn>
              <Btn kind="primary" onClick={save}>Save</Btn>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-lg">
            {p.caption ? <p dir="auto" className="bidi whitespace-pre-wrap text-sm leading-relaxed">{p.caption}</p> : <p className="text-sm text-white/50">No caption</p>}
            {msg && <p role="status" className="mt-1 text-xs text-acc">{msg}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionBtn icon={Pencil} onClick={() => setEdit({ caption: p.caption ?? "", date: p.date })}>Edit</ActionBtn>
              {p.refKind !== "avatar" && <ActionBtn icon={UserRound} onClick={makeAvatar}>Profile photo</ActionBtn>}
              {link && <a href={link} onClick={onClose} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm hover:bg-white/20"><ExternalLink size={16} aria-hidden />Open {p.sessionId ? "workout" : K.label.toLowerCase()}</a>}
              <ActionBtn icon={Trash2} onClick={del} danger>Delete</ActionBtn>
            </div>
            <p className="mt-2 text-[11px] text-white/45 num">{p.w && p.h ? `${p.w}×${p.h} · ` : ""}{p.bytes ? `${Math.round(p.bytes / 1024)} KB · ` : ""}private — only visible after login</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ icon: I, children, onClick, danger }: { icon: typeof Camera; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx("inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm", danger ? "bg-bad/20 text-bad hover:bg-bad/30" : "bg-white/10 hover:bg-white/20")}>
      <I size={16} aria-hidden />{children}
    </button>
  );
}

// ---------------------------------------------------------------- new post (pick → preview → caption, type, date → share)

/** Instagram "new post" flow for a photo already picked: preview, type, caption, date. */
export function NewPhotoSheet({ file, onClose, onDone, onBack }: { file: Edited | null; onClose: () => void; onDone: () => void; onBack?: () => void }) {
  const [kind, setKind] = useState<RefKind>("progress");
  const [caption, setCaption] = useState("");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const preview = file?.dataUrl ?? null;
  useEffect(() => { if (file) { setCaption(""); setDate(today()); setErr(null); } }, [file]);

  async function share() {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      await uploadPhoto(file, { refKind: kind, caption: caption.trim() || null, date });
      onDone();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!file} onClose={onClose} title="New photo" icon={ImagePlus}>
      {preview && <img src={preview} alt="Edited photo" className="mx-auto max-h-[38dvh] rounded-xl bg-black object-contain" />}
      {onBack && <button type="button" onClick={onBack} className="mx-auto mt-1 flex min-h-11 items-center px-3 text-sm font-semibold text-info">Edit again</button>}
      <div className="mt-3 text-[11px] text-mute">Type</div>
      <Chips small clearable={false} options={[{ id: "progress", label: "Progress" }, { id: "other", label: "Other" }]} value={kind} onChange={(k) => k && setKind(k as RefKind)} />
      <label className="mt-3 block text-[11px] text-mute">Caption
        <textarea dir="auto" value={caption} maxLength={500} onChange={(e) => setCaption(e.target.value)} rows={2} placeholder="e.g. Week 4 · 80.5 kg · front relaxed"
          className="mt-1 w-full rounded-xl bg-card2 p-3 text-sm text-ink outline-none focus:ring-2 focus:ring-acc" />
      </label>
      <label className="mt-2 block text-[11px] text-mute">Date taken
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} className="mt-1 min-h-11 w-full rounded-xl bg-card2 px-3 text-sm text-ink outline-none" />
      </label>
      {kind === "progress" && <p className="mt-2 text-[11px] text-faint">Tip: same place, light and pose each time (front, side, back), morning, before eating — so photos compare fairly.</p>}
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <Btn kind="primary" className="mt-4 w-full" disabled={busy} onClick={share} icon={busy ? Loader2 : undefined}>{busy ? "Saving…" : "Share to profile"}</Btn>
    </Sheet>
  );
}
