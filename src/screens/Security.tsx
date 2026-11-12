import { useCallback, useEffect, useState } from "react";
import {
  Check, Copy, KeyRound, Link2, Loader2, LockKeyhole, LogOut, MonitorSmartphone, Plus, Share2, ShieldCheck, Ticket, Trash2, Unlink, UserCog,
} from "lucide-react";
import { send } from "../lib/api";
import { forgetPhotos, setMe } from "../lib/me";
import { cx } from "../lib/util";
import { Badge, Btn, Card, Chips, PageHead, Sheet } from "../components/ui";
import ConnectAI from "../components/connect/ConnectAI";
import { call, Field, GoogleG, joinLink, mmss, Notice, PasscodeInput, prettyCode, takeAuthParams, useCountdown } from "../components/auth/kit";

type Account = {
  dev: boolean; username: string; name: string | null; role: string; hasPasscode: boolean;
  google: { available: boolean; linked: boolean; email: string | null }; lastLogin: number | null; previousLogin: number | null; createdAt: number;
};
type Invite = { code: string; uses: number; maxUses: number; expiresAt: number | null; createdAt: number; active: boolean };
type Member = { id: string; username: string; name: string | null; role: string; me: boolean; hasPasscode: boolean; google: boolean; resetPending: boolean };

const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const daysLeft = (ms: number | null) => (ms == null ? null : Math.max(0, Math.ceil((ms - Date.now()) / 86_400_000)));

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
async function share(text: string, url?: string) {
  if (navigator.share) {
    try { await navigator.share({ title: "Iron Log", text, url }); return true; } catch { return false; }
  }
  return copy(url ? `${text} ${url}` : text);
}

