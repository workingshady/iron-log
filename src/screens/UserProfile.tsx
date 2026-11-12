import { useCallback, useEffect, useState } from "react";
import { Ban, ChevronLeft, ChevronRight, Dumbbell, Flame, Grid3x3, Images, Lock, MessageCircle, MoreHorizontal, Trophy, UserMinus, X } from "lucide-react";
import type { Badge, Post, Relation, UserLite, WeekDay } from "../../shared/social";
import { Sheet } from "../components/ui";
import { UserAvatar } from "../components/social/UserAvatar";
import { FriendButton } from "../components/social/FriendButton";
import { PostGrid } from "../components/social/PostGrid";
import { BadgeRow, WeekStrip } from "../components/social/Achievements";
import { fmtNum, kgShort, lastSeen, localToday, socialPhotoUrl, sx, useFocusRefresh } from "../components/social/lib";
import { cx, niceDate } from "../lib/util";

export interface ProfileData {
  user: UserLite; relation: Relation; preview: boolean;
  see?: { profile: boolean; workouts: boolean; prs: boolean; stats: boolean; body: boolean; online: boolean; photos: boolean };
  counts?: { friends: number; posts: number | null }; mutual?: number; bio?: string | null; lastSeenAt?: number | null;
  stats?: { workouts: number; since: string | null; streak: number };
  prs?: { count: number; recent: { name: string; kg: number | null; reps: number | null; date: string }[] };
  workouts?: { date: string; dayName: string; minutes: number | null; sets: number; volume: number; prs: number }[];
  body?: { kg: number | null; date: string } | null;
  badges?: Badge[]; week?: WeekDay[];
}
interface Ph { id: string; date: string; caption: string | null }
type Tab = "posts" | "photos" | "prs";

