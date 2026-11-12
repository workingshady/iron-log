import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ChevronLeft, CloudOff, ImagePlus, Loader2, MoreVertical } from "lucide-react";
import { UserAvatar as Avatar } from "../components/social/UserAvatar";
import { Bubble, snippet, type Tick } from "../components/chat/Bubble";
import { Composer } from "../components/chat/Composer";
import { ImageViewer, MessageMenu, ReactorsSheet } from "../components/chat/Menus";
import { ConvSheet } from "../components/chat/Sheets";
import { themeVars } from "../components/chat/theme";
import { isDev } from "../lib/api";
import { useMe } from "../lib/me";
import { cx } from "../lib/util";
import {
  convTitle, deleteMessage, displayName, lastSeenText, loadAround, loadOlder, markRead, openDm, otherMember, retrySend, setChatMe, toggleReaction, useRoom, type Msg,
} from "../lib/chat";

/** #/chat/<id> — or #/chat/@<username> = open (or create) the DM with that friend. */
export default function ChatRoomScreen({ id }: { id: string }) {
  if (id.startsWith("@")) return <OpenDm username={id.slice(1)} />;
  return <Room id={id} />;
}

function OpenDm({ username }: { username: string }) {
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    openDm(username).then((cid) => { if (live) location.replace(`#/chat/${cid}`); }).catch((e) => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [username]);
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      {err ? (
        <>
          <p className="font-semibold">Can't open this chat</p>
          <p className="text-sm text-mute">{err}</p>
          <a href={`#/u/${encodeURIComponent(username)}`} className="min-h-11 rounded-xl border border-line px-4 py-2.5 font-semibold">View @{username}</a>
        </>
      ) : <Loader2 className="animate-spin text-mute" aria-label="Opening chat" />}
    </div>
  );
}

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(ms: number) {
  const d = new Date(ms), now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
const GROUP_GAP = 5 * 60e3;
const ALBUM_GAP = 2 * 60e3;

/** Keeps the room exactly the size of the visible viewport (the on-screen keyboard never covers the composer). */
function useViewport() {
  const [vp, setVp] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const f = () => setVp({ h: v.height, top: v.offsetTop });
    f();
    v.addEventListener("resize", f);
    v.addEventListener("scroll", f);
    return () => { v.removeEventListener("resize", f); v.removeEventListener("scroll", f); };
  }, []);
  return vp;
}

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const albumable = (m: Msg) => m.kind === "image" && !m.deleted && !m.text;

