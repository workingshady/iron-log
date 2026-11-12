import { useState } from "react";
import { Check, Clock, Loader2, UserCheck, UserPlus, X } from "lucide-react";
import type { Relation } from "../../../shared/social";
import { cx } from "../../lib/util";
import { sx } from "./lib";

/** The one friendship button: Add · Requested (tap = cancel) · Accept/Decline · Friends (tap = unfriend, confirmed). */
export function FriendButton({ userId, relation, onChange, wide, name }: { userId: string; relation: Relation; onChange?: (r: Relation) => void; wide?: boolean; name?: string }) {
  const [rel, setRel] = useState(relation);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function act(method: string, path: string, next: Relation) {
    setBusy(true); setErr(null);
    try {
      const r = await sx<{ relation?: Relation }>(method, `/friends/${encodeURIComponent(userId)}${path}`);
      const v = r.relation ?? next;
      setRel(v); onChange?.(v);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  const base = cx("inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition active:scale-[.98] disabled:opacity-50", wide && "w-full");
  const who = name ? ` ${name}` : "";
  let btn: React.ReactNode = null;
  if (rel === "self" || rel === "blocked") return null;
  if (rel === "none") btn = <button type="button" disabled={busy} onClick={() => act("POST", "/request", "outgoing")} className={cx(base, "bg-acc text-acc-ink")} aria-label={`Add${who} as friend`}>{busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <UserPlus size={16} aria-hidden />}Add friend</button>;
  if (rel === "outgoing") btn = <button type="button" disabled={busy} onClick={() => act("DELETE", "", "none")} className={cx(base, "bg-card2 text-ink hover:bg-card3")} aria-label={`Cancel friend request${who ? ` to${who}` : ""}`}><Clock size={16} aria-hidden />Requested</button>;
  if (rel === "incoming") btn = (
    <span className={cx("inline-flex gap-2", wide && "w-full")}>
      <button type="button" disabled={busy} onClick={() => act("POST", "/accept", "friends")} className={cx(base, "flex-1 bg-acc text-acc-ink")} aria-label={`Accept${who}`}><Check size={16} aria-hidden />Accept</button>
      <button type="button" disabled={busy} onClick={() => act("POST", "/decline", "none")} className={cx(base, "bg-card2 text-ink hover:bg-card3")} aria-label={`Decline${who}`}><X size={16} aria-hidden /><span className={wide ? "" : "sr-only"}>Decline</span></button>
    </span>
  );
  if (rel === "friends") btn = (
    <button type="button" disabled={busy} onClick={() => { if (confirm(`Remove${who || " this person"} from friends? They won't be told.`)) void act("DELETE", "", "none"); }} className={cx(base, "bg-card2 text-ink hover:bg-card3")} aria-label={`Friends${who ? ` with${who}` : ""}. Tap to unfriend`}>
      <UserCheck size={16} aria-hidden />Friends
    </button>
  );
  return (
    <span className={cx("inline-flex flex-col", wide && "w-full")}>
      {btn}
      {err && <span role="alert" className="mt-1 text-[11px] text-bad">{err}</span>}
    </span>
  );
}
