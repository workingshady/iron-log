import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { send, track, uid } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, niceDate, today } from "../lib/util";
import { Btn, Sheet } from "./ui";

export interface PhotoMeta { id: string; refKind: string; refId: string | null; exKey: string | null; sessionId: string | null; date: string; caption: string | null; w: number | null; h: number | null; bytes: number | null; createdAt: number }
export const photoUrl = (id: string) => `/api/photos/${id}/img`;

/** Shrink on the phone before upload: longest side ≤ 1280 px, JPEG ~0.72 → usually 150-350 KB. */
async function compress(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file).catch(async () => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    return img as unknown as ImageBitmap;
  });
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  let q = 0.72, dataUrl = c.toDataURL("image/jpeg", q);
  while (dataUrl.length > 600_000 && q > 0.4) { q -= 0.1; dataUrl = c.toDataURL("image/jpeg", q); }
  return { dataUrl, w, h };
}

/**
 * Photos for one thing (a set, an exercise's machine setup, a journal entry): thumbnails + "add photo".
 * The phone offers camera or gallery. Needs a connection (photos aren't queued offline).
 */
export function PhotoStrip({ refKind, refId, exKey, sessionId, label = "Photo", compact }: { refKind: "set" | "exercise" | "journal" | "session" | "other"; refId: string; exKey?: string | null; sessionId?: string | null; label?: string; compact?: boolean }) {
  const q = refKind === "exercise" ? `ex=${encodeURIComponent(refId)}` : `ref=${encodeURIComponent(refId)}`;
  const { data, reload } = useLoad<PhotoMeta[]>(`/photos?${q}`);
  const list = (data ?? []).filter((p) => (refKind === "exercise" ? p.refKind === "exercise" : true));
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<PhotoMeta | null>(null);

  async function add(f: File | undefined) {
    if (!f) return;
    setErr(null);
    if (!navigator.onLine) return setErr("Offline — photos need a connection.");
    setBusy(true);
    try {
      const { dataUrl, w, h } = await compress(f);
      await send("POST", "/photos", { id: uid(), refKind, refId, exKey: exKey ?? (refKind === "exercise" ? refId : null), sessionId: sessionId ?? null, date: today(), dataUrl, w, h });
      track("photo_add", { refKind, kb: Math.round(dataUrl.length / 1365) });
      reload();
    } catch (e) {
      setErr(String((e as Error).message || e).slice(0, 120));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {list.map((p) => (
          <button key={p.id} onClick={() => setView(p)} className={cx("overflow-hidden rounded-lg bg-card3", compact ? "h-12 w-12" : "h-16 w-16")} aria-label={p.caption ?? "Open photo"}>
            <img src={photoUrl(p.id)} alt={p.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
        <button onClick={() => input.current?.click()} disabled={busy} className={cx("flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-xs text-info", compact ? "h-12 px-3" : "h-16 px-4")}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : list.length ? <ImagePlus size={16} /> : <Camera size={16} />}
          {busy ? "Saving…" : list.length ? "Add" : label}
        </button>
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => add(e.target.files?.[0])} />
      </div>
      {err && <p className="mt-1 text-[11px] text-bad">{err}</p>}
      {view && <PhotoViewer p={view} onClose={() => setView(null)} onChanged={() => { setView(null); reload(); }} />}
    </div>
  );
}

export function PhotoViewer({ p, onClose, onChanged }: { p: PhotoMeta; onClose: () => void; onChanged: () => void }) {
  const [cap, setCap] = useState(p.caption ?? "");
  return (
    <Sheet open onClose={onClose} title={niceDate(p.date)} icon={Camera}>
      <img src={photoUrl(p.id)} alt={p.caption ?? ""} className="w-full rounded-xl bg-black object-contain" style={{ maxHeight: "60vh" }} />
      <input dir="auto" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Caption (e.g. seat 4, pin 6)" className="mt-3 min-h-11 w-full rounded-xl bg-card2 px-3 text-sm outline-none focus:ring-2 focus:ring-acc" />
      <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
        <Btn kind="danger" icon={Trash2} label="Delete photo" onClick={async () => { if (!confirm("Delete this photo?")) return; await send("DELETE", `/photos/${p.id}`); track("photo_delete", {}); onChanged(); }} />
        <Btn kind="primary" disabled={cap === (p.caption ?? "")} onClick={async () => { await send("PUT", `/photos/${p.id}`, { caption: cap.trim() || null }); onChanged(); }}>Save caption</Btn>
      </div>
      <p className="mt-2 text-[11px] text-faint">{p.w && p.h ? `${p.w}×${p.h} · ` : ""}{p.bytes ? `${Math.round(p.bytes / 1024)} KB` : ""} · private (only after login)</p>
    </Sheet>
  );
}
