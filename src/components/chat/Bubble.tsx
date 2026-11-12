import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Ban, Check, CheckCheck, Clock, Link2, MoreHorizontal, Plus, Reply, RotateCw, SmilePlus } from "lucide-react";
import { cx, time12 } from "../../lib/util";
import { displayName, mediaUrl, useUploadProgress, type ChatUser, type Msg } from "../../lib/chat";
import { UserAvatar as Avatar } from "../social/UserAvatar";
import { bigEmoji, emojiName, QUICK } from "./emoji";
import { Sticker, stickerById } from "./stickers";
import { fmt, VoicePlayer } from "./Voice";
import { MentionText } from "../mentions/MentionText";

/** @mentions in a bubble: same colour as the text (works on every theme / bubble colour), bold + underlined. */
const MENTION_CLS = "text-inherit underline decoration-1 underline-offset-2";

export type Tick = "pending" | "failed" | "sent" | "delivered" | "read";

// ---------------------------------------------------------------- text with links (bidi-safe)

const LINK = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[^\s<>"']+)/gi;
const cleanUrl = (u: string) => {
  const trail = /[.,!?;:)\]}'"»]+$/.exec(u)?.[0] ?? "";
  return trail && !(trail.startsWith(")") && u.includes("(")) ? u.slice(0, u.length - trail.length) : u;
};
export function Linkified({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const url = cleanUrl(m[0]);
    const i = m.index ?? 0;
    if (i > last) out.push(<MentionText key={`t${last}`} text={text.slice(last, i)} className={MENTION_CLS} />);
    out.push(
      <a key={i} href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noopener noreferrer nofollow ugc"
        className="break-all underline decoration-1 underline-offset-2" onClick={(e) => e.stopPropagation()} dir="ltr">
        {url}
      </a>,
    );
    last = i + url.length;
  }
  if (last < text.length) out.push(<MentionText key={`t${last}`} text={text.slice(last)} className={MENTION_CLS} />);
  return <>{out}</>;
}
/** First link in a text → { href, host } (domain-only preview, nothing is fetched). */
export function firstLink(text: string | null | undefined) {
  const m = text ? /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[^\s<>"']+)/i.exec(text) : null;
  if (!m) return null;
  const href = cleanUrl(m[0]).replace(/^www\./i, "https://www.");
  try { const u = new URL(href.startsWith("http") ? href : `https://${href}`); return { href: u.href, host: u.hostname.replace(/^www\./, "") }; } catch { return null; }
}
const SITE: Record<string, string> = { "youtube.com": "YouTube", "youtu.be": "YouTube", "m.youtube.com": "YouTube", "instagram.com": "Instagram", "tiktok.com": "TikTok", "x.com": "X", "twitter.com": "X", "facebook.com": "Facebook", "reddit.com": "Reddit", "maps.google.com": "Google Maps", "goo.gl": "Google Maps", "wa.me": "WhatsApp" };

export function snippet(m: { kind: string; text: string | null; deleted: number; sticker?: string | null }) {
  if (m.deleted) return "Message deleted";
  if (m.kind === "image") return m.text ? `📷 ${m.text}` : "📷 Photo";
  if (m.kind === "voice") return "🎤 Voice message";
  if (m.kind === "sticker") return `Sticker${m.sticker ? `: ${stickerById(m.sticker)?.label ?? ""}` : ""}`;
  return m.text ?? "";
}

const TICK_TEXT: Record<Tick, string> = { pending: "Sending", failed: "Not sent", sent: "Sent", delivered: "Delivered", read: "Read" };
function TickIcon({ tick, onRetry, onDark }: { tick: Tick; onRetry?: () => void; onDark?: boolean }) {
  if (tick === "pending") return <Clock size={13} aria-label="Sending" className="shrink-0" />;
  if (tick === "failed")
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); onRetry?.(); }} className="-m-3 inline-flex min-h-11 min-w-11 items-center justify-center gap-0.5 p-2 font-semibold text-bad" aria-label="Not sent. Retry">
        <AlertCircle size={14} aria-hidden /> <RotateCw size={12} aria-hidden />
      </button>
    );
  if (tick === "sent") return <Check size={14} aria-label="Sent" className="shrink-0" />;
  if (tick === "delivered") return <CheckCheck size={14} aria-label="Delivered" className="shrink-0" />;
  // read: blue that keeps ≥ 3.8:1 on every accent bubble (WCAG 1.4.11), light blue on the dark pill of stickers / big emoji
  return <CheckCheck size={14} aria-label="Read" className={cx("shrink-0", onDark ? "text-info" : "text-[#0b4fa8]")} strokeWidth={2.6} />;
}

