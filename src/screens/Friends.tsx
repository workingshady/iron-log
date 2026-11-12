import { useEffect, useState } from "react";
import { Ban, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import type { Relation, UserLite } from "../../shared/social";
import { Empty, PageHead, SectionHead } from "../components/ui";
import { FriendButton } from "../components/social/FriendButton";
import { UserRow } from "../components/social/UserAvatar";
import { INPUT, ago, sx } from "../components/social/lib";
import { useLoad } from "../lib/useLoad";
import { cx } from "../lib/util";

type F = UserLite & { since: number };
interface Data { friends: F[]; incoming: F[]; outgoing: F[]; blocked: F[]; suggestions: (UserLite & { mutual: number })[] }

/** Find people by username, answer requests, manage friends and blocks. */
export default function Friends() {
  const { data, reload } = useLoad<Data>("/friends");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<(UserLite & { relation: Relation })[] | null>(null);
  const [tab, setTab] = useState<"friends" | "requests" | "sent">("friends");
  const [showBlocked, setShowBlocked] = useState(false);

  useEffect(() => { if (data?.incoming.length && tab === "friends" && !data.friends.length) setTab("requests"); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = q.trim().toLowerCase().replace(/^@/, "");
    if (v.length < 2) { setRes(null); return; }
    const tm = setTimeout(() => sx<(UserLite & { relation: Relation })[]>("GET", `/users/search?q=${encodeURIComponent(v)}`).then(setRes).catch(() => setRes([])), 250);
    return () => clearTimeout(tm);
  }, [q]);

  const tabs = [
    { id: "friends", label: "Friends", n: data?.friends.length ?? 0 },
    { id: "requests", label: "Requests", n: data?.incoming.length ?? 0 },
    { id: "sent", label: "Sent", n: data?.outgoing.length ?? 0 },
  ] as const;
  const list = data ? (tab === "friends" ? data.friends : tab === "requests" ? data.incoming : data.outgoing) : null;
  const rel: Relation = tab === "friends" ? "friends" : tab === "requests" ? "incoming" : "outgoing";

  return (
    <div className="md:mx-auto md:max-w-xl">
      <PageHead icon={Users} title="Friends" sub="Friends see what you share. Nobody else does." />

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by username" aria-label="Search people by username"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} className={cx(INPUT, "min-h-12 pl-10")} />
      </div>
      {res != null && (
        <section aria-label="Search results" className="mt-2 rounded-2xl bg-card px-3">
          <p className="sr-only" role="status">{res.length} result{res.length === 1 ? "" : "s"}</p>
          {res.length === 0 ? <p className="py-4 text-center text-sm text-mute">No one with a username starting “{q.trim()}”.</p>
            : res.map((u) => <UserRow key={u.id} user={u} right={<FriendButton userId={u.id} relation={u.relation} name={u.username} onChange={reload} />} />)}
        </section>
      )}

      {res == null && (
        <>
          <div role="tablist" aria-label="Friend lists" className="mt-4 flex border-b border-line">
            {tabs.map((x) => (
              <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} className={cx("-mb-px flex h-12 flex-1 items-center justify-center gap-1.5 border-b-2 text-sm", tab === x.id ? "border-ink font-semibold text-ink" : "border-transparent text-mute")}>
                {x.label}
                {x.n > 0 && <span className={cx("rounded-full px-1.5 text-[11px] num", x.id === "requests" ? "bg-bad text-black" : "bg-card2 text-mute")}>{x.n}</span>}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="mt-1">
            {list == null ? <ul aria-busy className="space-y-2 pt-2">{[0, 1, 2].map((k) => <li key={k} className="h-14 animate-pulse rounded-xl bg-card" />)}</ul>
              : list.length === 0 ? (
                <div className="pt-4"><Empty icon={tab === "requests" ? UserPlus : Users}>{tab === "friends" ? "No friends yet. Search for your gym buddies by username." : tab === "requests" ? "No requests right now." : "No pending requests you sent."}</Empty></div>
              ) : (
                <ul>{list.map((u) => (
                  <li key={u.id}><UserRow user={u} sub={tab === "friends" ? `since ${ago(u.since)}` : ago(u.since)} right={<FriendButton userId={u.id} relation={rel} name={u.username} onChange={reload} />} /></li>
                ))}</ul>
              )}
          </div>

          {!!data?.suggestions.length && (
            <section aria-labelledby="sugg">
              <SectionHead><span id="sugg">People you may know</span></SectionHead>
              <ul className="rounded-2xl bg-card px-3">{data.suggestions.map((u) => (
                <li key={u.id}><UserRow user={u} sub={`${u.mutual} mutual`} right={<FriendButton userId={u.id} relation="none" name={u.username} onChange={reload} />} /></li>
              ))}</ul>
            </section>
          )}

          <div className="mt-6 flex flex-col gap-1">
            <a href="#/privacy" className="flex min-h-12 items-center gap-3 rounded-xl bg-card px-3 text-sm"><ShieldCheck size={18} className="text-info" aria-hidden /><span className="flex-1">Privacy: what friends can see</span><span className="text-faint" aria-hidden>›</span></a>
            {!!data?.blocked.length && (
              <>
                <button type="button" onClick={() => setShowBlocked(!showBlocked)} aria-expanded={showBlocked} className="flex min-h-12 items-center gap-3 rounded-xl bg-card px-3 text-left text-sm"><Ban size={18} className="text-bad" aria-hidden /><span className="flex-1">Blocked ({data.blocked.length})</span></button>
                {showBlocked && <ul className="rounded-xl bg-card px-3">{data.blocked.map((u) => (
                  <li key={u.id}><UserRow user={u} right={<button type="button" className="min-h-11 rounded-lg bg-card2 px-3 text-sm font-semibold" onClick={async () => { await sx("DELETE", `/friends/${u.id}/block`); reload(); }}>Unblock</button>} /></li>
                ))}</ul>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
