import { useCallback, useEffect, useRef, useState } from "react";
import { Dumbbell, Loader2, Plus, RefreshCw, Trophy, Users } from "lucide-react";
import type { Post } from "../../shared/social";
import { PostCard } from "../components/social/PostCard";
import { Composer } from "../components/social/Composer";
import { NotifBell } from "../components/social/Badges";
import { Stories } from "../components/social/Stories";
import { discardPost, jobAsPost, localSrc, retryPost, useUploads } from "../components/social/Uploads";
import { sx, useFocusRefresh, usePullRefresh } from "../components/social/lib";
import { cache } from "../lib/api";

/** Friends feed: stories row, your posts + friends' posts, newest first. Pull to refresh, scroll to load more. */
export default function Feed() {
  const [posts, setPosts] = useState<Post[] | null>(() => cache.get<Post[]>("social:feed"));
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);
  const [pull, setPull] = useState(0);
  const [fresh, setFresh] = useState<string | null>(null);
  const [storyKey, setStoryKey] = useState(0);
  const more = useRef<HTMLDivElement>(null);
  const uploads = useUploads();

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const r = await sx<{ posts: Post[]; next: string | null }>("GET", "/feed?limit=10");
      setPosts((old) => { if (old?.length && r.posts[0] && !old.some((x) => x.id === r.posts[0].id) && !r.posts[0].mine) setFresh("New posts"); return r.posts; });
      setNext(r.next); setErr(null);
      cache.set("social:feed", r.posts);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }, []);
  const loadMore = useCallback(async () => {
    if (!next || busy) return;
    setBusy(true);
    try {
      const r = await sx<{ posts: Post[]; next: string | null }>("GET", `/feed?limit=10&cursor=${encodeURIComponent(next)}`);
      setPosts((p) => [...(p ?? []), ...r.posts.filter((x) => !(p ?? []).some((y) => y.id === x.id))]);
      setNext(r.next);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }, [next, busy]);

  useEffect(() => { void refresh(); }, [refresh]);
  useFocusRefresh(refresh);
  usePullRefresh(useCallback(async () => { setStoryKey((k) => k + 1); await refresh(); }, [refresh]), setPull);
  useEffect(() => { const on = () => void refresh(); window.addEventListener("il:posted", on); return () => window.removeEventListener("il:posted", on); }, [refresh]);
  useEffect(() => { if (!fresh) return; const tm = setTimeout(() => setFresh(null), 2500); return () => clearTimeout(tm); }, [fresh]);
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && void loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // optimistic: posts still uploading sit on top (until the server copy arrives)
  const pending = uploads.filter((j) => !(posts ?? []).some((p) => p.id === j.id));
  const empty = posts != null && posts.length === 0 && !pending.length;

  return (
    <div className="-mx-4 overflow-x-clip md:mx-auto md:max-w-xl">
      <header className="flex items-center gap-0.5 px-4 pb-2">
        <h1 className="flex-1 text-[26px] font-extrabold tracking-tight">Feed</h1>
        <a href="#/compete" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="Leaderboard and challenges"><Trophy size={23} aria-hidden /></a>
        <a href="#/friends" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="Friends"><Users size={23} aria-hidden /></a>
        <NotifBell />
        <button type="button" onClick={() => void refresh()} className="hidden h-11 w-11 items-center justify-center rounded-full hover:bg-card2 md:flex" aria-label="Refresh"><RefreshCw size={20} className={busy ? "animate-spin" : ""} aria-hidden /></button>
      </header>

      <div className="flex justify-center overflow-hidden transition-[height] duration-150" style={{ height: pull }} aria-hidden>
        <RefreshCw size={20} className="mt-3 text-mute" style={{ transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / 64) }} />
      </div>
      <p className="sr-only" role="status" aria-live="polite">{busy ? "Loading posts" : fresh ?? ""}</p>
      {fresh && <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="sticky top-2 z-20 mx-auto -mb-9 block w-fit rounded-full bg-info px-3 py-1.5 text-xs font-semibold text-black shadow-lg">↑ {fresh}</button>}

      <Stories onCompose={() => setCompose(true)} reloadKey={storyKey} />

      {err && !posts?.length && <p role="alert" className="px-4 pt-3 text-sm text-bad">{err}</p>}
      {posts == null ? <Skeleton /> : empty ? <EmptyFeed onCompose={() => setCompose(true)} /> : (
        <div className="space-y-4 pt-2 md:space-y-5">
          {pending.map((j) => (
            <PostCard key={j.id} post={jobAsPost(j)} pending={{
              progress: j.progress, error: j.state === "error" ? j.error : undefined, onRetry: () => retryPost(j.id), onDiscard: () => discardPost(j.id),
              src: (id, thumb) => { const it = j.photos.find((x) => x.id === id); return it ? localSrc(it, thumb) : ""; },
            }} />
          ))}
          {posts.map((p) => (
            <PostCard key={p.id} post={p} onChange={(n) => setPosts((l) => (l ?? []).map((x) => (x.id === n.id ? n : x)))} onDelete={(id) => setPosts((l) => (l ?? []).filter((x) => x.id !== id))} />
          ))}
        </div>
      )}
      <div ref={more} className="flex min-h-16 items-center justify-center">
        {busy && posts?.length ? <Loader2 size={20} className="animate-spin text-mute" aria-label="Loading more" />
          : !next && posts?.length ? <span className="text-xs text-faint">You're all caught up ✓</span>
            : next ? <button type="button" onClick={() => void loadMore()} className="min-h-11 rounded-xl px-4 text-sm text-info">Load more</button> : null}
      </div>

      <button type="button" onClick={() => setCompose(true)} className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-acc text-acc-ink shadow-[0_8px_24px_-6px_var(--color-acc)] transition active:scale-95 md:bottom-8 md:right-8" aria-label="New post">
        <Plus size={28} strokeWidth={2.5} aria-hidden />
      </button>
      <Composer open={compose} onClose={() => setCompose(false)} onPosted={() => { setCompose(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
    </div>
  );
}

function EmptyFeed({ onCompose }: { onCompose: () => void }) {
  return (
    <div className="mx-4 mt-4 overflow-hidden rounded-3xl bg-card p-6 text-center">
      <div className="mx-auto flex w-fit -space-x-3" aria-hidden>
        {["bg-acc/20 text-acc", "bg-info/20 text-info", "bg-warn/20 text-warn"].map((c, i) => <span key={i} className={`flex h-14 w-14 items-center justify-center rounded-full ring-4 ring-card ${c}`}>{i === 1 ? <Users size={24} /> : i === 0 ? <Dumbbell size={22} /> : <Trophy size={22} />}</span>)}
      </div>
      <h2 className="mt-4 text-lg font-bold">Training's better together</h2>
      <p className="mx-auto mt-1 max-w-[16rem] text-sm text-mute">Add your gym crew, cheer each other on, compare lifts.</p>
      <div className="mt-5 flex flex-col gap-2">
        <a href="#/friends" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-acc px-4 font-semibold text-acc-ink"><Users size={18} aria-hidden />Find friends</a>
        <button type="button" onClick={onCompose} className="min-h-12 rounded-xl bg-card2 px-4 text-sm font-semibold">Share your first post</button>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy aria-label="Loading feed" className="space-y-6 pt-3">
      {[0, 1].map((k) => (
        <div key={k}>
          <div className="flex items-center gap-3 px-4"><span className="h-9 w-9 animate-pulse rounded-full bg-card2" /><span className="space-y-1.5"><span className="block h-3 w-28 animate-pulse rounded bg-card2" /><span className="block h-2.5 w-16 animate-pulse rounded bg-card2" /></span></div>
          <div className="mx-3 mt-3 h-72 animate-pulse rounded-3xl bg-card" />
          <div className="mx-4 mt-3 h-3 w-2/3 animate-pulse rounded bg-card2" />
        </div>
      ))}
    </div>
  );
}
