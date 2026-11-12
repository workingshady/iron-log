import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import type { MentionUser, UserLite } from "../../../shared/social";
import { cx } from "../../lib/util";
import { UserAvatar } from "../social/UserAvatar";
import { sx } from "../social/lib";

/** Where suggestions come from: a function of the typed prefix (server or a local list). */
export type MentionSource = (q: string) => Promise<MentionUser[]> | MentionUser[];

/** "@pre" right before the caret, not glued to a word / email (Arabic letters before it are fine). */
const TRIGGER = /(^|[^A-Za-z0-9_@.])@([A-Za-z0-9._]{0,30})$/;

/** Server suggestions for a post (comments) or a visibility (new post): friends first, then people who can see it. */
export const postMentionSource = (where: { post?: string; vis?: string }): MentionSource => (q) =>
  sx<MentionUser[]>("GET", `/mentions?q=${encodeURIComponent(q)}${where.post ? `&post=${encodeURIComponent(where.post)}` : ""}${where.vis ? `&vis=${where.vis}` : ""}`).catch(() => []);

/** Local suggestions (chat members): prefix of the username or of any word of the name. */
export function filterPeople(list: (UserLite & { friend?: boolean })[], q: string, max = 8): MentionUser[] {
  const s = q.toLowerCase();
  return list.filter((u) => !s || u.username.startsWith(s) || (u.name ?? "").toLowerCase().split(/\s+/).some((w) => w.startsWith(s)))
    .slice(0, max).map((u) => ({ id: u.id, username: u.username, name: u.name, avatarId: u.avatarId, friend: !!u.friend }));
}

/**
 * "@" autocomplete for an <input> or <textarea> (ARIA 1.2 combobox + listbox, keyboard: ↑ ↓ Enter / Tab, Esc closes).
 * Usage: spread `comboProps` on the field, call `sync(el)` from onChange / onSelect / onClick, call `onKeyDown(e)` first in
 * the field's key handler (true = handled), and render `popover` inside a `relative` wrapper around the field.
 */
export function useMentions<T extends HTMLInputElement | HTMLTextAreaElement>({ ref, value, setValue, source, id, place = "above" }: {
  ref: RefObject<T | null>; value: string; setValue: (v: string) => void; source: MentionSource; id: string; place?: "above" | "below";
}) {
  const [query, setQuery] = useState<{ q: string; start: number } | null>(null);
  const [items, setItems] = useState<MentionUser[]>([]);
  const [active, setActive] = useState(0);
  const dismissed = useRef<number | null>(null);
  const src = useRef(source);
  src.current = source;

  function sync(el: T | null = ref.current) {
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    if (el.selectionEnd != null && el.selectionEnd !== caret) { setQuery(null); return; }
    const m = TRIGGER.exec(el.value.slice(0, caret));
    if (!m) { setQuery(null); dismissed.current = null; return; }
    const start = caret - m[2].length - 1;
    setQuery(start === dismissed.current ? null : { q: m[2].toLowerCase(), start });
  }
  // the value can change from outside (cleared after send) → re-check
  useEffect(() => { if (!value) setQuery(null); }, [value]);

  useEffect(() => {
    if (!query) { setItems([]); return; }
    let live = true;
    const tm = setTimeout(async () => {
      const r = await src.current(query.q);
      if (live) { setItems(r); setActive(0); }
    }, 120);
    return () => { live = false; clearTimeout(tm); };
  }, [query?.q, query?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = !!query && items.length > 0;

  function pick(u: MentionUser) {
    const el = ref.current;
    if (!query || !el) return;
    const caret = el.selectionStart ?? value.length;
    const ins = `@${u.username} `;
    const next = value.slice(0, query.start) + ins + value.slice(caret).replace(/^[A-Za-z0-9._]*\s?/, "");
    setValue(next);
    setQuery(null);
    const pos = query.start + ins.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos); });
  }

  function onKeyDown(e: KeyboardEvent<T>): boolean {
    if (!open || e.nativeEvent.isComposing) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(items[Math.min(active, items.length - 1)]); return true; }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); dismissed.current = query!.start; setQuery(null); return true; }
    return false;
  }

  const listId = `${id}-mentions`;
  const comboProps = {
    role: "combobox" as const, "aria-autocomplete": "list" as const, "aria-expanded": open, "aria-controls": listId,
    "aria-activedescendant": open ? `${listId}-${active}` : undefined,
  };
  const popover = (
    <>
      <span className="sr-only" role="status" aria-live="polite">{open ? `${items.length} ${items.length === 1 ? "person" : "people"} to mention. Up and down to choose, Enter to pick.` : ""}</span>
      <ul id={listId} role="listbox" aria-label="Mention someone" hidden={!open}
        className={cx("absolute inset-x-0 z-40 max-h-[min(16rem,40vh)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-card2 p-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,.6)]",
          place === "above" ? "bottom-full mb-2" : "top-full mt-2")}>
        {open && items.map((u, i) => (
          <li key={u.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()} onClick={() => pick(u)} onMouseEnter={() => setActive(i)}
            className={cx("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1", i === active && "bg-card3")}>
            <UserAvatar id={u.avatarId} name={u.name ?? u.username} size={30} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold" dir="ltr">@{u.username}</span>
              {u.name && <span className="block truncate text-xs text-mute" dir="auto">{u.name}</span>}
            </span>
            {u.friend && <span className="shrink-0 rounded-full bg-acc/15 px-2 py-0.5 text-[10px] font-semibold text-acc">Friend</span>}
          </li>
        ))}
      </ul>
    </>
  );
  return { sync, onKeyDown, comboProps, popover, open };
}
