import { useState } from "react";
import { Globe2, Lock } from "lucide-react";
import { cx } from "../../lib/util";
import { sx } from "./lib";

/**
 * Per-photo "Friends / Only me" switch for one of YOUR photos (e.g. in the Lightbox caption bar or a photo sheet).
 * `visibility` = the photo's current value if you have it (defaults to private, the safe default).
 */
export function PhotoVisibilityToggle({ photoId, visibility = "private", onChange, className }: { photoId: string; visibility?: "friends" | "private"; onChange?: (v: "friends" | "private") => void; className?: string }) {
  const [v, setV] = useState(visibility);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function flip() {
    const next = v === "friends" ? "private" : "friends";
    setBusy(true); setErr(null); setV(next);
    try { await sx("PUT", `/social/photos/${encodeURIComponent(photoId)}/visibility`, { visibility: next }); onChange?.(next); }
    catch (e) { setV(v); setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <button type="button" role="switch" aria-checked={v === "friends"} disabled={busy} onClick={flip} title={err ?? undefined}
      className={cx("inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold", v === "friends" ? "bg-info/15 text-info" : "bg-card2 text-mute", className)}>
      {v === "friends" ? <Globe2 size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
      {v === "friends" ? "Friends can see" : "Only you"}
    </button>
  );
}
