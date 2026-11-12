import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Flag, Heart, Loader2, MessageCircle, PartyPopper, Trophy, UserCheck, UserPlus, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Notif, Post } from "../../shared/social";
import { Empty, PageHead, Sheet } from "../components/ui";
import { UserAvatar } from "../components/social/UserAvatar";
import { FriendButton } from "../components/social/FriendButton";
import { PostCard } from "../components/social/PostCard";
import { refreshUnread } from "../components/social/Badges";
import { ago, fullTime, sx, useFocusRefresh } from "../components/social/lib";
import { cx } from "../lib/util";

const KIND: Record<string, { icon: LucideIcon; tone: string; text: (n: Notif) => string }> = {
  friend_request: { icon: UserPlus, tone: "text-info", text: () => "sent you a friend request" },
  friend_accept: { icon: UserCheck, tone: "text-acc", text: () => "accepted your friend request" },
  like: { icon: Heart, tone: "text-bad", text: (n) => `liked your post${n.snippet ? `: “${n.snippet}”` : ""}` },
  comment: { icon: MessageCircle, tone: "text-info", text: (n) => `commented on your post${n.snippet ? `: “${n.snippet}”` : ""}` },
  cheer: { icon: Zap, tone: "text-warn", text: () => "cheered you on 💪 Keep going!" },
  challenge_invite: { icon: Flag, tone: "text-warn", text: (n) => `invited you to a challenge${n.snippet ? `: ${n.snippet}` : ""}` },
  challenge_join: { icon: Flag, tone: "text-acc", text: (n) => `joined your challenge${n.snippet ? ` ${n.snippet}` : ""}` },
  challenge_won: { icon: Trophy, tone: "text-warn", text: (n) => `You won${n.snippet ? ` “${n.snippet}”` : " a challenge"}! 🏆` },
  challenge_done: { icon: PartyPopper, tone: "text-info", text: (n) => `${n.snippet ? `“${n.snippet}”` : "A challenge"} has finished. See how everyone did.` },
};

/** Activity: friend requests, likes, comments, cheers, challenges. Marked read when you open the page. */
export default function Notifications() {
  const [items, setItems] = useState<Notif[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const seen = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const r = await sx<{ items: Notif[]; next: number | null }>("GET", "/notifications");
      const fresh = r.items.some((x) => !x.read);
      // items that were new when you opened the page stay in "New" while you're here (they're marked read on the server)
      r.items.forEach((x) => !x.read && seen.current.add(x.id));
      setItems(r.items.map((x) => (seen.current.has(x.id) ? { ...x, read: false } : x))); setNext(r.next); setErr(null);
      if (fresh) setTimeout(() => { void sx("POST", "/notifications/read", {}).then(refreshUnread).catch(() => {}); }, 1200);
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useFocusRefresh(load);

  async function more() {
    if (!next) return;
    setBusy(true);
    try { const r = await sx<{ items: Notif[]; next: number | null }>("GET", `/notifications?before=${next}`); setItems((l) => [...(l ?? []), ...r.items]); setNext(r.next); }
    finally { setBusy(false); }
  }
  async function open(n: Notif) {
    if ((n.kind === "like" || n.kind === "comment") && n.refId) {
      try { setPost(await sx<Post>("GET", `/posts/${n.refId}`)); } catch (e) { setErr((e as Error).message); }
    } else if (n.kind.startsWith("challenge_") || n.kind === "cheer") location.hash = "#/compete";
    else if (n.actor) location.hash = `#/u/${encodeURIComponent(n.actor.username)}`;
  }

  const day = 864e5;
  const groups = items ? [
    { label: "New", list: items.filter((x) => !x.read) },
    { label: "This week", list: items.filter((x) => x.read && Date.now() - x.createdAt < 7 * day) },
    { label: "Earlier", list: items.filter((x) => x.read && Date.now() - x.createdAt >= 7 * day) },
  ].filter((g) => g.list.length) : [];

  return (
    <div className="md:mx-auto md:max-w-xl">
      <PageHead icon={Bell} title="Activity" sub="Requests, likes, comments, cheers and challenges" />
      {err && <p role="alert" className="mb-2 text-sm text-bad">{err}</p>}
      {items == null ? <ul aria-busy className="space-y-2">{[0, 1, 2, 3].map((k) => <li key={k} className="h-16 animate-pulse rounded-2xl bg-card" />)}</ul>
        : items.length === 0 ? <Empty icon={Bell}>Nothing yet. When friends like, comment or cheer, it shows up here.</Empty>
          : groups.map((g) => (
            <section key={g.label} aria-label={g.label} className="mb-4">
              <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-mute">{g.label}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
                {g.list.map((n) => {
                  const k = KIND[n.kind] ?? { icon: Bell, tone: "text-mute", text: () => n.kind };
                  const self = n.kind === "challenge_won" || n.kind === "challenge_done";
                  return (
                    <li key={n.id} className={cx("flex items-center gap-3 px-3 py-2.5", !n.read && "bg-info/5")}>
                      <span className="relative shrink-0">
                        {n.actor && !self ? <UserAvatar id={n.actor.avatarId} name={n.actor.name ?? n.actor.username} size={44} /> : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card2"><k.icon size={20} className={k.tone} aria-hidden /></span>}
                        {n.actor && !self && <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-card2" aria-hidden><k.icon size={11} className={k.tone} /></span>}
                      </span>
                      <button type="button" onClick={() => open(n)} className="min-h-11 min-w-0 flex-1 text-left text-sm leading-snug">
                        {n.actor && !self && <span className="font-semibold">{n.actor.username} </span>}
                        <span dir="auto">{k.text(n)}</span>{" "}
                        <time className="text-xs text-faint" title={fullTime(n.createdAt)}>{ago(n.createdAt)}</time>
                        {!n.read && <span className="sr-only"> (new)</span>}
                      </button>
                      {n.kind === "friend_request" && !n.read && n.actor && <FriendButton userId={n.actor.id} relation="incoming" name={n.actor.username} onChange={() => void load()} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
      {next && <div className="flex justify-center"><button type="button" onClick={more} disabled={busy} className="min-h-11 rounded-xl px-4 text-sm text-info">{busy ? <Loader2 size={16} className="animate-spin" aria-label="Loading" /> : "Show older"}</button></div>}
      {post && <Sheet open onClose={() => setPost(null)} title="Post"><div className="-mx-4 md:-mx-6"><PostCard post={post} onDelete={() => setPost(null)} /></div></Sheet>}
    </div>
  );
}
