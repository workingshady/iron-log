import { useEffect, useRef, useState } from "react";
import { Dumbbell, Globe2, Heart, Lock, MessageCircle, MoreHorizontal, Pencil, Send, Timer, Trash2, TrendingUp, Trophy, UserRound } from "lucide-react";
import type { Comment, Post, PrSummary, WorkoutSummary } from "../../../shared/social";
import { LIMITS } from "../../../shared/social";
import { uid } from "../../lib/api";
import { useMe } from "../../lib/me";
import { cx, niceDate } from "../../lib/util";
import { Btn, Sheet } from "../ui";
import { UserAvatar } from "./UserAvatar";
import { INPUT, ago, fmtNum, fullTime, kgShort, reducedMotion, socialPhotoUrl, sx } from "./lib";

/**
 * One feed post (Instagram layout, Hevy-style workout card): header · media/summary · actions · likes · caption · comments.
 * Likes are optimistic (instant, rolled back on error); double-tap the photo to like with a heart burst.
 */
export function PostCard({ post, onChange, onDelete }: { post: Post; onChange?: (p: Post) => void; onDelete?: (id: string) => void }) {
  const [p, setP] = useState(post);
  useEffect(() => setP(post), [post]);
  const [comments, setComments] = useState(false);
  const [menu, setMenu] = useState(false);
  const [likers, setLikers] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const heart = useRef<HTMLSpanElement>(null);
  const likeBtn = useRef<HTMLSpanElement>(null);
  const update = (n: Post) => { setP(n); onChange?.(n); };

  async function like(on: boolean) {
    if (on === p.liked) return;
    const prev = p;
    update({ ...p, liked: on, likes: Math.max(0, p.likes + (on ? 1 : -1)) });
    if (on && !reducedMotion()) likeBtn.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 300, easing: "ease-out" });
    try {
      const r = await sx<{ likes: number; liked: boolean }>(on ? "POST" : "DELETE", `/posts/${p.id}/like`);
      update({ ...prev, liked: r.liked, likes: r.likes });
    } catch (e) { update(prev); setErr((e as Error).message); }
  }
  function burst() {
    void like(true);
    const h = heart.current;
    if (!h) return;
    if (reducedMotion()) { h.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600 }); return; }
    h.animate([
      { opacity: 0, transform: "translate(-50%,-50%) scale(.2)" },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1.15)", offset: 0.25 },
      { opacity: 1, transform: "translate(-50%,-50%) scale(.95)", offset: 0.45 },
      { opacity: 0, transform: "translate(-50%,-60%) scale(1.05)" },
    ], { duration: 850, easing: "ease-out" });
  }
  const long = (p.text?.length ?? 0) > 180;

  return (
    <article className="border-b border-line/60 pb-3 md:rounded-2xl md:border md:bg-card md:pb-4" aria-label={`Post by ${p.author.name || p.author.username}, ${ago(p.createdAt, true)}`}>
      <header className="flex items-center gap-3 px-4 py-2">
        <a href={`#/u/${encodeURIComponent(p.author.username)}`} className="flex min-w-0 flex-1 items-center gap-3">
          <UserAvatar id={p.author.avatarId} name={p.author.name ?? p.author.username} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{p.author.name || p.author.username}</span>
            <span className="flex items-center gap-1 text-xs text-mute">
              <time dateTime={new Date(p.createdAt).toISOString()} title={fullTime(p.createdAt)}>{ago(p.createdAt)}</time>
              {p.visibility === "private" ? <><span aria-hidden>·</span><Lock size={11} aria-hidden /><span>Only you</span></> : null}
              {p.updatedAt - p.createdAt > 60_000 && <span>· edited</span>}
            </span>
          </span>
        </a>
        <button type="button" onClick={() => setMenu(true)} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-mute hover:bg-card2" aria-label="Post options"><MoreHorizontal size={20} aria-hidden /></button>
      </header>

      {p.kind === "workout" && p.data && <WorkoutBody w={p.data as WorkoutSummary} />}
      {p.kind === "pr" && p.data && <PrBody pr={p.data as PrSummary} />}
      {p.photoIds.length > 0 && (
        <div className="relative">
          <Carousel ids={p.photoIds} onDoubleTap={burst} label={p.kind === "progress" ? "Progress photo" : "Photo"} />
          <span ref={heart} className="pointer-events-none absolute left-1/2 top-1/2 opacity-0" style={{ transform: "translate(-50%,-50%)" }} aria-hidden>
            <Heart size={96} className="fill-white text-white drop-shadow-[0_2px_12px_rgba(0,0,0,.5)]" />
          </span>
        </div>
      )}

      {/* actions */}
      <div className="flex items-center px-2 pt-1">
        <button type="button" onClick={() => like(!p.liked)} aria-pressed={p.liked} aria-label={p.liked ? "Unlike" : "Like"} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2">
          <span ref={likeBtn} className="inline-flex"><Heart size={24} className={p.liked ? "fill-bad text-bad" : "text-ink"} aria-hidden /></span>
        </button>
        <button type="button" onClick={() => setComments(true)} aria-label={`Comments (${p.comments})`} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2">
          <MessageCircle size={24} aria-hidden />
        </button>
        {p.kind === "progress" && <span className="ml-auto mr-2 inline-flex items-center gap-1 text-xs text-mute"><TrendingUp size={14} aria-hidden />Progress</span>}
      </div>
      <div className="px-4">
        {p.likes > 0 && (
          <button type="button" onClick={() => setLikers(true)} className="min-h-6 text-sm font-semibold" aria-live="polite">{fmtNum(p.likes)} {p.likes === 1 ? "like" : "likes"}</button>
        )}
        {p.text && (
          <p dir="auto" className="bidi mt-0.5 whitespace-pre-wrap break-words text-sm leading-snug">
            <a href={`#/u/${encodeURIComponent(p.author.username)}`} className="mr-1.5 font-semibold">{p.author.username}</a>
            {long && !expanded ? <>{p.text.slice(0, 160).trimEnd()}… <button type="button" onClick={() => setExpanded(true)} className="text-mute">more</button></> : p.text}
          </p>
        )}
        {p.comments > 0 && (
          <button type="button" onClick={() => setComments(true)} className="mt-1 block min-h-6 text-left text-sm text-mute">
            {p.comments === 1 ? "View 1 comment" : `View all ${p.comments} comments`}
          </button>
        )}
        {p.preview && (
          <p dir="auto" className="bidi truncate text-sm"><span className="mr-1.5 font-semibold">{p.preview.username}</span>{p.preview.text}</p>
        )}
        {err && <p role="alert" className="mt-1 text-xs text-bad">{err}</p>}
      </div>

      {comments && <CommentsSheet post={p} onClose={() => setComments(false)} onCount={(n) => update({ ...p, comments: n })} />}
      {likers && <LikesSheet postId={p.id} onClose={() => setLikers(false)} />}
      {menu && <PostMenu post={p} onClose={() => setMenu(false)} onChange={update} onDelete={() => { setMenu(false); onDelete?.(p.id); }} />}
    </article>
  );
}