// ---------------------------------------------------------------- photos (single / album tile with upload progress + retry)

function Tile({ m, onOpen, onRetry, className, style, more, children }: { m: Msg; onOpen: () => void; onRetry: () => void; className?: string; style?: React.CSSProperties; more?: number; children?: ReactNode }) {
  const p = useUploadProgress(m.id);
  const [ok, setOk] = useState(false);
  const src = m.local?.previewUrl ?? (m.mediaId ? mediaUrl(m.mediaId, true) : "");
  const pct = p === null ? null : Math.round(p * 100);
  return (
    <div className={cx("relative overflow-hidden bg-black/30", className)} style={style}>
      <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} aria-label={more ? `Open photo, ${more} more` : m.text ? `Open photo: ${m.text}` : "Open photo"}
        className="absolute inset-0 block h-full w-full">
        {src && <img src={src} alt="" className={cx("h-full w-full object-cover transition-opacity duration-200", ok || m.local?.previewUrl ? "opacity-100" : "opacity-0")} loading="lazy" decoding="async" draggable={false} onLoad={() => setOk(true)} />}
        {!!more && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-bold text-white">+{more}</span>}
      </button>
      {m.status === "pending" && (
        // WhatsApp-style ring in the middle of the photo (the time sits bottom-right)
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-[11px] font-bold tabular-nums text-white"
            role="progressbar" aria-label="Uploading photo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0} aria-valuetext={pct === null ? "Waiting to upload" : `${pct}%`}>
            <svg viewBox="0 0 36 36" className={cx("absolute inset-1", pct === null && "animate-spin motion-reduce:animate-none")} aria-hidden>
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" pathLength={100}
                strokeDasharray={`${pct === null ? 25 : Math.max(3, pct)} 100`} transform="rotate(-90 18 18)" className="transition-[stroke-dasharray] duration-200" />
            </svg>
            {pct !== null && pct < 95 ? `${pct}%` : ""}
          </span>
        </span>
      )}
      {m.status === "failed" && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onRetry(); }} className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 text-sm font-semibold text-white" aria-label="Photo not sent. Retry">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bad text-black"><RotateCw size={20} aria-hidden /></span> Retry
        </button>
      )}
      {children}
    </div>
  );
}

