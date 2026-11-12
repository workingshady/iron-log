import { useState } from "react";
import { KeyRound, LockOpen, LogIn, ShieldAlert, Ticket, X } from "lucide-react";
import { Badge, Btn, Chips } from "../ui";
import { UserAvatar } from "../social/UserAvatar";
import { Skeleton } from "./charts";
import { ago, ax, when, type SecurityData } from "./lib";

export function SecuritySkeleton() {
  return <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-64 md:col-span-2" /><Skeleton className="h-48" /><Skeleton className="h-48" /></div>;
}

export default function Security({ data, reload }: { data: SecurityData; reload: () => void }) {
  const [show, setShow] = useState<"open" | "all">("open");
  const [err, setErr] = useState<string | null>(null);
  const act = (p: Promise<unknown>) => p.then(reload).catch((e) => setErr((e as Error).message));
  const invites = show === "open" ? data.invites.filter((i) => i.active) : data.invites;
  const locked = data.lockouts.filter((l) => l.locked).length;

  return (
    <div className="space-y-4">
      {err && <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{err}</p>}
      <section className="rounded-2xl border border-line/60 bg-card p-4" aria-labelledby="inv-h">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="inv-h" className="flex flex-1 items-center gap-2 text-sm font-semibold"><Ticket size={16} className="text-mute" aria-hidden /> Invites <span className="font-normal text-mute num">({data.invites.filter((i) => i.active).length} open)</span></h2>
          <Chips small clearable={false} value={show} onChange={(v) => v && setShow(v)} options={[{ id: "open", label: "Open" }, { id: "all", label: `All ${data.invites.length}` }]} />
        </div>
        {invites.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm num">
              <thead className="text-left text-xs text-mute"><tr><th scope="col" className="py-2 pr-2 font-medium">Code</th><th scope="col" className="px-2 font-medium">By</th><th scope="col" className="px-2 text-right font-medium">Used</th><th scope="col" className="px-2 text-right font-medium">Expires</th><th scope="col" className="w-12"><span className="sr-only">Revoke</span></th></tr></thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.code} className="border-t border-line/40">
                    <td className="py-1.5 pr-2"><code className="font-mono">{i.code}</code> {!i.active && <Badge>closed</Badge>}</td>
                    <td className="px-2 text-mute">@{i.creator}</td>
                    <td className="px-2 text-right">{i.uses}/{i.maxUses}</td>
                    <td className="px-2 text-right text-xs text-mute">{i.expiresAt ? (i.expiresAt > Date.now() ? new Date(i.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "expired") : "never"}</td>
                    <td className="text-right">{i.active && <button type="button" onClick={() => act(ax("DELETE", `/admin/invites/${i.code}`))} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-bad hover:bg-bad/10" aria-label={`Revoke invite ${i.code}`}><X size={18} aria-hidden /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-mute">No {show === "open" ? "open " : ""}invites.</p>}
        {data.resets.length > 0 && (
          <div className="mt-4 border-t border-line/40 pt-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-mute"><KeyRound size={13} aria-hidden /> Passcode reset codes</h3>
            <ul className="space-y-1 text-sm">{data.resets.map((r, i) => <li key={i} className="flex justify-between gap-2"><span>@{r.username}</span><span className="text-xs text-mute">{r.used ? "used" : r.expiresAt > Date.now() ? `valid until ${when(r.expiresAt)}` : "expired"}</span></li>)}</ul>
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line/60 bg-card p-4" aria-labelledby="lk-h">
          <h2 id="lk-h" className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldAlert size={16} className={locked ? "text-bad" : "text-mute"} aria-hidden /> Failed logins {locked > 0 && <Badge tone="bad">{locked} locked</Badge>}</h2>
          {data.lockouts.length ? (
            <ul className="divide-y divide-line/40">
              {data.lockouts.map((l) => (
                <li key={l.key} className="flex min-h-12 items-center gap-3 py-1">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm">{l.key.startsWith("u:") ? `@${l.key.slice(2)}` : `IP ${l.key.slice(3)}`}</span>
                    <span className="block text-xs text-mute">{l.fails} failed · {l.locked ? <span className="text-bad">locked until {when(l.until)}</span> : `last ${ago(l.at)}`}</span>
                  </span>
                  <Btn kind="soft" icon={LockOpen} onClick={() => act(ax("DELETE", `/admin/lockouts?key=${encodeURIComponent(l.key)}`))}>{l.locked ? "Unlock" : "Clear"}</Btn>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-mute">No failed logins. Lockouts start after 5 wrong tries.</p>}
        </section>
        <section className="rounded-2xl border border-line/60 bg-card p-4" aria-labelledby="si-h">
          <h2 id="si-h" className="mb-3 flex items-center gap-2 text-sm font-semibold"><LogIn size={16} className="text-mute" aria-hidden /> Recent sign-ins</h2>
          {data.signIns.length ? (
            <ul className="divide-y divide-line/40">
              {data.signIns.map((s, i) => (
                <li key={i} className="flex min-h-12 items-center gap-3 py-1">
                  <UserAvatar id={s.avatarId} name={s.name ?? s.username} size={30} />
                  <span className="min-w-0 flex-1 truncate text-sm">{s.name || s.username} <span className="text-mute">@{s.username}</span></span>
                  <span className="shrink-0 text-right text-xs text-mute">{when(s.at)}{s.which === "previous" && <span className="block">previous</span>}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-mute">No passcode sign-ins recorded yet (DEV logins aren't recorded).</p>}
        </section>
      </div>
    </div>
  );
}
