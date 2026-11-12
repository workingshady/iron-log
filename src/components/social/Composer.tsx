import { useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, Dumbbell, Globe2, ImagePlus, Images, Lock, PenLine, Plus, Send, Share2, TrendingUp, Trophy, Type, X } from "lucide-react";
import { LIMITS, type PostKind, type PrSummary, type WorkoutSummary } from "../../../shared/social";
import { uid } from "../../lib/api";
import { useMe } from "../../lib/me";
import { cx, niceDate } from "../../lib/util";
import { Btn, Sheet } from "../ui";
import { PhotoEditor, type Edited } from "../PhotoEditor";
import { INPUT, confetti, socialPhotoUrl, sx } from "./lib";
import { PrHero, WorkoutHero } from "./PostCard";
import { localSrc, startPost, type PhotoItem } from "./Uploads";

interface Shareable { workouts: { id: string; date: string; dayName: string }[]; prs: { id: string; name: string; kg: number | null; reps: number | null; doneAt: number }[] }
interface MyPhoto { id: string; date: string; refKind: string; caption: string | null; visibility: string }
type Kind = "photo" | "workout" | "pr" | "text";

const TYPES: { id: Kind; label: string; hint: string; icon: typeof Type; tone: string }[] = [
  { id: "photo", label: "Photo", hint: "Up to 10", icon: Camera, tone: "bg-info/15 text-info" },
  { id: "workout", label: "Workout", hint: "Share a session", icon: Dumbbell, tone: "bg-acc/15 text-acc" },
  { id: "pr", label: "PR", hint: "Show off a record", icon: Trophy, tone: "bg-warn/15 text-warn" },
  { id: "text", label: "Text", hint: "Say something", icon: Type, tone: "bg-vio/15 text-vio" },
];

/**
 * New post, Instagram sequence: choose a type → (photos: pick 1-10 → edit each) → caption + who sees it → Share.
 * Share closes at once; the upload runs in the background with a progress toast and the post shows up top (Uploads.tsx).
 */
