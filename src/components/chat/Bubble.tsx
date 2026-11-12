import { memo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Ban, Check, CheckCheck, Clock, Reply, RotateCw } from "lucide-react";
import { cx, time12 } from "../../lib/util";
import { displayName, mediaUrl, type ChatUser, type Msg } from "../../lib/chat";
import { UserAvatar as Avatar } from "../social/UserAvatar";
import { bigEmoji } from "./emoji";
import { Sticker, stickerById } from "./stickers";
import { VoicePlayer } from "./Voice";

export type Tick = "pending" | "failed" | "sent" | "delivered" | "read";

// ---------------------------------------------------------------- text with links (bidi-safe)

const LINK = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[^\s<>"']+)/gi;
export function Linkified({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    let url = m[0];
    const trail = /[.,!?;:)\]}'"»]+$/.exec(url)?.[0] ?? "";
    if (trail && !(trail.startsWith(")") && url.includes("("))) url = url.slice(0, url.length - trail.length);
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(
      <a key={i} href={url.startsWith("http") ? url : `https://${url}`} target="_blank" rel="noopener noreferrer nofollow ugc"
        className="break-all underline decoration-1 underline-offset-2" onClick={(e) => e.stopPropagation()} dir="ltr">
        {url}
      </a>,
    );
    last = i + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

export function snippet(m: { kind: string; text: string | null; deleted: number; sticker?: string | null }) {
  if (m.deleted) return "Message deleted";
  if (m.kind === "image") return m.text ? `📷 ${m.text}` : "📷 Photo";
  if (m.kind === "voice") return "🎤 Voice message";
  if (m.kind === "sticker") return `Sticker${m.sticker ? `: ${stickerById(m.sticker)?.label ?? ""}` : ""}`;
  return m.text ?? "";
}

function TickIcon({ tick, onRetry }: { tick: Tick; onRetry?: () => void }) {
  if (tick === "pending") return <Clock size={13} aria-label="Sending" className="shrink-0" />;
  if (tick === "failed")
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); onRetry?.(); }} className="-m-2 inline-flex items-center gap-0.5 p-2 font-semibold text-bad" aria-label="Not sent. Tap to retry">
        <AlertCircle size={14} aria-hidden /> <RotateCw size={12} aria-hidden />
      </button>
    );
  if (tick === "sent") return <Check size={14} aria-label="Sent" className="shrink-0" />;
  if (tick === "delivered") return <CheckCheck size={14} aria-label="Delivered" className="shrink-0" />;
  return <CheckCheck size={14} aria-label="Read" className="shrink-0 text-[#1d6fd6]" strokeWidth={2.6} />;
}

// ---------------------------------------------------------------- one message row

export interface BubbleProps {
  m: Msg;
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
  onReply: (m: Msg) => void;
  onMenu: (m: Msg) => void;
  onJump: (id: string) => void;
  onImage: (m: Msg) => void;
  onReact: (m: Msg, emoji: string) => void;
  onRetry: (m: Msg) => void;
}

