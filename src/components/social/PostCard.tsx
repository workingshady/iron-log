import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Clock3, Copy, CornerDownRight, Dumbbell, Flag, Globe2, Heart, Layers, Loader2, Lock, MessageCircle, MoreHorizontal, Pencil, Reply, RotateCw, Send, Sparkles, Trash2, TrendingUp, Trophy, UserRound, Users, X } from "lucide-react";
import type { Comment, Post, PostVis, PrSummary, WorkoutSummary } from "../../../shared/social";
import { LIMITS } from "../../../shared/social";
import { uid } from "../../lib/api";
import { useMe } from "../../lib/me";
import { cx, niceDate } from "../../lib/util";
import { Btn, Sheet } from "../ui";
import { UserAvatar } from "./UserAvatar";
import { INPUT, ago, fmtNum, fullTime, kgShort, reducedMotion, socialPhotoUrl, sx } from "./lib";
import { MentionText } from "../mentions/MentionText";
import { postMentionSource, useMentions } from "../mentions/useMentions";

type Src = (id: string, thumb?: boolean) => string;
/** Optimistic (not yet uploaded) post: progress bar over the card, retry on failure. */
export interface Pending { progress: number; error?: string; onRetry: () => void; onDiscard: () => void; src: Src }

const KIND_LABEL: Record<string, string> = { workout: "Workout", pr: "New PR", progress: "Progress", photo: "", text: "" };

/**
 * One feed post (Instagram layout, Hevy/Strava-style workout card): compact header · big media or a visual summary ·
 * actions · "Liked by …" · caption with "more" · comments. Likes are optimistic; double-tap media = like + heart burst.
 */
