import { useState } from "react";
import {
  ArrowLeft, BarChart3, Ban, Bell, CalendarDays, Check, ClipboardList, Copy, Download, Dumbbell, HardDrive, KeyRound, LayoutList, LogIn, Lock,
  ShieldCheck, Ticket, Trash2, Trophy, UserCheck,
} from "lucide-react";
import { Badge, Btn, Empty, Sheet } from "../ui";
import { UserAvatar } from "../social/UserAvatar";
import { cx } from "../../lib/util";
import { ChartCard, ColumnChart, DayStrip, Kpi, RankBars, Skeleton } from "./charts";
import { RoleBadge } from "./Users";
import { ax, ago, bytes, compact, evLabel, fmt, shortDay, tzOff, useAdmin, when, type UserDetail as D } from "./lib";

export default function UserDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const { data, error, reload } = useAdmin<D>(`/admin/users/${encodeURIComponent(id)}?off=${tzOff()}`);
  const [sheet, setSheet] = useState<null | "reset" | "suspend" | "delete">(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const back = (
    <button type="button" onClick={onBack} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-info hover:bg-card2">
      <ArrowLeft size={18} aria-hidden /> All people
    </button>
  );
  if (error && !data) return <div>{back}<Empty icon={Ban}>{error}</Empty></div>;
  if (!data) return <div>{back}<div className="space-y-3"><Skeleton className="h-24" /><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-56" /></div></div>;

  const { user: u, counts: k } = data;
  const isOwner = u.role === "owner" || u.me;
  const suspended = u.role === "suspended";
  const weeks = data.weeks.map((w) => ({ label: shortDay(w.start), long: `7 days from ${shortDay(w.start)}` }));
  const exportJson = async () => {
    try {
      const out = await ax<object>("GET", `/admin/users/${encodeURIComponent(u.id)}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `iron-log-${u.username}-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMsg({ tone: "ok", text: "Export downloaded. Send it to them privately; it holds their journal and notes." });
    } catch (e) { setMsg({ tone: "bad", text: (e as Error).message }); }
  };

  return (
    <div className="space-y-4">
      {back}
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-line/60 bg-card p-4">
        <UserAvatar id={u.avatarId} name={u.name ?? u.username} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-xl font-bold">{u.name || u.username}</h2><RoleBadge role={u.role} />{u.google && <Badge tone="info">Google</Badge>}</div>
          <p className="truncate text-sm text-mute">@{u.username}{u.email ? ` · ${u.email}` : ""}</p>
          <p className="mt-1 text-xs text-mute">Joined {new Date(u.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })} · last seen {ago(u.lastSeenAt)} · plan: {data.plan ? data.plan.name : "none yet"}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          <Btn icon={Download} kind="soft" onClick={exportJson}>Export</Btn>
          {!isOwner && <Btn icon={KeyRound} kind="soft" onClick={() => setSheet("reset")}>Reset code</Btn>}
          {!isOwner && <Btn icon={suspended ? UserCheck : Ban} kind={suspended ? "soft" : "ghost"} onClick={() => setSheet("suspend")}>{suspended ? "Unsuspend" : "Suspend"}</Btn>}
          {!isOwner && <Btn icon={Trash2} kind="danger" onClick={() => setSheet("delete")}>Delete</Btn>}
        </div>
      </header>
      {msg && <p role="status" className={cx("rounded-xl px-3 py-2 text-sm", msg.tone === "ok" ? "bg-acc/10 text-acc" : "bg-bad/10 text-bad")}>{msg.text}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Dumbbell} label="Workouts" value={fmt(k.workouts)} sub={`${k.missed} missed · ${k.skipped} skipped`} spark={data.weeks.map((w) => w.workouts)} />
        <Kpi icon={BarChart3} label="Sets logged" value={compact(k.sets)} sub={`${k.cardio} cardio sessions`} spark={data.weeks.map((w) => w.sets)} />
        <Kpi icon={Trophy} label="PRs" value={fmt(k.prs)} sub={`${k.blocks} month blocks`} />
        <Kpi icon={UserCheck} tone="info" label="Friends" value={fmt(k.friends)} sub={`${k.chats} chats · ${fmt(k.messages)} messages sent`} />
        <Kpi icon={ClipboardList} tone="info" label="Posts" value={fmt(k.posts)} sub={`${k.comments} comments · ${k.likes} likes`} />
        <Kpi icon={HardDrive} tone="vio" label="Photos" value={fmt(k.photos)} sub={`${bytes(data.storage.photoBytes + data.storage.mediaBytes)} stored`} />
        <Kpi icon={Bell} tone="info" label="Push devices" value={fmt(data.devices.length)} sub={data.devices[0]?.ua ?? "none"} />
        <Kpi icon={LayoutList} tone="info" label="Taps logged" value={compact(k.events)} sub="all time" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Workouts per week" sub="Last 12 weeks · missed shown in the table" icon={Dumbbell} table={{ cols: ["Week from", "Done", "Missed", "PRs"], rows: [...data.weeks].reverse().map((w) => [w.start, w.workouts, w.missed, w.prs]) }}>
          <ColumnChart data={data.weeks.map((w, i) => ({ ...weeks[i], value: w.workouts }))} unit="workouts" valueFmt={fmt} />
        </ChartCard>
        <ChartCard title="Volume per week" sub="kg × reps" icon={Trophy} table={{ cols: ["Week from", "Sets", "Volume kg"], rows: [...data.weeks].reverse().map((w) => [w.start, w.sets, w.volume]) }}>
          <ColumnChart data={data.weeks.map((w, i) => ({ ...weeks[i], value: w.volume }))} unit="kg" />
        </ChartCard>
        <ChartCard title="Activity" sub="App use per day, last 13 weeks" icon={CalendarDays} table={{ cols: ["Day", "Actions"], rows: [...data.activity].reverse().filter((d) => d.n).map((d) => [d.d, d.n]) }}>
          <DayStrip days={data.activity} />
        </ChartCard>
        <ChartCard title="Top actions" sub="Last 30 days" icon={LayoutList} table={{ cols: ["Action", "Times"], rows: data.features.map((f) => [evLabel(f.type), f.n]) }}>
          {data.features.length ? <RankBars items={data.features.map((f) => ({ label: evLabel(f.type), value: f.n }))} unit="times" /> : <p className="text-sm text-mute">No actions in 30 days.</p>}
        </ChartCard>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-line/60 bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><LogIn size={16} className="text-mute" aria-hidden /> Sign-ins & devices</h3>
          <dl className="space-y-1.5 text-sm">
            <Row k="Latest sign-in" v={when(data.logins.last)} />
            <Row k="Previous" v={when(data.logins.prev)} />
            <Row k="Sign-in method" v={u.google ? "Google + passcode" : "Passcode"} />
          </dl>
          {data.devices.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line/40 pt-2 text-xs text-mute">
              {data.devices.map((d, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate text-ink">{d.ua}</span><span className="shrink-0">push ok {ago(d.lastOkAt)}</span></li>)}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-line/60 bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Lock size={16} className="text-mute" aria-hidden /> Their privacy settings</h3>
          <dl className="space-y-1.5 text-sm">
            <Row k="Profile" v={data.privacy.profile} />
            <Row k="Workouts" v={data.privacy.workouts} />
            <Row k="Photos" v={data.privacy.photos} />
            <Row k="Body stats" v={data.privacy.body} />
            {data.bodyweight && <Row k="Latest bodyweight" v={`${data.bodyweight.kg} kg · ${shortDay(data.bodyweight.date)}`} />}
          </dl>
          <p className="mt-3 flex gap-1.5 text-xs text-mute"><ShieldCheck size={14} className="mt-px shrink-0 text-acc" aria-hidden />Journal, notes, pain, readiness, messages and private photos are never shown here.</p>
        </section>
        <section className="rounded-2xl border border-line/60 bg-card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Ticket size={16} className="text-mute" aria-hidden /> Invites they made</h3>
          {data.invites.length ? (
            <ul className="space-y-1.5 text-sm">
              {data.invites.map((i) => (
                <li key={i.code} className="flex items-center gap-2"><code className="font-mono text-xs">{i.code}</code><span className="flex-1 text-xs text-mute num">{i.uses}/{i.maxUses} used</span>{i.active ? <Badge tone="acc">open</Badge> : <Badge>closed</Badge>}</li>
              ))}
            </ul>
          ) : <p className="text-sm text-mute">None.</p>}
        </section>
      </div>

      <ResetSheet open={sheet === "reset"} onClose={() => setSheet(null)} userId={u.id} username={u.username} />
      <SuspendSheet open={sheet === "suspend"} onClose={() => setSheet(null)} userId={u.id} name={u.name || u.username} suspended={suspended}
        onDone={(t) => { setSheet(null); setMsg({ tone: "ok", text: t }); reload(); onChanged(); }} />
      <DeleteSheet open={sheet === "delete"} onClose={() => setSheet(null)} userId={u.id} username={u.username}
        onDone={() => { setSheet(null); onChanged(); onBack(); }} />
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-3"><dt className="text-mute">{k}</dt><dd className="truncate text-right">{v}</dd></div>
);

function ResetSheet({ open, onClose, userId, username }: { open: boolean; onClose: () => void; userId: string; username: string }) {
  const [res, setRes] = useState<{ code: string; expiresAt: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const close = () => { setRes(null); setErr(null); setCopied(false); onClose(); };
  const make = async () => {
    setBusy(true); setErr(null);
    try { setRes(await ax<{ code: string; expiresAt: number }>("POST", "/account/reset-code", { userId })); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={close} title="Passcode reset code" icon={KeyRound}>
      {res ? (
        <div className="space-y-3">
          <p className="text-sm text-mute">Give this to @{username} privately. It works once, until {when(res.expiresAt)}.</p>
          <div className="flex items-center gap-2 rounded-xl bg-card2 p-3"><code className="flex-1 font-mono text-2xl font-bold tracking-widest">{res.code}</code>
            <Btn icon={copied ? Check : Copy} kind="soft" onClick={() => navigator.clipboard?.writeText(res.code).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</Btn></div>
          <Btn kind="primary" className="w-full" onClick={close}>Done</Btn>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-mute">Makes a one-time 24-hour code @{username} can use on the login screen to set a new passcode. Any older code stops working.</p>
          {err && <p role="alert" className="text-sm text-bad">{err}</p>}
          <Btn kind="primary" icon={KeyRound} className="w-full" disabled={busy} onClick={make}>Create code</Btn>
        </div>
      )}
    </Sheet>
  );
}

function SuspendSheet({ open, onClose, userId, name, suspended, onDone }: { open: boolean; onClose: () => void; userId: string; name: string; suspended: boolean; onDone: (msg: string) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await ax("POST", `/admin/users/${encodeURIComponent(userId)}/suspend`, { suspended: !suspended }); onDone(suspended ? `${name} can log in again.` : `${name} is suspended.`); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title={suspended ? `Unsuspend ${name}?` : `Suspend ${name}?`} icon={suspended ? UserCheck : Ban}>
      <p className="text-sm text-mute">{suspended ? "They can log in and use the app again. Their data was kept." : "They are logged out everywhere and can't log in until you unsuspend them. Their data stays; their open invites close."}</p>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <div className="mt-4 flex gap-2"><Btn className="flex-1" onClick={onClose}>Cancel</Btn><Btn className="flex-1" kind={suspended ? "primary" : "danger"} disabled={busy} onClick={go}>{suspended ? "Unsuspend" : "Suspend"}</Btn></div>
    </Sheet>
  );
}

function DeleteSheet({ open, onClose, userId, username, onDone }: { open: boolean; onClose: () => void; userId: string; username: string; onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ok = typed.trim().toLowerCase().replace(/^@/, "") === username;
  const go = async () => {
    setBusy(true); setErr(null);
    try { await ax("DELETE", `/admin/users/${encodeURIComponent(userId)}`, { confirm: typed }); setTyped(""); onDone(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Delete account" icon={Trash2}>
      <p className="text-sm text-mute">This permanently deletes <b className="text-ink">@{username}</b> and everything of theirs: workouts, sets, photos, posts, comments, likes, messages, DMs, friends, invites, devices. It can't be undone. Export first if they asked for their data.</p>
      <label className="mt-4 block text-sm">
        Type <b>{username}</b> to confirm
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false}
          className="mt-1.5 min-h-12 w-full rounded-xl bg-card2 px-3 outline-none focus:ring-2 focus:ring-bad" />
      </label>
      {err && <p role="alert" className="mt-2 text-sm text-bad">{err}</p>}
      <div className="mt-4 flex gap-2"><Btn className="flex-1" onClick={onClose}>Cancel</Btn><Btn className="flex-1" kind="danger" icon={Trash2} disabled={!ok || busy} onClick={go}>Delete forever</Btn></div>
    </Sheet>
  );
}