/** Someone else's profile (#/u/<username>), Instagram layout, showing only what their privacy settings allow. */
export default function UserProfile({ username, asFriend }: { username: string; asFriend?: boolean }) {
  const q = asFriend ? "?as=friend" : "";
  const [p, setP] = useState<ProfileData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("posts");
  const [photos, setPhotos] = useState<Ph[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);

  const load = useCallback(() => {
    const t = `${q ? "&" : "?"}today=${localToday()}`;
    sx<ProfileData>("GET", `/social/profile/${encodeURIComponent(username)}${q}${t}`).then((d) => { setP(d); setErr(null); }).catch((e) => setErr((e as Error).message));
    sx<Ph[]>("GET", `/social/users/${encodeURIComponent(username)}/photos${q}`).then(setPhotos).catch(() => setPhotos([]));
    sx<{ posts: Post[] }>("GET", `/feed?limit=30&user=${encodeURIComponent(username)}${asFriend ? "&as=friend" : ""}`).then((r) => setPosts(r.posts)).catch(() => setPosts([]));
  }, [username, q, asFriend]);
  useEffect(load, [load]);
  useFocusRefresh(load);

  if (err) return <div className="py-16 text-center"><p className="text-mute">{err === "User not found" ? "This account isn't available." : err}</p><button type="button" onClick={() => history.back()} className="mt-4 min-h-11 rounded-xl bg-card2 px-4 text-sm font-semibold">Go back</button></div>;
  if (!p) return <ProfileSkeleton />;
  if (!asFriend && p.relation === "self") { location.hash = "#/profile"; return null; }

  const locked = !p.see?.photos && p.relation !== "blocked";
  const display = p.user.name || p.user.username;
  const today = localToday();
  const trainedToday = p.week?.some((d) => d.date === today && (d.lift || d.cardio));
  const online = lastSeen(p.lastSeenAt);

  return (
    <div className={cx(!asFriend && "-mx-4 overflow-x-clip md:mx-auto md:max-w-2xl")}>
      {!asFriend && (
        <header className="flex items-center gap-0.5 pb-3 pl-1 pr-2">
          <button type="button" onClick={() => history.back()} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="Back"><ChevronLeft size={26} aria-hidden /></button>
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{p.user.username}</h1>
          {p.relation !== "blocked" && <button type="button" onClick={() => setMenu(true)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="More options"><MoreHorizontal size={24} aria-hidden /></button>}
        </header>
      )}

      <section className="flex items-center gap-5 px-4 md:gap-10" aria-label="Profile">
        <span className="relative shrink-0 rounded-full p-[3px]" style={trainedToday ? { background: "conic-gradient(var(--color-acc), var(--color-info), var(--color-acc))" } : undefined} title={trainedToday ? "Trained today" : undefined}>
          <span className="block rounded-full bg-bg p-[2px]"><UserAvatar id={p.user.avatarId} name={display} size={82} /></span>
        </span>
        <dl className="grid flex-1 grid-cols-3 text-center">
          {([["posts", p.counts?.posts], ["friends", p.counts?.friends], ["workouts", p.stats?.workouts]] as const).map(([l, v]) => (
            <div key={l} className="flex flex-col-reverse items-center gap-0.5">
              <dt className="text-xs text-mute">{l}</dt>
              <dd className="text-lg font-bold leading-none num">{v == null ? <Lock size={14} className="inline text-faint" aria-label="hidden" /> : fmtNum(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-3 px-4">
        <div className="text-[15px] font-semibold leading-tight">{display}</div>
        {p.bio && <p dir="auto" className="bidi mt-0.5 whitespace-pre-wrap text-sm leading-snug">{p.bio}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-mute">
          {!!p.stats?.streak && <span className="inline-flex items-center gap-0.5 font-semibold text-warn"><Flame size={13} className="fill-warn" aria-hidden />{p.stats.streak}-week streak</span>}
          {p.body?.kg && <span className="num">{p.body.kg} kg</span>}
          {online && <span className={(Date.now() - (p.lastSeenAt ?? 0)) < 180e3 ? "font-semibold text-acc" : ""}>{online}</span>}
          {!!p.mutual && p.relation !== "friends" && <span>{p.mutual} mutual</span>}
        </p>
      </div>

      {!asFriend && (
        <div className="mt-3 grid grid-cols-2 gap-2 px-4">
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

      {!!p.badges?.length && <div className="mt-4 px-4"><BadgeRow badges={p.badges} /></div>}
      {p.week && <div className="mt-3 px-4"><WeekStrip days={p.week} today={today} /></div>}

      {locked ? (
        <div className="mx-4 mt-6 rounded-3xl bg-card p-6 text-center">
          <Lock size={26} className="mx-auto text-faint" aria-hidden />
          <p className="mt-2 font-semibold">{p.relation === "outgoing" ? "Request sent" : "Friends only"}</p>
          <p className="mt-0.5 text-sm text-mute">{p.relation === "outgoing" ? `You'll see ${display}'s posts once they accept.` : `Add ${display} to see posts and training.`}</p>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Profile sections" className="sticky top-0 z-10 mt-4 flex border-b border-line bg-bg">
            {([["posts", "Posts", Grid3x3], ["photos", "Photos", Images], ["prs", "PRs", Trophy]] as const).map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={cx("-mb-px flex h-12 flex-1 items-center justify-center gap-1.5 border-b-2 text-xs font-semibold", tab === id ? "border-ink text-ink" : "border-transparent text-faint hover:text-mute")}>
                <Icon size={19} strokeWidth={tab === id ? 2.4 : 1.8} aria-hidden />{label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="pb-6">
            {tab === "posts" && (posts == null ? <GridSkeleton /> : posts.length === 0 ? <Nothing icon={Grid3x3} text="No posts yet" /> : <PostGrid posts={posts} onChange={setPosts} />)}
            {tab === "photos" && (photos == null ? <GridSkeleton /> : photos.length === 0 ? <Nothing icon={Images} text="No shared photos yet" /> : (
              <ul className="grid grid-cols-3 gap-0.5" aria-label="Photos">
                {photos.map((ph, i) => (
                  <li key={ph.id}><button type="button" onClick={() => setOpen(i)} className="block aspect-[4/5] w-full overflow-hidden bg-card3" aria-label={`Photo from ${niceDate(ph.date)}${ph.caption ? `: ${ph.caption}` : ""}`}>
                    <img src={socialPhotoUrl(ph.id, true)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  </button></li>
                ))}
              </ul>
            ))}
            {tab === "prs" && <Training p={p} />}
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

function Nothing({ icon: Icon, text }: { icon: typeof Lock; text: string }) {
  return <div className="flex flex-col items-center gap-2 py-12 text-sm text-mute"><span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-line"><Icon size={24} aria-hidden /></span>{text}</div>;
}

/** PRs as trophy cards + recent workouts. */
export function Training({ p }: { p: ProfileData }) {
  if (!p.workouts && !p.prs) return <Nothing icon={Lock} text="Training is private" />;
  return (
    <div className="space-y-5 px-4 pt-4">
      {p.prs && (
        <section aria-labelledby="rp">
          <h2 id="rp" className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-mute">PRs <span className="text-warn num">{fmtNum(p.prs.count)}</span></h2>
          {p.prs.recent.length === 0 ? <p className="text-sm text-mute">No PRs yet.</p> : (
            <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {p.prs.recent.map((r, i) => (
                <li key={i} className="flex w-36 shrink-0 flex-col justify-between gap-3 rounded-2xl p-3" style={{ background: "linear-gradient(160deg, color-mix(in srgb, var(--color-warn) 22%, var(--color-card)), var(--color-card) 70%)" }}>
                  <Trophy size={18} className="text-warn" aria-hidden />
                  <span>
                    <span className="block truncate text-xs text-mute">{r.name}</span>
                    <span className="block text-xl font-extrabold leading-tight num">{r.kg ? r.kg : ""}{r.kg ? <span className="text-xs font-semibold text-mute"> kg</span> : null}{r.reps ? <span className="text-base"> ×{r.reps}</span> : null}</span>
                    <span className="block text-[11px] text-faint">{new Date(`${r.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {p.workouts && (
        <section aria-labelledby="rw">
          <h2 id="rw" className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">Recent workouts</h2>
          {p.workouts.length === 0 ? <p className="text-sm text-mute">No finished workouts yet.</p> : (
            <ul className="space-y-1.5">
              {p.workouts.map((w, i) => (
                <li key={i} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-acc/15 text-acc" aria-hidden><Dumbbell size={18} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{w.dayName}</span><span className="block text-xs text-mute">{niceDate(w.date)}{w.minutes ? ` · ${w.minutes} min` : ""}</span></span>
                  <span className="text-right text-xs text-mute num"><span className="block text-sm font-bold text-ink">{kgShort(w.volume)}</span>{w.sets} sets{w.prs ? <span className="text-warn"> · 🏆{w.prs}</span> : ""}</span>
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
  return <div aria-busy className="grid grid-cols-3 gap-0.5">{Array.from({ length: 6 }, (_, k) => <div key={k} className="aspect-[4/5] animate-pulse bg-card" />)}</div>;
}
function ProfileSkeleton() {
  return (
    <div aria-busy aria-label="Loading profile" className="pt-14">
      <div className="flex items-center gap-5"><span className="h-[88px] w-[88px] animate-pulse rounded-full bg-card2" /><span className="h-10 flex-1 animate-pulse rounded-xl bg-card" /></div>
      <div className="mt-4 h-4 w-40 animate-pulse rounded bg-card2" /><div className="mt-2 h-3 w-56 animate-pulse rounded bg-card2" />
      <div className="mt-4 grid grid-cols-2 gap-2"><span className="h-11 animate-pulse rounded-lg bg-card" /><span className="h-11 animate-pulse rounded-lg bg-card" /></div>
    </div>
  );
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
