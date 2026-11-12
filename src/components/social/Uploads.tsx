import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertCircle, Check, RotateCw, X } from "lucide-react";
import type { Post, PostKind, PrSummary, UserLite, WorkoutSummary } from "../../../shared/social";
import { today } from "../../lib/util";
import { cx } from "../../lib/util";
import type { Edited } from "../PhotoEditor";
import { sx } from "./lib";

// Background posting (Instagram flow): Share closes the composer at once, the post appears at the top of the feed
// (optimistic) and a small progress toast stays on screen while you navigate. Photos go up one by one with real byte
// progress (XHR); then the post is created. A failure keeps everything in memory → Retry, or discard. Ids are generated
// on the phone, so a retry never duplicates a photo or a post (both endpoints are idempotent per id).

export type PhotoItem = { kind: "new"; edited: Edited; id: string; done: boolean } | { kind: "existing"; id: string };
export interface Job {
  id: string; // = post id
  kind: PostKind; text: string; visibility: "friends" | "private";
  photos: PhotoItem[]; sessionId?: string | null; setId?: string | null;
  data: WorkoutSummary | PrSummary | null; author: UserLite; createdAt: number;
  progress: number; state: "uploading" | "posting" | "done" | "error"; error?: string;
}

let jobs: Job[] = [];
const subs = new Set<(j: Job[]) => void>();
const emit = () => { jobs = [...jobs]; subs.forEach((f) => f(jobs)); };
const set = (id: string, patch: Partial<Job>) => { jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)); emit(); };

export function useUploads() {
  const [v, setV] = useState(jobs);
  useEffect(() => { subs.add(setV); setV(jobs); return () => { subs.delete(setV); }; }, []);
  return v;
}

/** Local image for a pending photo (data URL) or the server URL for an existing one. */
export const localSrc = (p: PhotoItem, thumb = false) => (p.kind === "new" ? (thumb ? p.edited.thumbUrl : p.edited.dataUrl) : `/api/social/photos/${encodeURIComponent(p.id)}/img${thumb ? "?s=t" : ""}`);

/** A pending job shaped like a feed post, for the optimistic card. */
export function jobAsPost(j: Job): Post {
  return { id: j.id, kind: j.kind, text: j.text || null, photoIds: j.photos.map((p) => p.id), data: j.data, visibility: j.visibility, createdAt: j.createdAt, updatedAt: j.createdAt, author: j.author, likes: 0, liked: false, comments: 0, preview: null, mine: true, likedBy: [] };
}

function xhrUpload(body: string, onProgress: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", "/api/photos");
    x.withCredentials = true;
    x.setRequestHeader("content-type", "application/json");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) return resolve();
      let msg = x.statusText || "Upload failed";
      try { msg = (JSON.parse(x.responseText) as { error?: string }).error ?? msg; } catch { /* keep */ }
      reject(new Error(msg));
    };
    x.onerror = () => reject(new Error("Connection lost"));
    x.send(body);
  });
}

async function run(id: string) {
  const j0 = jobs.find((j) => j.id === id);
  if (!j0) return;
  set(id, { state: "uploading", error: undefined });
  try {
    if (!navigator.onLine) throw new Error("You're offline");
    const todo = j0.photos.filter((p): p is Extract<PhotoItem, { kind: "new" }> => p.kind === "new" && !p.done);
    const sizes = todo.map((p) => p.edited.dataUrl.length + p.edited.thumbUrl.length);
    const total = sizes.reduce((a, b) => a + b, 0) || 1;
    let sent = 0;
    for (const [i, p] of todo.entries()) {
      const body = JSON.stringify({ id: p.id, refKind: j0.kind === "progress" ? "progress" : "other", date: today(), dataUrl: p.edited.dataUrl, thumbUrl: p.edited.thumbUrl, w: p.edited.w, h: p.edited.h });
      await xhrUpload(body, (f) => set(id, { progress: Math.min(0.92, ((sent + f * sizes[i]) / total) * 0.92) }));
      sent += sizes[i];
      p.done = true;
    }
    set(id, { state: "posting", progress: 0.95 });
    await sx("POST", "/posts", { id, kind: j0.kind, text: j0.text, visibility: j0.visibility, photoIds: j0.photos.map((p) => p.id), sessionId: j0.sessionId ?? undefined, setId: j0.setId ?? undefined });
    set(id, { state: "done", progress: 1 });
    window.dispatchEvent(new CustomEvent("il:posted", { detail: id }));
    setTimeout(() => { jobs = jobs.filter((j) => j.id !== id); emit(); }, 2600);
  } catch (e) {
    set(id, { state: "error", error: (e as Error).message });
  }
}

export function startPost(j: Omit<Job, "progress" | "state" | "createdAt">) {
  mountToast();
  jobs = [{ ...j, createdAt: Date.now(), progress: 0.03, state: "uploading" }, ...jobs];
  emit();
  void run(j.id);
}
export const retryPost = (id: string) => void run(id);
export const discardPost = (id: string) => { jobs = jobs.filter((j) => j.id !== id); emit(); };

// ---------------------------------------------------------------- toast (mounts itself once, survives navigation)

let mounted = false;
function mountToast() {
  if (mounted || typeof document === "undefined") return;
  mounted = true;
  const el = document.createElement("div");
  el.id = "il-upload-toast";
  document.body.appendChild(el);
  createRoot(el).render(<UploadToast />);
}

export function UploadToast() {
  const list = useUploads();
  const j = list[0];
  if (!j) return null;
  const first = j.photos[0];
  const label = j.state === "done" ? "Shared" : j.state === "error" ? "Couldn't share" : j.state === "posting" ? "Almost done…" : list.length > 1 ? `Posting ${list.length}…` : "Posting…";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[60] flex justify-center px-3 md:pl-60">
      <div role="status" aria-live="polite" className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl bg-card2/95 shadow-xl ring-1 ring-line/60 backdrop-blur">
        <div className="flex items-center gap-3 p-2 pr-1">
          {first ? <img src={localSrc(first, true)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-acc/15 text-sm font-bold text-acc" aria-hidden>{j.kind === "pr" ? "PR" : "✍"}</span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {j.state === "done" && <Check size={15} className="text-acc" aria-hidden />}
              {j.state === "error" && <AlertCircle size={15} className="text-bad" aria-hidden />}
              {label}
            </div>
            <div className="truncate text-xs text-mute">{j.state === "error" ? j.error : j.text || (j.kind === "workout" ? (j.data as WorkoutSummary | null)?.dayName ?? "Workout" : j.photos.length ? `${j.photos.length} photo${j.photos.length > 1 ? "s" : ""}` : "")}</div>
          </div>
          {j.state === "error" ? (
            <>
              <button type="button" onClick={() => retryPost(j.id)} className="flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-acc hover:bg-card3"><RotateCw size={15} aria-hidden />Retry</button>
              <button type="button" onClick={() => discardPost(j.id)} className="flex h-11 w-11 items-center justify-center rounded-full text-mute hover:bg-card3" aria-label="Discard post"><X size={18} aria-hidden /></button>
            </>
          ) : <span className="w-2" />}
        </div>
        <div className="h-1 bg-card3" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(j.progress * 100)}>
          <div className={cx("h-full transition-[width] duration-300 motion-reduce:transition-none", j.state === "error" ? "bg-bad" : "bg-acc")} style={{ width: `${Math.round(j.progress * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