export const Bubble = memo(function Bubble(p: BubbleProps) {
  const { m, mine, group, sender, first, last } = p;
  const [dx, setDx] = useState(0);
  const g = useRef<{ x: number; y: number; id: number; horiz: boolean | null; timer: number; moved: boolean } | null>(null);
  const fired = useRef(false);

  if (m.kind === "system")
    return (
      <div className="my-2 flex justify-center px-6">
        <p className="rounded-full bg-card2/90 px-3 py-1 text-center text-xs text-mute" dir="auto">
          <b className="font-semibold text-ink">{mine ? "You" : displayName(sender)}</b> {m.text}
        </p>
      </div>
    );

  // ---- gestures: swipe right → reply, long-press → menu (touch); right-click → menu (mouse)
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    fired.current = false;
    const timer = window.setTimeout(() => { if (g.current && !g.current.moved) { fired.current = true; navigator.vibrate?.(12); p.onMenu(m); } }, 450);
    g.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horiz: null, timer, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const ddx = e.clientX - s.x, ddy = e.clientY - s.y;
    if (Math.abs(ddx) > 8 || Math.abs(ddy) > 8) { s.moved = true; clearTimeout(s.timer); }
    if (e.pointerType === "mouse" || m.deleted || m.status) return;
    if (s.horiz === null && (Math.abs(ddx) > 10 || Math.abs(ddy) > 10)) s.horiz = Math.abs(ddx) > Math.abs(ddy) * 1.3 && ddx > 0;
    if (s.horiz) setDx(Math.max(0, Math.min(84, ddx * 0.75)));
  };
  const up = () => {
    const s = g.current;
    if (s) clearTimeout(s.timer);
    if (dx > 56) { navigator.vibrate?.(10); p.onReply(m); }
    setDx(0);
    g.current = null;
  };

  const big = m.kind === "text" && !m.deleted ? bigEmoji(m.text) : 0;
  const bare = (m.kind === "sticker" || big) && !m.deleted;
  const reactions = Object.entries(m.reactions ?? {});
  const name = (id: string) => (id === p.meId ? "You" : displayName(p.members.find((u) => u.id === id)));
  const time = time12(m.createdAt);
  const meta = (
    <span dir="ltr" className={cx("ml-2 inline-flex translate-y-[3px] items-center gap-1 whitespace-nowrap align-bottom text-[11px] tabular-nums", bare ? "rounded-full bg-black/45 px-1.5 py-0.5 text-white/85" : "opacity-70")} style={{ float: "inline-end" }}>
      {m.editedAt && !m.deleted && <span>edited</span>}
      <time dateTime={new Date(m.createdAt).toISOString()}>{time}</time>
      {mine && p.tick && <TickIcon tick={p.tick} onRetry={() => p.onRetry(m)} />}
    </span>
  );

  const quote = m.reply && !m.deleted && (
    <button type="button" onClick={(e) => { e.stopPropagation(); p.onJump(m.reply!.id); }}
      className={cx("mb-1 block w-full min-w-0 rounded-lg border-l-[3px] px-2 py-1 text-left", mine ? "border-black/40 bg-black/10" : "border-[var(--ch-acc)] bg-white/[.06]")}>
      <span className={cx("block truncate text-xs font-semibold", mine ? "" : "text-[var(--ch-acc)]")}>{name(m.reply.senderId)}</span>
      <span className="line-clamp-2 block text-[13px] opacity-80" dir="auto">{snippet(m.reply)}</span>
    </button>
  );

  let content: ReactNode;
  if (m.deleted) {
    content = <p className="flow-root italic opacity-70"><Ban size={14} aria-hidden className="mr-1.5 inline align-[-2px]" />{mine ? "You deleted this message" : "This message was deleted"}{meta}</p>;
  } else if (m.kind === "sticker") {
    content = <div className="relative">{quote}<Sticker id={m.sticker ?? ""} size={132} /><div className="mt-0.5 flex justify-end">{meta}</div></div>;
  } else if (m.kind === "image") {
    const w = m.media?.w ?? 3, h = m.media?.h ?? 4;
    const ratio = Math.max(0.56, Math.min(1.9, w / h));
    const src = m.local?.previewUrl ?? (m.mediaId ? mediaUrl(m.mediaId, true) : "");
    content = (
      <>
        {quote}
        <button type="button" onClick={(e) => { e.stopPropagation(); if (!fired.current) p.onImage(m); }} aria-label="Open photo"
          className="relative block w-[min(15rem,64vw)] overflow-hidden rounded-[calc(var(--ch-r)-6px)] bg-black/30" style={{ aspectRatio: String(ratio) }}>
          {src && <img src={src} alt={m.text ? `Photo: ${m.text}` : "Photo"} className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} />}
          {!m.text && <span className="absolute bottom-1.5 right-1.5">{meta}</span>}
        </button>
        {m.text && <p className="mt-1 flow-root whitespace-pre-wrap break-words px-1" dir="auto"><Linkified text={m.text} />{meta}</p>}
      </>
    );
  } else if (m.kind === "voice") {
    content = (
      <>
        {quote}
        <VoicePlayer src={m.local?.blobUrl ?? (m.mediaId ? mediaUrl(m.mediaId) : "")} durationMs={m.media?.durationMs ?? 0} peaks={m.local?.peaks} mine={mine} />
        <div className="-mt-1 flex justify-end">{meta}</div>
      </>
    );
  } else {
    content = (
      <>
        {quote}
        {big ? (
          <>
            <p className={cx("leading-[1.15]", big === 1 ? "text-[52px]" : "text-[40px]")}>{m.text}</p>
            <div className="mt-0.5 flex justify-end">{meta}</div>
          </>
        ) : (
          <p className="flow-root whitespace-pre-wrap break-words text-[15.5px] leading-snug" dir="auto">
            <Linkified text={m.text ?? ""} />
            {meta}
          </p>
        )}
      </>
    );
  }

  const R = "var(--ch-r)", T = "var(--ch-tail)";
  // the corner next to the sender's side is small inside a run of messages (and at the tail of the last one)
  const radius = { borderRadius: mine ? `${R} ${first ? R : T} ${T} ${R}` : `${first ? R : T} ${R} ${R} ${T}` };

  return (
    <div
      className={cx("group relative flex items-end gap-1.5 px-2.5", mine ? "justify-end" : "justify-start", reactions.length > 0 ? "mb-6" : last ? "mb-2" : "mb-[3px]")}
      style={{ touchAction: "pan-y" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onContextMenu={(e) => { e.preventDefault(); if (!fired.current) p.onMenu(m); }}
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
        className={cx("relative max-w-[min(80%,30rem)] min-w-0 transition-transform duration-150 ease-out motion-reduce:transition-none", dx > 0 && "!duration-0")}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      >
        <div
          tabIndex={0}
          role="group"
          aria-label={`${mine ? "You" : displayName(sender)}, ${time}${m.editedAt ? ", edited" : ""}${reactions.length ? `, reactions ${reactions.map(([e, u]) => `${e} ${u.length}`).join(" ")}` : ""}`}
          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " " || e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) { e.preventDefault(); p.onMenu(m); } }}
          className={cx(
            "relative select-none [-webkit-touch-callout:none] md:select-text",
            !bare && "px-3 py-1.5 shadow-sm",
            !bare && (mine ? "bg-[var(--ch-acc)] text-[var(--ch-ink)]" : "bg-card2 text-ink"),
            m.status === "failed" && "ring-2 ring-bad/70",
            p.highlight && "animate-[chat-flash_1.6s_ease-out] motion-reduce:animate-none",
            m.kind === "image" && !m.deleted && "!p-1",
          )}
          style={bare ? undefined : radius}
        >
          {group && !mine && first && !bare && <span className="mb-0.5 block truncate text-xs font-semibold" style={{ color: nameColor(m.senderId) }}>{displayName(sender)}</span>}
          {content}
        </div>
        {m.status === "failed" && <p className="mt-1 text-right text-[11px] text-bad">{m.error ? `Not sent: ${m.error}` : "Not sent"} · tap the icon to retry</p>}
        {reactions.length > 0 && (
          <div className={cx("absolute -bottom-4 z-[1] flex flex-wrap gap-1", mine ? "right-2" : "left-2")}>
            {reactions.map(([e, users]) => {
              const on = users.includes(p.meId);
              return (
                <button key={e} type="button" onClick={(ev) => { ev.stopPropagation(); p.onReact(m, e); }} title={users.map(name).join(", ")}
                  aria-label={`${e} by ${users.map(name).join(", ")}. ${on ? "Tap to remove yours" : "Tap to add"}`} aria-pressed={on}
                  className={cx("flex h-7 items-center gap-0.5 rounded-full border px-1.5 text-sm leading-none shadow", on ? "border-[var(--ch-acc)] bg-card3" : "border-line bg-card2")}>
                  <span>{e}</span>{users.length > 1 && <span className="text-[11px] font-semibold tabular-nums text-mute">{users.length}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

const NAME_COLORS = ["#8cc8ff", "#ffc56b", "#c7b3ff", "#7ae0cf", "#ffa8d4", "#ff9a8a", "#c8f560"];
export function nameColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}