// ---------------------------------------------------------------- bodies

function WorkoutBody({ w }: { w: WorkoutSummary }) {
  return (
    <section className="mx-4 rounded-2xl bg-card2 p-3 md:mx-4" aria-label={`Workout: ${w.dayName}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-acc/15 text-acc" aria-hidden><Dumbbell size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{w.dayName}</div>
          <div className="text-xs text-mute">{niceDate(w.date)}</div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[[w.minutes != null ? `${w.minutes}` : "–", "min", Timer], [`${w.hardSets}`, "hard sets", Dumbbell], [kgShort(w.volume), "volume", TrendingUp]].map(([v, l]) => (
          <div key={l as string} className="flex flex-col-reverse rounded-xl bg-card3/60 py-2">
            <dt className="text-[11px] text-mute">{l as string}</dt>
            <dd className="text-base font-bold num">{v as string}</dd>
          </div>
        ))}
      </dl>
      {w.exercises.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {w.exercises.slice(0, 6).map((e, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="w-7 shrink-0 text-right text-xs text-faint num">{e.sets}×</span>
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              {e.best && <span className="shrink-0 text-xs text-mute num">{e.best}</span>}
            </li>
          ))}
          {w.exercises.length > 6 && <li className="pl-9 text-xs text-faint">+{w.exercises.length - 6} more</li>}
        </ul>
      )}
      {w.prs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {w.prs.map((x, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-medium text-warn"><Trophy size={12} aria-hidden />{x.name}{x.kg ? ` ${x.kg} kg` : ""}{x.reps ? ` × ${x.reps}` : ""}</span>)}
        </div>
      )}
    </section>
  );
}

function PrBody({ pr }: { pr: PrSummary }) {
  return (
    <section className="mx-4 flex items-center gap-3 rounded-2xl bg-warn/10 p-4" aria-label="Personal record">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-warn/20 text-warn" aria-hidden><Trophy size={24} /></span>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-warn">New PR</div>
        <div className="truncate font-semibold">{pr.name}</div>
        <div className="text-lg font-bold num">{pr.kg ? `${pr.kg} kg` : ""}{pr.reps ? ` × ${pr.reps}` : ""}</div>
        {pr.e1rm && <div className="text-xs text-mute num">≈ {pr.e1rm} kg est. max · {niceDate(pr.date)}</div>}
      </div>
    </section>
  );
}

/** Swipeable photos (scroll-snap) with dots; double-tap = like. */
function Carousel({ ids, onDoubleTap, label }: { ids: string[]; onDoubleTap: () => void; label: string }) {
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  return (
    <div>
      <div ref={box} className="flex snap-x snap-mandatory overflow-x-auto bg-black [scrollbar-width:none]" aria-roledescription="carousel" aria-label={`${ids.length} photo${ids.length > 1 ? "s" : ""}. Double-tap to like.`}
        onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        onPointerUp={(e) => { if (e.pointerType === "mouse") return; const tm = Date.now(); if (tm - last.current < 300) { onDoubleTap(); last.current = 0; } else last.current = tm; }}
        onDoubleClick={onDoubleTap}>
        {ids.map((id, k) => (
          <div key={id} className="w-full shrink-0 snap-center" aria-roledescription="slide" aria-label={`${k + 1} of ${ids.length}`}>
            <img src={socialPhotoUrl(id)} alt={`${label} ${k + 1}`} loading="lazy" decoding="async" draggable={false} className="aspect-[4/5] w-full select-none object-cover" />
          </div>
        ))}
      </div>
      {ids.length > 1 && (
        <div className="mt-2 flex justify-center gap-1" aria-hidden>
          {ids.map((id, k) => <span key={id} className={cx("h-1.5 w-1.5 rounded-full transition-colors", k === i ? "bg-info" : "bg-line")} />)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- comments

export function CommentsSheet({ post, onClose, onCount }: { post: Post; onClose: () => void; onCount: (n: number) => void }) {
  const me = useMe();
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { sx<Comment[]>("GET", `/posts/${post.id}/comments`).then(setList).catch((e) => setErr((e as Error).message)); }, [post.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [list?.length]);
  async function add() {
    const v = text.trim();
    if (!v || busy) return;
    const id = uid();
    const tmp: Comment = { id, text: v, createdAt: Date.now(), author: { id: me?.id ?? "", username: me?.username ?? "you", name: me?.name ?? null, avatarId: me?.avatarId ?? null }, canDelete: true };
    setBusy(true); setErr(null); setText("");
    setList((l) => [...(l ?? []), tmp]);
    try { await sx("POST", `/posts/${post.id}/comments`, { id, text: v }); onCount((list?.length ?? 0) + 1); }
    catch (e) { setErr((e as Error).message); setText(v); setList((l) => (l ?? []).filter((c) => c.id !== id)); }
    finally { setBusy(false); }
  }
  async function del(c: Comment) {
    if (!confirm("Delete this comment?")) return;
    const prev = list;
    setList((l) => (l ?? []).filter((x) => x.id !== c.id));
    try { await sx("DELETE", `/comments/${c.id}`); onCount((prev?.length ?? 1) - 1); }
    catch (e) { setList(prev); setErr((e as Error).message); }
  }
  return (
    <Sheet open onClose={onClose} title="Comments" icon={MessageCircle}>
      {list == null && !err && <ul aria-busy className="space-y-3">{[0, 1, 2].map((k) => <li key={k} className="flex gap-3"><span className="h-8 w-8 animate-pulse rounded-full bg-card2" /><span className="h-8 flex-1 animate-pulse rounded-lg bg-card2" /></li>)}</ul>}
      {list && list.length === 0 && <p className="py-8 text-center text-sm text-mute">No comments yet. Say something nice 💪</p>}
      <ul className="space-y-3" aria-live="polite">
        {list?.map((c) => (
          <li key={c.id} className="flex gap-3">
            <a href={`#/u/${encodeURIComponent(c.author.username)}`} onClick={onClose} aria-label={c.author.username}><UserAvatar id={c.author.avatarId} name={c.author.name ?? c.author.username} size={32} /></a>
            <div className="min-w-0 flex-1">
              <p dir="auto" className="bidi whitespace-pre-wrap break-words text-sm"><span className="mr-1.5 font-semibold">{c.author.username}</span>{c.text}</p>
              <span className="text-[11px] text-faint" title={fullTime(c.createdAt)}>{ago(c.createdAt)}</span>
            </div>
            {c.canDelete && <button type="button" onClick={() => del(c)} className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-faint hover:bg-card2 hover:text-bad" aria-label="Delete comment"><Trash2 size={16} aria-hidden /></button>}
          </li>
        ))}
      </ul>
      <div ref={end} />
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <form className="sticky bottom-0 -mx-4 mt-3 flex items-center gap-2 border-t border-line bg-card px-4 pt-3 md:-mx-6 md:px-6" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <label className="sr-only" htmlFor={`cm-${post.id}`}>Add a comment</label>
        <input id={`cm-${post.id}`} value={text} maxLength={LIMITS.comment} onChange={(e) => setText(e.target.value)} dir="auto" placeholder="Add a comment…" className={INPUT} autoComplete="off" enterKeyHint="send" />
        <button type="submit" disabled={!text.trim() || busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-acc text-acc-ink disabled:opacity-40" aria-label="Post comment"><Send size={18} aria-hidden /></button>
      </form>
    </Sheet>
  );
}

