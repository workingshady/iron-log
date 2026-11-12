import { Bell, Cloud, Database, ExternalLink, GitBranch, MessagesSquare, Package, Table2 } from "lucide-react";
import { ChartCard, DataTable, Kpi, Meter, RankBars, Skeleton } from "./charts";
import { bytes, compact, fmt, shortDay, type SystemData } from "./lib";

const LINKS = [
  { href: "https://dash.cloudflare.com/?to=/:account/workers-and-pages", label: "Cloudflare Workers", icon: Cloud },
  { href: "https://dash.cloudflare.com/?to=/:account/workers/d1", label: "D1 databases", icon: Database },
  { href: "https://github.com/workingshady/iron-log", label: "GitHub repo", icon: GitBranch },
];

export function SystemSkeleton() {
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-72" /></div>;
}

export default function System({ data: s }: { data: SystemData }) {
  const used = s.storage.bytes / s.storage.limit;
  const rows = s.tables.reduce((a, t) => a + t.rows, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Database} tone="vio" label="Database size" value={bytes(s.storage.bytes)} sub={`${(used * 100).toFixed(used < 0.01 ? 2 : 1)}% of 500 MB${s.storage.exact ? "" : " · est."}`} />
        <Kpi icon={Table2} tone="vio" label="Rows" value={compact(rows)} sub={`${s.tables.length} tables`} />
        <Kpi icon={Bell} tone="info" label="Push devices" value={fmt(s.pushSubscriptions)} sub="subscriptions" />
        <Kpi icon={MessagesSquare} tone="info" label="Chat rooms" value={fmt(s.chats.total)} sub={`${s.chats.active7} active this week · ${s.chats.byKind.map((k) => `${k.n} ${k.kind}`).join(", ") || "none"}`} />
      </div>

      <section className="rounded-2xl border border-line/60 bg-card p-4">
        <div className="mb-2 flex items-baseline gap-2 text-sm"><h2 className="flex-1 font-semibold">Storage · {s.mode}</h2><span className="num"><b>{bytes(s.storage.bytes)}</b> <span className="text-mute">/ 500 MB</span></span></div>
        <Meter value={s.storage.bytes} max={s.storage.limit} label="Database storage used" />
        <p className="mt-1.5 text-xs text-mute">Photos {bytes(s.storage.photoBytes)} · voice notes {bytes(s.storage.mediaBytes)} (original sizes; stored as base64, about 1.37×). Each chat room is one Durable Object.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Biggest tables" sub="Estimated size (rows × typical row size)" icon={Database} table={{ cols: ["Table", "Rows", "Est. KB"], rows: s.tables.map((t) => [t.name, t.rows, Math.round(t.estBytes / 1024)]) }}>
          <RankBars tone="vio" items={s.tables.slice(0, 10).map((t) => ({ label: t.name, value: t.estBytes, sub: `${fmt(t.rows)} rows` }))} unit="bytes" fmtValue={bytes} />
        </ChartCard>
        <section className="rounded-2xl border border-line/60 bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Package size={16} className="text-mute" aria-hidden /> Versions</h3>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-mute">Default plan</dt><dd className="truncate text-right">{s.app.programName} <code className="text-xs text-mute">{s.app.program}</code></dd></div>
            {s.app.latest && <div className="flex justify-between gap-3"><dt className="text-mute">Latest release</dt><dd className="truncate text-right">{s.app.latest.title} · {shortDay(s.app.latest.date)}</dd></div>}
          </dl>
          <h4 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-mute">Program versions in use</h4>
          <DataTable cols={["Version", "People", "Sessions", "Last used"]} rows={s.versions.map((v) => [v.id, v.users, v.sessions, v.last])} />
          <h4 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-mute">Quick links</h4>
          <ul className="flex flex-wrap gap-2">
            {LINKS.map((l) => (
              <li key={l.href}><a href={l.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm hover:bg-card2"><l.icon size={16} aria-hidden />{l.label}<ExternalLink size={13} className="text-faint" aria-hidden /></a></li>
            ))}
          </ul>
        </section>
      </div>

      <details className="rounded-2xl border border-line/60 bg-card p-4">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold"><Table2 size={16} className="text-mute" aria-hidden /> Row count for every table</summary>
        <div className="mt-3"><DataTable cols={["Table", "Rows", "Est. size"]} rows={[...s.tables].sort((a, b) => a.name.localeCompare(b.name)).map((t) => [t.name, t.rows, bytes(t.estBytes)])} /></div>
      </details>
    </div>
  );
}
