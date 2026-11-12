import { useMemo, useState } from "react";
import { BellOff, Check, CheckCheck, MessagesSquare, Search, SquarePen } from "lucide-react";
import { PushNudge } from "../components/push/PushPrompt";
import { PageHead } from "../components/ui";
import { UserAvatar as Avatar } from "../components/social/UserAvatar";
import { NewChatSheet } from "../components/chat/Sheets";
import { useMe } from "../lib/me";
import { cx, time12 } from "../lib/util";
import { convTitle, displayName, otherMember, previewText, setChatMe, useChatList, useListTyping, type Conv } from "../lib/chat";

function shortWhen(ms: number) {
  const d = new Date(ms), now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff === 0) return time12(ms);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ConvAvatar({ c, me }: { c: Conv; me: string }) {
  const o = otherMember(c, me);
  if (o) {
    const on = !!o.lastSeenAt && Date.now() - o.lastSeenAt < 2 * 60e3;
    return (
      <span className="relative shrink-0">
        <Avatar id={o.avatarId} name={o.name ?? o.username} size={52} />
        {on && <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-bg bg-acc" aria-hidden />}
      </span>
    );
  }
  const others = c.members.filter((u) => u.id !== me).slice(0, 2);
  return (
    <span className="relative h-[52px] w-[52px] shrink-0" aria-hidden>
      {others[1] && <Avatar id={others[1].avatarId} name={others[1].name ?? others[1].username} size={36} className="absolute right-0 top-0" />}
      {others[0] && <Avatar id={others[0].avatarId} name={others[0].name ?? others[0].username} size={36} className="absolute bottom-0 left-0 ring-2 ring-bg" />}
    </span>
  );
}

/** Conversation list (#/chats): search, newest first, unread counts, live updates. */
export default function Chats() {
  const me = useMe();
  setChatMe(me?.id);
  const { convs, loaded, error } = useChatList();
  const typingBy = useListTyping();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const meId = me?.id ?? "";
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return convs;
    return convs.filter((c) => `${convTitle(c, meId)} ${c.members.map((u) => `${u.name} ${u.username}`).join(" ")} ${c.last?.text ?? ""}`.toLowerCase().includes(s));
  }, [convs, q, meId]);

  return (
    <div>
      <PageHead icon={MessagesSquare} title="Chats" sub="Talk training with your friends"
        right={<button type="button" onClick={() => setOpen(true)} aria-label="New chat" className="flex h-11 w-11 items-center justify-center rounded-full bg-acc text-acc-ink hover:brightness-105"><SquarePen size={20} aria-hidden /></button>} />
      <PushNudge reason="Get pinged when friends message you." className="mb-3" />
      {convs.length > 3 && (
        <label className="relative mb-3 block">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <span className="sr-only">Search chats</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats and messages"
            className="h-11 w-full rounded-2xl bg-card pl-10 pr-3 placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-acc/60" />
        </label>
      )}
      {error && !convs.length && <p className="rounded-xl bg-card p-4 text-sm text-bad">Couldn't load chats: {error}</p>}
      {!loaded && !convs.length && (
        <ul className="flex flex-col gap-1" aria-hidden>
          {[0, 1, 2].map((i) => <li key={i} className="flex h-[72px] items-center gap-3 px-2"><span className="h-[52px] w-[52px] rounded-full bg-card2" /><span className="flex-1"><span className="mb-2 block h-3.5 w-32 rounded bg-card2" /><span className="block h-3 w-48 rounded bg-card" /></span></li>)}
        </ul>
      )}
      {loaded && !convs.length && !error && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-6 py-10 text-center">
          <MessagesSquare size={36} className="text-faint" aria-hidden />
          <p className="font-semibold">No chats yet</p>
          <p className="max-w-xs text-sm text-mute">Message a friend about today's session, share a PR or plan the next leg day.</p>
          <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-12 rounded-xl bg-acc px-5 font-semibold text-acc-ink">Start a chat</button>
        </div>
      )}
      {q && !shown.length && <p className="py-8 text-center text-sm text-mute">Nothing matches “{q}”</p>}
      <ul className="-mx-2 flex flex-col" aria-label="Conversations">
        {shown.map((c) => {
          const unread = c.unread > 0;
          const title = convTitle(c, meId);
          const muted = !!c.muted;
          const typers = Object.entries(typingBy[c.id] ?? {}).filter(([u, at]) => u !== meId && at > Date.now()).map(([u]) => u);
          const typingText = typers.length ? (c.kind === "group" ? `${typers.map((u) => displayName(c.members.find((x) => x.id === u)).split(" ")[0]).join(", ")} ${typers.length > 1 ? "are" : "is"} typing…` : "typing…") : null;
          // my last message: ✓ sent · ✓✓ delivered (they were online after it) · ✓✓ in colour = read by everyone
          const mineLast = c.last && c.last.senderId === meId && !c.last.deleted && c.last.kind !== "system";
          const others = c.members.filter((u) => u.id !== meId);
          const tick = !mineLast ? null : others.length && others.every((u) => (u.lastReadAt ?? 0) >= c.last!.createdAt) ? "read"
            : others.length && others.every((u) => (u.lastSeenAt ?? 0) >= c.last!.createdAt) ? "delivered" : "sent";
          return (
            <li key={c.id}>
              <a href={`#/chat/${c.id}`} className="flex min-h-[72px] items-center gap-3 rounded-2xl px-2 py-2 hover:bg-card active:bg-card2"
                aria-label={`${title}${muted ? ", muted" : ""}${unread ? `, ${c.unread} unread` : ""}. ${typingText ?? `${tick ? `${tick === "read" ? "Read" : tick === "delivered" ? "Delivered" : "Sent"}: ` : ""}${previewText(c.last, meId, c.members, c.kind === "group")}`}. ${shortWhen(c.last?.createdAt ?? c.lastMessageAt)}`}>
                <ConvAvatar c={c} me={meId} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={cx("min-w-0 flex-1 truncate", unread ? "font-bold" : "font-semibold", muted && "text-mute")} dir="auto">{title}</span>
                    <span className={cx("shrink-0 text-xs tabular-nums", unread && !muted ? "font-semibold text-acc" : "text-mute")}>{shortWhen(c.last?.createdAt ?? c.lastMessageAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    {typingText ? (
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-acc">{typingText}</span>
                    ) : (
                      <span className={cx("flex min-w-0 flex-1 items-center gap-1 text-sm", unread && !muted ? "text-ink" : "text-mute")}>
                        {tick === "read" ? <CheckCheck size={15} className="shrink-0 text-info" aria-hidden /> : tick === "delivered" ? <CheckCheck size={15} className="shrink-0" aria-hidden /> : tick === "sent" ? <Check size={15} className="shrink-0" aria-hidden /> : null}
                        <span className="min-w-0 truncate" dir="auto">{previewText(c.last, meId, c.members, c.kind === "group")}</span>
                      </span>
                    )}
                    {muted ? <BellOff size={15} className="shrink-0 text-faint" aria-hidden /> : null}
                    {unread && <span className={cx("flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums", c.muted ? "bg-card3 text-ink" : "bg-acc text-acc-ink")}>{c.unread > 99 ? "99+" : c.unread}</span>}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <NewChatSheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
