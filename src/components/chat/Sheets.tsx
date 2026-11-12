import { useEffect, useMemo, useState } from "react";
import { BellOff, Check, LogOut, Search, UserPlus, Users } from "lucide-react";
import { Btn, Sheet } from "../ui";
import { UserAvatar as Avatar } from "../social/UserAvatar";
import { cx } from "../../lib/util";
import { chatApi, convTitle, createGroup, displayName, lastSeenText, openDm, refreshConv, refreshList, updateConv, type ChatUser, type Conv } from "../../lib/chat";
import { ACCENTS, BUBBLES, WALLPAPERS, resolveTheme } from "./theme";

function useFriends(open: boolean) {
  const [friends, setFriends] = useState<ChatUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    chatApi<ChatUser[]>("GET", "/chats/friends").then(setFriends).catch((e) => setErr((e as Error).message));
  }, [open]);
  return { friends, err };
}

function PersonRow({ u, right, onClick, selected }: { u: ChatUser; right?: React.ReactNode; onClick?: () => void; selected?: boolean }) {
  const inner = (
    <>
      <Avatar id={u.avatarId} name={u.name ?? u.username} size={40} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold">{displayName(u)}</span>
        <span className="block truncate text-xs text-mute">@{u.username}</span>
      </span>
      {selected !== undefined && (
        <span className={cx("flex h-6 w-6 items-center justify-center rounded-full border-2", selected ? "border-acc bg-acc text-acc-ink" : "border-line")} aria-hidden>{selected && <Check size={15} strokeWidth={3} />}</span>
      )}
      {right}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} role={selected !== undefined ? "checkbox" : undefined} aria-checked={selected}
      className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 hover:bg-card2">{inner}</button>
  ) : <div className="flex min-h-14 items-center gap-3 px-2">{inner}</div>;
}

