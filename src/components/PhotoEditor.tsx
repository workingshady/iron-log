import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Crop, Frame, Loader2, Maximize, Minimize, RotateCw, Scan, SlidersHorizontal, Sparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import { cx } from "../lib/util";

// Photo editor used for EVERY upload (profile photo, posts, set / machine / journal photos) so they all look consistent.
// Model (one source of truth, same maths for preview and export): aspect · zoom · pan (x, y) · rotation · fit/fill · filter ·
// adjustments · border. The crop frame stays still; you drag / pinch / wheel / arrow-key the photo underneath it.
// Output: JPEG (long side 1350 px, like Instagram's 1080×1350) + a small thumbnail for grids (3:4, or 1:1 for the profile photo).

export interface Edited { dataUrl: string; thumbUrl: string; w: number; h: number }
type Mode = "avatar" | "post";

export const ASPECTS: { id: string; label: string; r: number | null; hint: string }[] = [
  { id: "orig", label: "Original", r: null, hint: "Keep the photo's own shape" },
  { id: "1:1", label: "1:1", r: 1, hint: "Square" },
  { id: "4:5", label: "4:5", r: 4 / 5, hint: "Portrait post" },
  { id: "3:4", label: "3:4", r: 3 / 4, hint: "Profile grid shape" },
  { id: "9:16", label: "9:16", r: 9 / 16, hint: "Full-screen / story" },
  { id: "16:9", label: "16:9", r: 16 / 9, hint: "Wide" },
  { id: "1.91:1", label: "1.91:1", r: 1.91, hint: "Landscape post" },
];

const FILTERS: { id: string; label: string; css: string }[] = [
  { id: "none", label: "Normal", css: "" },
  { id: "vivid", label: "Vivid", css: "contrast(1.12) saturate(1.35)" },
  { id: "warm", label: "Warm", css: "sepia(0.22) saturate(1.2) brightness(1.03)" },
  { id: "cool", label: "Cool", css: "hue-rotate(-12deg) saturate(1.05) brightness(1.03) contrast(1.05)" },
  { id: "fade", label: "Fade", css: "contrast(0.85) brightness(1.08) saturate(0.8)" },
  { id: "drama", label: "Drama", css: "contrast(1.3) saturate(1.1) brightness(0.95)" },
  { id: "gym", label: "Gym", css: "contrast(1.2) saturate(0.85) brightness(1.02) sepia(0.08)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.1)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.45) brightness(0.9)" },
];

const ADJ = [
  { id: "brightness", label: "Brightness" },
  { id: "contrast", label: "Contrast" },
  { id: "saturation", label: "Saturation" },
  { id: "warmth", label: "Warmth" },
  { id: "vignette", label: "Vignette" },
] as const;
type Adj = Record<(typeof ADJ)[number]["id"], number>; // -100..100 (vignette 0..100)
const ADJ0: Adj = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0 };

const BORDERS: { id: string; label: string; color: string; sides: [number, number, number, number] }[] = [
  { id: "none", label: "None", color: "", sides: [0, 0, 0, 0] },
  { id: "thin", label: "Thin white", color: "#ffffff", sides: [0.015, 0.015, 0.015, 0.015] },
  { id: "thick", label: "Thick white", color: "#ffffff", sides: [0.05, 0.05, 0.05, 0.05] },
  { id: "black", label: "Black", color: "#000000", sides: [0.04, 0.04, 0.04, 0.04] },
  { id: "accent", label: "Lime", color: "#c8f560", sides: [0.025, 0.025, 0.025, 0.025] },
  { id: "polaroid", label: "Polaroid", color: "#f4f1ea", sides: [0.045, 0.045, 0.17, 0.045] }, // top right bottom left
];
const BGS = [{ id: "blur", label: "Blur" }, { id: "black", label: "Black" }, { id: "white", label: "White" }] as const;
type Bg = (typeof BGS)[number]["id"];

/** CSS / canvas filter string from the preset + sliders (canvas ctx.filter takes the same syntax). */
function filterCss(preset: string, a: Adj) {
  const p = FILTERS.find((f) => f.id === preset)?.css ?? "";
  const parts = [p];
  if (a.brightness) parts.push(`brightness(${1 + a.brightness / 200})`);
  if (a.contrast) parts.push(`contrast(${1 + a.contrast / 200})`);
  if (a.saturation) parts.push(`saturate(${1 + a.saturation / 100})`);
  if (a.warmth > 0) parts.push(`sepia(${a.warmth / 300}) saturate(${1 + a.warmth / 500})`);
  if (a.warmth < 0) parts.push(`hue-rotate(${a.warmth / 6}deg) saturate(${1 + a.warmth / 400})`);
  return parts.filter(Boolean).join(" ") || "none";
}