export function PostCard({ post, onChange, onDelete, pending, open }: {
  post: Post; onChange?: (p: Post) => void; onDelete?: (id: string) => void; pending?: Pending;
  /** Open the comments sheet right away (from a notification): highlight `focus`, or start a reply to `reply`. */
  open?: { focus?: string | null; reply?: string | null };
}) {
  const [p, setP] = useState(post);
  useEffect(() => setP(post), [post]);
  const [comments, setComments] = useState(!!open);
  const [menu, setMenu] = useState(false);
  const [likers, setLikers] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const heart = useRef<HTMLSpanElement>(null);
  const likeBtn = useRef<HTMLSpanElement>(null);
  const update = (n: Post) => { setP(n); onChange?.(n); };
  const src: Src = pending?.src ?? socialPhotoUrl;

  async function like(on: boolean) {
    if (on === p.liked || pending) return;
    const prev = p;
    update({ ...p, liked: on, likes: Math.max(0, p.likes + (on ? 1 : -1)) });
    if (on && !reducedMotion()) likeBtn.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(.9)" }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out" });
    if (on) navigator.vibrate?.(8);
    try {
      const r = await sx<{ likes: number; liked: boolean }>(on ? "POST" : "DELETE", `/posts/${p.id}/like`);
      update({ ...prev, liked: r.liked, likes: r.likes });
    } catch (e) { update(prev); setErr((e as Error).message); }
  }
  function burst() {
    void like(true);
    const h = heart.current;
    if (!h || pending) return;
    if (reducedMotion()) { h.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600 }); return; }
    h.animate([
      { opacity: 0, transform: "translate(-50%,-50%) scale(.2) rotate(-12deg)" },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1.15) rotate(0)", offset: 0.25 },
      { opacity: 1, transform: "translate(-50%,-50%) scale(.95)", offset: 0.45 },
      { opacity: 0, transform: "translate(-50%,-75%) scale(1.05)" },
    ], { duration: 900, easing: "ease-out" });
  }
  const long = (p.text?.length ?? 0) > 140;
  const w = p.kind === "workout" ? (p.data as WorkoutSummary | null) : null;
  const pr = p.kind === "pr" ? (p.data as PrSummary | null) : null;
  const hasPhotos = p.photoIds.length > 0;
  const bigText = p.kind === "text" && !hasPhotos && (p.text?.length ?? 0) <= 160;
  const sub = w?.dayName ?? (pr ? `PR · ${pr.name}` : KIND_LABEL[p.kind]);

  return (
    <article className={cx("relative pb-2 md:rounded-2xl md:bg-card md:pb-3", pending && "opacity-95")} aria-label={`Post by ${p.author.name || p.author.username}, ${ago(p.createdAt, true)}`}>
      <header className="flex items-center gap-2.5 px-4 py-2">
        <a href={`#/u/${encodeURIComponent(p.author.username)}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <UserAvatar id={p.author.avatarId} name={p.author.name ?? p.author.username} size={34} />
          <span className="min-w-0 leading-tight">
            <span className="flex items-baseline gap-1.5 text-sm">
              <span className="truncate font-semibold">{p.author.username}</span>
              <span className="shrink-0 text-xs text-faint">·</span>
              <time className="shrink-0 text-xs text-mute" dateTime={new Date(p.createdAt).toISOString()} title={fullTime(p.createdAt)}>{pending ? "now" : ago(p.createdAt)}</time>
              {p.visibility === "private" && <Lock size={11} className="shrink-0 text-mute" aria-label="Only you" />}
              {p.visibility === "members" && <Globe2 size={11} className="shrink-0 text-mute" aria-label="Everyone on Iron Log" />}
            </span>
            {sub && <span className="block truncate text-xs text-mute">{sub}</span>}
          </span>
        </a>
        {!pending && <button type="button" onClick={() => setMenu(true)} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-mute hover:bg-card2" aria-label="Post options"><MoreHorizontal size={20} aria-hidden /></button>}
      </header>

      <div className="relative" onDoubleClick={burst}>
        {hasPhotos ? (
          p.kind === "progress" && p.photoIds.length === 2
            ? <BeforeAfter ids={p.photoIds} src={src} onDoubleTap={burst} />
            : <Carousel ids={p.photoIds} src={src} onDoubleTap={burst} label={p.kind === "progress" ? "Progress photo" : "Photo"} />
        ) : w ? <WorkoutHero w={w} onDoubleTap={burst} />
          : pr ? <PrHero pr={pr} onDoubleTap={burst} />
            : bigText ? <TextHero text={p.text!} onDoubleTap={burst} /> : null}
        {hasPhotos && w && <WorkoutStrip w={w} />}
        <span ref={heart} className="pointer-events-none absolute left-1/2 top-1/2 z-10 opacity-0" style={{ transform: "translate(-50%,-50%)" }} aria-hidden>
          <Heart size={104} className="fill-white text-white drop-shadow-[0_4px_18px_rgba(0,0,0,.45)]" />
        </span>
        {pending && <PendingOverlay pending={pending} />}
      </div>

      {/* actions */}
      <div className="flex items-center px-2 pt-0.5">
        <button type="button" onClick={() => like(!p.liked)} disabled={!!pending} aria-pressed={p.liked} aria-label={p.liked ? "Unlike" : "Like"} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2 disabled:opacity-40">
          <span ref={likeBtn} className="inline-flex"><Heart size={25} className={p.liked ? "fill-bad text-bad" : "text-ink"} aria-hidden /></span>
        </button>
        <button type="button" onClick={() => setComments(true)} disabled={!!pending} aria-label={`Comments (${p.comments})`} className="flex h-11 items-center gap-1 rounded-full px-2.5 hover:bg-card2 disabled:opacity-40">
          <MessageCircle size={24} aria-hidden />{p.comments > 0 && <span className="text-sm font-semibold num">{p.comments}</span>}
        </button>
        {p.photoIds.length > 1 && <span className="ml-auto mr-3 inline-flex items-center gap-1 text-xs text-mute"><Layers size={13} aria-hidden />{p.photoIds.length}</span>}
      </div>
      <div className="px-4">
        {p.likes > 0 && <LikedBy p={p} onOpen={() => setLikers(true)} />}
        {p.text && !bigText && (
          <p dir="auto" className="bidi mt-0.5 whitespace-pre-wrap break-words text-sm leading-snug">
            <a href={`#/u/${encodeURIComponent(p.author.username)}`} className="mr-1.5 font-semibold">{p.author.username}</a>
            {long && !expanded ? <><MentionText text={p.text.slice(0, 125).trimEnd()} />… <button type="button" onClick={() => setExpanded(true)} className="text-mute">more</button></> : <MentionText text={p.text} />}
          </p>
        )}
        {p.comments > 1 && (
          <button type="button" onClick={() => setComments(true)} className="mt-0.5 block min-h-6 text-left text-sm text-mute">View all {p.comments} comments</button>
        )}
        {p.preview && (
          <button type="button" onClick={() => setComments(true)} dir="auto" className="bidi block w-full truncate text-left text-sm"><span className="mr-1.5 font-semibold">{p.preview.username}</span>{p.preview.text}</button>
        )}
        {err && <p role="alert" className="mt-1 text-xs text-bad">{err}</p>}
      </div>

      {comments && <CommentsSheet post={p} focus={open?.focus} replyTo={open?.reply} onClose={() => setComments(false)} onCount={(n) => update({ ...p, comments: n })} />}
      {likers && <LikesSheet url={`/posts/${p.id}/likes`} onClose={() => setLikers(false)} />}
      {menu && <PostMenu post={p} onClose={() => setMenu(false)} onChange={update} onDelete={() => { setMenu(false); onDelete?.(p.id); }} />}
    </article>
  );
}

/** "Liked by omar and 3 others" with tiny stacked faces (falls back to "12 likes"). */
function LikedBy({ p, onOpen }: { p: Post; onOpen: () => void }) {
  const by = (p.likedBy ?? []).filter(Boolean);
  const names = [...(p.liked ? ["you"] : []), ...(by[0] ? [by[0].username] : [])];
  const rest = Math.max(0, p.likes - names.length);
  return (
    <button type="button" onClick={onOpen} className="flex min-h-7 items-center gap-2 text-left text-sm" aria-live="polite">
      {by.length > 0 && <span className="flex -space-x-1.5" aria-hidden>{by.map((u) => <UserAvatar key={u.id} id={u.avatarId} name={u.name ?? u.username} size={20} className="ring-2 ring-bg" />)}</span>}
      {names.length ? (
        <span>Liked by {names.map((n, i) => <span key={n}>{i ? ", " : ""}<b>{n}</b></span>)}{rest > 0 && <> and <b className="num">{fmtNum(rest)} other{rest === 1 ? "" : "s"}</b></>}</span>
      ) : <b className="num">{fmtNum(p.likes)} {p.likes === 1 ? "like" : "likes"}</b>}
    </button>
  );
}