/** WhatsApp-style album: 2 side by side, 3 = one wide + two, 4+ = 2×2 with "+N" on the last tile. */
function Album({ items, onImage, onRetry }: { items: Msg[]; onImage: (m: Msg) => void; onRetry: (m: Msg) => void }) {
  const shown = items.slice(0, 4);
  const extra = items.length - 4;
  return (
    <div className="grid w-[min(16rem,66vw)] grid-cols-2 gap-[3px] overflow-hidden rounded-[calc(var(--ch-r)-6px)]">
      {shown.map((x, i) => (
        <Tile key={x.id} m={x} onOpen={() => onImage(x)} onRetry={() => onRetry(x)} more={i === 3 && extra > 0 ? extra : undefined}
          className={cx(items.length === 3 && i === 0 && "col-span-2")} style={{ aspectRatio: items.length === 2 ? "3 / 4" : items.length === 3 && i === 0 ? "2 / 1" : "1 / 1" }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- one message row

export interface BubbleProps {
  m: Msg;
  /** 2+ photos sent together, rendered as one album (m = the first one) */
  album?: Msg[];
  mine: boolean;
  group: boolean;
  sender?: ChatUser;
  members: ChatUser[];
  meId: string;
  /** first / last of a run of messages from the same person (grouping + tails) */
  first: boolean;
  last: boolean;
  tick?: Tick;
  highlight?: boolean;
  /** the one message in the list that is in the tab order (roving tabindex) */
  active?: boolean;
  /** quick-reaction bar open on this message */
  bar?: boolean;
  dayText?: string;
  onReply: (m: Msg) => void;
  onMenu: (m: Msg) => void;
  onJump: (id: string) => void;
  onImage: (m: Msg) => void;
  onReact: (m: Msg, emoji: string) => void;
  onRetry: (m: Msg) => void;
  onBar: (m: Msg | null) => void;
  /** open the actions sheet (picker = straight to the full emoji picker) */
  onMore: (m: Msg, picker?: boolean) => void;
  onWho: (m: Msg, emoji?: string) => void;
  onFocusMsg: (id: string) => void;
}

/** Spoken summary of a message for the log (sender, time, reply, content, status, reactions). */
function describe(p: BubbleProps, nameOf: (id: string) => string) {
  const { m, album } = p;
  const who = p.mine ? "You" : displayName(p.sender);
  let body: string;
  if (m.deleted) body = p.mine ? "You deleted this message" : "This message was deleted";
  else if (album) body = `Album, ${album.length} photos${album.some((x) => x.text) ? `: ${album.map((x) => x.text).filter(Boolean).join(". ")}` : ""}`;
  else if (m.kind === "image") body = m.text ? `Photo: ${m.text}` : "Photo";
  else if (m.kind === "voice") body = `Voice message, ${fmt(m.media?.durationMs ?? 0)}`;
  else if (m.kind === "sticker") body = `Sticker: ${stickerById(m.sticker ?? "")?.label ?? "sticker"}`;
  else body = m.text ?? "";
  const reply = m.reply && !m.deleted ? ` Replying to ${nameOf(m.reply.senderId)}: ${snippet(m.reply)}.` : "";
  const rx = Object.entries(m.reactions ?? {});
  const reactions = rx.length ? ` Reactions: ${rx.map(([e, u]) => `${emojiName(e)} ${u.length}${u.includes(p.meId) ? " including you" : ""}`).join(", ")}.` : "";
  const status = p.mine && p.tick ? ` ${TICK_TEXT[p.tick]}.` : "";
  return `${who}, ${p.dayText ? `${p.dayText} ` : ""}${time12(m.createdAt)}.${reply} ${body}${m.editedAt && !m.deleted ? " (edited)" : ""}.${status}${reactions}`;
}

export const Bubble = memo(function Bubble(p: BubbleProps) {
  const { m, mine, group, sender, first, last, album } = p;
  const [dx, setDx] = useState(0);
  const [sel, setSel] = useState(false);
  const [heart, setHeart] = useState(0);
  const g = useRef<{ x: number; y: number; id: number; horiz: boolean | null; timer: number; moved: boolean; type: string } | null>(null);
  const fired = useRef(false);
  const lastTap = useRef(0);
  const tapTimer = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);

  // a tap elsewhere hides the action buttons shown by a tap on this message
  useEffect(() => {
    if (!sel) return;
    const f = (e: PointerEvent) => { if (!rowRef.current?.contains(e.target as Node)) setSel(false); };
    document.addEventListener("pointerdown", f);
    return () => document.removeEventListener("pointerdown", f);
  }, [sel]);
  useEffect(() => () => clearTimeout(tapTimer.current), []);

  if (m.kind === "system")
    return (
      <div className="my-2 flex justify-center px-6" role="article" aria-label={`${mine ? "You" : displayName(sender)} ${m.text ?? ""}`}>
        <p className="rounded-full bg-card2/90 px-3 py-1 text-center text-xs text-mute" dir="auto">
          <b className="font-semibold text-ink">{mine ? "You" : displayName(sender)}</b> {m.text}
        </p>
      </div>
    );

  const interactive = !m.deleted && !m.status;
  const anyPending = album ? album.some((x) => x.status) : !!m.status;
  const heartIt = () => {
    if (!interactive || anyPending) return;
    navigator.vibrate?.(8);
    setHeart((h) => h + 1);
    if (!m.reactions["❤️"]?.includes(p.meId)) p.onReact(m, "❤️");
  };
  const inControl = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("button, a, [role=slider], input, textarea");

  // ---- gestures: swipe right → reply, long-press → menu, tap → show actions, double-tap → ❤️ (touch); right-click → menu (mouse)
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    fired.current = false;
    const timer = window.setTimeout(() => { if (g.current && !g.current.moved) { fired.current = true; navigator.vibrate?.(12); p.onMenu(m); } }, 450);
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horiz: null, timer, moved: false, type: e.pointerType };
  };
  const move = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const ddx = e.clientX - s.x, ddy = e.clientY - s.y;
    if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) { s.moved = true; clearTimeout(s.timer); }
    if (e.pointerType === "mouse" || m.deleted || anyPending) return;
    if (s.horiz === null && (Math.abs(ddx) > 10 || Math.abs(ddy) > 10)) s.horiz = Math.abs(ddx) > Math.abs(ddy) * 1.3 && ddx > 0;
    if (s.horiz) setDx(Math.max(0, Math.min(84, ddx * 0.75)));
  };
  const up = (e: React.PointerEvent) => {
    const s = g.current;
    if (s) clearTimeout(s.timer);
    if (dx > 56) { navigator.vibrate?.(10); p.onReply(m); }
    const tap = s && !s.moved && !fired.current && dx === 0 && e.type === "pointerup" && s.type !== "mouse" && !inControl(e.target);
    setDx(0);
    g.current = null;
    if (!tap) return;
    const now = Date.now();
    if (now - lastTap.current < 320) { clearTimeout(tapTimer.current); lastTap.current = 0; heartIt(); return; }
    lastTap.current = now;
    tapTimer.current = window.setTimeout(() => setSel((v) => !v), 320);
  };

  const big = m.kind === "text" && !m.deleted ? bigEmoji(m.text) : 0;
  const bare = (m.kind === "sticker" || big) && !m.deleted;
  const reactions = Object.entries(m.reactions ?? {});
  const name = (id: string) => (id === p.meId ? "You" : displayName(p.members.find((u) => u.id === id)));

  const lastOf = album ? album[album.length - 1] : m;
  const caption = album ? null : m.text;
  const onPhoto = m.kind === "image" && !m.deleted && !caption;
  const meta = (
    <span dir="ltr" className={cx("ml-2 inline-flex translate-y-[3px] items-center gap-1 whitespace-nowrap align-bottom text-[11px] tabular-nums",
      bare || onPhoto ? "rounded-full bg-black/55 px-1.5 py-0.5 text-white" : "opacity-75")} style={{ float: "right" }}>
      {m.editedAt && !m.deleted && <span>edited</span>}
      <time dateTime={new Date(lastOf.createdAt).toISOString()} title={new Date(lastOf.createdAt).toLocaleString()}>{time12(lastOf.createdAt)}</time>
      {mine && p.tick && <TickIcon tick={p.tick} onRetry={() => p.onRetry(lastOf)} onDark={bare || onPhoto} />}
    </span>
  );

  const quote = m.reply && !m.deleted && (
    <button type="button" onClick={(e) => { e.stopPropagation(); p.onJump(m.reply!.id); }} aria-label={`Replying to ${name(m.reply.senderId)}: ${snippet(m.reply)}. Show that message`}
      className={cx("mb-1 block w-full min-w-0 rounded-lg border-l-[3px] px-2 py-1 text-left", mine ? "border-black/40 bg-black/10" : "border-[var(--ch-acc)] bg-white/[.06]", !!bare && "bg-card2 text-ink")}>
      <span className={cx("block truncate text-xs font-semibold", mine && !bare ? "" : "text-[var(--ch-acc)]")}>{name(m.reply.senderId)}</span>
      <span className="line-clamp-2 block text-[13px] opacity-80" dir="auto">{snippet(m.reply)}</span>
    </button>
  );

  let content: ReactNode;
  if (m.deleted) {
    content = <p className="flow-root italic opacity-75"><Ban size={14} aria-hidden className="mr-1.5 inline align-[-2px]" />{mine ? "You deleted this message" : "This message was deleted"}{meta}</p>;
  } else if (album) {
    content = (
      <>
        {quote}
        <div className="relative"><Album items={album} onImage={p.onImage} onRetry={p.onRetry} /><span className="absolute bottom-1.5 right-1.5">{meta}</span></div>
      </>
    );
  } else if (m.kind === "sticker") {
    content = <div className="relative">{quote}<Sticker id={m.sticker ?? ""} size={132} /><div className="mt-0.5 flex justify-end">{meta}</div></div>;
  } else if (m.kind === "image") {
    const w = m.media?.w ?? 3, h = m.media?.h ?? 4;
    const ratio = Math.max(0.56, Math.min(1.9, w / h));
    content = (
      <>
        {quote}
        <Tile m={m} onOpen={() => { if (!fired.current) p.onImage(m); }} onRetry={() => p.onRetry(m)} className="w-[min(15rem,64vw)] rounded-[calc(var(--ch-r)-6px)]" style={{ aspectRatio: String(ratio) }}>
          {!m.text && <span className="pointer-events-none absolute bottom-1.5 right-1.5">{meta}</span>}
        </Tile>
        {m.text && <p className="mt-1 flow-root whitespace-pre-wrap break-words px-1" dir="auto"><Linkified text={m.text} />{meta}</p>}
      </>
    );
  } else if (m.kind === "voice") {
    content = (
      <>
        {quote}
        <VoicePlayer src={m.local?.blobUrl ?? (m.mediaId ? mediaUrl(m.mediaId) : "")} durationMs={m.media?.durationMs ?? 0} peaks={m.local?.peaks} mine={mine} label={`voice message from ${mine ? "you" : displayName(sender)}`} />
        <div className="-mt-1 flex justify-end">{meta}</div>
      </>
    );
  } else {
    const link = big ? null : firstLink(m.text);
    content = (
      <>
        {quote}
        {big ? (
          <>
            <p className={cx("leading-[1.15]", big === 1 ? "text-[52px]" : big === 2 ? "text-[44px]" : "text-[38px]")}>{m.text}</p>
            <div className="mt-0.5 flex justify-end">{meta}</div>
          </>
        ) : (
          <>
            <p className="flow-root whitespace-pre-wrap break-words text-[15.5px] leading-snug [overflow-wrap:anywhere]" dir="auto">
              <Linkified text={m.text ?? ""} />
              {meta}
            </p>
            {link && (
              <a href={link.href} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()} dir="ltr"
                className={cx("mb-0.5 mt-1.5 flex min-h-11 items-center gap-2 rounded-lg px-2.5 py-1.5", mine ? "bg-black/10" : "bg-white/[.06]")}
                aria-label={`Open link: ${link.host}`}>
                <Link2 size={16} className="shrink-0 opacity-75" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{SITE[link.host] ?? link.host}</span>
                  <span className="block truncate text-[11px] opacity-75">{link.host}</span>
                </span>
              </a>
            )}
          </>
        )}
      </>
    );
  }

  const R = "var(--ch-r)", T = "var(--ch-tail)";
  // the corner next to the sender's side is small inside a run of messages (and at the tail of the last one)
  const radius = { borderRadius: mine ? `${R} ${first ? R : T} ${T} ${R}` : `${first ? R : T} ${R} ${R} ${T}` };
  const tool = "flex h-11 w-11 items-center justify-center rounded-full text-mute hover:bg-card3 hover:text-ink";
  const showTools = sel && !p.bar;

  return (
    <div
      ref={rowRef}
      className={cx("group/row relative flex items-end gap-1.5 px-2.5", mine ? "justify-end" : "justify-start", reactions.length > 0 ? "mb-7" : last ? "mb-2" : "mb-[3px]")}
      style={{ touchAction: "pan-y" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onDoubleClick={(e) => { if (!inControl(e.target) && e.detail === 2) { window.getSelection?.()?.removeAllRanges(); heartIt(); } }}
      onContextMenu={(e) => { if ((e.target as HTMLElement).closest("a")) return; e.preventDefault(); if (!fired.current) p.onMenu(m); }}
    >
      {/* swipe-to-reply hint */}
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-card3 text-ink transition-opacity"
        style={{ opacity: dx > 12 ? Math.min(1, dx / 56) : 0, transform: `translateY(-50%) scale(${dx > 56 ? 1.1 : 0.8})` }}>
        <Reply size={16} />
      </span>
      {group && !mine && (
        <span className="w-8 shrink-0 self-end">{last && <Avatar id={sender?.avatarId} name={sender?.name ?? sender?.username} size={32} />}</span>
      )}
      <div
        className={cx("relative min-w-0 max-w-[min(80%,30rem)] transition-transform duration-150 ease-out motion-reduce:transition-none", dx > 0 && "!duration-0")}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      >
        <div
          tabIndex={p.active ? 0 : -1}
          role="article"
          data-msg-focus={m.id}
          aria-label={describe(p, name)}
          aria-describedby="chat-msg-help"
          onFocus={() => p.onFocusMsg(m.id)}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); p.onMenu(m); }
            else if (e.key === "r" || e.key === "R") { if (interactive) { e.preventDefault(); p.onReply(m); } }
            else if (e.key === "e" || e.key === "E") { if (interactive && !anyPending) { e.preventDefault(); p.onBar(m); } }
          }}
          className={cx(
            "relative select-none [-webkit-touch-callout:none] md:select-text",
            !bare && "px-3 py-1.5 shadow-sm",
            !bare && (mine ? "bg-[var(--ch-acc)] text-[var(--ch-ink)]" : "bg-card2 text-ink"),
            m.status === "failed" && !album && "ring-2 ring-bad/70",
            p.highlight && "animate-[chat-flash_1.6s_ease-out] motion-reduce:animate-none",
            (m.kind === "image" || album) && !m.deleted && "!p-1",
          )}
          style={bare ? undefined : radius}
        >
          {group && !mine && first && !bare && <span className="mb-0.5 block truncate text-xs font-semibold" style={{ color: nameColor(m.senderId) }}>{displayName(sender)}</span>}
          {content}
          {heart > 0 && (
            <span key={heart} aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl [animation:chat-heart_.75s_ease-out_forwards] motion-reduce:hidden">❤️</span>
          )}
        </div>
        {/* actions: shown on hover (mouse), when the message has keyboard focus, or after a tap (touch) — never gesture-only */}
        {interactive && !anyPending && !p.bar && (
          <div role="toolbar" aria-label="Message actions"
            className={cx("absolute bottom-full z-[4] mb-1 flex items-center gap-0.5 rounded-full border border-line bg-card2 p-0.5 shadow-lg",
              mine ? "right-0" : "left-0",
              showTools ? "visible" : "invisible group-hover/row:visible group-focus-within/row:visible")}>
            <button type="button" className={tool} aria-label="React" aria-haspopup="true" onClick={(e) => { e.stopPropagation(); setSel(false); p.onBar(m); }}><SmilePlus size={19} aria-hidden /></button>
            <button type="button" className={tool} aria-label="Reply" onClick={(e) => { e.stopPropagation(); setSel(false); p.onReply(m); }}><Reply size={19} aria-hidden /></button>
            <button type="button" className={tool} aria-label="More actions" aria-haspopup="dialog" onClick={(e) => { e.stopPropagation(); setSel(false); p.onMore(m); }}><MoreHorizontal size={19} aria-hidden /></button>
          </div>
        )}
        {p.bar && <ReactionBar m={m} meId={p.meId} mine={mine} onPick={(e) => { p.onReact(m, e); p.onBar(null); }} onMore={() => { p.onBar(null); p.onMore(m, true); }} onClose={() => p.onBar(null)} />}
        {m.status === "failed" && !album && m.kind !== "image" && <p className="mt-1 text-right text-[11px] text-bad">{m.error ? `Not sent: ${m.error}` : "Not sent"}</p>}
        {reactions.length > 0 && (
          <div className={cx("absolute -bottom-5 z-[1] flex select-none flex-wrap gap-1", mine ? "right-2" : "left-2")}>
            {reactions.map(([e, users]) => <Pill key={`${e}-${users.length}`} e={e} users={users} meId={p.meId} name={name} onToggle={() => p.onReact(m, e)} onWho={() => p.onWho(m, e)} />)}
          </div>
        )}
      </div>
    </div>
  );
});

