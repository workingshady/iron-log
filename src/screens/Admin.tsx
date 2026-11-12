import { useEffect, useState } from "react";
import { Gauge, LayoutDashboard, RefreshCw, Server, ShieldCheck, Users as UsersIcon, type LucideIcon } from "lucide-react";
import { Badge, Empty, PageHead } from "../components/ui";
import { cx } from "../lib/util";
import { isDev } from "../lib/api";
import { tzOff, useAdmin, type Overview as O, type SecurityData, type SystemData, type UserRow } from "../components/admin/lib";
import Overview, { OverviewSkeleton } from "../components/admin/Overview";
import Users, { UsersSkeleton } from "../components/admin/Users";
import UserDetail from "../components/admin/UserDetail";
import Security, { SecuritySkeleton } from "../components/admin/Security";
import System, { SystemSkeleton } from "../components/admin/System";

/**
 * Owner-only admin dashboard (#/admin). Tiered: insights + KPI tiles first (the 10-second glance), then trends,
 * then drill-down (people → one person). Shows accounts, activity metadata, counts and usage, never anyone's
 * private content (journal, notes, pain, readiness, message text, private photos). The server enforces role === owner.
 */
type Tab = "overview" | "users" | "security" | "system";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "People", icon: UsersIcon },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "system", label: "System", icon: Server },
];
const TAB_KEY = "il_admin_tab";

export default function Admin() {
  const [tab, setTabState] = useState<Tab>(() => {
    try { const t = sessionStorage.getItem(TAB_KEY) as Tab | null; return t && TABS.some((x) => x.id === t) ? t : "overview"; } catch { return "overview"; }
  });
  const [userId, setUserId] = useState<string | null>(null);
  const setTab = (t: Tab) => { setTabState(t); setUserId(null); try { sessionStorage.setItem(TAB_KEY, t); } catch { /* ignore */ } };
  const off = tzOff();
  const overview = useAdmin<O>(tab === "overview" ? `/admin/overview?off=${off}` : null);
  const users = useAdmin<{ users: UserRow[] }>(tab === "users" ? "/admin/users" : null);
  const security = useAdmin<SecurityData>(tab === "security" ? "/admin/security" : null);
  const system = useAdmin<SystemData>(tab === "system" ? "/admin/system" : null);
  const cur = { overview, users, security, system }[tab];
  const open = (id: string) => { setTabState("users"); setUserId(id); window.scrollTo({ top: 0 }); };
  useEffect(() => { if (userId) window.scrollTo({ top: 0 }); }, [userId]);

  const body = () => {
    if (tab === "users" && userId) return <UserDetail id={userId} onBack={() => setUserId(null)} onChanged={users.reload} />;
    if (cur.error && !cur.data) return <Empty icon={Gauge}>{cur.error}</Empty>;
    if (tab === "overview") return overview.data ? <Overview data={overview.data} onOpenUser={open} /> : <OverviewSkeleton />;
    if (tab === "users") return users.data ? <Users users={users.data.users} onOpen={setUserId} /> : <UsersSkeleton />;
    if (tab === "security") return security.data ? <Security data={security.data} reload={security.reload} /> : <SecuritySkeleton />;
    return system.data ? <System data={system.data} /> : <SystemSkeleton />;
  };

  return (
    <div>
      <PageHead icon={Gauge} title="Admin" sub="Accounts, activity and usage. No private content."
        right={
          <div className="flex items-center gap-1">
            {isDev() && <Badge tone="warn">DEV data</Badge>}
            <button type="button" onClick={cur.reload} disabled={cur.busy} aria-label="Refresh"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-mute hover:bg-card2 hover:text-ink disabled:opacity-60">
              <RefreshCw size={18} className={cx(cur.busy && "animate-spin")} aria-hidden />
            </button>
          </div>
        } />
      <div role="tablist" aria-label="Admin sections" className="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-card p-1 md:inline-grid md:w-auto">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cx("flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-medium md:flex-row md:gap-2 md:px-4 md:text-sm",
              tab === t.id ? "bg-card3 text-ink" : "text-mute hover:text-ink")}>
            <t.icon size={17} aria-hidden />{t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label} className={cx("transition-opacity", cur.busy && cur.data && "opacity-70")}>
        {body()}
      </div>
    </div>
  );
}