export function Composer({ open, onClose, onPosted, initial }: { open: boolean; onClose: () => void; onPosted: () => void; initial?: { kind?: PostKind; sessionId?: string } }) {
  const me = useMe();
  const startKind: Kind | null = initial?.kind === "progress" ? "photo" : (initial?.kind as Kind | undefined) ?? null;
  const [kind, setKind] = useState<Kind | null>(startKind);
  const [progress, setProgress] = useState(initial?.kind === "progress");
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [queue, setQueue] = useState<File[]>([]);
  const [qi, setQi] = useState(0);
  const [text, setText] = useState("");
  const [vis, setVis] = useState<"friends" | "private">("friends");
  const [sessionId, setSessionId] = useState<string | null>(initial?.sessionId ?? null);
  const [setId, setSetId] = useState<string | null>(null);
  const [share, setShare] = useState<Shareable | null>(null);
  const [preview, setPreview] = useState<WorkoutSummary | null>(null);
  const [library, setLibrary] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const celebrated = useRef(false);

  useEffect(() => {
    if (!open) return;
    sx<Shareable>("GET", "/social/shareable").then((s) => { setShare(s); setSessionId((x) => x ?? s.workouts[0]?.id ?? null); setSetId((x) => x ?? s.prs[0]?.id ?? null); }).catch(() => setShare({ workouts: [], prs: [] }));
    sx<{ photos: "friends" | "private" }>("GET", "/privacy").then((p) => setVis(p.photos)).catch(() => {});
  }, [open]);
  useEffect(() => {
    if (!open || kind !== "workout" || !sessionId) return;
    setPreview(null);
    sx<WorkoutSummary>("GET", `/social/workout-preview/${encodeURIComponent(sessionId)}`).then(setPreview).catch(() => setPreview(null));
  }, [open, kind, sessionId]);
  // finishing a workout is a celebration (once)
  useEffect(() => {
    if (preview && initial?.sessionId && !celebrated.current) { celebrated.current = true; setTimeout(() => confetti(hero.current, 26), 150); navigator.vibrate?.([10, 40, 10]); }
  }, [preview, initial?.sessionId]);

  function reset() { setKind(startKind); setItems([]); setText(""); setQueue([]); setQi(0); setErr(null); setProgress(initial?.kind === "progress"); }
  function close() { reset(); onClose(); }
  function onFiles(list: FileList | null) {
    const files = [...(list ?? [])].slice(0, LIMITS.photosPerPost - items.length);
    if (!files.length) return;
    setQueue(files); setQi(0);
  }
  function edited(x: Edited | null) {
    if (x) setItems((l) => [...l, { kind: "new" as const, edited: x, id: uid(), done: false }].slice(0, LIMITS.photosPerPost));
    if (qi + 1 < queue.length) setQi(qi + 1);
    else { setQueue([]); setQi(0); setKind((k) => k ?? "photo"); }
  }
  const pr = share?.prs.find((x) => x.id === setId) ?? null;
  const prData: PrSummary | null = pr ? { name: pr.name, kg: pr.kg, reps: pr.reps, e1rm: pr.kg && pr.reps && pr.reps <= 12 ? Math.round(pr.kg * (1 + pr.reps / 30) * 10) / 10 : null, date: new Date(pr.doneAt).toISOString().slice(0, 10) } : null;
  const ready = kind === "text" ? !!text.trim() : kind === "workout" ? !!sessionId : kind === "pr" ? !!setId : kind === "photo" ? items.length > 0 : false;

  function post() {
    if (!kind || !ready || !me) return;
    const k: PostKind = kind === "photo" && progress ? "progress" : kind;
    startPost({
      id: uid(), kind: k, text: text.trim(), visibility: vis, photos: kind === "pr" || kind === "text" ? [] : items,
      sessionId: kind === "workout" ? sessionId : null, setId: kind === "pr" ? setId : null,
      data: kind === "workout" ? preview : kind === "pr" ? prData : null,
      author: { id: me.id, username: me.username, name: me.name, avatarId: me.avatarId },
    });
    reset();
    onPosted();
  }

  const editingFile = queue[qi];
  const title = kind == null ? "New post" : kind === "workout" && initial?.sessionId ? "Share your workout" : `New ${kind === "pr" ? "PR" : kind} post`;

  return (
    <Sheet open={open} onClose={close} title={title} icon={kind == null ? PenLine : TYPES.find((x) => x.id === kind)!.icon}>
      {kind == null ? (
        <ul className="grid grid-cols-2 gap-2.5" aria-label="Post type">
          {TYPES.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => (x.id === "photo" ? pick.current?.click() : setKind(x.id))}
                className="flex w-full flex-col items-start gap-3 rounded-2xl bg-card2 p-4 text-left transition hover:bg-card3 active:scale-[.98]">
                <span className={cx("flex h-11 w-11 items-center justify-center rounded-2xl", x.tone)} aria-hidden><x.icon size={22} /></span>
                <span><span className="block font-semibold">{x.label}</span><span className="block text-xs text-mute">{x.hint}</span></span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          {!initial?.sessionId && !initial?.kind && (
            <button type="button" onClick={() => { setKind(null); setErr(null); }} className="-mt-2 mb-2 inline-flex min-h-11 items-center gap-1 pr-2 text-sm text-mute hover:text-ink"><ChevronLeft size={18} aria-hidden />Type</button>
          )}

          {kind === "photo" && (
            <>
              <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label={`${items.length} photos`}>
                {items.map((it, i) => (
                  <li key={it.id} className="relative shrink-0">
                    <img src={localSrc(it, true)} alt={`Photo ${i + 1}`} className="h-28 w-[90px] rounded-xl object-cover" />
                    <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[11px] font-bold text-white num" aria-hidden>{i + 1}</span>
                    <button type="button" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))} className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-card3 text-ink shadow" aria-label={`Remove photo ${i + 1}`}><X size={15} aria-hidden /></button>
                  </li>
                ))}
                {items.length < LIMITS.photosPerPost && (
                  <li className="flex shrink-0 flex-col gap-2">
                    <button type="button" onClick={() => pick.current?.click()} className="flex h-[52px] w-[90px] flex-col items-center justify-center rounded-xl border border-dashed border-line text-[11px] text-info hover:bg-card2"><Plus size={18} aria-hidden />Add</button>
                    <button type="button" onClick={() => setLibrary(true)} className="flex h-[52px] w-[90px] flex-col items-center justify-center rounded-xl border border-dashed border-line text-[11px] text-mute hover:bg-card2"><Images size={16} aria-hidden />Library</button>
                  </li>
                )}
              </ul>
              <button type="button" role="switch" aria-checked={progress} onClick={() => setProgress(!progress)} className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-xl bg-card2 px-3 text-left text-sm">
                <TrendingUp size={18} className="text-acc" aria-hidden />
                <span className="flex-1">Progress photo{items.length === 2 && progress ? <span className="text-xs text-mute"> · before / after slider</span> : null}</span>
                <span className={cx("relative h-6 w-10 rounded-full transition-colors", progress ? "bg-acc" : "bg-card3")} aria-hidden><span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", progress ? "left-[18px]" : "left-0.5")} /></span>
              </button>
            </>
          )}

          {kind === "workout" && (
            <>
              {share && share.workouts.length > 1 && !initial?.sessionId && (
                <ul className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="radiogroup" aria-label="Which workout">
                  {share.workouts.map((w) => (
                    <li key={w.id} className="shrink-0"><button type="button" role="radio" aria-checked={sessionId === w.id} onClick={() => setSessionId(w.id)}
                      className={cx("min-h-11 shrink-0 whitespace-nowrap rounded-full border px-3 text-sm", sessionId === w.id ? "border-acc bg-acc font-semibold text-acc-ink" : "border-line hover:bg-card2")}>{w.dayName} · {niceDate(w.date)}</button></li>
                  ))}
                </ul>
              )}
              {share?.workouts.length === 0 ? <p className="py-6 text-center text-sm text-mute">Finish a workout first, then share it here 💪</p> : (
                <div ref={hero} className="-mx-3">{preview ? <WorkoutHero w={preview} celebrate={!!initial?.sessionId} /> : <div className="mx-3 h-64 animate-pulse rounded-3xl bg-card2" aria-busy aria-label="Loading preview" />}</div>
              )}
              <div className="mt-3 flex gap-2">
                {items.map((it) => (
                  <span key={it.id} className="relative"><img src={localSrc(it, true)} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    <button type="button" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))} className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-card3" aria-label="Remove photo"><X size={13} aria-hidden /></button></span>
                ))}
                {items.length < LIMITS.photosPerPost && <button type="button" onClick={() => pick.current?.click()} className="flex min-h-14 items-center gap-2 rounded-xl border border-dashed border-line px-3 text-sm text-info hover:bg-card2"><ImagePlus size={17} aria-hidden />{items.length ? "" : "Add a gym pic"}</button>}
              </div>
            </>
          )}

          {kind === "pr" && (
            share == null ? <div className="h-48 animate-pulse rounded-3xl bg-card2" aria-busy /> : share.prs.length === 0 ? <p className="py-6 text-center text-sm text-mute">No PRs yet. Beat your best and it lands here 🏆</p> : (
              <>
                <div className="-mx-3">{prData && <PrHero pr={prData} />}</div>
                <ul className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="radiogroup" aria-label="Which PR">
                  {share.prs.map((x) => (
                    <li key={x.id} className="shrink-0"><button type="button" role="radio" aria-checked={setId === x.id} onClick={() => setSetId(x.id)}
                      className={cx("flex min-h-12 shrink-0 flex-col justify-center rounded-2xl border px-3 text-left", setId === x.id ? "border-warn bg-warn/15" : "border-line hover:bg-card2")}>
                      <span className="max-w-40 truncate text-xs font-semibold">{x.name}</span>
                      <span className="text-xs text-mute num">{x.kg ? `${x.kg} kg × ` : ""}{x.reps ?? ""}</span>
                    </button></li>
                  ))}
                </ul>
              </>
            )
          )}

          <label className="mt-3 block">
            <span className="sr-only">{kind === "text" ? "What's on your mind?" : "Caption"}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={LIMITS.postText} rows={kind === "text" ? 5 : 2} dir="auto" autoFocus={kind === "text"}
              placeholder={kind === "text" ? "What's on your mind?" : kind === "workout" ? "How did it feel?" : kind === "pr" ? "Say something about it…" : "Write a caption…"} className={cx(INPUT, "py-2.5", kind === "text" && "text-lg")} />
          </label>

          <div role="radiogroup" aria-label="Who can see it" className="mt-3 flex rounded-xl bg-card2 p-1">
            {([["friends", "Friends", Globe2], ["private", "Only me", Lock]] as const).map(([id, l, Icon]) => (
              <button key={id} type="button" role="radio" aria-checked={vis === id} onClick={() => setVis(id)} className={cx("flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm", vis === id ? "bg-card3 font-semibold" : "text-mute")}><Icon size={15} aria-hidden />{l}</button>
            ))}
          </div>
          {vis === "friends" && items.length > 0 && <p className="mt-1.5 text-[11px] text-faint">These photos become visible to friends.</p>}

          {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
          <Btn kind="primary" icon={kind === "workout" && initial?.sessionId ? Share2 : Send} className="mt-4 w-full" disabled={!ready} onClick={post}>Share</Btn>
        </>
      )}

      <input ref={pick} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      {editingFile && <PhotoEditor key={qi} src={editingFile} title={queue.length > 1 ? `Edit ${qi + 1} of ${queue.length}` : undefined} defaultAspect="4:5" onCancel={() => edited(null)} onDone={edited} />}
      {library && <LibraryPicker exclude={items.map((x) => x.id)} max={LIMITS.photosPerPost - items.length} onClose={() => setLibrary(false)} onPick={(ids) => { setItems((l) => [...l, ...ids.map((id) => ({ kind: "existing" as const, id }))]); setLibrary(false); setKind((k) => k ?? "photo"); }} />}
    </Sheet>
  );
}