function PendingOverlay({ pending }: { pending: Pending }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10">
      {pending.error ? (
        <div className="flex items-center gap-2 bg-black/75 px-3 py-2 text-sm text-white backdrop-blur">
          <AlertCircle size={16} className="shrink-0 text-bad" aria-hidden /><span className="min-w-0 flex-1 truncate">{pending.error}</span>
          <button type="button" onClick={pending.onRetry} className="flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-acc"><RotateCw size={15} aria-hidden />Retry</button>
          <button type="button" onClick={pending.onDiscard} className="min-h-11 rounded-lg px-2 text-white/70">Discard</button>
        </div>
      ) : (
        <div className="h-1 bg-black/40" role="progressbar" aria-label="Posting" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pending.progress * 100)}>
          <div className="h-full bg-acc transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.round(pending.progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- bodies

const useDoubleTap = (f: () => void) => {
  const last = useRef(0);
  return (e: React.PointerEvent) => { if (e.pointerType === "mouse") return; const t = Date.now(); if (t - last.current < 300) { f(); last.current = 0; } else last.current = t; };
};

/** Workout share card: day name big, 3 stat tiles, muscles hit (bars), top lifts as chips, PR badges. */
export function WorkoutHero({ w, onDoubleTap, celebrate }: { w: WorkoutSummary; onDoubleTap?: () => void; celebrate?: boolean }) {
  const tap = useDoubleTap(onDoubleTap ?? (() => {}));
  const maxM = Math.max(1, ...(w.muscles ?? []).map((m) => m.sets));
  return (
    <section onPointerUp={tap} className="relative mx-3 overflow-hidden rounded-3xl bg-card2 p-4 select-none" aria-label={`Workout: ${w.dayName}, ${w.minutes ?? "?"} minutes, ${w.hardSets} hard sets, ${kgShort(w.volume)}`}>
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-acc/15 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-info/10 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-acc">
          {celebrate ? <><Sparkles size={13} aria-hidden />Workout done</> : <><Dumbbell size={13} aria-hidden />{niceDate(w.date)}</>}
        </div>
        <h3 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight">{w.dayName}</h3>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          <HeroStat icon={Clock3} value={w.minutes != null ? `${w.minutes}` : "–"} unit="min" />
          <HeroStat icon={TrendingUp} value={w.volume >= 10000 ? (w.volume / 1000).toFixed(1) : fmtNum(w.volume)} unit={w.volume >= 10000 ? "t" : "kg"} />
          <HeroStat icon={Layers} value={`${w.hardSets}`} unit="sets" />
        </dl>
        {!!w.muscles?.length && (
          <ul className="mt-3 space-y-1" aria-label="Hard sets per muscle">
            {w.muscles.slice(0, 4).map((m) => (
              <li key={m.group} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 truncate text-mute">{m.group}</span>
                <span className="h-2 flex-1 rounded-full bg-card3/80"><span className="block h-full rounded-full bg-acc" style={{ width: `${(m.sets / maxM) * 100}%` }} /></span>
                <span className="w-5 text-right font-semibold num">{m.sets}</span>
              </li>
            ))}
          </ul>
        )}
        {w.exercises.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Top lifts">
            {w.exercises.filter((e) => e.best).slice(0, 3).map((e, i) => {
              const isPr = w.prs.some((x) => x.name === e.name);
              return (
                <li key={i} className={cx("inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-2.5 pr-2 text-xs", isPr ? "bg-warn/15 text-warn" : "bg-card3/80")}>
                  {isPr && <Trophy size={12} className="shrink-0" aria-label="PR" />}<span className="truncate">{e.name}</span><span className="shrink-0 font-semibold num">{e.best}</span>
                </li>
              );
            })}
            {w.exercises.length > 3 && <li className="inline-flex items-center rounded-full px-1.5 py-1 text-xs text-mute">+{w.exercises.length - 3} more</li>}
          </ul>
        )}
        {(() => {
          const shownPr = new Set(w.exercises.filter((e) => e.best).slice(0, 3).map((e) => e.name));
          const rest = w.prs.filter((x) => !shownPr.has(x.name));
          return rest.length > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 text-xs font-semibold text-warn"><Trophy size={12} aria-hidden />{rest.length === 1 ? `PR · ${rest[0].name}` : `+${rest.length} more PRs`}</p>
          );
        })()}
      </div>
    </section>
  );
}
function HeroStat({ icon: Icon, value, unit }: { icon: typeof Clock3; value: string; unit: string }) {
  return (
    <div className="rounded-2xl bg-card3/60 px-2.5 py-2">
      <dt className="sr-only">{unit}</dt>
      <dd className="flex items-baseline gap-1"><span className="text-xl font-bold leading-none num">{value}</span><span className="text-xs text-mute">{unit}</span></dd>
      <Icon size={13} className="mt-1 text-faint" aria-hidden />
    </div>
  );
}
/** Compact stats under a workout's photos. */
function WorkoutStrip({ w }: { w: WorkoutSummary }) {
  return (
    <div className="mx-3 mt-2 flex items-center gap-3 rounded-2xl bg-card2 px-3 py-2 text-xs text-mute">
      <Dumbbell size={14} className="text-acc" aria-hidden /><span className="min-w-0 flex-1 truncate font-semibold text-ink">{w.dayName}</span>
      {w.minutes != null && <span className="num">{w.minutes} min</span>}<span className="num">{kgShort(w.volume)}</span>{w.prs.length > 0 && <span className="text-warn num">🏆 {w.prs.length}</span>}
    </div>
  );
}