/** Account & security: sign-in methods (passcode, Google), invites for friends, owner tools, devices. */
export default function Security() {
  const [acc, setAcc] = useState<Account | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "ok" | "bad"; t: string } | null>(() => {
    const p = takeAuthParams();
    return p.error ? { tone: "bad", t: p.error } : p.ok === "linked" ? { tone: "ok", t: "Google is linked. You can now sign in with Google." } : p.ok === "welcome" ? { tone: "ok", t: "Welcome! Set a passcode below so you can also log in without Google." } : null;
  });
  const load = useCallback(() => {
    call<Account>("GET", "/account").then((r) => (r.ok ? setAcc(r.data) : setLoadErr(r.data.error ?? "Couldn't load your account")));
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <PageHead icon={LockKeyhole} title="Account & security" sub="How you log in, invites for friends, and your devices." />
      <div aria-live="polite" className="mb-3">{flash && <Notice tone={flash.tone}>{flash.t}</Notice>}</div>
      {loadErr && <Notice tone="bad">{loadErr}</Notice>}
      {!acc && !loadErr && <div className="flex justify-center py-10 text-mute"><Loader2 className="animate-spin" aria-label="Loading" /></div>}
      {acc && (
        <div className="flex flex-col gap-3">
          {acc.dev && <Notice tone="info">DEV mode: test users log in with the DEV passcode, so passcode and Google settings are off here. Invites work (DEV database only).</Notice>}
          {!acc.dev && <SignIn acc={acc} reload={load} onFlash={setFlash} />}
          <Invites />
          <ConnectAI dev={acc.dev} />
          {acc.role === "owner" && <OwnerTools dev={acc.dev} />}
          <Devices acc={acc} onFlash={setFlash} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- sign-in methods

function Row({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 py-2">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="truncate text-xs text-mute">{sub}</div>
      </div>
      {children}
    </div>
  );
}

function SignIn({ acc, reload, onFlash }: { acc: Account; reload: () => void; onFlash: (f: { tone: "ok" | "bad"; t: string }) => void }) {
  const [pass, setPass] = useState(false);
  const [unlink, setUnlink] = useState(false);
  const [busy, setBusy] = useState(false);
  async function doUnlink() {
    setBusy(true);
    const r = await call("DELETE", "/account/google");
    setBusy(false);
    setUnlink(false);
    onFlash(r.ok ? { tone: "ok", t: "Google unlinked." } : { tone: "bad", t: r.data.error ?? "Couldn't unlink" });
    reload();
  }
  return (
    <Card title="Sign-in methods" icon={ShieldCheck}>
      <div className="divide-y divide-line/60">
        <Row icon={<KeyRound size={18} className="text-mute" />} title="Passcode" sub={acc.hasPasscode ? `@${acc.username} + your 6-12 digit passcode` : "Not set: you can only sign in with Google"}>
          <Btn kind={acc.hasPasscode ? "ghost" : "primary"} onClick={() => setPass(true)}>{acc.hasPasscode ? "Change" : "Set"}</Btn>
        </Row>
        <Row icon={<GoogleG size={18} />} title="Google" sub={acc.google.linked ? acc.google.email ?? "Linked" : acc.google.available ? "Not linked" : "Not set up on this server"}>
          {acc.google.linked ? (
            <Btn kind="ghost" icon={Unlink} onClick={() => setUnlink(true)} label="Unlink Google">Unlink</Btn>
          ) : acc.google.available ? (
            <a href="/api/auth/google/start?mode=link" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-card2"><Link2 size={16} aria-hidden /> Link</a>
          ) : null}
        </Row>
      </div>
      <PasscodeSheet open={pass} hasPasscode={acc.hasPasscode} onClose={() => setPass(false)} onDone={() => { setPass(false); onFlash({ tone: "ok", t: acc.hasPasscode ? "Passcode changed. Other devices need to log in again." : "Passcode set. You can now log in with it too." }); reload(); }} />
      <Sheet open={unlink} onClose={() => setUnlink(false)} title="Unlink Google?" icon={Unlink}>
        {acc.hasPasscode ? (
          <>
            <p className="text-sm text-mute">You'll log in with <b className="text-ink">@{acc.username}</b> + your passcode. You can link Google again any time.</p>
            <Btn kind="danger" className="mt-4 w-full" icon={busy ? Loader2 : Unlink} disabled={busy} onClick={doUnlink}>Unlink Google</Btn>
          </>
        ) : (
          <>
            <p className="text-sm text-mute">Google is your only way to log in. Set a passcode first, then you can unlink.</p>
            <Btn kind="primary" className="mt-4 w-full" onClick={() => { setUnlink(false); setPass(true); }}>Set a passcode</Btn>
          </>
        )}
      </Sheet>
    </Card>
  );
}

function PasscodeSheet({ open, hasPasscode, onClose, onDone }: { open: boolean; hasPasscode: boolean; onClose: () => void; onDone: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState<{ f?: string; m: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useCountdown();
  useEffect(() => { if (!open) { setCur(""); setNext(""); setErr(null); } }, [open]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6,12}$/.test(next)) { setErr({ f: "next", m: "New passcode: 6-12 digits" }); return; }
    if (hasPasscode && next === cur) { setErr({ f: "next", m: "That's the same as your current passcode" }); return; }
    setBusy(true); setErr(null);
    const r = await call("POST", "/account/passcode", { current: cur, next });
    setBusy(false);
    if (r.ok) { onDone(); return; }
    if (r.status === 429 && r.data.retryAfter) lock.start(r.data.retryAfter);
    setErr({ f: r.data.field, m: r.data.error ?? "Couldn't save" });
    if (r.data.field === "current") setCur("");
  }
  return (
    <Sheet open={open} onClose={onClose} title={hasPasscode ? "Change passcode" : "Set a passcode"} icon={KeyRound}>
      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        {/* hidden username helps password managers save the right entry */}
        <input type="text" autoComplete="username" value="" readOnly hidden />
        {hasPasscode && (
          <Field label="Current passcode" error={err?.f === "current" ? err.m : undefined}>
            {(p) => <PasscodeInput {...p} autoFocus autoComplete="current-password" value={cur} onChange={setCur} />}
          </Field>
        )}
        <Field label="New passcode" hint="6-12 digits. Other devices will be logged out." error={err?.f === "next" ? err.m : undefined}>
          {(p) => <PasscodeInput {...p} autoFocus={!hasPasscode} autoComplete="new-password" value={next} onChange={setNext} />}
        </Field>
        <div aria-live="polite">{err && !err.f && <Notice tone="bad">{err.m}{lock.left > 0 && <> Try again in <b className="num">{mmss(lock.left)}</b>.</>}</Notice>}</div>
        <Btn kind="primary" type="submit" icon={busy ? Loader2 : undefined} disabled={busy || lock.left > 0 || (hasPasscode && !cur) || !next}>{busy ? "Saving…" : "Save passcode"}</Btn>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------- invites

function Invites() {
  const [list, setList] = useState<Invite[] | null>(null);
  const [uses, setUses] = useState<number | null>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const load = useCallback(() => { call<{ invites: Invite[] }>("GET", "/invites").then((r) => r.ok && setList(r.data.invites)); }, []);
  useEffect(load, [load]);

  async function create() {
    setBusy(true); setErr(null);
    const r = await call<Invite>("POST", "/invites", { maxUses: uses ?? 1 });
    setBusy(false);
    if (!r.ok) { setErr(r.data.error ?? "Couldn't create"); return; }
    setFresh(r.data.code);
    load();
  }
  async function revoke(code: string) {
    await call("DELETE", `/invites/${code}`);
    if (fresh === code) setFresh(null);
    load();
  }
  const msg = (code: string) => `Join me on Iron Log (invite code ${prettyCode(code)}):`;
  async function doCopy(code: string) { if (await copy(joinLink(code))) { setCopied(code); setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000); } }

  const active = list?.filter((i) => i.active) ?? [];
  const old = list?.filter((i) => !i.active) ?? [];
  return (
    <Card title="Invite friends" icon={Ticket}>
      <p className="text-sm text-mute">Iron Log is invite-only. Each invite works for 7 days.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-mute" id="uses-lbl">Can be used by</span>
        <div role="group" aria-labelledby="uses-lbl">
          <Chips small clearable={false} value={uses} onChange={setUses} options={[1, 3, 5].map((n) => ({ id: n, label: n === 1 ? "1 person" : `${n} people` }))} />
        </div>
      </div>
      <Btn kind="soft" icon={busy ? Loader2 : Plus} className="mt-3 w-full" disabled={busy} onClick={create}>New invite</Btn>
      <div aria-live="polite">{err && <div className="mt-2"><Notice tone="bad">{err}</Notice></div>}</div>

      {fresh && (
        <div className="mt-3 rounded-2xl border border-acc/40 bg-acc/5 p-4 text-center">
          <div className="text-xs text-mute">Invite code</div>
          <div className="my-1 text-3xl font-bold tracking-[.18em] text-acc num">{prettyCode(fresh)}</div>
          <div className="break-all text-xs text-faint">{joinLink(fresh)}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn kind="primary" icon={Share2} onClick={() => share(msg(fresh), joinLink(fresh))}>Share</Btn>
            <Btn kind="ghost" icon={copied === fresh ? Check : Copy} onClick={() => doCopy(fresh)}>{copied === fresh ? "Copied" : "Copy link"}</Btn>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <ul className="mt-3 divide-y divide-line/60" aria-label="Open invites">
          {active.map((i) => (
            <li key={i.code} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold tracking-wider num">{prettyCode(i.code)}</div>
                <div className="text-xs text-mute num">{i.uses}/{i.maxUses} used · {daysLeft(i.expiresAt) === 0 ? "expires today" : `${daysLeft(i.expiresAt)} days left`}</div>
              </div>
              <IconBtn label={`Share invite ${prettyCode(i.code)}`} onClick={() => share(msg(i.code), joinLink(i.code))}><Share2 size={18} /></IconBtn>
              <IconBtn label={copied === i.code ? "Copied" : `Copy link for ${prettyCode(i.code)}`} onClick={() => doCopy(i.code)}>{copied === i.code ? <Check size={18} className="text-acc" /> : <Copy size={18} />}</IconBtn>
              <IconBtn label={`Revoke invite ${prettyCode(i.code)}`} onClick={() => revoke(i.code)} danger><Trash2 size={18} /></IconBtn>
            </li>
          ))}
        </ul>
      )}
      {old.length > 0 && (
        <details className="mt-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs text-mute">Used or expired ({old.length})</summary>
          <ul className="divide-y divide-line/60">
            {old.map((i) => (
              <li key={i.code} className="flex items-center gap-2 py-1.5 text-sm text-mute">
                <span className="flex-1 num">{prettyCode(i.code)} · {i.uses}/{i.maxUses} used</span>
                <Badge>{i.uses >= i.maxUses ? "used up" : "expired"}</Badge>
                <IconBtn label={`Remove invite ${prettyCode(i.code)}`} onClick={() => revoke(i.code)}><Trash2 size={16} /></IconBtn>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", danger ? "text-bad hover:bg-bad/10" : "text-mute hover:bg-card2 hover:text-ink")}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- owner: passcode reset codes

function OwnerTools({ dev }: { dev: boolean }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [made, setMade] = useState<{ code: string; username: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => { call<{ members: Member[] }>("GET", "/account/members").then((r) => r.ok && setMembers(r.data.members)); }, []);
  useEffect(load, [load]);
  async function make(m: Member) {
    setBusy(m.id); setErr(null);
    const r = await call<{ code: string; username: string; expiresAt: number }>("POST", "/account/reset-code", { userId: m.id });
    setBusy(null);
    if (!r.ok) { setErr(r.data.error ?? "Couldn't make a code"); return; }
    setMade(r.data); setCopied(false);
    load();
  }
  const others = members?.filter((m) => !m.me) ?? [];
  const text = made ? `Your Iron Log reset code: ${prettyCode(made.code)} (valid 24 h). Open Iron Log → Forgot passcode? → I have a reset code. Username: @${made.username}` : "";
  return (
    <Card title="Members (owner)" icon={UserCog}>
      <p className="text-sm text-mute">Someone forgot their passcode? Make a one-time reset code and send it to them privately. Only the newest code works, for 24 hours.</p>
      {dev && <p className="mt-2 text-xs text-warn">Reset codes are off in DEV mode.</p>}
      <div aria-live="polite">{err && <div className="mt-2"><Notice tone="bad">{err}</Notice></div>}</div>
      {members && others.length === 0 && <p className="mt-3 text-sm text-faint">No one else yet. Send an invite above.</p>}
      <ul className="mt-2 divide-y divide-line/60">
        {others.map((m) => (
          <li key={m.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{m.name || `@${m.username}`}</div>
              <div className="flex flex-wrap items-center gap-1 text-xs text-mute">
                @{m.username}
                {m.role === "owner" && <Badge tone="acc">owner</Badge>}
                {m.google && <Badge tone="info">Google</Badge>}
                {!m.hasPasscode && <Badge tone="warn">no passcode</Badge>}
                {m.resetPending && <Badge tone="warn">reset code open</Badge>}
              </div>
            </div>
            {m.role !== "owner" && !dev && (
              <Btn kind="ghost" icon={busy === m.id ? Loader2 : KeyRound} disabled={!!busy} onClick={() => make(m)} label={`Make a reset code for @${m.username}`}>Reset</Btn>
            )}
          </li>
        ))}
      </ul>
      <Sheet open={!!made} onClose={() => setMade(null)} title={made ? `Reset code for @${made.username}` : ""} icon={KeyRound}>
        {made && (
          <div className="text-center">
            <div className="my-2 text-4xl font-bold tracking-[.18em] text-acc num">{prettyCode(made.code)}</div>
            <p className="text-sm text-mute">Shown only now. Valid until {when(made.expiresAt)}. They open Iron Log → <b className="text-ink">Forgot passcode?</b> → <b className="text-ink">I have a reset code</b>.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Btn kind="primary" icon={Share2} onClick={() => share(text)}>Send</Btn>
              <Btn kind="ghost" icon={copied ? Check : Copy} onClick={async () => setCopied(await copy(text))}>{copied ? "Copied" : "Copy"}</Btn>
            </div>
          </div>
        )}
      </Sheet>
    </Card>
  );
}

// ---------------------------------------------------------------- devices

function Devices({ acc, onFlash }: { acc: Account; onFlash: (f: { tone: "ok" | "bad"; t: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useCountdown();
  async function others(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await call("POST", "/account/logout-others", { current: cur });
    setBusy(false);
    if (r.ok) { setOpen(false); setCur(""); onFlash({ tone: "ok", t: "Done. Every other phone and browser is logged out. This one stays in." }); return; }
    if (r.status === 429 && r.data.retryAfter) lock.start(r.data.retryAfter);
    setErr(r.data.error ?? "Couldn't do that"); setCur("");
  }
  async function logout() {
    await send("POST", "/logout").catch(() => {});
    forgetPhotos();
    setMe(null);
    location.hash = "#/";
    location.reload();
  }
  return (
    <Card title="Devices" icon={MonitorSmartphone}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-mute">Last sign-in</dt><dd className="num">{when(acc.lastLogin)}</dd>
        <dt className="text-mute">Before that</dt><dd className="num">{when(acc.previousLogin)}</dd>
      </dl>
      <p className="mt-2 text-xs text-faint">Don't recognise a sign-in? Change your passcode, or log out everywhere else.</p>
      <div className="mt-3 flex flex-col gap-2">
        {!acc.dev && <Btn kind="ghost" icon={ShieldCheck} onClick={() => setOpen(true)}>Log out everywhere else</Btn>}
        <Btn kind="danger" icon={LogOut} onClick={logout}>Log out this device</Btn>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Log out everywhere else" icon={ShieldCheck}>
        <form onSubmit={others} noValidate className="flex flex-col gap-4">
          <p className="text-sm text-mute">Every other phone and browser will need to log in again. Your data isn't touched.</p>
          {acc.hasPasscode && (
            <Field label="Your passcode" error={err ?? undefined}>
              {(p) => <PasscodeInput {...p} autoFocus autoComplete="current-password" value={cur} onChange={setCur} />}
            </Field>
          )}
          {!acc.hasPasscode && err && <Notice tone="bad">{err}</Notice>}
          {lock.left > 0 && <p className="text-xs text-bad" role="status">Try again in <span className="num">{mmss(lock.left)}</span></p>}
          <Btn kind="primary" type="submit" icon={busy ? Loader2 : undefined} disabled={busy || lock.left > 0 || (acc.hasPasscode && !cur)}>{busy ? "Working…" : "Log out other devices"}</Btn>
        </form>
      </Sheet>
    </Card>
  );
}
