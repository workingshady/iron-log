import { useCallback, useEffect, useState } from "react";
import { Dumbbell, Plus } from "lucide-react";
import type { Story } from "../../../shared/social";
import { cache } from "../../lib/api";
import { cx } from "../../lib/util";
import { UserAvatar } from "./UserAvatar";
import { firstName, localToday, sx, useFocusRefresh } from "./lib";

/**
 * Instagram-style stories row: you first (tap = new post), then friends. A lime→blue ring = trained today (only shown
 * when they share workouts with friends), grey ring = not yet. Tap a friend → their profile.
 */
export function Stories({ onCompose, reloadKey }: { onCompose: () => void; reloadKey?: number }) {
  const [list, setList] = useState<Story[] | null>(() => cache.get<Story[]>("social:stories"));
  const load = useCallback(() => {
    sx<Story[]>("GET", `/social/stories?today=${localToday()}`).then((s) => { setList(s); cache.set("social:stories", s); }).catch(() => setList((l) => l ?? []));
  }, []);
  useEffect(load, [load, reloadKey]);
  useFocusRefresh(load);
  if (list && list.length <= 1) return null; // no friends yet → the empty feed invites you to find some
  const trained = list?.filter((s) => s.trainedToday && !s.me).length ?? 0;
  return (
    <nav aria-label={`Friends${trained ? `, ${trained} trained today` : ""}`} className="border-b border-line/50 pb-3">
      <ul className="flex gap-3 overflow-x-auto px-4 [scrollbar-width:none]">
        {list == null
          ? [0, 1, 2, 3, 4].map((k) => <li key={k} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5"><span className="h-[66px] w-[66px] animate-pulse rounded-full bg-card2" /><span className="h-2.5 w-10 animate-pulse rounded bg-card2" /></li>)
          : list.map((s) => (
            <li key={s.user.id} className="shrink-0">
              {s.me ? (
                <button type="button" onClick={onCompose} className="flex w-[68px] flex-col items-center gap-1 text-center" aria-label="New post">
                  <span className="relative rounded-full p-[3px]" style={s.trainedToday ? { background: "conic-gradient(var(--color-acc), var(--color-info), var(--color-acc))" } : undefined}>
                    <span className="block rounded-full bg-bg p-[2px]"><UserAvatar id={s.user.avatarId} name={s.user.name ?? s.user.username} size={56} /></span>
                    <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg bg-acc text-acc-ink" aria-hidden><Plus size={14} strokeWidth={3} /></span>
                  </span>
                  <span className="w-full truncate text-[11px] text-mute">You</span>
                </button>
              ) : (
                <a href={`#/u/${encodeURIComponent(s.user.username)}`} className="flex w-[68px] flex-col items-center gap-1 text-center" aria-label={`${s.user.name || s.user.username}${s.trainedToday ? ", trained today" : ""}`}>
                  <span className={cx("relative rounded-full p-[3px]", !s.trainedToday && "bg-line")} style={s.trainedToday ? { background: "conic-gradient(var(--color-acc), var(--color-info), var(--color-acc))" } : undefined}>
                    <span className="block rounded-full bg-bg p-[2px]"><UserAvatar id={s.user.avatarId} name={s.user.name ?? s.user.username} size={56} /></span>
                    {s.trainedToday && <span className="absolute -bottom-0.5 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg bg-acc text-acc-ink" aria-hidden><Dumbbell size={12} strokeWidth={2.6} /></span>}
                  </span>
                  <span className={cx("w-full truncate text-[11px]", s.trainedToday ? "font-semibold text-ink" : "text-mute")}>{firstName(s.user)}</span>
                </a>
              )}
            </li>
          ))}
      </ul>
    </nav>
  );
}
