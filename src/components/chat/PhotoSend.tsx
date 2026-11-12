import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Loader2, Pencil, Plus, SendHorizontal, X } from "lucide-react";
import { cx } from "../../lib/util";
import { compress } from "../Photos";
import { PhotoEditor, type Edited } from "../PhotoEditor";

export const MAX_PHOTOS = 10;
type Item = { key: string; file: File; ed: Edited | null; edited: boolean; err: string | null; caption: string };
const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
const toItems = (fs: File[], room: number): Item[] =>
  fs.filter(isImage).slice(0, Math.max(0, room)).map((file) => ({ key: crypto.randomUUID(), file, ed: null, edited: false, err: null, caption: "" }));

/**
 * Review screen before photos are sent (WhatsApp / Telegram style): up to 10, each compressed right away
 * (1280 px JPEG, ≤ ~600 KB: "send as is"), or opened in the PhotoEditor (crop, filters…). Optional caption per photo.
 */
export function PhotoSend({ files, onCancel, onSend, title }: { files: File[]; onCancel: () => void; onSend: (items: { dataUrl: string; w: number; h: number; caption: string }[]) => void; title: string }) {
  const [items, setItems] = useState<Item[]>(() => toItems(files, MAX_PHOTOS));
  const [cur, setCur] = useState(0);
  const [editing, setEditing] = useState<Item | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const more = useRef<HTMLInputElement>(null);
  const cap = useRef<HTMLInputElement>(null);

  useEffect(() => { if (files.length > MAX_PHOTOS) setNote(`Up to ${MAX_PHOTOS} photos at a time`); }, [files]);
  function add(fs: File[]) {
    const room = MAX_PHOTOS - items.length;
    if (fs.length > room) setNote(`Up to ${MAX_PHOTOS} photos at a time`);
    setItems((old) => [...old, ...toItems(fs, MAX_PHOTOS - old.length)]);
  }
  // compress one at a time (big phone photos are heavy to decode)
  useEffect(() => {
    const todo = items.find((x) => !x.ed && !x.err);
    if (!todo) return;
    let alive = true;
    compress(todo.file)
      .then((r) => alive && setItems((s) => s.map((x) => (x.key === todo.key ? { ...x, ed: r } : x))))
      .catch((e) => alive && setItems((s) => s.map((x) => (x.key === todo.key ? { ...x, err: (e as Error).message } : x))));
    return () => { alive = false; };
  }, [items]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 3000); return () => clearTimeout(t); }, [note]);
  useEffect(() => { if (items.length && cur >= items.length) setCur(items.length - 1); }, [items.length, cur]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !editing) { e.preventDefault(); onCancel(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [editing, onCancel]);

  const it = items[cur];
  const ready = items.filter((x) => x.ed);
  const busy = items.some((x) => !x.ed && !x.err);
  const remove = (key: string) => setItems((s) => { const n = s.filter((x) => x.key !== key); if (!n.length) onCancel(); return n; });
  const send = () => { if (!ready.length || busy) return; onSend(ready.map((x) => ({ dataUrl: x.ed!.dataUrl, w: x.ed!.w, h: x.ed!.h, caption: x.caption }))); };

  // portal: the composer has a backdrop-filter, which would trap a position:fixed child inside it
  if (editing)
    return createPortal(
      <PhotoEditor src={editing.file} mode="post" title="Edit photo" defaultAspect="orig"
        onCancel={() => setEditing(null)}
        onDone={(r) => { setItems((s) => s.map((x) => (x.key === editing.key ? { ...x, ed: r, edited: true, err: null } : x))); setEditing(null); }} />,
      document.body,
    );

  return createPortal(
    <div className="fixed inset-0 z-[55] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex shrink-0 items-center gap-1 px-1 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onCancel} autoFocus className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-white/10" aria-label="Cancel, don't send"><X size={24} aria-hidden /></button>
        <p className="min-w-0 flex-1 truncate font-semibold">{items.length > 1 ? `${items.length} photos` : "Photo"}</p>
        {it?.ed && (
          <button type="button" onClick={() => setEditing(it)} className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-white/10">
            <Pencil size={17} aria-hidden /> Edit{it.edited ? "ed" : ""}
          </button>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        {it?.err ? (
          <p className="flex max-w-xs items-center gap-2 text-center text-sm text-bad" role="alert"><AlertCircle size={18} aria-hidden /> {it.err}</p>
        ) : it?.ed ? (
          <img src={it.ed.dataUrl} alt={`Photo ${cur + 1} of ${items.length}`} className="max-h-full max-w-full object-contain" />
        ) : <Loader2 className="animate-spin text-white/70" aria-label="Preparing photo" />}
        {note && <p role="status" className="absolute inset-x-0 top-3 mx-auto w-max max-w-[90%] rounded-full bg-white/15 px-4 py-2 text-sm backdrop-blur">{note}</p>}
      </div>
      <div className="flex shrink-0 gap-2.5 overflow-x-auto px-3 pb-2 pt-2.5" role="list" aria-label="Photos to send">
        {items.map((x, i) => (
          <div key={x.key} role="listitem" className="relative shrink-0">
            <button type="button" onClick={() => setCur(i)} aria-label={`Photo ${i + 1}${x.err ? ", can't be sent" : ""}`} aria-current={i === cur}
              className={cx("block h-14 w-14 overflow-hidden rounded-lg border-2", i === cur ? "border-acc" : "border-transparent opacity-80")}>
              {x.ed ? <img src={x.ed.thumbUrl} alt="" className="h-full w-full object-cover" /> : x.err ? <AlertCircle className="m-auto text-bad" aria-hidden /> : <Loader2 size={18} className="m-auto animate-spin" aria-hidden />}
            </button>
            {items.length > 1 && (
              <button type="button" onClick={() => remove(x.key)} aria-label={`Remove photo ${i + 1}`}
                className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-card3 text-white shadow before:absolute before:-inset-2 before:content-['']"><X size={14} aria-hidden /></button>
            )}
          </div>
        ))}
        {items.length < MAX_PHOTOS && (
          <button type="button" onClick={() => more.current?.click()} aria-label="Add more photos" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-white/30 text-white/80 hover:bg-white/10"><Plus size={22} aria-hidden /></button>
        )}
        <input ref={more} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; add(fs); }} />
      </div>
      <form className="flex shrink-0 items-center gap-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Caption for photo {cur + 1}</span>
          <input ref={cap} value={it?.caption ?? ""} maxLength={1000} dir="auto" placeholder="Add a caption…" disabled={!it}
            onChange={(e) => { const v = e.target.value; setItems((s) => s.map((x, i) => (i === cur ? { ...x, caption: v } : x))); }}
            className="h-12 w-full rounded-full bg-white/10 px-4 text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-acc/70" />
        </label>
        <button type="submit" disabled={!ready.length || busy} aria-label={`Send ${ready.length} photo${ready.length === 1 ? "" : "s"}`}
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-acc text-acc-ink disabled:opacity-40">
          {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <SendHorizontal size={21} aria-hidden />}
          {ready.length > 1 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-black tabular-nums" aria-hidden>{ready.length}</span>}
        </button>
      </form>
    </div>,
    document.body,
  );
}
