import { useState } from "react";
import { cx } from "../../lib/util";
import { socialPhotoUrl } from "./lib";

/** Avatar for anyone (friends included): same look as components/Avatar, but loads through the social photo route. */
export function UserAvatar({ id, name, size = 40, ring, className }: { id?: string | null; name?: string | null; size?: number; ring?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = (name ?? "").trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-card3 font-semibold text-mute", ring && "ring-2 ring-acc ring-offset-2 ring-offset-bg", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {id && !broken ? <img src={socialPhotoUrl(id, true)} alt="" className="h-full w-full object-cover" decoding="async" loading="lazy" onError={() => setBroken(true)} /> : initials}
    </span>
  );
}

/** Avatar + name + @username row linking to the profile. */
export function UserRow({ user, sub, right, size = 44 }: { user: { username: string; name: string | null; avatarId: string | null }; sub?: React.ReactNode; right?: React.ReactNode; size?: number }) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-1.5">
      <a href={`#/u/${encodeURIComponent(user.username)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl">
        <UserAvatar id={user.avatarId} name={user.name ?? user.username} size={size} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{user.name || user.username}</span>
          <span className="block truncate text-xs text-mute">@{user.username}{sub ? <> · {sub}</> : null}</span>
        </span>
      </a>
      {right}
    </div>
  );
}
