import { useCallback, useEffect, useState } from "react";
import { Activity, Ban, ChevronLeft, ChevronRight, Dumbbell, Grid3x3, Lock, MessageCircle, MoreHorizontal, Newspaper, Scale, Trophy, UserMinus, X } from "lucide-react";
import type { Post, Relation, UserLite } from "../../shared/social";
import { Empty, Sheet } from "../components/ui";
import { UserAvatar } from "../components/social/UserAvatar";
import { FriendButton } from "../components/social/FriendButton";
import { PostCard } from "../components/social/PostCard";
import { fmtNum, kgShort, lastSeen, socialPhotoUrl, sx, useFocusRefresh } from "../components/social/lib";
import { cx, niceDate } from "../lib/util";

export interface ProfileData {
  user: UserLite; relation: Relation; preview: boolean;
  see?: { profile: boolean; workouts: boolean; prs: boolean; stats: boolean; body: boolean; online: boolean; photos: boolean };
  counts?: { friends: number; posts: number | null }; mutual?: number; bio?: string | null; lastSeenAt?: number | null;
  stats?: { workouts: number; since: string | null; streak: number };
  prs?: { count: number; recent: { name: string; kg: number | null; reps: number | null; date: string }[] };
  workouts?: { date: string; dayName: string; minutes: number | null; sets: number; volume: number; prs: number }[];
  body?: { kg: number | null; date: string } | null;
}
interface Ph { id: string; date: string; caption: string | null }

const since = (d: string | null | undefined) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null);

