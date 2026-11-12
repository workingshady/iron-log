import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, Bell, ChevronLeft, CornerDownRight, Flag, Heart, Loader2, MessageCircle, PartyPopper, Trophy, UserCheck, UserPlus, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Notif, Post } from "../../shared/social";
import { Sheet } from "../components/ui";
import { UserAvatar } from "../components/social/UserAvatar";
import { FriendButton } from "../components/social/FriendButton";
import { PostCard } from "../components/social/PostCard";
import { refreshUnread } from "../components/social/Badges";
import { CheerButton } from "../components/social/compete-shared";
import { ago, fullTime, socialPhotoUrl, sx, useFocusRefresh } from "../components/social/lib";
import { cx } from "../lib/util";

/** Short post reference: nothing when a thumbnail already shows which post, else ≤ 28 chars. */
const snip = (n: Notif) => (n.thumb || !n.snippet ? "" : ` “${n.snippet.length > 28 ? `${n.snippet.slice(0, 27).trimEnd()}…` : n.snippet}”`);
/** The comment / message itself (always shown, a thumbnail only says which post). */
const quote = (n: Notif) => (!n.snippet ? "" : `: “${n.snippet.length > 60 ? `${n.snippet.slice(0, 59).trimEnd()}…` : n.snippet}”`);
/** Notifications that point at a comment you can answer inline. */
const replyable = (n: Notif) => !!n.commentId && !!n.postId && (n.kind === "comment" || n.kind === "reply" || (n.kind === "mention" && n.where === "comment"));
const KIND: Record<string, { icon: LucideIcon; bg: string; text: (n: Notif) => string }> = {
  friend_request: { icon: UserPlus, bg: "bg-info", text: () => "wants to be friends" },
  friend_accept: { icon: UserCheck, bg: "bg-acc", text: () => "accepted your request. Say hi 👋" },
  like: { icon: Heart, bg: "bg-bad", text: (n) => `liked your post${snip(n)}` },
  comment: { icon: MessageCircle, bg: "bg-info", text: (n) => (n.commentId ? `commented${quote(n)}` : `commented${snip(n) ? ` on${snip(n)}` : " on your post"}`) },
  reply: { icon: CornerDownRight, bg: "bg-info", text: (n) => `replied to your comment${quote(n)}` },
  comment_like: { icon: Heart, bg: "bg-bad", text: (n) => `liked your comment${quote(n)}` },
  mention: { icon: AtSign, bg: "bg-vio", text: (n) => (n.where === "chat" ? `mentioned you in a chat${quote(n)}` : n.where === "comment" ? `mentioned you in a comment${quote(n)}` : `mentioned you in a post${snip(n)}`) },
  cheer: { icon: Zap, bg: "bg-warn", text: () => "cheered you on 💪" },
  challenge_invite: { icon: Flag, bg: "bg-warn", text: (n) => `challenged you${n.snippet ? `: ${n.snippet}` : ""}` },
  challenge_join: { icon: Flag, bg: "bg-acc", text: (n) => `joined ${n.snippet ? `“${n.snippet}”` : "your challenge"}` },
  challenge_won: { icon: Trophy, bg: "bg-warn", text: (n) => `You won ${n.snippet ? `“${n.snippet}”` : "a challenge"}! 🏆` },
  challenge_done: { icon: PartyPopper, bg: "bg-vio", text: (n) => `${n.snippet ? `“${n.snippet}”` : "A challenge"} is over. See who won` },
};

/** One row = one notification, or several likes on the same post merged ("omar and sara liked your post"). */
interface Row { key: string; items: Notif[]; read: boolean; at: number }

function group(items: Notif[]): { label: string; rows: Row[] }[] {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const t0 = startOfDay.getTime(), wk = t0 - 6 * 864e5;
  const buckets = [{ label: "Today", f: (n: Notif) => n.createdAt >= t0 }, { label: "This week", f: (n: Notif) => n.createdAt < t0 && n.createdAt >= wk }, { label: "Earlier", f: (n: Notif) => n.createdAt < wk }];
  return buckets.map((b) => {
    const rows: Row[] = [];
    for (const n of items.filter(b.f)) {
      const merge = n.kind === "like" && n.refId ? rows.find((r) => r.items[0].kind === "like" && r.items[0].refId === n.refId) : null;
      if (merge) { merge.items.push(n); merge.read = merge.read && n.read; } else rows.push({ key: n.id, items: [n], read: n.read, at: n.createdAt });
    }
    return { label: b.label, rows };
  }).filter((g) => g.rows.length);
}