/** Start a chat: tap a friend (DM) or switch to "New group". */
export function NewChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { friends, err } = useFriends(open);
  const [group, setGroup] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!open) { setGroup(false); setSel([]); setTitle(""); setQ(""); setError(null); } }, [open]);
  const list = useMemo(() => (friends ?? []).filter((u) => !q || `${u.name} ${u.username}`.toLowerCase().includes(q.toLowerCase())), [friends, q]);

  async function dm(u: ChatUser) {
    setBusy(true);
    try { const id = await openDm(u.username); onClose(); location.hash = `#/chat/${id}`; }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  async function makeGroup() {
    setBusy(true);
    try { const id = await createGroup(title.trim(), sel); void refreshList(); onClose(); location.hash = `#/chat/${id}`; }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <Sheet open={open} onClose={onClose} title={group ? "New group" : "New chat"}>
      {group && (
        <label className="mb-3 block">
          <span className="mb-1 block text-sm text-mute">Group name</span>
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder="e.g. Gym crew" dir="auto"
            className="h-12 w-full rounded-xl bg-card2 px-3 placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-acc/60" />
        </label>
      )}
      <label className="relative mb-2 block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
        <span className="sr-only">Search friends</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search friends"
          className="h-11 w-full rounded-xl bg-card2 pl-9 pr-3 placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-acc/60" />
      </label>
      {!group && (friends?.length ?? 0) > 1 && (
        <button type="button" onClick={() => setGroup(true)} className="mb-1 flex min-h-14 w-full items-center gap-3 rounded-xl px-2 font-semibold hover:bg-card2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-acc/20 text-acc"><Users size={20} aria-hidden /></span> New group
        </button>
      )}
      {err && <p className="py-4 text-sm text-bad">{err}</p>}
      {!friends && !err && <p className="py-6 text-center text-sm text-mute">Loading friends…</p>}
      {friends && !friends.length && (
        <p className="py-6 text-center text-sm text-mute">You can chat with friends. Add some first from <a href="#/friends" className="font-semibold text-acc underline" onClick={onClose}>Friends</a>.</p>
      )}
      <div className="flex flex-col">
        {list.map((u) => (
          <PersonRow key={u.id} u={u} selected={group ? sel.includes(u.id) : undefined}
            onClick={busy ? undefined : group ? () => setSel((s) => (s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id])) : () => void dm(u)} />
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
      {group && (
        <Btn kind="primary" className="mt-3 w-full" disabled={busy || !title.trim() || !sel.length} onClick={() => void makeGroup()}>
          Create group{sel.length ? ` · ${sel.length + 1} people` : ""}
        </Btn>
      )}
    </Sheet>
  );
}

/** Chat details: look (accent, bubbles, wallpaper), name (groups), members, mute, leave. */
export function ConvSheet({ conv, meId, online, open, onClose }: { conv: Conv; meId: string; online: string[]; open: boolean; onClose: () => void }) {
  const th = resolveTheme(conv.theme);
  const [title, setTitle] = useState(conv.title ?? "");
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const { friends } = useFriends(open && adding);
  useEffect(() => { if (open) { setTitle(conv.title ?? ""); setAdding(false); setAdd([]); setError(null); setLeaving(false); } }, [open, conv.title]);
  const set = (patch: Parameters<typeof updateConv>[1]) => updateConv(conv.id, patch).catch((e) => setError((e as Error).message));
  const theme = (p: Partial<{ accent: string; bubble: string; wallpaper: string }>) => set({ theme: { accent: th.accent.id, bubble: th.bubble.id, wallpaper: th.wall.id, ...p } });
  const group = conv.kind === "group";
  const swatch = "flex h-11 w-11 items-center justify-center rounded-full ring-offset-2 ring-offset-card";

  return (
    <Sheet open={open} onClose={onClose} title={convTitle(conv, meId)}>
      {group && (
        <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim() && title.trim() !== conv.title) void set({ title: title.trim() }); }}>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Group name</span>
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} dir="auto" className="h-12 w-full rounded-xl bg-card2 px-3 focus:outline-none focus:ring-2 focus:ring-acc/60" />
          </label>
          <Btn type="submit" kind="soft" disabled={!title.trim() || title.trim() === conv.title}>Rename</Btn>
        </form>
      )}

      <h3 className="mb-2 text-sm font-semibold text-mute">Colour</h3>
      <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Chat colour">
        {ACCENTS.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={th.accent.id === a.id} aria-label={a.label} onClick={() => theme({ accent: a.id })}
            className={cx(swatch, th.accent.id === a.id && "ring-2 ring-ink")} style={{ background: a.bg, color: a.ink }}>
            {th.accent.id === a.id && <Check size={18} strokeWidth={3} aria-hidden />}
          </button>
        ))}
      </div>
      <h3 className="mb-2 text-sm font-semibold text-mute">Bubbles</h3>
      <div className="mb-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Bubble style">
        {BUBBLES.map((b) => (
          <button key={b.id} type="button" role="radio" aria-checked={th.bubble.id === b.id} onClick={() => theme({ bubble: b.id })}
            className={cx("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border text-xs", th.bubble.id === b.id ? "border-acc bg-card2" : "border-line")}>
            <span className="h-5 w-12" style={{ background: th.accent.bg, borderRadius: `${b.r}px ${b.r}px ${b.tail}px ${b.r}px` }} aria-hidden />
            {b.label}
          </button>
        ))}
      </div>
      <h3 className="mb-2 text-sm font-semibold text-mute">Wallpaper</h3>
      <div className="mb-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Wallpaper">
        {WALLPAPERS.map((w) => (
          <button key={w.id} type="button" role="radio" aria-checked={th.wall.id === w.id} onClick={() => theme({ wallpaper: w.id })}
            className={cx("flex min-h-14 items-end justify-center rounded-xl border bg-bg pb-1 text-xs", th.wall.id === w.id ? "border-acc" : "border-line")}
            style={{ backgroundImage: w.css }}>
            <span className="rounded bg-black/40 px-1.5">{w.label}</span>
          </button>
        ))}
      </div>

      <button type="button" role="switch" aria-checked={!!conv.muted} onClick={() => void set({ muted: !conv.muted })}
        className="mb-3 flex min-h-12 w-full items-center gap-3 rounded-xl px-2 hover:bg-card2">
        <BellOff size={20} className="text-mute" aria-hidden />
        <span className="flex-1 text-left">Mute<span className="block text-xs text-mute">Not counted in the unread badge</span></span>
        <span className={cx("relative h-7 w-12 rounded-full transition-colors", conv.muted ? "bg-acc" : "bg-card3")} aria-hidden>
          <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white transition-all", conv.muted ? "left-6" : "left-1")} />
        </span>
      </button>

      <h3 className="mb-1 text-sm font-semibold text-mute">{conv.members.length} {group ? "members" : "people"}</h3>
      <div className="mb-2 flex flex-col">
        {conv.members.map((u) => (
          <a key={u.id} href={u.id === meId ? "#/profile" : `#/u/${encodeURIComponent(u.username)}`} onClick={onClose} className="rounded-xl hover:bg-card2">
            <PersonRow u={u} right={<span className="shrink-0 text-xs text-mute">{u.id === meId ? "You" : online.includes(u.id) ? <span className="text-acc">online</span> : lastSeenText(u.lastSeenAt)}</span>} />
          </a>
        ))}
      </div>
      {group && !adding && (
        <button type="button" onClick={() => setAdding(true)} className="mb-2 flex min-h-12 w-full items-center gap-3 rounded-xl px-2 font-semibold text-acc hover:bg-card2">
          <UserPlus size={20} aria-hidden /> Add people
        </button>
      )}
      {adding && (
        <div className="mb-3 rounded-xl bg-card2 p-2">
          {!friends ? <p className="p-2 text-sm text-mute">Loading…</p> : (
            <>
              {friends.filter((f) => !conv.members.some((m) => m.id === f.id)).map((u) => (
                <PersonRow key={u.id} u={u} selected={add.includes(u.id)} onClick={() => setAdd((s) => (s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id]))} />
              ))}
              {!friends.some((f) => !conv.members.some((m) => m.id === f.id)) && <p className="p-2 text-sm text-mute">All your friends are already here.</p>}
              <Btn kind="primary" className="mt-2 w-full" disabled={!add.length} onClick={() => {
                chatApi("POST", `/chat/${conv.id}/members`, { userIds: add }).then(() => { setAdding(false); setAdd([]); void refreshConv(conv.id); }).catch((e) => setError((e as Error).message));
              }}>Add {add.length || ""}</Btn>
            </>
          )}
        </div>
      )}
      {group && (leaving ? (
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={() => setLeaving(false)}>Stay</Btn>
          <Btn kind="danger" className="flex-1" onClick={() => {
            chatApi("DELETE", `/chat/${conv.id}/members/me`).then(() => { void refreshList(); onClose(); location.hash = "#/chats"; }).catch((e) => setError((e as Error).message));
          }}>Leave group</Btn>
        </div>
      ) : (
        <button type="button" onClick={() => setLeaving(true)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-bad hover:bg-bad/10">
          <LogOut size={20} aria-hidden /> Leave group
        </button>
      ))}
      {error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>}
    </Sheet>
  );
}
