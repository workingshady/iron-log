import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Bell, ChevronRight, Search } from "lucide-react";
import { Badge, Chips, Empty } from "../ui";
import { UserAvatar } from "../social/UserAvatar";
import { cx } from "../../lib/util";
import { Skeleton } from "./charts";
import { ago, fmt, type UserRow } from "./lib";

type SortKey = "lastSeen" | "createdAt" | "workouts" | "sets" | "prs" | "posts" | "friends" | "username";
const SORTS: { id: SortKey; label: string }[] = [
  { id: "lastSeen", label: "Last seen" }, { id: "workouts", label: "Workouts" }, { id: "sets", label: "Sets" }, { id: "prs", label: "PRs" },
  { id: "posts", label: "Posts" }, { id: "friends", label: "Friends" }, { id: "createdAt", label: "Joined" }, { id: "username", label: "Username" },
];
type Filter = "all" | "active" | "dormant" | "suspended" | "google";
const DAY = 86_400_000;

export const RoleBadge = ({ role }: { role: string }) =>
  role === "owner" ? <Badge tone="acc">owner</Badge> : role === "suspended" ? <Badge tone="bad">suspended</Badge> : <Badge>member</Badge>;

export function UsersSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>;
}

export default function Users({ users, onOpen }: { users: UserRow[]; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("lastSeen");
  const [desc, setDesc] = useState(true);
  const now = Date.now();
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^@/, "");
    const out = users.filter((u) => {
      if (s && !`${u.username} ${u.name ?? ""} ${u.email ?? ""} ${u.plan ?? ""}`.toLowerCase().includes(s)) return false;
      if (filter === "active") return (u.lastSeen ?? 0) > now - 7 * DAY;
      if (filter === "dormant") return u.role !== "suspended" && (u.lastSeen ?? 0) <= now - 7 * DAY;
      if (filter === "suspended") return u.role === "suspended";
      if (filter === "google") return u.google;
      return true;
    });
    const val = (u: UserRow) => (sort === "username" ? u.username : (u[sort] as number | null) ?? 0);
    out.sort((a, b) => { const x = val(a), y = val(b); const r = x < y ? -1 : x > y ? 1 : 0; return desc ? -r : r; });
    return out;
  }, [users, q, filter, sort, desc, now]);

  const th = (k: SortKey, label: string, right = true) => (
    <th scope="col" aria-sort={sort === k ? (desc ? "descending" : "ascending") : "none"} className={cx("px-2 py-2 font-medium", right && "text-right")}>
      <button type="button" onClick={() => (sort === k ? setDesc(!desc) : (setSort(k), setDesc(k !== "username")))} className={cx("inline-flex min-h-8 items-center gap-0.5 hover:text-ink", sort === k && "text-ink")}>
        {label}{sort === k && (desc ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />)}
      </button>
    </th>
  );
  const seen = (u: UserRow) => {
    const fresh = (u.lastSeen ?? 0) > now - 7 * DAY;
    return <span className={cx("inline-flex items-center gap-1.5", !fresh && "text-mute")}><span className={cx("h-2 w-2 rounded-full", fresh ? "bg-acc" : (u.lastSeen ?? 0) > now - 14 * DAY ? "bg-warn" : "bg-bad")} aria-hidden />{ago(u.lastSeen)}</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search people</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, @username, email, plan"
            className="min-h-11 w-full rounded-xl bg-card2 pl-9 pr-3 outline-none placeholder:text-faint focus:ring-2 focus:ring-acc" />
        </label>
        <label className="flex items-center gap-2 text-sm text-mute md:hidden">
          Sort
          <select value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setDesc(e.target.value !== "username"); }} className="min-h-11 flex-1 rounded-xl bg-card2 px-3 text-ink">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button type="button" onClick={() => setDesc(!desc)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-card2 text-ink" aria-label={desc ? "Sort ascending" : "Sort descending"}>
            {desc ? <ArrowDown size={16} aria-hidden /> : <ArrowUp size={16} aria-hidden />}
          </button>
        </label>
      </div>
      <div role="group" aria-label="Filter people">
        <Chips small clearable={false} value={filter} onChange={(v) => v && setFilter(v)}
          options={[{ id: "all", label: `All ${users.length}` }, { id: "active", label: "Active 7d" }, { id: "dormant", label: "Quiet 7d+" }, { id: "suspended", label: "Suspended" }, { id: "google", label: "Google" }]} />
      </div>
      <p className="text-xs text-mute" aria-live="polite">{rows.length} of {users.length} people</p>

      {!rows.length ? <Empty icon={Search}>Nobody matches.</Empty> : (
        <>
          {/* phone: cards */}
          <ul className="space-y-2 md:hidden">
            {rows.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => onOpen(u.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line/60 bg-card p-3 text-left hover:bg-card2">
                  <UserAvatar id={u.avatarId} name={u.name ?? u.username} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold">{u.name || u.username}</span><RoleBadge role={u.role} /></span>
                    <span className="block truncate text-xs text-mute">@{u.username}{u.plan ? ` · ${u.plan}` : ""}</span>
                    <span className="mt-1 flex flex-wrap gap-x-3 text-xs num">{seen(u)}<span className="text-mute">{fmt(u.workouts)} workouts</span><span className="text-mute">{fmt(u.sets)} sets</span></span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {/* desktop: sortable table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-line/60 bg-card md:block">
            <table className="w-full text-sm num">
              <caption className="sr-only">People on this app. Column headers sort.</caption>
              <thead className="border-b border-line/60 text-left text-xs text-mute">
                <tr>
                  {th("username", "Person", false)}
                  <th scope="col" className="px-2 py-2 font-medium">Sign-in</th>
                  {th("createdAt", "Joined")}
                  {th("lastSeen", "Last seen")}
                  {th("workouts", "Workouts")}
                  {th("sets", "Sets")}
                  {th("prs", "PRs")}
                  <th scope="col" className="px-2 py-2 text-right font-medium">Photos</th>
                  {th("posts", "Posts")}
                  {th("friends", "Friends")}
                  <th scope="col" className="px-2 py-2 text-right font-medium"><Bell size={13} className="inline" aria-label="Devices with push on" /></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} onClick={() => onOpen(u.id)} className="cursor-pointer border-t border-line/30 first:border-0 hover:bg-card2">
                    <td className="px-2 py-2">
                      <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(u.id); }} className="flex min-w-0 items-center gap-2.5 text-left">
                        <UserAvatar id={u.avatarId} name={u.name ?? u.username} size={34} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5"><span className="max-w-40 truncate font-medium">{u.name || u.username}</span><RoleBadge role={u.role} /></span>
                          <span className="block max-w-56 truncate text-xs text-mute">@{u.username}{u.plan ? ` · ${u.plan}` : ""}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-xs text-mute">
                      <span className="block">{u.google ? "Google linked" : "Passcode"}</span>
                      {u.email && <span className="block max-w-40 truncate">{u.email}</span>}
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-mute">{new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}</td>
                    <td className="px-2 py-2 text-right text-xs">{seen(u)}<span className="block text-mute" title="Last sign-in">{u.lastLogin ? `login ${ago(u.lastLogin)}` : ""}</span></td>
                    <td className="px-2 py-2 text-right">{fmt(u.workouts)}</td>
                    <td className="px-2 py-2 text-right">{fmt(u.sets)}</td>
                    <td className="px-2 py-2 text-right">{fmt(u.prs)}</td>
                    <td className="px-2 py-2 text-right">{fmt(u.photos)}</td>
                    <td className="px-2 py-2 text-right">{fmt(u.posts)}</td>
                    <td className="px-2 py-2 text-right">{fmt(u.friends)}</td>
                    <td className="px-2 py-2 text-right text-mute">{u.devices || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