/** Pick photos you already have (progress, form…). */
function LibraryPicker({ exclude, max, onClose, onPick }: { exclude: string[]; max: number; onClose: () => void; onPick: (ids: string[]) => void }) {
  const [mine, setMine] = useState<MyPhoto[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => { sx<MyPhoto[]>("GET", "/social/my-photos").then(setMine).catch(() => setMine([])); }, []);
  const list = (mine ?? []).filter((m) => !exclude.includes(m.id));
  return (
    <Sheet open onClose={onClose} title="Your photos" icon={Images}>
      {mine == null ? <div className="grid grid-cols-4 gap-1">{Array.from({ length: 8 }, (_, k) => <span key={k} className="aspect-square animate-pulse rounded-lg bg-card2" />)}</div>
        : !list.length ? <p className="py-6 text-center text-sm text-mute">No photos yet.</p> : (
          <ul className="grid grid-cols-4 gap-1">
            {list.slice(0, 60).map((m) => {
              const on = sel.includes(m.id);
              return (
                <li key={m.id}><button type="button" aria-pressed={on} onClick={() => setSel((s) => (on ? s.filter((x) => x !== m.id) : s.length < max ? [...s, m.id] : s))} aria-label={`Photo from ${niceDate(m.date)}`}
                  className={cx("relative block aspect-square w-full overflow-hidden rounded-lg bg-card3", on && "ring-2 ring-acc")}>
                  <img src={socialPhotoUrl(m.id, true)} alt="" loading="lazy" className={cx("h-full w-full object-cover", on && "opacity-75")} />
                  {on && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-acc text-[11px] font-bold text-acc-ink num" aria-hidden>{sel.indexOf(m.id) + 1}</span>}
                </button></li>
              );
            })}
          </ul>
        )}
      <Btn kind="primary" icon={Check} className="mt-4 w-full" disabled={!sel.length} onClick={() => onPick(sel)}>Add {sel.length || ""}</Btn>
    </Sheet>
  );
}

/**
 * Drop-in for the finished-workout screen: <ShareWorkoutButton sessionId={id} />. Opens the composer with this workout
 * as a celebration card; after sharing it turns into "Shared ✓".
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