/** PR celebration card: gold, big number, est. max. */
export function PrHero({ pr, onDoubleTap }: { pr: PrSummary; onDoubleTap?: () => void }) {
  const tap = useDoubleTap(onDoubleTap ?? (() => {}));
  return (
    <section onPointerUp={tap} className="relative mx-3 overflow-hidden rounded-3xl p-5 text-center select-none" style={{ background: "radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--color-warn) 30%, var(--color-card2)), var(--color-card2) 70%)" }} aria-label={`New personal record: ${pr.name}${pr.kg ? ` ${pr.kg} kilos` : ""}${pr.reps ? ` for ${pr.reps}` : ""}`}>
      <span className="pointer-events-none absolute left-6 top-6 text-warn/60" aria-hidden><Sparkles size={18} /></span>
      <span className="pointer-events-none absolute bottom-8 right-7 text-warn/50" aria-hidden><Sparkles size={14} /></span>
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warn text-black shadow-[0_0_40px_-6px_var(--color-warn)]" aria-hidden><Trophy size={30} strokeWidth={2.2} /></span>
      <div className="mt-3 text-[11px] font-bold uppercase tracking-[.2em] text-warn">New personal record</div>
      <div className="mt-1 truncate text-base font-semibold">{pr.name}</div>
      <div className="mt-1 text-4xl font-extrabold tracking-tight num">{pr.kg ? <>{pr.kg}<span className="text-xl font-bold text-mute"> kg</span></> : null}{pr.reps ? <span className="text-3xl"> × {pr.reps}</span> : null}</div>
      {pr.e1rm && <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-card3/70 px-3 py-1 text-xs text-mute num">≈ {pr.e1rm} kg est. max</div>}
    </section>
  );
}

/** Short text post as a big card (Instagram "notes"/quote style). */
function TextHero({ text, onDoubleTap }: { text: string; onDoubleTap: () => void }) {
  const tap = useDoubleTap(onDoubleTap);
  return (
    <section onPointerUp={tap} className="mx-3 rounded-3xl bg-gradient-to-br from-card2 to-card3/70 px-5 py-6 select-none">
      <p dir="auto" className="bidi whitespace-pre-wrap break-words text-xl font-semibold leading-snug"><MentionText text={text} /></p>
    </section>
  );
}

/** Progress post with exactly 2 photos: before/after split with a draggable divider (a range input = keyboard + screen reader). */
function BeforeAfter({ ids, src, onDoubleTap }: { ids: string[]; src: Src; onDoubleTap: () => void }) {
  const [pos, setPos] = useState(50);
  const tap = useDoubleTap(onDoubleTap);
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden bg-black select-none" onPointerUp={tap}>
      <img src={src(ids[1])} alt="After" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      <img src={src(ids[0])} alt="Before" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} aria-hidden>
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-bold text-black shadow-lg">⇆</span>
      </span>
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">Before</span>
      <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-acc px-2.5 py-1 text-[11px] font-semibold text-acc-ink">After</span>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Before / after divider" className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
    </div>
  );
}

