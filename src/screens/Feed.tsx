import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Newspaper, Plus, RefreshCw, Trophy, Users } from "lucide-react";
import type { Post } from "../../shared/social";
import { Btn, Empty } from "../components/ui";
import { PostCard } from "../components/social/PostCard";
import { Composer } from "../components/social/Composer";
import { NotifBell } from "../components/social/Badges";
import { sx, useFocusRefresh, usePullRefresh } from "../components/social/lib";
import { cache } from "../lib/api";

/** Friends feed: your posts + friends' posts, newest first. Pull down / come back to the app to refresh; scroll to load more. */
export default function Feed() {
  const [posts, setPosts] = useState<Post[] | null>(() => cache.get<Post[]>("social:feed"));
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);
  const [pull, setPull] = useState(0);
  const [fresh, setFresh] = useState<string | null>(null);
  const more = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const r = await sx<{ posts: Post[]; next: string | null }>("GET", "/feed?limit=10");
      setPosts((old) => { if (old && r.posts[0] && old[0]?.id !== r.posts[0].id) setFresh("New posts"); return r.posts; });
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
  usePullRefresh(refresh, setPull);
  useEffect(() => { if (!fresh) return; const tm = setTimeout(() => setFresh(null), 2500); return () => clearTimeout(tm); }, [fresh]);
  // infinite scroll
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && void loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <div className="-mx-4 md:mx-auto md:max-w-xl">
      <header className="flex items-center gap-1 px-4 pb-2">
        <h1 className="flex-1 text-2xl font-bold">Feed</h1>
        <a href="#/compete" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="Leaderboard and challenges"><Trophy size={23} aria-hidden /></a>
        <a href="#/friends" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="Friends"><Users size={23} aria-hidden /></a>
        <NotifBell />
        <button type="button" onClick={() => void refresh()} className="hidden h-11 w-11 items-center justify-center rounded-full hover:bg-card2 md:flex" aria-label="Refresh"><RefreshCw size={20} className={busy ? "animate-spin" : ""} aria-hidden /></button>
      </header>

      {/* pull-to-refresh indicator */}
      <div className="flex justify-center overflow-hidden transition-[height] duration-150" style={{ height: pull }} aria-hidden>
        <RefreshCw size={20} className="mt-3 text-mute" style={{ transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / 64) }} />
      </div>
      <p className="sr-only" role="status" aria-live="polite">{busy ? "Loading posts" : fresh ?? ""}</p>
      {fresh && <div className="sticky top-2 z-20 mx-auto -mb-9 w-fit rounded-full bg-info px-3 py-1.5 text-xs font-semibold text-black shadow-lg" aria-hidden>{fresh}</div>}

      {/* composer prompt */}
      <button type="button" onClick={() => setCompose(true)} className="mx-4 mb-3 flex min-h-12 w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-card px-4 text-left text-sm text-mute hover:bg-card2">
        <Plus size={18} className="text-acc" aria-hidden />Share a workout, PR or photo…
      </button>

      {err && !posts?.length && <p role="alert" className="px-4 text-sm text-bad">{err}</p>}
      {posts == null ? <Skeleton /> : posts.length === 0 ? (
        <div className="px-4 pt-4">
          <Empty icon={Newspaper}>Your feed is quiet. Add friends from the gym, then share your next workout. Only friends ever see your posts.</Empty>
          <div className="mt-3 flex justify-center gap-2"><a href="#/friends" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-acc px-4 font-semibold text-acc-ink"><Users size={18} aria-hidden />Find friends</a></div>
        </div>
      ) : (
        <div className="space-y-3 md:space-y-4">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} onChange={(n) => setPosts((l) => (l ?? []).map((x) => (x.id === n.id ? n : x)))} onDelete={(id) => setPosts((l) => (l ?? []).filter((x) => x.id !== id))} />
          ))}
        </div>
      )}
      <div ref={more} className="flex min-h-16 items-center justify-center">
        {busy && posts?.length ? <Loader2 size={20} className="animate-spin text-mute" aria-label="Loading more" /> : !next && posts?.length ? <span className="text-xs text-faint">You're all caught up ✓</span> : next ? <Btn kind="ghost" onClick={() => void loadMore()}>Load more</Btn> : null}
      </div>

      {/* floating new-post button (Fitts: low and big) */}
      <button type="button" onClick={() => setCompose(true)} className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-acc text-acc-ink shadow-lg active:scale-95 md:bottom-8 md:right-8" aria-label="New post">
        <Plus size={26} aria-hidden />
      </button>
      <Composer open={compose} onClose={() => setCompose(false)} onPosted={() => { setCompose(false); void refresh(); }} />
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy aria-label="Loading feed" className="space-y-6 px-4">
      {[0, 1].map((k) => (
        <div key={k}>
          <div className="flex items-center gap-3"><span className="h-9 w-9 animate-pulse rounded-full bg-card2" /><span className="h-4 w-32 animate-pulse rounded bg-card2" /></div>
          <div className="mt-3 aspect-[4/5] w-full animate-pulse rounded-2xl bg-card" />
          <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-card2" />
        </div>
      ))}
    </div>
  );
}
