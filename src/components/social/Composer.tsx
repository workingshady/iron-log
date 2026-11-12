import { useEffect, useRef, useState } from "react";
import { Camera, Check, Dumbbell, Globe2, ImagePlus, Loader2, Lock, PenLine, Share2, TrendingUp, Trophy, Type } from "lucide-react";
import { LIMITS, type PostKind } from "../../../shared/social";
import { uid } from "../../lib/api";
import { cx, niceDate } from "../../lib/util";
import { Btn, Chips, Sheet } from "../ui";
import { uploadPhoto } from "../Photos";
import { PhotoEditor, type Edited } from "../PhotoEditor";
import { INPUT, socialPhotoUrl, sx } from "./lib";

interface Shareable { workouts: { id: string; date: string; dayName: string }[]; prs: { id: string; name: string; kg: number | null; reps: number | null; doneAt: number }[] }
interface MyPhoto { id: string; date: string; refKind: string; caption: string | null; visibility: string }

const KINDS: { id: PostKind; label: string; icon: typeof Type }[] = [
  { id: "workout", label: "Workout", icon: Dumbbell },
  { id: "photo", label: "Photo", icon: Camera },
  { id: "progress", label: "Progress", icon: TrendingUp },
  { id: "pr", label: "PR", icon: Trophy },
  { id: "text", label: "Text", icon: Type },
];