/** Decode once, orientation-corrected, capped at 2560 px → the same pixels feed the preview and the export. */
async function loadSource(src: File | string): Promise<{ canvas: HTMLCanvasElement; url: string; w: number; h: number }> {
  let bmp: ImageBitmap | HTMLImageElement;
  if (typeof src === "string") {
    const img = new Image();
    img.src = src;
    await img.decode();
    bmp = img;
  } else {
    if (!src.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(src.name)) throw new Error("That file isn't a photo.");
    if (src.size > 40 * 1024 * 1024) throw new Error("Photo is over 40 MB.");
    try {
      bmp = await createImageBitmap(src, { imageOrientation: "from-image" });
    } catch {
      throw new Error("Can't read this photo (HEIC?). Pick a JPEG, or set the camera to “Most compatible”.");
    }
  }
  const W0 = "naturalWidth" in bmp ? bmp.naturalWidth : bmp.width, H0 = "naturalHeight" in bmp ? bmp.naturalHeight : bmp.height;
  const s = Math.min(1, 2560 / Math.max(W0, H0));
  const c = document.createElement("canvas");
  c.width = Math.round(W0 * s); c.height = Math.round(H0 * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  if ("close" in bmp) bmp.close();
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.92));
  return { canvas: c, url: URL.createObjectURL(blob), w: c.width, h: c.height };
}

function jpeg(c: HTMLCanvasElement, max = 900_000) {
  let q = 0.85, d = c.toDataURL("image/jpeg", q);
  while (d.length > max && q > 0.45) { q -= 0.08; d = c.toDataURL("image/jpeg", q); }
  return d;
}