/** Reaction pill: tap toggles yours, long-press / right-click shows who reacted. Pops when its count changes. */
function Pill({ e, users, meId, name, onToggle, onWho }: { e: string; users: string[]; meId: string; name: (id: string) => string; onToggle: () => void; onWho: () => void }) {
  const on = users.includes(meId);
  const t = useRef(0);
  const long = useRef(false);
  return (
    <button type="button"
      onPointerDown={(ev) => { ev.stopPropagation(); long.current = false; t.current = window.setTimeout(() => { long.current = true; navigator.vibrate?.(10); onWho(); }, 450); }}
      onPointerUp={() => clearTimeout(t.current)} onPointerLeave={() => clearTimeout(t.current)} onPointerCancel={() => clearTimeout(t.current)}
      onClick={(ev) => { ev.stopPropagation(); if (long.current) return; onToggle(); }}
      onContextMenu={(ev) => { ev.preventDefault(); ev.stopPropagation(); onWho(); }}
      title={users.map(name).join(", ")}
      aria-label={`${emojiName(e)}, ${users.length}: ${users.map(name).join(", ")}. ${on ? "Remove your reaction" : "Add this reaction"}`} aria-pressed={on}
      className={cx("relative flex h-7 items-center gap-0.5 rounded-full border px-1.5 text-sm leading-none shadow [animation:chat-pop_.28s_ease-out] motion-reduce:animate-none",
        "before:absolute before:-inset-2 before:content-['']", // ≥ 44 px tall hit area without a bigger pill
        on ? "border-[var(--ch-acc)] bg-card3" : "border-line bg-card2")}>
      <span>{e}</span>{users.length > 1 && <span className="text-[11px] font-semibold tabular-nums text-mute">{users.length}</span>}
    </button>
  );
}