function Skeleton() {
  const rows = [[false, 46], [false, 62], [true, 54], [false, 38], [true, 70], [true, 44], [false, 58]] as const;
  return (
    <div className="flex flex-col gap-2 px-3 py-2" aria-hidden>
      {rows.map(([mine, w], i) => (
        <div key={i} className={cx("flex", mine ? "justify-end" : "justify-start")}>
          <span className={cx("h-9 animate-pulse rounded-2xl motion-reduce:animate-none", mine ? "bg-card3" : "bg-card2")} style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

type MenuState = { m: Msg; album?: Msg[]; picker?: boolean } | null;

function Room({ id }: { id: string }) {
  const me = useMe();
  setChatMe(me?.id);
  const meId = me?.id ?? "";
  const r = useRoom(id);
  const { conv, msgs } = r;
  const vp = useViewport();
  const dev = isDev();

  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [who, setWho] = useState<{ id: string; emoji?: string } | null>(null);
  const [bar, setBar] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [atBottomUi, setAtBottomUi] = useState(true);
  const [unreadAbove, setUnreadAbove] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [dropping, setDropping] = useState(false);
  const [, tick] = useState(0);
  const [topPad, setTopPad] = useState(dev ? 24 : 0);
  // DEV mode: the warning banner stays visible above the room
  useLayoutEffect(() => {
    if (!dev) return;
    const f = () => { const el = [...document.querySelectorAll<HTMLElement>("div.sticky")].find((e) => e.textContent?.startsWith("DEV MODE")); setTopPad(el?.offsetHeight ?? 24); };
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, [dev]);

  const sc = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prev = useRef<{ first?: string; last?: string; height: number; count: number }>({ height: 0, count: 0 });
  const initial = useRef(false);
  const pendingAnnounce = useRef<{ from: Set<string>; n: number; last: Msg | null; timer: number }>({ from: new Set(), n: 0, last: null, timer: 0 });

  // page behind the room must not scroll
  useEffect(() => {
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = o; };
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.error ? 5000 : 2200); return () => clearTimeout(t); }, [toast]);
  const err = useCallback((text: string) => setToast({ text, error: true }), []);
  // typing indicators expire
  useEffect(() => { if (!Object.keys(r.typing).length) return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [r.typing]);

  const members = useMemo(() => conv?.members ?? [], [conv]);
  const byId = useMemo(() => new Map(members.map((u) => [u.id, u])), [members]);
  const others = useMemo(() => members.filter((u) => u.id !== meId), [members, meId]);
  const group = conv?.kind === "group";
  const other = otherMember(conv, meId);
  const typing = Object.entries(r.typing).filter(([u, at]) => u !== meId && at > Date.now()).map(([u]) => u);
  const images = useMemo(() => msgs.filter((m) => m.kind === "image" && !m.deleted && (m.mediaId || m.local?.previewUrl)), [msgs]);
  const nameOf = useCallback((uid: string) => (uid === meId ? "You" : displayName(byId.get(uid))), [meId, byId]);

  // "Unread messages" divider: decided once, from what was unread when the room opened (not for messages arriving live)
  const firstUnreadRef = useRef<{ id: string | null; n: number } | undefined>(undefined);
  if (firstUnreadRef.current === undefined && conv && r.loaded && msgs.length) {
    const from = conv.myLastReadAt ?? 0;
    const unread = msgs.filter((m) => m.createdAt > from && m.senderId !== meId && m.kind !== "system" && !m.status);
    firstUnreadRef.current = { id: unread[0]?.id ?? null, n: unread.length };
  }
  const firstUnread = firstUnreadRef.current?.id ?? null;

  const read = useCallback(() => {
    if (document.visibilityState === "visible" && atBottom.current) markRead(id);
  }, [id]);
  useEffect(() => {
    document.addEventListener("visibilitychange", read);
    window.addEventListener("focus", read);
    return () => { document.removeEventListener("visibilitychange", read); window.removeEventListener("focus", read); };
  }, [read]);

  const toBottom = useCallback((smooth = false) => {
    const el = sc.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reducedMotion() ? "smooth" : "auto" });
    atBottom.current = true;
    setAtBottomUi(true);
    setNewCount(0);
  }, []);

  /** Screen readers: one polite announcement per burst of incoming messages, not one per message. */
  const queueAnnounce = useCallback((m: Msg) => {
    const q = pendingAnnounce.current;
    q.from.add(m.senderId); q.n++; q.last = m;
    clearTimeout(q.timer);
    q.timer = window.setTimeout(() => {
      if (document.visibilityState === "visible" && q.last) {
        const names = [...q.from].map((u) => displayName(byId.get(u)));
        setAnnounce(q.n === 1 ? `New message from ${names[0]}: ${snippet(q.last)}` : `${q.n} new messages from ${names.join(", ")}. Latest: ${snippet(q.last)}`);
      }
      pendingAnnounce.current = { from: new Set(), n: 0, last: null, timer: 0 };
    }, 1200);
  }, [byId]);
  useEffect(() => () => clearTimeout(pendingAnnounce.current.timer), []);

  // scroll bookkeeping after every change of the message list (runs before paint → no visible jump)
  useLayoutEffect(() => {
    const el = sc.current;
    if (!el) return;
    const first = msgs[0]?.id, last = msgs[msgs.length - 1]?.id;
    const p = prev.current;
    if (!initial.current) {
      if (msgs.length && r.loaded) {
        initial.current = true;
        const div = firstUnread ? el.querySelector<HTMLElement>("[data-unread-divider]") : null;
        if (div && div.offsetTop > el.clientHeight * 0.4) { el.scrollTop = div.offsetTop - 64; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setAtBottomUi(atBottom.current); }
        else el.scrollTop = el.scrollHeight;
      } else if (msgs.length) el.scrollTop = el.scrollHeight; // cached messages before the server answered
    } else if (first !== p.first && last === p.last && p.first) {
      el.scrollTop += el.scrollHeight - p.height; // older page prepended: keep what you were reading in place
    } else if (last !== p.last && last) {
      const lm = msgs[msgs.length - 1];
      if (lm.senderId === meId && lm.status) toBottom(true);
      else if (atBottom.current) el.scrollTop = el.scrollHeight;
      else if (lm.senderId !== meId) setNewCount((n) => n + Math.max(1, msgs.length - p.count));
      if (lm.senderId !== meId && lm.kind !== "system" && p.last) queueAnnounce(lm);
    }
    prev.current = { first, last, height: el.scrollHeight, count: msgs.length };
    read();
  }, [msgs, r.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // stay pinned to the bottom when things grow (photos decode, reactions, typing bubble, composer grows)
  useEffect(() => {
    const el = sc.current, inner = content.current;
    if (!el || !inner) return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
      prev.current.height = el.scrollHeight;
    });
    ro.observe(inner);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const checkUnreadAbove = () => {
    const el = sc.current;
    const div = el?.querySelector<HTMLElement>("[data-unread-divider]");
    setUnreadAbove(!!div && div.offsetTop + div.offsetHeight < el!.scrollTop);
  };
  const onScroll = () => {
    const el = sc.current!;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (bottom !== atBottom.current) { atBottom.current = bottom; setAtBottomUi(bottom); }
    if (bottom) { setNewCount(0); read(); }
    checkUnreadAbove();
    if (el.scrollTop < 600 && r.hasMore && r.loaded && !r.loadingOlder && initial.current) { prev.current.height = el.scrollHeight; void loadOlder(id); }
  };
  useEffect(() => { checkUnreadAbove(); }, [r.loaded, firstUnread]);

  const jump = useCallback(async (mid: string) => {
    const ok = await loadAround(id, mid);
    if (!ok) { setToast({ text: "That message isn't available any more.", error: true }); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = sc.current?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(mid)}"]`);
      el?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
      el?.querySelector<HTMLElement>("[data-msg-focus]")?.focus({ preventScroll: true });
      setHighlight(mid);
      setTimeout(() => setHighlight((h) => (h === mid ? null : h)), 1700);
    }));
  }, [id]);
  const jumpUnread = () => {
    const div = sc.current?.querySelector<HTMLElement>("[data-unread-divider]");
    div?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    (div?.nextElementSibling?.querySelector("[data-msg-focus]") as HTMLElement | null)?.focus({ preventScroll: true });
  };

  const tickFor = useCallback((m: Msg): Tick => {
    if (m.status) return m.status;
    if (!others.length) return "sent";
    if (others.every((u) => (u.lastReadAt ?? 0) >= m.createdAt)) return "read";
    if (others.every((u) => r.online.includes(u.id) || (u.lastSeenAt ?? 0) >= m.createdAt || (u.lastReadAt ?? 0) >= m.createdAt)) return "delivered";
    return "sent";
  }, [others, r.online]);

  // albums: runs of 2+ caption-less photos from one person within 2 minutes (each photo is its own message on the server)
  const albums = useMemo(() => {
    const map = new Map<string, Msg[]>(); // first id → items
    const inAlbum = new Set<string>();
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (!albumable(m) || inAlbum.has(m.id)) continue;
      const run = [m];
      for (let j = i + 1; j < msgs.length; j++) {
        const n = msgs[j], pm = run[run.length - 1];
        if (!albumable(n) || n.senderId !== m.senderId || n.createdAt - pm.createdAt > ALBUM_GAP || n.replyToId || n.id === firstUnread || dayKey(n.createdAt) !== dayKey(m.createdAt)) break;
        run.push(n);
      }
      if (run.length >= 2) { map.set(m.id, run); run.forEach((x) => inAlbum.add(x.id)); }
    }
    return { map, inAlbum };
  }, [msgs, firstUnread]);

  // sheets give focus back to the message they were opened from (keyboard + screen-reader users keep their place)
  const back = useRef<HTMLElement | null>(null);
  const remember = () => { const a = document.activeElement as HTMLElement | null; if (a && a !== document.body) back.current = a; };
  const restore = () => requestAnimationFrame(() => { const b = back.current; back.current = null; if (b?.isConnected && !b.closest("[role=dialog]")) b.focus({ preventScroll: true }); });
  const onReply = useCallback((m: Msg) => { setEditing(null); setReplyTo(m); }, []);
  const onMenu = useCallback((m: Msg) => { if (m.kind !== "system") { remember(); setBar(null); setMenu({ m, album: albums.map.get(m.id) }); } }, [albums]);
  const onMore = useCallback((m: Msg, picker?: boolean) => { remember(); setBar(null); setMenu({ m, album: albums.map.get(m.id), picker }); }, [albums]);
  const onImage = useCallback((m: Msg) => setViewer(Math.max(0, images.findIndex((x) => x.id === m.id))), [images]);
  const onReact = useCallback((m: Msg, e: string) => void toggleReaction(id, m.id, e), [id]);
  const onRetry = useCallback((m: Msg) => retrySend(m.id), []);
  const onJump = useCallback((mid: string) => void jump(mid), [jump]);
  const onBar = useCallback((m: Msg | null) => setBar(m?.id ?? null), []);
  const onWho = useCallback((m: Msg, emoji?: string) => { if (!back.current) remember(); setMenu(null); setWho({ id: m.id, emoji }); }, []);
  const onFocusMsg = useCallback((mid: string) => setActiveId(mid), []);

  // keyboard: ↑ ↓ move between messages (one tab stop for the whole list), Home / End = first / last loaded
  const onLogKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (!t.matches("[data-msg-focus]")) return;
    const all = [...(sc.current?.querySelectorAll<HTMLElement>("[data-msg-focus]") ?? [])];
    const i = all.indexOf(t);
    const n = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : e.key === "PageDown" ? i + 8 : e.key === "PageUp" ? i - 8 : null;
    if (n === null) { if (e.key === "Escape" && bar) setBar(null); return; }
    e.preventDefault();
    const to = all[Math.max(0, Math.min(all.length - 1, n))];
    to?.focus({ preventScroll: true });
    to?.scrollIntoView({ block: "nearest" });
    if (n < 0 && r.hasMore) void loadOlder(id);
  };

  // desktop: drop photos anywhere on the room
  const onDrop = (e: React.DragEvent) => {
    setDropping(false);
    const fs = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (!fs.length) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("il:chat-files", { detail: fs }));
  };

  // ---- header text
  const title = convTitle(conv, meId);
  const sub = typing.length
    ? group ? `${typing.map((u) => displayName(byId.get(u)).split(" ")[0]).join(", ")} ${typing.length > 1 ? "are" : "is"} typing…` : "typing…"
    : group ? members.map((u) => (u.id === meId ? "You" : displayName(u).split(" ")[0])).join(", ")
      : other ? (r.live === "live" && r.online.includes(other.id) ? "online" : lastSeenText(other.lastSeenAt)) : "";

  // ---- rows
  const lastFocusable = [...msgs].reverse().find((m) => m.kind !== "system" && !albums.inAlbum.has(m.id) || albums.map.has(m.id))?.id;
  const active = activeId && msgs.some((m) => m.id === activeId) ? activeId : lastFocusable;
  // one section per day, so each sticky day label lets go at the end of its day (no pile-up of labels)
  const days: { key: string; label: string; rows: React.ReactNode[] }[] = [];
  let rows: React.ReactNode[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const album = albums.map.get(m.id);
    if (albums.inAlbum.has(m.id) && !album) continue; // rendered inside its album
    const pm = msgs[i - 1];
    const endIdx = album ? i + album.length - 1 : i;
    const lm = msgs[endIdx], nm = msgs[endIdx + 1];
    const newDay = !pm || dayKey(pm.createdAt) !== dayKey(m.createdAt);
    if (newDay) {
      rows = [];
      days.push({ key: m.id, label: dayLabel(m.createdAt), rows });
      rows.push(
        <div key={`d-${m.id}`} className="sticky top-1 z-[2] my-2 flex justify-center" role="separator" aria-label={dayLabel(m.createdAt)}>
          <span className="rounded-full bg-card2 px-3 py-1 text-xs font-semibold text-mute shadow">{dayLabel(m.createdAt)}</span>
        </div>,
      );
    }
    if (m.id === firstUnread) rows.push(
      <div key="unread" data-unread-divider className="my-2 flex items-center gap-2 px-4 text-xs font-semibold text-[var(--ch-acc)]" role="separator" aria-label={`${firstUnreadRef.current?.n ?? ""} unread messages`}>
        <span className="h-px flex-1 bg-current opacity-40" /> {firstUnreadRef.current?.n === 1 ? "1 unread message" : `${firstUnreadRef.current?.n} unread messages`} <span className="h-px flex-1 bg-current opacity-40" />
      </div>,
    );
    const same = (a?: Msg, b?: Msg) => !!a && !!b && a.senderId === b.senderId && a.kind !== "system" && b.kind !== "system" && Math.abs(a.createdAt - b.createdAt) < GROUP_GAP && dayKey(a.createdAt) === dayKey(b.createdAt) && b.id !== firstUnread;
    const first = !same(pm, m);
    const last = !same(lm, nm) || nm?.id === firstUnread;
    const mine = m.senderId === meId;
    rows.push(
      <div key={m.id} data-mid={m.id} className={cx(first && i > 0 && !newDay && "mt-1.5")}>
        <Bubble m={m} album={album} mine={mine} group={!!group} sender={byId.get(m.senderId)} members={members} meId={meId} first={first} last={last}
          tick={mine ? tickFor(album ? album[album.length - 1] : m) : undefined} highlight={highlight === m.id}
          active={active === m.id} bar={bar === m.id} dayText={dayLabel(m.createdAt)}
          onReply={onReply} onMenu={onMenu} onJump={onJump} onImage={onImage} onReact={onReact} onRetry={onRetry}
          onBar={onBar} onMore={onMore} onWho={onWho} onFocusMsg={onFocusMsg} />
      </div>,
    );
  }
  const whoMsg = who ? msgs.find((m) => m.id === who.id) ?? null : null;

  return (
    <div
      className="fixed inset-x-0 z-[35] flex flex-col overflow-hidden bg-bg md:left-60"
      style={{ ...themeVars(conv?.theme), backgroundImage: undefined, top: (vp?.top ?? 0) + topPad, height: vp ? vp.h - topPad : `calc(100dvh - ${topPad}px)` }}
      onDragEnter={(e) => { if ([...e.dataTransfer.types].includes("Files")) setDropping(true); }}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false); }}
      onDrop={onDrop}
    >
      <style>{`
        @keyframes chat-flash { 0%,30% { box-shadow: 0 0 0 3px var(--ch-acc); } 100% { box-shadow: 0 0 0 0 transparent; } }
        @keyframes chat-dot { 0%,60%,100% { opacity:.3; transform: translateY(0) } 30% { opacity:1; transform: translateY(-3px) } }
        @keyframes chat-pop { 0% { transform: scale(.6); opacity: 0 } 70% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes chat-heart { 0% { transform: scale(.2); opacity: 0 } 35% { transform: scale(1.25); opacity: 1 } 70% { transform: scale(1); opacity: 1 } 100% { transform: scale(1.1); opacity: 0 } }
      `}</style>

      {/* header */}
      <header className="flex shrink-0 items-center gap-1 border-b border-line bg-bg/95 px-1 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] backdrop-blur">
        <a href="#/chats" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-card2" aria-label="Back to chats"><ChevronLeft size={26} aria-hidden /></a>
        <button type="button" onClick={() => conv && setDetails(true)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 text-left hover:bg-card" aria-label={`${title}, ${sub}. Chat details and theme`}>
          {group ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[var(--ch-ink)]" style={{ background: "var(--ch-acc)" }} aria-hidden>
              {(conv?.title ?? "G").trim().slice(0, 1).toUpperCase()}
            </span>
          ) : (
            <span className="relative shrink-0">
              <Avatar id={other?.avatarId} name={other?.name ?? other?.username} size={40} />
              {other && r.live === "live" && r.online.includes(other.id) && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-bg bg-acc" aria-hidden />}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-semibold leading-tight" dir="auto">{title}</span>
            <span className={cx("block truncate text-xs leading-tight", typing.length ? "text-[var(--ch-acc)]" : "text-mute")}>{sub}</span>
          </span>
        </button>
        <button type="button" onClick={() => conv && setDetails(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mute hover:bg-card2 hover:text-ink" aria-label="Chat details">
          <MoreVertical size={21} aria-hidden />
        </button>
      </header>

      {(r.live === "offline" || r.live === "polling") && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 bg-warn/15 py-1 text-xs font-semibold text-warn" role="status">
          <CloudOff size={13} aria-hidden /> {r.live === "offline" ? "Offline · messages send when you're back" : "Reconnecting…"}
        </div>
      )}

      {/* messages */}
      <div className="relative min-h-0 flex-1">
        <div ref={sc} onScroll={onScroll} onKeyDown={onLogKey} className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ overflowAnchor: "none", backgroundImage: themeVars(conv?.theme).backgroundImage }}
          role="log" aria-label={`Messages with ${title}`} aria-live="off" tabIndex={-1}>
          <div ref={content} className="mx-auto flex min-h-full max-w-3xl flex-col justify-end pb-1 pt-14">
            {r.error ? (
              <div className="m-auto max-w-xs p-6 text-center">
                <p className="font-semibold">Can't open this chat</p>
                <p className="mt-1 text-sm text-mute">{r.error}</p>
                <a href="#/chats" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-semibold">Back to chats</a>
              </div>
            ) : (
              <>
                {r.loadingOlder && <div className="flex justify-center py-2"><Loader2 size={20} className="animate-spin text-mute" aria-label="Loading older messages" /></div>}
                {r.loaded && !r.hasMore && msgs.length > 0 && (
                  <p className="mx-auto my-3 max-w-xs rounded-xl bg-card/90 px-3 py-2 text-center text-xs text-mute">Start of your chat{group ? ` in ${title}` : ` with ${title}`}</p>
                )}
                {!msgs.length && !r.loaded && <><span className="sr-only" role="status">Loading messages</span><Skeleton /></>}
                {!msgs.length && r.loaded && (
                  <div className="m-auto flex flex-col items-center gap-2 p-6 text-center">
                    {other ? <Avatar id={other.avatarId} name={other.name ?? other.username} size={72} /> : <span className="text-5xl" aria-hidden>👋</span>}
                    <p className="font-semibold">Say hi to {title} 👋</p>
                    <p className="max-w-xs text-sm text-mute">Text, photos, voice notes and stickers. Long-press or hover a message to react.</p>
                  </div>
                )}
                {days.map((d) => <div key={d.key} className="flex flex-col">{d.rows}</div>)}
                {typing.length > 0 && (
                  <div className="mb-2 flex items-end gap-1.5 px-2.5" aria-hidden>
                    {group && <span className="w-8 shrink-0"><Avatar id={byId.get(typing[0])?.avatarId} name={byId.get(typing[0])?.name} size={32} /></span>}
                    <span className="flex h-9 items-center gap-1 rounded-[var(--ch-r)] bg-card2 px-3.5">
                      {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 rounded-full bg-mute" style={{ animation: `chat-dot 1.2s ${i * 0.15}s infinite` }} />)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <p id="chat-msg-help" className="sr-only">Up and down arrows move between messages. Enter opens actions, R replies, E reacts. Tab reaches the message's buttons.</p>
        {unreadAbove && firstUnread && (
          <button type="button" onClick={jumpUnread}
            className="absolute left-1/2 top-2 z-[3] flex h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--ch-acc)] px-4 text-sm font-semibold text-[var(--ch-ink)] shadow-lg [animation:chat-pop_.2s_ease-out] motion-reduce:animate-none">
            <ArrowUp size={16} aria-hidden /> {firstUnreadRef.current?.n} unread
          </button>
        )}
        {(!atBottomUi || newCount > 0) && (
          <button type="button" onClick={() => toBottom(true)}
            className={cx("absolute bottom-3 right-3 z-[3] flex h-11 items-center gap-1.5 rounded-full shadow-lg", newCount ? "bg-[var(--ch-acc)] px-4 font-semibold text-[var(--ch-ink)]" : "w-11 justify-center bg-card3 text-ink")}
            aria-label={newCount ? `${newCount} new message${newCount > 1 ? "s" : ""}, jump to latest` : "Jump to latest"}>
            <ArrowDown size={18} aria-hidden /> {newCount > 0 && <span className="text-sm tabular-nums">{newCount} new</span>}
          </button>
        )}
        {toast && (
          <p role={toast.error ? "alert" : "status"} className={cx("absolute inset-x-4 top-2 z-[4] mx-auto max-w-sm rounded-xl px-3 py-2 text-center text-sm shadow-lg", toast.error ? "bg-card3 text-ink ring-1 ring-bad/50" : "bg-card3 text-ink")}>{toast.text}</p>
        )}
        {dropping && (
          <div className="pointer-events-none absolute inset-2 z-[6] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--ch-acc)] bg-bg/85 text-[var(--ch-acc)]">
            <ImagePlus size={36} aria-hidden /> <p className="font-semibold">Drop photos to send (up to 10)</p>
          </div>
        )}
      </div>

      <span className="sr-only" role="status" aria-live="polite">{announce}</span>

      {!r.error && conv && (
        <Composer convId={id} members={members} meId={meId}
          replyTo={replyTo} onCancelReply={() => setReplyTo(null)}
          editing={editing} onCancelEdit={() => setEditing(null)}
          onSent={() => requestAnimationFrame(() => toBottom(true))} onError={err} />
      )}

      <MessageMenu m={menu?.m ?? null} album={menu?.album} picker={menu?.picker} mine={!!menu && menu.m.senderId === meId} meId={meId} onClose={() => { setMenu(null); restore(); }}
        onReact={(e) => menu && void toggleReaction(id, menu.m.id, e)}
        onReply={() => menu && onReply(menu.m)}
        onEdit={() => { if (menu) { setReplyTo(null); setEditing(menu.m); } }}
        onCopied={() => setToast({ text: "Copied", error: false })}
        onWho={() => menu && onWho(menu.m)}
        onDelete={() => {
          if (!menu) return;
          for (const x of menu.album ?? [menu.m]) deleteMessage(id, x.id)?.catch?.((e: Error) => err(e.message));
        }} />
      <ReactorsSheet m={whoMsg} start={who?.emoji} members={members} meId={meId} onClose={() => { setWho(null); restore(); }} onToggle={(e) => whoMsg && void toggleReaction(id, whoMsg.id, e)} />
      {/* portal: above the room's stacking context (and the DEV banner) */}
      {viewer !== null && images.length > 0 && createPortal(<ImageViewer items={images} index={Math.min(viewer, images.length - 1)} onIndex={setViewer} onClose={() => setViewer(null)} sender={(m) => nameOf(m.senderId)} />, document.body)}
      {conv && <ConvSheet conv={conv} meId={meId} online={r.online} open={details} onClose={() => setDetails(false)} />}
    </div>
  );
}