/** Swipeable photos (scroll-snap) with dots + counter; double-tap = like. */
function Carousel({ ids, src, onDoubleTap, label }: { ids: string[]; src: Src; onDoubleTap: () => void; label: string }) {
  const [i, setI] = useState(0);
  const tap = useDoubleTap(onDoubleTap);
  return (
    <div className="relative">
      <div className="flex snap-x snap-mandatory overflow-x-auto bg-black [scrollbar-width:none]" aria-roledescription="carousel" aria-label={`${ids.length} photo${ids.length > 1 ? "s" : ""}. Double-tap to like.`}
        onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))} onPointerUp={tap}>
        {ids.map((id, k) => (
          <div key={id} className="w-full shrink-0 snap-center" aria-roledescription="slide" aria-label={`${k + 1} of ${ids.length}`}>
            <img src={src(id)} alt={`${label} ${k + 1}`} loading="lazy" decoding="async" draggable={false} className="aspect-[4/5] w-full select-none bg-card object-cover" />
          </div>
        ))}
      </div>
      {ids.length > 1 && (
        <>
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white num" aria-hidden>{i + 1}/{ids.length}</span>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1" aria-hidden>
            {ids.map((id, k) => <span key={id} className={cx("h-1.5 rounded-full transition-all", k === i ? "w-4 bg-white" : "w-1.5 bg-white/50")} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- comments (one level of replies, likes, @mentions)

type Reply = { id: string; topId: string; username: string };
const countAll = (l: Comment[]) => l.reduce((n, c) => n + 1 + (c.replyCount ?? 0), 0);

/**
 * Comments sheet, Instagram-style: top-level comments with replies one level deep ("View N more replies" / "Hide replies"),
 * a heart per comment (tap the count = who liked it), long-press or "…" = Reply / Copy / Delete / Hide. `focus` (from a
 * notification) scrolls to and highlights that comment; `replyTo` opens the reply bar on it.
 */
export function CommentsSheet({ post, onClose, onCount, focus, replyTo }: { post: Post; onClose: () => void; onCount: (n: number) => void; focus?: string | null; replyTo?: string | null }) {
  const me = useMe();
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<Comment | null>(null);
  const [likers, setLikers] = useState<string | null>(null);
  const [glow, setGlow] = useState<string | null>(null);
  const [loadingReplies, setLoadingReplies] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const initial = useRef({ focus, replyTo });
  const fieldId = `cm-${post.id}`;
  const mention = useMentions({ ref: input, value: text, setValue: setText, source: postMentionSource({ post: post.id }), id: fieldId });

  const startReply = useCallback((c: Comment, prefill = true) => {
    setReply({ id: c.id, topId: c.parentId ?? c.id, username: c.author.username });
    setHidden((h) => { const n = new Set(h); n.delete(c.parentId ?? c.id); return n; });
    if (prefill && c.author.id !== me?.id) setText((t) => (t.trim() ? t : `@${c.author.username} `));
    requestAnimationFrame(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  }, [me?.id]);

  useEffect(() => {
    const f = initial.current.focus ?? initial.current.replyTo;
    sx<Comment[]>("GET", `/posts/${post.id}/comments${f ? `?focus=${encodeURIComponent(f)}` : ""}`).then((l) => {
      setList(l);
      const target = f ? l.flatMap((c) => [c, ...(c.replies ?? [])]).find((c) => c.id === f) : null;
      if (target) {
        if (initial.current.replyTo) startReply(target);
        requestAnimationFrame(() => document.getElementById(`c-${target.id}`)?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" }));
        setGlow(target.id);
        setTimeout(() => setGlow(null), 2600);
      } else if (f) setErr("That comment was deleted.");
    }).catch((e) => setErr((e as Error).message));
  }, [post.id, startReply]);

  /** Apply `f` to one comment wherever it is (top level or reply). */
  const patch = (id: string, f: (c: Comment) => Comment) => setList((l) => (l ?? []).map((c) => (c.id === id ? f(c) : c.replies?.some((r) => r.id === id) ? { ...c, replies: c.replies.map((r) => (r.id === id ? f(r) : r)) } : c)));
  const setAll = (next: Comment[]) => { setList(next); onCount(countAll(next)); };

  async function add() {
    const v = text.trim();
    if (!v || busy || !list) return;
    const id = uid();
    const r = reply;
    const tmp: Comment = { id, text: v, createdAt: Date.now(), author: { id: me?.id ?? "", username: me?.username ?? "you", name: me?.name ?? null, avatarId: me?.avatarId ?? null }, canDelete: true, parentId: r?.topId ?? null, likes: 0, liked: false, replies: [], replyCount: 0 };
    const prev = list;
    const next = r ? list.map((c) => (c.id === r.topId ? { ...c, replies: [...(c.replies ?? []), tmp], replyCount: (c.replyCount ?? 0) + 1 } : c)) : [...list, tmp];
    setBusy(true); setErr(null); setText(""); setReply(null);
    setAll(next);
    if (!r) requestAnimationFrame(() => end.current?.scrollIntoView({ block: "nearest" }));
    try { await sx("POST", `/posts/${post.id}/comments`, { id, text: v, parentId: r?.id ?? null }); setAnnounce(r ? "Reply posted" : "Comment posted"); }
    catch (e) { setErr((e as Error).message); setText(v); setReply(r); setAll(prev); }
    finally { setBusy(false); }
  }
  async function del(c: Comment) {
    setMenu(null);
    if (!list || !confirm(c.parentId ? "Delete this reply?" : c.replyCount ? "Delete this comment and its replies?" : "Delete this comment?")) return;
    const prev = list;
    setAll(c.parentId ? list.map((x) => (x.id === c.parentId ? { ...x, replies: (x.replies ?? []).filter((r) => r.id !== c.id), replyCount: Math.max(0, (x.replyCount ?? 1) - 1) } : x)) : list.filter((x) => x.id !== c.id));
    if (reply && (reply.id === c.id || reply.topId === c.id)) setReply(null);
    try { await sx("DELETE", `/comments/${c.id}`); setAnnounce("Deleted"); }
    catch (e) { setAll(prev); setErr((e as Error).message); }
  }
  async function like(c: Comment) {
    const on = !c.liked;
    patch(c.id, (x) => ({ ...x, liked: on, likes: Math.max(0, x.likes + (on ? 1 : -1)) }));
    if (on) navigator.vibrate?.(6);
    try { const r = await sx<{ likes: number; liked: boolean }>(on ? "POST" : "DELETE", `/comments/${c.id}/like`); patch(c.id, (x) => ({ ...x, liked: r.liked, likes: r.likes })); }
    catch (e) { patch(c.id, (x) => ({ ...x, liked: c.liked, likes: c.likes })); setErr((e as Error).message); }
  }
  async function hide(c: Comment) {
    setMenu(null);
    if (!list || !confirm("Hide this comment for you and report it? The post author can still remove it.")) return;
    const prev = list;
    setAll(c.parentId ? list.map((x) => (x.id === c.parentId ? { ...x, replies: (x.replies ?? []).filter((r) => r.id !== c.id), replyCount: Math.max(0, (x.replyCount ?? 1) - 1) } : x)) : list.filter((x) => x.id !== c.id));
    try { await sx("POST", `/comments/${c.id}/hide`); setAnnounce("Comment hidden"); } catch (e) { setAll(prev); setErr((e as Error).message); }
  }
  async function copy(c: Comment) {
    setMenu(null);
    try { await navigator.clipboard.writeText(c.text); setAnnounce("Copied"); } catch { setErr("Couldn't copy"); }
  }
  async function moreReplies(c: Comment) {
    setLoadingReplies(c.id);
    try { const r = await sx<Comment[]>("GET", `/comments/${c.id}/replies`); setList((l) => (l ?? []).map((x) => (x.id === c.id ? { ...x, replies: r, replyCount: r.length } : x))); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoadingReplies(null); }
  }
  const toggleHidden = (id: string, on: boolean) => setHidden((h) => { const n = new Set(h); if (on) n.add(id); else n.delete(id); return n; });

  const row = (c: Comment) => <CommentRow key={c.id} c={c} glow={glow === c.id} onReply={() => startReply(c)} onLike={() => like(c)} onLikers={() => setLikers(c.id)} onMenu={() => setMenu(c)} onNavigate={onClose} />;

  return (
    <Sheet open onClose={onClose} title="Comments" icon={MessageCircle}>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {list == null && !err && <ul aria-busy className="space-y-3">{[0, 1, 2].map((k) => <li key={k} className="flex gap-3"><span className="h-8 w-8 animate-pulse rounded-full bg-card2" /><span className="h-8 flex-1 animate-pulse rounded-lg bg-card2" /></li>)}</ul>}
      {list && list.length === 0 && <p className="py-8 text-center text-sm text-mute">No comments yet. Say something nice 💪</p>}
      <ul className="space-y-1">
        {list?.map((c) => {
          const shown = hidden.has(c.id) ? [] : c.replies ?? [];
          const total = c.replyCount ?? 0;
          const more = total - shown.length;
          return (
            <li key={c.id}>
              {row(c)}
              {total > 0 && (
                <div className="pl-11">
                  {shown.length > 0 && <ul aria-label={`Replies to ${c.author.username}`}>{shown.map(row)}</ul>}
                  <div className="flex items-center gap-1">
                    {more > 0 && (
                      <button type="button" onClick={() => (hidden.has(c.id) && (c.replies?.length ?? 0) >= total ? toggleHidden(c.id, false) : (toggleHidden(c.id, false), void moreReplies(c)))}
                        className="flex min-h-11 items-center gap-2 pr-2 text-xs font-semibold text-mute hover:text-ink" aria-expanded={false}>
                        <span className="h-px w-6 bg-line" aria-hidden />
                        {loadingReplies === c.id ? <Loader2 size={14} className="animate-spin" aria-label="Loading replies" /> : `View ${more} ${shown.length ? "more " : ""}${more === 1 ? "reply" : "replies"}`}
                      </button>
                    )}
                    {shown.length > 0 && (
                      <button type="button" onClick={() => toggleHidden(c.id, true)} className="flex min-h-11 items-center gap-2 pr-2 text-xs font-semibold text-mute hover:text-ink" aria-expanded>
                        {more <= 0 && <span className="h-px w-6 bg-line" aria-hidden />}Hide replies
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div ref={end} />
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <form className="sticky bottom-0 -mx-4 mt-3 border-t border-line bg-card px-4 pt-2 md:-mx-6 md:px-6" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        {reply && (
          <div className="flex items-center gap-2 pb-1 text-xs text-mute">
            <CornerDownRight size={14} aria-hidden /><span className="min-w-0 flex-1 truncate">Replying to <b dir="ltr" className="text-ink">@{reply.username}</b></span>
            <button type="button" onClick={() => { setReply(null); if (text.trim() === `@${reply.username}`) setText(""); input.current?.focus(); }} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="Cancel reply"><X size={16} aria-hidden /></button>
          </div>
        )}
        <div className="relative flex items-center gap-2">
          {mention.popover}
          <label className="sr-only" htmlFor={fieldId}>{reply ? `Reply to ${reply.username}` : "Add a comment"}</label>
          <input id={fieldId} ref={input} value={text} maxLength={LIMITS.comment} dir="auto" placeholder={reply ? `Reply to @${reply.username}…` : "Add a comment…"} className={INPUT} autoComplete="off" enterKeyHint="send"
            {...mention.comboProps}
            onChange={(e) => { setText(e.target.value); mention.sync(e.target); }} onSelect={(e) => mention.sync(e.currentTarget)}
            onKeyDown={(e) => { if (mention.onKeyDown(e)) return; if (e.key === "Escape" && reply) { e.preventDefault(); e.stopPropagation(); setReply(null); } }} />
          <button type="submit" disabled={!text.trim() || busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-acc text-acc-ink disabled:opacity-40" aria-label={reply ? "Post reply" : "Post comment"}><Send size={18} aria-hidden /></button>
        </div>
      </form>
      {menu && (
        <Sheet open onClose={() => setMenu(null)} title="Comment" icon={MessageCircle}>
          <p dir="auto" className="bidi mb-3 line-clamp-3 rounded-xl bg-card2 px-3 py-2 text-sm"><b className="mr-1.5">{menu.author.username}</b>{menu.text}</p>
          <div className="space-y-2">
            <Btn kind="soft" icon={Reply} className="w-full" onClick={() => { const c = menu; setMenu(null); startReply(c); }}>Reply</Btn>
            <Btn kind="soft" icon={Copy} className="w-full" onClick={() => copy(menu)}>Copy text</Btn>
            {menu.canDelete && <Btn kind="danger" icon={Trash2} className="w-full" onClick={() => del(menu)}>{menu.author.id === me?.id ? "Delete" : "Delete from your post"}</Btn>}
            {menu.author.id !== me?.id && <Btn kind="ghost" icon={Flag} className="w-full" onClick={() => hide(menu)}>Hide and report</Btn>}
          </div>
        </Sheet>
      )}
      {likers && <LikesSheet url={`/comments/${likers}/likes`} onClose={() => setLikers(null)} />}
    </Sheet>
  );
}

/** One comment: avatar · name + text (mentions are links) · time, likes, Reply, … · heart. Long-press = menu. */
function CommentRow({ c, glow, onReply, onLike, onLikers, onMenu, onNavigate }: { c: Comment; glow: boolean; onReply: () => void; onLike: () => void; onLikers: () => void; onMenu: () => void; onNavigate: () => void }) {
  const press = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const cancel = () => { if (press.current) clearTimeout(press.current.t); press.current = null; };
  const small = !!c.parentId;
  return (
    <div id={`c-${c.id}`} role="article" aria-label={`${c.author.username}: ${c.text}`}
      className={cx("-mx-2 flex gap-2.5 rounded-xl px-2 pt-1.5 transition-colors duration-700 motion-reduce:transition-none", glow ? "bg-warn/15" : "bg-transparent")}
      onPointerDown={(e) => { if (e.pointerType === "mouse") return; cancel(); press.current = { x: e.clientX, y: e.clientY, t: setTimeout(() => { press.current = null; navigator.vibrate?.(10); onMenu(); }, 500) }; }}
      onPointerMove={(e) => { const p = press.current; if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancel(); }}
      onPointerUp={cancel} onPointerCancel={cancel} onContextMenu={(e) => { if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType !== "mouse") e.preventDefault(); }}>
      <a href={`#/u/${encodeURIComponent(c.author.username)}`} onClick={onNavigate} aria-label={c.author.username} className="shrink-0 pt-0.5">
        <UserAvatar id={c.author.avatarId} name={c.author.name ?? c.author.username} size={small ? 26 : 32} />
      </a>
      <div className="min-w-0 flex-1">
        <p dir="auto" className="bidi whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
          <a href={`#/u/${encodeURIComponent(c.author.username)}`} onClick={onNavigate} className="mr-1.5 font-semibold" dir="ltr">{c.author.username}</a>
          <MentionText text={c.text} onNavigate={onNavigate} />
        </p>
        <div className="-ml-1 flex flex-wrap items-center text-xs text-faint">
          <time className="px-1" dateTime={new Date(c.createdAt).toISOString()} title={fullTime(c.createdAt)}>{ago(c.createdAt)}</time>
          {c.likes > 0 && <button type="button" onClick={onLikers} className="min-h-11 px-1.5 font-semibold text-mute hover:text-ink num" aria-label={`${c.likes} ${c.likes === 1 ? "like" : "likes"}, see who`}>{fmtNum(c.likes)} {c.likes === 1 ? "like" : "likes"}</button>}
          <button type="button" onClick={onReply} className="min-h-11 px-1.5 font-semibold text-mute hover:text-ink">Reply</button>
          <button type="button" onClick={onMenu} className="flex h-11 w-9 items-center justify-center text-mute hover:text-ink" aria-label="More options for this comment"><MoreHorizontal size={16} aria-hidden /></button>
        </div>
      </div>
      <button type="button" onClick={onLike} aria-pressed={c.liked} aria-label={c.liked ? "Unlike comment" : "Like comment"} className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-card2">
        <Heart size={14} className={c.liked ? "fill-bad text-bad" : "text-faint"} aria-hidden />
      </button>
    </div>
  );
}

function LikesSheet({ url, onClose, title = "Likes" }: { url: string; onClose: () => void; title?: string }) {
  const [list, setList] = useState<{ id: string; username: string; name: string | null; avatarId: string | null }[] | null>(null);
  useEffect(() => { sx<typeof list>("GET", url).then(setList).catch(() => setList([])); }, [url]);
  return (
    <Sheet open onClose={onClose} title={title} icon={Heart}>
      {list == null ? <p className="py-6 text-center text-sm text-mute" role="status">Loading…</p> : list.length === 0 ? <p className="py-6 text-center text-sm text-mute">No likes yet</p> : (
        <ul>{list.map((u) => (
          <li key={u.id}><a href={`#/u/${encodeURIComponent(u.username)}`} onClick={onClose} className="flex min-h-12 items-center gap-3 rounded-xl px-1 hover:bg-card2">
            <UserAvatar id={u.avatarId} name={u.name ?? u.username} size={36} /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{u.username}</span>{u.name && <span className="block truncate text-xs text-mute" dir="auto">{u.name}</span>}</span>
          </a></li>
        ))}</ul>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- menu: edit / visibility / delete

function PostMenu({ post, onClose, onChange, onDelete }: { post: Post; onClose: () => void; onChange: (p: Post) => void; onDelete: () => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const mention = useMentions({ ref: area, value: edit ?? "", setValue: (v) => setEdit(v), source: postMentionSource({ post: post.id }), id: `edit-${post.id}`, place: "below" });
  async function save(patch: { text?: string; visibility?: PostVis }) {
    setBusy(true); setErr(null);
    try { await sx("PUT", `/posts/${post.id}`, patch); onChange({ ...post, ...patch, text: patch.text !== undefined ? patch.text.trim() || null : post.text, updatedAt: Date.now() }); onClose(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function del() {
    if (!confirm("Delete this post? Likes and comments go with it.")) return;
    setBusy(true);
    try { await sx("DELETE", `/posts/${post.id}`); onDelete(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose} title={edit != null ? "Edit caption" : "Post"} icon={edit != null ? Pencil : MoreHorizontal}>
      {edit != null ? (
        <>
          <div className="relative">
            <textarea ref={area} value={edit} onChange={(e) => { setEdit(e.target.value); mention.sync(e.target); }} onSelect={(e) => mention.sync(e.currentTarget)} onKeyDown={(e) => { mention.onKeyDown(e); }}
              {...mention.comboProps} maxLength={LIMITS.postText} rows={5} dir="auto" autoFocus className={cx(INPUT, "py-2")} aria-label="Caption" />
            {mention.popover}
          </div>
          <Btn kind="primary" className="mt-3 w-full" disabled={busy} onClick={() => save({ text: edit })}>Save</Btn>
        </>
      ) : post.mine ? (
        <div className="space-y-2">
          <Btn kind="soft" icon={Pencil} className="w-full" onClick={() => setEdit(post.text ?? "")}>Edit caption</Btn>
          <VisPicker value={post.visibility} disabled={busy} onPick={(v) => v !== post.visibility && save({ visibility: v })} />
          <Btn kind="danger" icon={Trash2} className="w-full" disabled={busy} onClick={del}>Delete post</Btn>
        </div>
      ) : (
        <div className="space-y-2">
          <a href={`#/u/${encodeURIComponent(post.author.username)}`} onClick={onClose} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-card2 font-semibold"><UserRound size={18} aria-hidden />View @{post.author.username}</a>
          <p className="pt-1 text-center text-xs text-faint">Posted {fullTime(post.createdAt)}</p>
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
    </Sheet>
  );
}

export const VIS_OPTS: { id: PostVis; label: string; short: string; icon: typeof Users; help: string }[] = [
  { id: "friends", label: "Friends", short: "Friends", icon: Users, help: "Your accepted friends" },
  { id: "members", label: "Everyone on Iron Log", short: "Everyone", icon: Globe2, help: "Shows in Discover for all members (blocked people never see it)" },
  { id: "private", label: "Only me", short: "Only me", icon: Lock, help: "Nobody else" },
];

/** Who can see a post: Friends (default) · Everyone on Iron Log · Only me. A radio group, the hint under it explains the pick. */
export function VisPicker({ value, onPick, disabled }: { value: PostVis; onPick: (v: PostVis) => void; disabled?: boolean }) {
  const cur = VIS_OPTS.find((o) => o.id === value) ?? VIS_OPTS[0];
  return (
    <div>
      <div role="radiogroup" aria-label="Who can see it" className="flex rounded-xl bg-card2 p-1">
        {VIS_OPTS.map(({ id, short, label, icon: Icon }) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} aria-label={label} disabled={disabled} onClick={() => onPick(id)}
            className={cx("flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 text-sm", value === id ? "bg-card3 font-semibold" : "text-mute")}>
            <Icon size={15} className="shrink-0" aria-hidden /><span className="truncate">{short}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-faint">{cur.label}: {cur.help}.</p>
    </div>
  );
}