/** Activity: friend requests (accept inline), likes, comments, cheers (cheer back), challenges. Marked read on open. */
export default function Notifications() {
  const [items, setItems] = useState<Notif[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [post, setPost] = useState<{ p: Post; open?: { focus?: string | null; reply?: string | null } } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const seen = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const r = await sx<{ items: Notif[]; next: number | null }>("GET", "/notifications");
      const fresh = r.items.some((x) => !x.read);
      r.items.forEach((x) => !x.read && seen.current.add(x.id)); // stay "new" while you're on the page
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
  async function open(n: Notif, reply = false) {
    if (n.kind === "mention" && n.where === "chat") { if (n.convId) location.hash = `#/chat/${encodeURIComponent(n.convId)}`; else setErr("That message is gone."); return; }
    const postId = n.postId ?? ((n.kind === "like" || n.kind === "comment") ? n.refId : null);
    if (["like", "comment", "reply", "comment_like", "mention"].includes(n.kind)) {
      if (!postId) { setErr(n.snippet?.startsWith("(deleted") ? `That ${n.snippet.slice(9, -1)} is gone.` : "That post is gone."); return; }
      try {
        const p = await sx<Post>("GET", `/posts/${postId}`);
        setPost({ p, open: n.commentId ? (reply ? { reply: n.commentId } : { focus: n.commentId }) : undefined });
      } catch (e) { setErr((e as Error).message); }
    } else if (n.kind.startsWith("challenge_")) { try { sessionStorage.setItem("il:compete", "challenges"); } catch { /* ignore */ } location.hash = "#/compete"; }
    else if (n.actor) location.hash = `#/u/${encodeURIComponent(n.actor.username)}`;
  }
  const requests = items?.filter((n) => n.kind === "friend_request" && n.relation === "incoming") ?? [];

  return (
    <div className="md:mx-auto md:max-w-xl">
      <header className="-ml-2 mb-3 flex items-center gap-1">
        <button type="button" onClick={() => history.back()} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-card2" aria-label="Back"><ChevronLeft size={26} aria-hidden /></button>
        <h1 className="flex-1 text-[26px] font-extrabold tracking-tight">Activity</h1>
      </header>
      {requests.length > 1 && (
        <a href="#/friends" className="mb-3 flex min-h-14 items-center gap-3 rounded-2xl bg-card px-3">
          <span className="flex -space-x-3">{requests.slice(0, 3).map((n) => n.actor && <UserAvatar key={n.id} id={n.actor.avatarId} name={n.actor.name ?? n.actor.username} size={36} className="ring-2 ring-card" />)}</span>
          <span className="flex-1 text-sm"><b>Friend requests</b><span className="block text-xs text-mute">{requests.length} waiting</span></span>
          <span className="h-2.5 w-2.5 rounded-full bg-info" aria-hidden />
        </a>
      )}
      {err && <p role="alert" className="mb-2 text-sm text-bad">{err}</p>}
      {items == null ? (
        <ul aria-busy aria-label="Loading activity" className="space-y-3">{[0, 1, 2, 3, 4].map((k) => <li key={k} className="flex items-center gap-3"><span className="h-11 w-11 animate-pulse rounded-full bg-card2" /><span className="h-4 flex-1 animate-pulse rounded bg-card" /></li>)}</ul>
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-line text-mute" aria-hidden><Heart size={34} /></span>
          <p className="font-semibold">No activity yet</p>
          <p className="max-w-[16rem] text-sm text-mute">Likes, comments and cheers from friends land here.</p>
          <a href="#/friends" className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-acc px-4 text-sm font-semibold text-acc-ink">Find friends</a>
        </div>
      ) : group(items).map((g) => (
        <section key={g.label} aria-label={g.label} className="mb-5">
          <h2 className="mb-1 text-base font-bold">{g.label}</h2>
          <ul>
            {g.rows.map((r) => <RowView key={r.key} r={r} onOpen={(n) => void open(n)} onReply={(n) => void open(n, true)} onChanged={() => void load()} />)}
          </ul>
        </section>
      ))}
      {next && <div className="flex justify-center"><button type="button" onClick={more} disabled={busy} className="min-h-11 rounded-xl px-4 text-sm text-info">{busy ? <Loader2 size={16} className="animate-spin" aria-label="Loading" /> : "Show older"}</button></div>}
      {post && <Sheet open onClose={() => setPost(null)}><div className="-mx-4 md:-mx-6"><PostCard key={`${post.p.id}-${post.open?.focus ?? post.open?.reply ?? ""}`} post={post.p} open={post.open} onDelete={() => setPost(null)} /></div></Sheet>}
    </div>
  );
}

function RowView({ r, onOpen, onReply, onChanged }: { r: Row; onOpen: (n: Notif) => void; onReply: (n: Notif) => void; onChanged: () => void }) {
  const n = r.items[0];
  const k = KIND[n.kind] ?? { icon: Bell, bg: "bg-card3", text: () => n.kind };
  const self = n.kind === "challenge_won" || n.kind === "challenge_done";
  const actors = r.items.map((x) => x.actor).filter((a): a is NonNullable<Notif["actor"]> => !!a);
  const who = actors.length > 2 ? <><b>{actors[0].username}</b> and <b>{actors.length - 1} others</b></> : actors.length === 2 ? <><b>{actors[0].username}</b> and <b>{actors[1].username}</b></> : actors[0] ? <b>{actors[0].username}</b> : null;
  let right: React.ReactNode = null;
  if (n.kind === "friend_request" && n.actor) right = n.relation === "incoming" ? <FriendButton userId={n.actor.id} relation="incoming" name={n.actor.username} onChange={onChanged} /> : n.relation === "friends" ? <span className="text-xs text-mute">Friends ✓</span> : null;
  else if (n.kind === "friend_accept" && n.actor && n.relation === "friends") right = <a href={`#/chat/@${encodeURIComponent(n.actor.username)}`} className="inline-flex min-h-11 items-center rounded-xl bg-card2 px-3 text-sm font-semibold hover:bg-card3">Message</a>;
  else if (n.kind === "cheer" && n.actor && n.relation === "friends") right = <CheerButton user={n.actor} label="Cheer back" />;
  else if (n.kind === "challenge_invite") right = <button type="button" onClick={() => onOpen(n)} className="inline-flex min-h-11 items-center rounded-xl bg-acc px-3 text-sm font-semibold text-acc-ink">View</button>;
  else if (n.thumb) right = <button type="button" onClick={() => onOpen(n)} className="shrink-0" aria-label="Open post"><img src={socialPhotoUrl(n.thumb, true)} alt="" className="h-11 w-11 rounded-lg object-cover" /></button>;
  return (
    <li className="flex min-h-16 items-center gap-3 py-1.5">
      <span className={cx("h-2 w-2 shrink-0 rounded-full", r.read ? "bg-transparent" : "bg-info")} aria-hidden />
      <span className="relative shrink-0">
        {actors.length > 1 ? (
          <span className="relative block h-11 w-11" aria-hidden>
            <UserAvatar id={actors[1].avatarId} name={actors[1].name ?? actors[1].username} size={32} className="absolute right-0 top-0" />
            <UserAvatar id={actors[0].avatarId} name={actors[0].name ?? actors[0].username} size={32} className="absolute bottom-0 left-0 ring-2 ring-bg" />
          </span>
        ) : n.actor && !self ? <UserAvatar id={n.actor.avatarId} name={n.actor.name ?? n.actor.username} size={44} />
          : <span className={cx("flex h-11 w-11 items-center justify-center rounded-full text-black", k.bg)} aria-hidden><k.icon size={20} /></span>}
        {(n.actor && !self) && <span className={cx("absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-bg text-black", k.bg)} aria-hidden><k.icon size={10} strokeWidth={2.6} /></span>}
      </span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onOpen(n)} className="block min-h-11 w-full text-left text-sm leading-snug [overflow-wrap:anywhere]">
          {who && !self && <>{who} </>}<span dir="auto" className="bidi text-ink/90">{k.text(n)}</span>{" "}
          <time className="whitespace-nowrap text-xs text-faint" title={fullTime(n.createdAt)}>{ago(r.at)}</time>
          {!r.read && <span className="sr-only"> (new)</span>}
        </button>
        {replyable(n) && n.actor && (
          <button type="button" onClick={() => onReply(n)} className="-mt-1.5 flex min-h-11 items-center text-xs font-semibold text-mute hover:text-ink" aria-label={`Reply to ${n.actor.username}`}>Reply</button>
        )}
      </div>
      {right && <span className="shrink-0">{right}</span>}
    </li>
  );
}