function LikesSheet({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [list, setList] = useState<{ id: string; username: string; name: string | null; avatarId: string | null }[] | null>(null);
  useEffect(() => { sx<typeof list>("GET", `/posts/${postId}/likes`).then(setList).catch(() => setList([])); }, [postId]);
  return (
    <Sheet open onClose={onClose} title="Likes" icon={Heart}>
      {list == null ? <p className="py-6 text-center text-sm text-mute" role="status">Loading…</p> : (
        <ul>{list.map((u) => (
          <li key={u.id}><a href={`#/u/${encodeURIComponent(u.username)}`} onClick={onClose} className="flex min-h-12 items-center gap-3 rounded-xl px-1 hover:bg-card2">
            <UserAvatar id={u.avatarId} name={u.name ?? u.username} size={36} /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{u.username}</span>{u.name && <span className="block truncate text-xs text-mute">{u.name}</span>}</span>
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
  async function save(patch: { text?: string; visibility?: "friends" | "private" }) {
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
          <textarea value={edit} onChange={(e) => setEdit(e.target.value)} maxLength={LIMITS.postText} rows={5} dir="auto" autoFocus className={cx(INPUT, "py-2")} aria-label="Caption" />
          <Btn kind="primary" className="mt-3 w-full" disabled={busy} onClick={() => save({ text: edit })}>Save</Btn>
        </>
      ) : post.mine ? (
        <div className="space-y-2">
          <Btn kind="soft" icon={Pencil} className="w-full" onClick={() => setEdit(post.text ?? "")}>Edit caption</Btn>
          {post.visibility === "friends"
            ? <Btn kind="soft" icon={Lock} className="w-full" disabled={busy} onClick={() => save({ visibility: "private" })}>Hide from friends (only you)</Btn>
            : <Btn kind="soft" icon={Globe2} className="w-full" disabled={busy} onClick={() => save({ visibility: "friends" })}>Share with friends</Btn>}
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