/** Quick-reaction bar above a message: 6 defaults + "+" for the full picker. Arrow keys move, Esc closes. */
export function ReactionBar({ m, meId, mine, onPick, onMore, onClose }: { m: Msg; meId: string; mine: boolean; onPick: (e: string) => void; onMore: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const f = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close.current(); };
    const t = setTimeout(() => document.addEventListener("pointerdown", f), 0);
    return () => { clearTimeout(t); document.removeEventListener("pointerdown", f); };
  }, []);
  return (
    <div ref={ref} role="toolbar" aria-label="Pick a reaction"
      className={cx("absolute bottom-full z-[5] mb-1 flex items-center gap-0.5 rounded-full border border-line bg-card2 p-1 shadow-xl [animation:chat-pop_.18s_ease-out] motion-reduce:animate-none", mine ? "right-0" : "left-0")}
      onKeyDown={(e) => {
        const bs = [...(ref.current?.querySelectorAll<HTMLElement>("button") ?? [])];
        const i = bs.indexOf(document.activeElement as HTMLElement);
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); (ref.current?.parentElement?.querySelector("[data-msg-focus]") as HTMLElement | null)?.focus(); }
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); bs[(i + (e.key === "ArrowRight" ? 1 : -1) + bs.length) % bs.length]?.focus(); }
      }}>
      {QUICK.map((e) => {
        const on = m.reactions[e]?.includes(meId);
        return (
          <button key={e} type="button" onClick={(ev) => { ev.stopPropagation(); onPick(e); }} aria-pressed={on} aria-label={`React ${emojiName(e)}`}
            className={cx("flex h-11 w-11 items-center justify-center rounded-full text-[25px] leading-none transition hover:scale-110 active:scale-90 motion-reduce:transform-none", on && "bg-card3 ring-2 ring-[var(--ch-acc)]/70")}>
            {e}
          </button>
        );
      })}
      <button type="button" onClick={(ev) => { ev.stopPropagation(); onMore(); }} aria-label="More reactions" className="flex h-11 w-11 items-center justify-center rounded-full bg-card3 text-mute hover:text-ink"><Plus size={20} aria-hidden /></button>
    </div>
  );
}

const NAME_COLORS = ["#8cc8ff", "#ffc56b", "#c7b3ff", "#7ae0cf", "#ffa8d4", "#ff9a8a", "#c8f560"];
export function nameColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}