/** Full-screen editor. `src` = a picked file or an existing photo URL (same origin). */
export function PhotoEditor({ src, mode = "post", title, onCancel, onDone, defaultAspect }: {
  src: File | string; mode?: Mode; title?: string; onCancel: () => void; onDone: (r: Edited) => void; defaultAspect?: string;
}) {
  const avatar = mode === "avatar";
  const [img, setImg] = useState<{ canvas: HTMLCanvasElement; url: string; w: number; h: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aspect, setAspect] = useState(avatar ? "1:1" : defaultAspect ?? "orig");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rot, setRot] = useState(0);
  const [fit, setFit] = useState(false);
  const [bg, setBg] = useState<Bg>("blur");
  const [preset, setPreset] = useState("none");
  const [adj, setAdj] = useState<Adj>(ADJ0);
  const [adjKey, setAdjKey] = useState<keyof Adj>("brightness");
  const [border, setBorder] = useState("none");
  const [tool, setTool] = useState<"crop" | "filter" | "adjust" | "border">("crop");
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState({ w: 360, h: 480 }); // available space for the frame
  const area = useRef<HTMLDivElement>(null);
  const doneBtn = useRef<HTMLButtonElement>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);

  useEffect(() => {
    let url = "";
    loadSource(src).then((r) => { url = r.url; setImg(r); }).catch((e) => setErr((e as Error).message));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [src]);

  // modal basics: lock page scroll, focus, Esc
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    doneBtn.current?.focus();
    return () => { document.body.style.overflow = o; opener?.focus?.({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onCancel]);

  // available space
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- geometry (shared by preview + export)
  const rw = img ? (rot % 180 ? img.h : img.w) : 1, rh = img ? (rot % 180 ? img.w : img.h) : 1;
  const ratio = ASPECTS.find((a) => a.id === aspect)?.r ?? rw / rh;
  const vw = Math.max(80, Math.min(box.w - 24, (box.h - 24) * ratio)), vh = vw / ratio; // frame size on screen
  const cover = Math.max(vw / rw, vh / rh), contain = Math.min(vw / rw, vh / rh);
  const minZ = fit ? contain / cover : 1;
  const z = Math.max(minZ, zoom);
  const clampPan = useCallback((p: { x: number; y: number }, zz = z) => {
    const mx = Math.abs(rw * cover * zz - vw) / 2, my = Math.abs(rh * cover * zz - vh) / 2;
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  }, [rw, rh, cover, vw, vh, z]);
  const P = clampPan(pan);
  const iw = img ? img.w * cover * z : 0, ih = img ? img.h * cover * z : 0; // <img> box before rotation
  const filter = filterCss(preset, adj);
  const bd = BORDERS.find((b) => b.id === border)!;
  const m = Math.min(vw, vh);

  const setZ = (nz: number) => { const zz = Math.max(minZ, Math.min(6, nz)); setZoom(zz); setPan((p) => clampPan(p, zz)); };
  const center = () => { setPan({ x: 0, y: 0 }); setZoom(minZ); };

  // ---- gestures: 1 finger = move, 2 = pinch zoom, wheel = zoom, arrows / +/- = keyboard
  const onDown = (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); setMoving(true); };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    ptrs.current.set(e.pointerId, cur);
    const pts = [...ptrs.current.values()];
    if (pts.length >= 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (!pinch.current) pinch.current = { d, z };
      else setZ(pinch.current.z * (d / pinch.current.d));
    } else setPan((p) => clampPan({ x: p.x + (cur.x - prev.x), y: p.y + (cur.y - prev.y) }));
  };
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) pinch.current = null; if (!ptrs.current.size) { setMoving(false); setPan((p) => clampPan(p)); } };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (mv[e.key]) { e.preventDefault(); setPan((p) => clampPan({ x: p.x + mv[e.key][0], y: p.y + mv[e.key][1] })); }
    else if (e.key === "+" || e.key === "=") setZ(z * 1.1);
    else if (e.key === "-") setZ(z / 1.1);
    else if (e.key === "0") center();
  };

  // changing shape / rotation / fit → start centred (predictable)
  useEffect(() => { setPan({ x: 0, y: 0 }); setZoom(fit ? 0 : 1); }, [aspect, rot, fit]); // fit = whole photo visible

  async function done() {
    if (!img) return;
    setBusy(true);
    try {
      const L = avatar ? 720 : 1350;
      const OW = Math.round(ratio >= 1 ? L : L * ratio), OH = Math.round(ratio >= 1 ? L / ratio : L);
      const k = OW / vw;
      const c = document.createElement("canvas");
      c.width = OW; c.height = OH;
      const g = c.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      // background (only visible when the photo is fitted inside the frame)
      if (fit && bg === "blur") {
        g.filter = `blur(${Math.round(OW / 24)}px) brightness(0.7)`;
        const cs = Math.max(OW / rw, OH / rh) * 1.15;
        g.save(); g.translate(OW / 2, OH / 2); g.rotate((rot * Math.PI) / 180);
        g.drawImage(img.canvas, (-img.w * cs) / 2, (-img.h * cs) / 2, img.w * cs, img.h * cs);
        g.restore(); g.filter = "none";
      } else { g.fillStyle = bg === "white" && fit ? "#ffffff" : "#000000"; g.fillRect(0, 0, OW, OH); }
      // the photo, exactly as framed
      g.filter = filter;
      g.save();
      g.translate(OW / 2 + P.x * k, OH / 2 + P.y * k);
      g.rotate((rot * Math.PI) / 180);
      g.drawImage(img.canvas, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
      g.restore();
      g.filter = "none";
      // vignette
      if (adj.vignette > 0) {
        const r = g.createRadialGradient(OW / 2, OH / 2, Math.min(OW, OH) * 0.35, OW / 2, OH / 2, Math.hypot(OW, OH) / 2);
        r.addColorStop(0, "rgba(0,0,0,0)"); r.addColorStop(1, `rgba(0,0,0,${(adj.vignette / 100) * 0.75})`);
        g.fillStyle = r; g.fillRect(0, 0, OW, OH);
      }
      // border / frame
      if (!avatar && bd.color) {
        const M = Math.min(OW, OH), [t, rr, b, l] = bd.sides.map((s) => Math.round(s * M));
        g.fillStyle = bd.color;
        g.fillRect(0, 0, OW, t); g.fillRect(0, OH - b, OW, b); g.fillRect(0, 0, l, OH); g.fillRect(OW - rr, 0, rr, OH);
      }
      // grid thumbnail: 3:4 (profile grid shape) or square for the profile photo
      const ta = avatar ? 1 : 3 / 4, TW = 360, TH = Math.round(TW / ta);
      const t = document.createElement("canvas");
      t.width = TW; t.height = TH;
      const sc = Math.max(TW / OW, TH / OH);
      t.getContext("2d")!.drawImage(c, (TW - OW * sc) / 2, (TH - OH * sc) / 2, OW * sc, OH * sc);
      onDone({ dataUrl: jpeg(c), thumbUrl: t.toDataURL("image/jpeg", 0.72), w: OW, h: OH });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const tools = useMemo(() => [
    { id: "crop" as const, label: "Crop", icon: Crop },
    { id: "filter" as const, label: "Filters", icon: Sparkles },
    { id: "adjust" as const, label: "Adjust", icon: SlidersHorizontal },
    ...(avatar ? [] : [{ id: "border" as const, label: "Border", icon: Frame }]),
  ], [avatar]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title ?? (avatar ? "Edit profile photo" : "Edit photo")} className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      {/* top bar */}
      <div className="flex items-center px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onCancel} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Cancel"><X size={22} aria-hidden /></button>
        <h2 className="flex-1 text-center text-base font-semibold">{title ?? (avatar ? "Profile photo" : "Edit photo")}</h2>
        <button ref={doneBtn} type="button" onClick={done} disabled={!img || busy} className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 font-semibold text-acc hover:bg-white/10 disabled:opacity-40">
          {busy ? <Loader2 size={18} className="animate-spin" aria-label="Saving" /> : <><Check size={18} aria-hidden />Done</>}
        </button>
      </div>

      {/* frame */}
      <div ref={area} className="relative flex min-h-0 flex-1 items-center justify-center">
        {err && <p role="alert" className="max-w-xs text-center text-sm text-bad">{err}</p>}
        {!img && !err && <Loader2 size={28} className="animate-spin text-white/60" aria-label="Loading photo" />}
        {img && (
          <div
            tabIndex={0} role="application" aria-roledescription="photo framer"
            aria-label="Photo position. Drag to move, pinch or scroll to zoom. Arrow keys move, plus and minus zoom, 0 centres."
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            onWheel={(e) => setZ(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))} onKeyDown={onKey}
            className="relative cursor-grab touch-none select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-acc active:cursor-grabbing"
            style={{ width: vw, height: vh, background: fit ? (bg === "white" ? "#fff" : "#000") : "#000" }}
          >
            {fit && bg === "blur" && (
              <img src={img.url} alt="" aria-hidden draggable={false} className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{ width: img.w * cover * 1.15, height: img.h * cover * 1.15, transform: `translate(-50%,-50%) rotate(${rot}deg)`, filter: `blur(${Math.round(vw / 24)}px) brightness(0.7)` }} />
            )}
            <img src={img.url} alt="" draggable={false} className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{ width: iw, height: ih, transform: `translate(-50%,-50%) translate(${P.x}px,${P.y}px) rotate(${rot}deg)`, filter, transition: moving ? "none" : "transform .15s" }} />
            {adj.vignette > 0 && <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle, transparent 45%, rgba(0,0,0,${(adj.vignette / 100) * 0.75}) 100%)` }} />}
            {!avatar && bd.color && (
              <div className="pointer-events-none absolute inset-0" style={{ borderStyle: "solid", borderColor: bd.color, borderWidth: bd.sides.map((s) => `${s * m}px`).join(" ") }} />
            )}
            {/* rule-of-thirds grid while moving / cropping */}
            <div className={cx("pointer-events-none absolute inset-0 transition-opacity", moving || tool === "crop" ? "opacity-100" : "opacity-0")} aria-hidden
              style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.35) 1px, transparent 1px)", backgroundSize: `${vw / 3}px ${vh / 3}px`, backgroundPosition: "-1px -1px" }} />
            {avatar && <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,.72)] ring-1 ring-white/60" aria-hidden />}
          </div>
        )}
      </div>

      {/* zoom + quick actions */}
      <div className="mx-auto flex w-full max-w-lg items-center gap-1 px-3 pt-2">
        <button type="button" onClick={() => setZ(z / 1.15)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10" aria-label="Zoom out"><ZoomOut size={18} aria-hidden /></button>
        <input type="range" min={minZ} max={6} step={0.01} value={z} onChange={(e) => setZ(Number(e.target.value))} aria-label="Zoom" className="min-w-0 flex-1 accent-[var(--color-acc)]" />
        <button type="button" onClick={() => setZ(z * 1.15)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10" aria-label="Zoom in"><ZoomIn size={18} aria-hidden /></button>
        <button type="button" onClick={center} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10" aria-label="Centre the photo" title="Centre"><Scan size={18} aria-hidden /></button>
        <button type="button" onClick={() => setRot((r) => (r + 90) % 360)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10" aria-label="Rotate 90°" title="Rotate"><RotateCw size={18} aria-hidden /></button>
        {!avatar && (
          <button type="button" onClick={() => setFit(!fit)} aria-pressed={fit} className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10", fit && "text-acc")}
            aria-label={fit ? "Fill the frame" : "Fit the whole photo"} title={fit ? "Fill" : "Fit whole photo"}>{fit ? <Maximize size={18} aria-hidden /> : <Minimize size={18} aria-hidden />}</button>
        )}
      </div>

      {/* tool panel */}
      <div className="mx-auto min-h-[104px] w-full max-w-lg px-3 py-2">
        {tool === "crop" && (
          <div className="space-y-2">
            {!avatar && (
              <Row label="Shape">
                {ASPECTS.map((a) => <Chip key={a.id} on={aspect === a.id} onClick={() => setAspect(a.id)} title={a.hint}>{a.label}</Chip>)}
              </Row>
            )}
            {fit && <Row label="Background">{BGS.map((b) => <Chip key={b.id} on={bg === b.id} onClick={() => setBg(b.id)}>{b.label}</Chip>)}</Row>}
            {avatar && <p className="text-center text-xs text-white/60">Drag to move · pinch to zoom · the circle is what everyone sees</p>}
          </div>
        )}
        {tool === "filter" && img && (
          <ul className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filters">
            {FILTERS.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => setPreset(f.id)} aria-pressed={preset === f.id} className="flex w-16 flex-col items-center gap-1 text-[11px]">
                  <span className={cx("h-16 w-16 overflow-hidden rounded-lg ring-2", preset === f.id ? "ring-acc" : "ring-transparent")}>
                    <img src={img.url} alt="" className="h-full w-full object-cover" style={{ filter: f.css || "none" }} />
                  </span>
                  <span className={preset === f.id ? "font-semibold text-white" : "text-white/70"}>{f.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {tool === "adjust" && (
          <div>
            <Row label="">{ADJ.map((a) => <Chip key={a.id} on={adjKey === a.id} onClick={() => setAdjKey(a.id)}>{a.label}{adj[a.id] ? " •" : ""}</Chip>)}</Row>
            <div className="mt-2 flex items-center gap-2">
              <input type="range" min={adjKey === "vignette" ? 0 : -100} max={100} value={adj[adjKey]} onChange={(e) => setAdj({ ...adj, [adjKey]: Number(e.target.value) })}
                aria-label={ADJ.find((a) => a.id === adjKey)!.label} className="min-w-0 flex-1 accent-[var(--color-acc)]" />
              <span className="w-10 text-right text-sm num">{adj[adjKey] > 0 ? "+" : ""}{adj[adjKey]}</span>
              <button type="button" onClick={() => setAdj(ADJ0)} className="min-h-11 rounded-full px-3 text-xs text-white/70 hover:bg-white/10">Reset</button>
            </div>
          </div>
        )}
        {tool === "border" && <Row label="Border">{BORDERS.map((b) => <Chip key={b.id} on={border === b.id} onClick={() => setBorder(b.id)}>{b.color && <span className="mr-1 inline-block h-3 w-3 rounded-sm border border-white/30" style={{ background: b.color }} />}{b.label}</Chip>)}</Row>}
      </div>

      {/* tool tabs */}
      <div role="tablist" aria-label="Edit tools" className="mx-auto flex w-full max-w-lg border-t border-white/10 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        {tools.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tool === t.id} onClick={() => setTool(t.id)}
            className={cx("flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", tool === t.id ? "font-semibold text-white" : "text-white/55")}>
            <t.icon size={20} aria-hidden />{t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={label || undefined}>
      {children}
    </div>
  );
}
function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on}
      className={cx("flex h-9 shrink-0 items-center rounded-full border px-3.5 text-xs num", on ? "border-white bg-white font-semibold text-black" : "border-white/25 text-white/80 hover:border-white/50")}>
      {children}
    </button>
  );
}