/** Someone else's profile (#/u/<username>), Instagram layout, showing only what their privacy settings allow. */
export default function UserProfile({ username, asFriend }: { username: string; asFriend?: boolean }) {
  const q = asFriend ? "?as=friend" : "";
  const [p, setP] = useState<ProfileData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"grid" | "posts" | "training">("grid");
  const [photos, setPhotos] = useState<Ph[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);

  const load = useCallback(() => {
    sx<ProfileData>("GET", `/social/profile/${encodeURIComponent(username)}${q}`).then((d) => { setP(d); setErr(null); }).catch((e) => setErr((e as Error).message));
    sx<Ph[]>("GET", `/social/users/${encodeURIComponent(username)}/photos${q}`).then(setPhotos).catch(() => setPhotos([]));
    sx<{ posts: Post[] }>("GET", `/feed?limit=20&user=${encodeURIComponent(username)}${asFriend ? "&as=friend" : ""}`).then((r) => setPosts(r.posts)).catch(() => setPosts([]));
  }, [username, q, asFriend]);
  useEffect(load, [load]);
  useFocusRefresh(load);

  if (err) return <div className="py-16 text-center"><p className="text-mute">{err === "User not found" ? "This account isn't available." : err}</p><button type="button" onClick={() => history.back()} className="mt-4 min-h-11 rounded-xl bg-card2 px-4 text-sm font-semibold">Go back</button></div>;
  if (!p) return <div className="py-20 text-center text-mute" role="status">Loading profile…</div>;
  if (!asFriend && p.relation === "self") { location.hash = "#/profile"; return null; }

  const see = p.see;
  const locked = !see?.photos && p.relation !== "blocked";
  const display = p.user.name || p.user.username;

  return (
    <div className={cx(!asFriend && "-mx-4 md:mx-auto md:max-w-2xl")}>
      {!asFriend && (
        <header className="flex items-center gap-0.5 pb-3 pl-1 pr-2">
          <button type="button" onClick={() => history.back()} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="Back"><ChevronLeft size={26} aria-hidden /></button>
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{p.user.username}</h1>
          {p.relation !== "blocked" && <button type="button" onClick={() => setMenu(true)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="More options"><MoreHorizontal size={24} aria-hidden /></button>}
        </header>
      )}

      <section className="flex items-center gap-6 px-4 md:gap-10" aria-label="Profile">
        <UserAvatar id={p.user.avatarId} name={display} size={86} ring={!!p.user.avatarId && p.relation === "friends"} />
        <dl className="grid flex-1 grid-cols-3 text-center">
          {[["Posts", p.counts?.posts], ["Friends", p.counts?.friends], ["Workouts", p.stats?.workouts]].map(([l, v]) => (
            <div key={l as string} className="flex flex-col-reverse items-center gap-0.5">
              <dt className="text-xs text-mute">{l}</dt>
              <dd className="text-lg font-bold leading-none num">{v == null ? <Lock size={14} className="inline text-faint" aria-label="hidden" /> : fmtNum(v as number)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-3 px-4">
        <div className="text-[15px] font-semibold leading-tight">{display}</div>
        {p.bio && <p dir="auto" className="bidi mt-0.5 whitespace-pre-wrap text-sm leading-snug">{p.bio}</p>}
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-mute">
          {p.stats?.since && <span>Training since {since(p.stats.since)}</span>}
          {lastSeen(p.lastSeenAt) && <span className={(Date.now() - (p.lastSeenAt ?? 0)) < 180e3 ? "text-acc" : ""}>{lastSeen(p.lastSeenAt)}</span>}
          {!!p.mutual && p.relation !== "friends" && <span>{p.mutual} mutual friend{p.mutual === 1 ? "" : "s"}</span>}
        </p>
      </div>

      {!asFriend && (
        <div className="mt-4 grid grid-cols-2 gap-2 px-4">
          {p.relation === "blocked" ? (
            <button type="button" className="col-span-2 flex h-11 items-center justify-center rounded-lg bg-card2 text-sm font-semibold" onClick={async () => { await sx("DELETE", `/friends/${p.user.id}/block`); load(); }}>Unblock</button>
          ) : (
            <>
              <FriendButton key={p.relation} userId={p.user.id} relation={p.relation} name={p.user.username} wide onChange={load} />
              <a href={`#/chat/@${encodeURIComponent(p.user.username)}`} className={cx("flex h-11 items-center justify-center gap-1.5 rounded-lg bg-card2 text-sm font-semibold hover:bg-card3", p.relation !== "friends" && "pointer-events-none opacity-40")} aria-disabled={p.relation !== "friends"}>
                <MessageCircle size={16} aria-hidden />Message
              </a>
            </>
          )}
        </div>
      )}

      {/* quick stats strip */}
      {(p.stats || p.prs || p.body) && (
        <ul className="mt-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" aria-label="Highlights">
          {p.stats && <Chip icon={Activity} label="Weekly streak" value={`${p.stats.streak} wk`} />}
          {p.prs && <Chip icon={Trophy} label="PRs" value={fmtNum(p.prs.count)} tone="text-warn" />}
          {p.body?.kg && <Chip icon={Scale} label="Bodyweight" value={`${p.body.kg} kg`} />}
        </ul>
      )}

      {locked ? (
        <div className="mx-4 mt-6"><Empty icon={Lock}>{p.relation === "outgoing" ? `Request sent. Once ${display} accepts, you'll see what they share with friends.` : `Add ${display} as a friend to see their posts and training.`}</Empty></div>
      ) : (
        <>
          <div role="tablist" aria-label="Profile sections" className="sticky top-0 z-10 mt-5 flex border-b border-line bg-bg">
            {([["grid", "Photos", Grid3x3], ["posts", "Posts", Newspaper], ["training", "Training", Dumbbell]] as const).map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} title={label}
                className={cx("-mb-px flex h-12 flex-1 items-center justify-center border-b-2", tab === id ? "border-ink text-ink" : "border-transparent text-faint hover:text-mute")}>
                <Icon size={22} strokeWidth={tab === id ? 2.4 : 1.8} aria-hidden /><span className="sr-only">{label}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" className="pb-6">
            {tab === "grid" && (photos == null ? <GridSkeleton /> : photos.length === 0 ? <div className="px-4 pt-6"><Empty icon={Grid3x3}>No shared photos yet.</Empty></div> : (
              <ul className="grid grid-cols-3 gap-0.5" aria-label="Photos">
                {photos.map((ph, i) => (
                  <li key={ph.id}><button type="button" onClick={() => setOpen(i)} className="block aspect-[3/4] w-full overflow-hidden bg-card3" aria-label={`Photo from ${niceDate(ph.date)}${ph.caption ? `: ${ph.caption}` : ""}`}>
                    <img src={socialPhotoUrl(ph.id, true)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  </button></li>
                ))}
              </ul>
            ))}
            {tab === "posts" && (posts == null ? <GridSkeleton /> : posts.length === 0 ? <div className="px-4 pt-6"><Empty icon={Newspaper}>No posts yet.</Empty></div> : (
              <div className="space-y-3 pt-2">{posts.map((x) => <PostCard key={x.id} post={x} />)}</div>
            ))}
            {tab === "training" && <Training p={p} />}
          </div>
        </>
      )}

      {open != null && photos && <Viewer photos={photos} start={open} onClose={() => setOpen(null)} />}
      {menu && (
        <Sheet open onClose={() => setMenu(false)} title={`@${p.user.username}`}>
          <div className="space-y-2">
            {p.relation === "friends" && <button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-card2 px-4 text-sm font-semibold" onClick={async () => { if (confirm(`Remove ${display} from friends? They won't be told.`)) { await sx("DELETE", `/friends/${p.user.id}`); setMenu(false); load(); } }}><UserMinus size={18} aria-hidden />Unfriend</button>}
            <button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-bad/40 px-4 text-sm font-semibold text-bad" onClick={async () => { if (confirm(`Block ${display}? They can't find you, see your posts or message you. They won't be told.`)) { await sx("POST", `/friends/${p.user.id}/block`); setMenu(false); load(); } }}><Ban size={18} aria-hidden />Block</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Chip({ icon: Icon, label, value, tone }: { icon: typeof Trophy; label: string; value: string; tone?: string }) {
  return (
    <li className="flex shrink-0 items-center gap-2 rounded-2xl bg-card px-3 py-2">
      <Icon size={16} className={tone ?? "text-acc"} aria-hidden />
      <span><span className="block text-sm font-bold leading-tight num">{value}</span><span className="block text-[11px] text-mute">{label}</span></span>
    </li>
  );
}

function Training({ p }: { p: ProfileData }) {
  const none = !p.workouts && !p.prs;
  if (none) return <div className="px-4 pt-6"><Empty icon={Lock}>{p.user.name || p.user.username} keeps their training private.</Empty></div>;
  return (
    <div className="space-y-4 px-4 pt-4">
      {p.workouts && (
        <section aria-labelledby="rw">
          <h2 id="rw" className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">Recent workouts</h2>
          {p.workouts.length === 0 ? <p className="text-sm text-mute">No finished workouts yet.</p> : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
              {p.workouts.map((w, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-acc/15 text-acc" aria-hidden><Dumbbell size={17} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{w.dayName}</span><span className="block text-xs text-mute">{niceDate(w.date)}{w.minutes ? ` · ${w.minutes} min` : ""}</span></span>
                  <span className="text-right text-xs text-mute num"><span className="block text-sm font-semibold text-ink">{w.sets} sets</span>{kgShort(w.volume)}{w.prs ? ` · ${w.prs} PR` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {p.prs && (
        <section aria-labelledby="rp">
          <h2 id="rp" className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">Recent PRs</h2>
          {p.prs.recent.length === 0 ? <p className="text-sm text-mute">No PRs yet.</p> : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
              {p.prs.recent.map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <Trophy size={16} className="shrink-0 text-warn" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                  <span className="text-sm font-semibold num">{r.kg ? `${r.kg} kg` : ""}{r.reps ? ` × ${r.reps}` : ""}</span>
                  <span className="w-14 text-right text-xs text-faint">{new Date(`${r.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function GridSkeleton() {
  return <div aria-busy className="grid grid-cols-3 gap-0.5">{Array.from({ length: 6 }, (_, k) => <div key={k} className="aspect-[3/4] animate-pulse bg-card" />)}</div>;
}

/** Minimal full-screen viewer for friends' photos (← → keys, swipe via buttons, Esc closes). */
function Viewer({ photos, start, onClose }: { photos: Ph[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const ph = photos[i];
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") setI((x) => Math.min(photos.length - 1, x + 1)); if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [photos.length, onClose]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={`Photo ${i + 1} of ${photos.length}`}>
      <div className="flex items-center justify-between p-2 text-white">
        <span className="px-2 text-sm num">{i + 1} / {photos.length} · {niceDate(ph.date)}</span>
        <button type="button" autoFocus onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close"><X size={24} aria-hidden /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <img src={socialPhotoUrl(ph.id)} alt={ph.caption ?? `Photo from ${niceDate(ph.date)}`} className="max-h-full max-w-full object-contain" />
        {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white" aria-label="Previous photo"><ChevronLeft size={24} aria-hidden /></button>}
        {i < photos.length - 1 && <button type="button" onClick={() => setI(i + 1)} className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white" aria-label="Next photo"><ChevronRight size={24} aria-hidden /></button>}
      </div>
      {ph.caption && <p dir="auto" className="bidi p-4 text-sm text-white">{ph.caption}</p>}
    </div>
  );
}
