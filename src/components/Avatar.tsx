import { photoUrl } from "./Photos";
import { cx } from "../lib/util";

/** Round profile picture (the photo's square thumbnail) or initials on a tinted circle. */
export function Avatar({ id, name, size = 40, ring, className }: { id?: string | null; name?: string | null; size?: number; ring?: boolean; className?: string }) {
  const initials = (name ?? "").trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-card3 font-semibold text-mute", ring && "ring-2 ring-acc ring-offset-2 ring-offset-bg", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {id ? <img src={photoUrl(id, true)} alt="" className="h-full w-full object-cover" decoding="async" /> : initials}
    </span>
  );
}