/** New post sheet: pick a kind → pick what to share → caption → who sees it. One primary button. */
export function Composer({ open, onClose, onPosted, initial }: { open: boolean; onClose: () => void; onPosted: () => void; initial?: { kind?: PostKind; sessionId?: string } }) {
  const [kind, setKind] = useState<PostKind>(initial?.kind ?? "workout");
  const [text, setText] = useState("");
  const [vis, setVis] = useState<"friends" | "private">("friends");
  const [sessionId, setSessionId] = useState<string | null>(initial?.sessionId ?? null);
  const [setId, setSetId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [share, setShare] = useState<Shareable | null>(null);
  const [mine, setMine] = useState<MyPhoto[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    sx<Shareable>("GET", "/social/shareable").then((s) => { setShare(s); if (!sessionId && s.workouts[0]) setSessionId(s.workouts[0].id); if (s.prs[0]) setSetId((x) => x ?? s.prs[0].id); }).catch(() => setShare({ workouts: [], prs: [] }));
    sx<MyPhoto[]>("GET", "/social/my-photos").then(setMine).catch(() => setMine([]));
    sx<{ photos: "friends" | "private" }>("GET", "/privacy").then((p) => setVis(p.photos)).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsPhotos = kind === "photo" || kind === "progress";
  const ready = !busy && !uploading && (kind === "text" ? !!text.trim() : kind === "workout" ? !!sessionId : kind === "pr" ? !!setId : photos.length > 0);

  async function upload(x: Edited) {
    setFile(null); setUploading(x.thumbUrl); setErr(null);
    try {
      const id = await uploadPhoto(x, { refKind: kind === "progress" ? "progress" : "other" });
      setPhotos((p) => [...p, id].slice(0, LIMITS.photosPerPost));
      setMine((m) => [{ id, date: "", refKind: "other", caption: null, visibility: "private" }, ...(m ?? [])]);
    } catch (e) { setErr((e as Error).message); }
    finally { setUploading(null); }
  }
  async function post() {
    setBusy(true); setErr(null);
    try {
      await sx("POST", "/posts", { id: uid(), kind, text, visibility: vis, photoIds: needsPhotos || kind === "workout" ? photos : [], sessionId: kind === "workout" ? sessionId : undefined, setId: kind === "pr" ? setId : undefined });
      setText(""); setPhotos([]);
      onPosted();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  const toggle = (id: string) => setPhotos((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < LIMITS.photosPerPost ? [...p, id] : p));

  return (
    <Sheet open={open} onClose={onClose} title="New post" icon={PenLine}>
      <div role="radiogroup" aria-label="Post type" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
            className={cx("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm", kind === k.id ? "border-acc bg-acc font-semibold text-acc-ink" : "border-line hover:bg-card2")}>
            <k.icon size={15} aria-hidden />{k.label}
          </button>
        ))}
      </div>

      {kind === "workout" && (
        <fieldset className="mt-3">
          <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-mute">Which workout</legend>
          {share == null ? <p className="text-sm text-mute" role="status">Loading…</p> : share.workouts.length === 0 ? <p className="text-sm text-mute">Finish a workout first, then share it here.</p> : (
            <select value={sessionId ?? ""} onChange={(e) => setSessionId(e.target.value)} className={INPUT} aria-label="Workout">
              {share.workouts.map((w) => <option key={w.id} value={w.id}>{w.dayName} · {niceDate(w.date)}</option>)}
            </select>
          )}
          <p className="mt-1 text-[11px] text-faint">Shares day, time, sets, volume, best sets and PRs. Never your notes, pain or readiness.</p>
        </fieldset>
      )}
      {kind === "pr" && (
        <fieldset className="mt-3">
          <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-mute">Which PR</legend>
          {share == null ? <p className="text-sm text-mute" role="status">Loading…</p> : share.prs.length === 0 ? <p className="text-sm text-mute">No PRs yet: they appear here when you beat your best.</p> : (
            <select value={setId ?? ""} onChange={(e) => setSetId(e.target.value)} className={INPUT} aria-label="PR">
              {share.prs.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.kg ? `${p.kg} kg × ` : ""}{p.reps ?? ""} · {new Date(p.doneAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</option>)}
            </select>
          )}
        </fieldset>
      )}

      {(needsPhotos || kind === "workout") && (
        <fieldset className="mt-3">
          <legend className="mb-1 flex w-full justify-between text-[11px] font-semibold uppercase tracking-wide text-mute"><span>Photos{kind === "workout" ? " (optional)" : ""}</span><span className="num">{photos.length}/{LIMITS.photosPerPost}</span></legend>
          <ul className="grid grid-cols-4 gap-1">
            <li>
              <button type="button" onClick={() => pick.current?.click()} disabled={!!uploading || photos.length >= LIMITS.photosPerPost} className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-[11px] text-info hover:bg-card2 disabled:opacity-40">
                {uploading ? <Loader2 size={18} className="animate-spin" aria-label="Uploading" /> : <ImagePlus size={18} aria-hidden />}New
              </button>
            </li>
            {(mine ?? []).slice(0, 39).map((m) => {
              const on = photos.includes(m.id);
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => toggle(m.id)} aria-pressed={on} aria-label={`Photo${m.date ? ` from ${niceDate(m.date)}` : ""}${on ? ", selected" : ""}`} className={cx("relative block aspect-square w-full overflow-hidden rounded-lg bg-card3", on && "ring-2 ring-acc")}>
                    <img src={socialPhotoUrl(m.id, true)} alt="" loading="lazy" className={cx("h-full w-full object-cover", on && "opacity-80")} />
                    {on && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-acc text-[11px] font-bold text-acc-ink num" aria-hidden>{photos.indexOf(m.id) + 1}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {mine == null && <p className="mt-1 text-xs text-mute" role="status">Loading your photos…</p>}
        </fieldset>
      )}

      <label className="mt-3 block">
        <span className="mb-1 flex justify-between text-[11px] text-mute"><span>{kind === "text" ? "What's up?" : "Caption"}</span><span className="text-faint num">{text.length}/{LIMITS.postText}</span></span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={LIMITS.postText} rows={3} dir="auto" placeholder={kind === "progress" ? "e.g. 8 weeks in, same light and pose" : "Say something…"} className={cx(INPUT, "py-2")} />
      </label>

      <div className="mt-3">
        <span className="mb-1 block text-[11px] text-mute">Who can see it</span>
        <Chips clearable={false} options={[{ id: "friends", label: "Friends", icon: Globe2 }, { id: "private", label: "Only me", icon: Lock }]} value={vis} onChange={(v) => setVis((v ?? "friends") as "friends" | "private")} />
        {vis === "friends" && photos.length > 0 && <p className="mt-1 text-[11px] text-faint">The chosen photos become visible to your friends. You can hide the post later.</p>}
      </div>

      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <Btn kind="primary" icon={busy ? Loader2 : Check} className="mt-4 w-full" disabled={!ready} onClick={post}>{busy ? "Posting…" : "Post"}</Btn>
      <input ref={pick} type="file" accept="image/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      {file && <PhotoEditor src={file} defaultAspect="4:5" onCancel={() => setFile(null)} onDone={upload} />}
    </Sheet>
  );
}

/**
 * Drop-in for the finished-workout screen: <ShareWorkoutButton sessionId={id} />. Opens the composer with this workout
 * pre-selected; after posting it turns into "Shared ✓". Hidden when there's no connection.
 */
export function ShareWorkoutButton({ sessionId, className }: { sessionId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <>
      <Btn kind={done ? "soft" : "primary"} icon={done ? Check : Share2} className={className} disabled={done} onClick={() => setOpen(true)}>{done ? "Shared with friends" : "Share with friends"}</Btn>
      {open && <Composer open initial={{ kind: "workout", sessionId }} onClose={() => setOpen(false)} onPosted={() => { setOpen(false); setDone(true); }} />}
    </>
  );
}
