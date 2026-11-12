import { useEffect, useRef, useState } from "react";
import { ArrowLeft, AtSign, Check, KeyRound, Loader2, LifeBuoy, Ticket, UserRound } from "lucide-react";
import { send } from "../lib/api";
import { Btn } from "../components/ui";
import { call, Field, GoogleButton, mmss, Notice, OrLine, PasscodeInput, prettyCode, takeAuthParams, useCountdown } from "../components/auth/kit";

const LAST = "il:lastUser";
const remember = (u: string) => { try { if (u && u !== "dev") localStorage.setItem(LAST, u); } catch { /* private mode */ } };
const norm = (s: string) => s.trim().toLowerCase().replace(/^@/, "");
const validUser = (u: string) => /^[a-z0-9._]{3,30}$/.test(u) && !/^[.]|[.]$|\.\./.test(u);

/** Set once the person moves between views: from then on the new view's heading takes focus. */
let moved = false;

type View = { v: "login" } | { v: "join"; code: string } | { v: "forgot" } | { v: "reset" };

/** #/join/<code> → the Join screen with the invite filled in (works whatever the router does, the app is logged out here). */
function viewFromHash(): View {
  const m = /^#\/join\/?([^?]*)/.exec(location.hash);
  if (m) return { v: "join", code: decodeURIComponent(m[1] ?? "") };
  return { v: "login" };
}

/**
 * Logged-out entry: Log in · Join with an invite · Forgot passcode → reset code. One primary action per view,
 * labels always visible, username kept on errors, passcode show/hide, numeric keypad, lockout countdown, Google if set up.
 */
export default function Login({ onIn }: { onIn: () => void }) {
  const [view, setView] = useState<View>(viewFromHash);
  const [google, setGoogle] = useState(false);
  const [flash] = useState(takeAuthParams);
  useEffect(() => {
    call<{ google?: boolean }>("GET", "/auth/providers").then((r) => setGoogle(!!r.data.google));
    const f = () => setView(viewFromHash());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const go = (v: View) => {
    moved = true;
    if (v.v === "join") history.replaceState(null, "", `#/join/${v.code}`);
    else if (location.hash.startsWith("#/join")) history.replaceState(null, "", "#/");
    setView(v);
  };
  const done = (u?: string) => { if (u) remember(u); onIn(); location.reload(); }; // reload = re-detect real vs DEV mode

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      {view.v === "login" && <LogIn google={google} flash={flash.error} onJoin={() => go({ v: "join", code: "" })} onForgot={() => go({ v: "forgot" })} done={done} />}
      {view.v === "join" && <Join google={google} initial={view.code} onBack={() => go({ v: "login" })} done={done} />}
      {view.v === "forgot" && <Forgot google={google} onBack={() => go({ v: "login" })} onReset={() => go({ v: "reset" })} />}
      {view.v === "reset" && <Reset onBack={() => go({ v: "forgot" })} done={done} />}
    </main>
  );
}

/** Heading that takes focus when the view changes (screen readers announce the new step). */
function Title({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (moved) h.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="mb-6">
      <h1 ref={h} tabIndex={-1} className="text-2xl font-bold outline-none">{children}</h1>
      {sub && <p className="mt-1.5 text-sm text-mute">{sub}</p>}
    </div>
  );
}

function Back({ onClick, label = "Back to log in" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="-ml-3 mb-4 inline-flex min-h-11 items-center gap-1.5 self-start rounded-xl px-3 text-sm text-mute hover:text-ink">
      <ArrowLeft size={18} aria-hidden /> {label}
    </button>
  );
}

// ---------------------------------------------------------------- log in

function LogIn({ google, flash, onJoin, onForgot, done }: { google: boolean; flash: string | null; onJoin: () => void; onForgot: () => void; done: (u: string) => void }) {
  const [user, setUser] = useState(() => { try { return localStorage.getItem(LAST) ?? ""; } catch { return ""; } });
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(flash);
  const [busy, setBusy] = useState(false);
  const lock = useCountdown();
  const pass = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || lock.left) return;
    const u = norm(user);
    if (!code) { setErr("Enter your passcode"); pass.current?.focus(); return; }
    setBusy(true);
    setErr(null);
    const r = await call<{ setup?: boolean }>("POST", "/login", { username: u, passcode: code });
    if (r.ok) { done(u); return; }
    setBusy(false);
    setCode(""); // keep the username, clear only the secret
    if (r.status === 429 && r.data.retryAfter) {
      lock.start(r.data.retryAfter);
      setErr("Too many wrong tries. For your safety, logging in is paused for a moment.");
    } else setErr(r.data.error ?? "Couldn't log in. Try again.");
    pass.current?.focus();
  }

  return (
    <>
      <h1 className="mb-8 mt-2"><img src="/brand/logo.svg" alt="Iron Log" width={896} height={300} className="mx-auto h-auto w-full max-w-[260px]" /></h1>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-describedby={err ? "login-err" : undefined}>
        <Field label="Username" icon={AtSign}>
          {(p) => (
            <input {...p} name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus={!user}
              value={user} onChange={(e) => setUser(e.target.value.replace(/\s/g, ""))} placeholder="your username" />
          )}
        </Field>
        <Field label="Passcode" icon={KeyRound}>
          {(p) => <PasscodeInput {...p} ref={pass} name="password" autoComplete="current-password" autoFocus={!!user} value={code} onChange={setCode} placeholder="6-12 digits" />}
        </Field>
        <div aria-live="polite">
          {err && <Notice tone="bad" id="login-err">{err}{lock.left > 0 && <> Try again in <b className="num">{mmss(lock.left)}</b>.</>}</Notice>}
        </div>
        <Btn kind="primary" type="submit" icon={busy ? Loader2 : undefined} disabled={busy || lock.left > 0} className="min-h-14 text-base">
          {busy ? "Logging in…" : lock.left ? `Wait ${mmss(lock.left)}` : "Log in"}
        </Btn>
        <button type="button" onClick={onForgot} className="mx-auto -mt-1 min-h-11 rounded-xl px-3 text-sm font-medium text-info hover:underline">Forgot passcode?</button>
      </form>
      {google && (<><OrLine /><GoogleButton href="/api/auth/google/start?mode=login" /></>)}
      <p className="mt-8 text-center text-sm text-mute">
        New here?{" "}
        <button type="button" onClick={onJoin} className="min-h-11 rounded-xl px-1 font-semibold text-ink underline-offset-4 hover:underline">Join with an invite</button>
      </p>
      <details className="mx-auto mt-4 text-center text-[11px] text-faint">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center px-2">Test mode</summary>
        Username <b>dev</b>, <b>dev_omar</b> or <b>dev_sara</b> + the DEV passcode. Dummy data only.
      </details>
      <p className="mt-2 text-center text-[11px] text-faint">
        <a href="/privacy" className="inline-flex min-h-11 items-center px-2 underline-offset-4 hover:underline">Privacy</a> ·
        <a href="/terms" className="inline-flex min-h-11 items-center px-2 underline-offset-4 hover:underline">Terms</a>
      </p>
    </>
  );
}

// ---------------------------------------------------------------- join with an invite

type InviteCheck = { state: "idle" | "checking" | "ok" | "bad"; inviter?: string | null; dev?: boolean; msg?: string };

function Join({ google, initial, onBack, done }: { google: boolean; initial: string; onBack: () => void; done: (u: string) => void }) {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const [invite, setInvite] = useState(() => clean(initial));
  const [inv, setInv] = useState<InviteCheck>({ state: "idle" });
  const [name, setName] = useState("");
  const [user, setUser] = useState("");
  const [code, setCode] = useState("");
  const [avail, setAvail] = useState<{ u: string; ok: boolean } | null>(null);
  const [errs, setErrs] = useState<{ invite?: string; username?: string; passcode?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const lock = useCountdown();
  const u = norm(user);

  // check the invite as soon as it has 8 characters
  useEffect(() => {
    if (invite.length !== 8) { setInv({ state: "idle" }); return; }
    let live = true;
    setInv({ state: "checking" });
    call<{ valid?: boolean; inviter?: string | null; dev?: boolean; reason?: string }>("GET", `/public/invite/${invite}`).then((r) => {
      if (!live) return;
      if (r.status === 429) { setInv({ state: "bad", msg: r.data.error }); return; }
      if (r.data.valid) setInv({ state: "ok", inviter: r.data.inviter, dev: r.data.dev });
      else setInv({ state: "bad", msg: r.data.reason === "used" ? "This invite has been used up. Ask for a new one." : r.data.reason === "expired" ? "This invite has expired. Ask for a new one." : "That code doesn't match any invite. Check the letters." });
    });
    return () => { live = false; };
  }, [invite]);

  // username availability (debounced, only for a valid invite)
  useEffect(() => {
    setAvail(null);
    if (inv.state !== "ok" || !validUser(u)) return;
    const t = setTimeout(() => {
      call<{ available?: boolean }>("GET", `/public/username?u=${encodeURIComponent(u)}&invite=${invite}`).then((r) => { if (r.ok) setAvail({ u, ok: !!r.data.available }); });
    }, 400);
    return () => clearTimeout(t);
  }, [u, inv.state, invite]);

  const userErr = errs.username ?? (user && !validUser(u) ? "3-30 characters: a-z, 0-9, . or _" : avail && avail.u === u && !avail.ok ? `@${u} is taken` : undefined);
  const needPass = !inv.dev;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || lock.left) return;
    const next: typeof errs = {};
    if (inv.state !== "ok") next.invite = inv.msg ?? "Enter the 8-character code from your invite";
    if (!validUser(u)) next.username = "Pick a username: 3-30 characters: a-z, 0-9, . or _";
    if (needPass && !/^\d{6,12}$/.test(code)) next.passcode = "Choose a passcode of 6-12 digits";
    setErrs(next);
    if (Object.keys(next).length) { document.getElementById(`join-${Object.keys(next)[0]}`)?.focus(); return; }
    setBusy(true);
    const r = await call("POST", "/signup", { invite, username: u, passcode: code, name });
    if (r.ok) { done(u); return; }
    setBusy(false);
    if (r.status === 429 && r.data.retryAfter) { lock.start(r.data.retryAfter); setErrs({ form: r.data.error }); return; }
    const f = r.data.field as keyof typeof errs | undefined;
    setErrs(f && ["invite", "username", "passcode"].includes(f) ? { [f]: r.data.error } : { form: r.data.error ?? "Couldn't create the account" });
    if (f) document.getElementById(`join-${f}`)?.focus();
  }

  return (
    <>
      <Back onClick={onBack} />
      <Title sub="Iron Log is invite-only. Ask a friend who uses it for an invite link or code.">Join Iron Log</Title>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field id="join-invite" label="Invite code" icon={Ticket} error={errs.invite ?? (inv.state === "bad" ? inv.msg : undefined)}
          hint={inv.state === "ok" ? <span className="inline-flex items-center gap-1 text-acc"><Check size={14} aria-hidden /> Invite from {inv.inviter ?? "a friend"}{inv.dev ? " (DEV)" : ""}</span> : inv.state === "checking" ? "Checking…" : "8 letters and numbers, e.g. ABCD-EFGH"}>
          {(p) => (
            <input {...p} autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus={!initial}
              value={prettyCode(invite)} onChange={(e) => { setInvite(clean(e.target.value)); setErrs((x) => ({ ...x, invite: undefined })); }}
              className={`${p.className} uppercase tracking-[.2em]`} placeholder="ABCD-EFGH" />
          )}
        </Field>
        <Field label="Your name" icon={UserRound} hint="Shown to your friends. Optional.">
          {(p) => <input {...p} autoComplete="name" autoFocus={!!initial} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Omar" />}
        </Field>
        <Field id="join-username" label="Username" icon={AtSign} error={userErr}
          hint={inv.dev ? "DEV invite: must start with dev_" : avail?.u === u && avail.ok ? <span className="text-acc">@{u} is free</span> : "Friends find you by it. a-z, 0-9, . and _"}>
          {(p) => (
            <input {...p} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={31}
              value={user} onChange={(e) => { setUser(e.target.value.toLowerCase().replace(/\s/g, "")); setErrs((x) => ({ ...x, username: undefined })); }} placeholder="username" />
          )}
        </Field>
        {needPass && (
          <Field id="join-passcode" label="Passcode" icon={KeyRound} error={errs.passcode} hint="6-12 digits. You'll type it to log in, so pick one you remember.">
            {(p) => <PasscodeInput {...p} autoComplete="new-password" value={code} onChange={(v) => { setCode(v); setErrs((x) => ({ ...x, passcode: undefined })); }} />}
          </Field>
        )}
        <div aria-live="polite">{errs.form && <Notice tone="bad">{errs.form}{lock.left > 0 && <> Try again in <b className="num">{mmss(lock.left)}</b>.</>}</Notice>}</div>
        <Btn kind="primary" type="submit" icon={busy ? Loader2 : undefined} disabled={busy || lock.left > 0} className="min-h-14 text-base">
          {busy ? "Creating your account…" : "Create account"}
        </Btn>
      </form>
      {google && inv.state === "ok" && !inv.dev && (
        <>
          <OrLine />
          <GoogleButton href={`/api/auth/google/start?mode=signup&invite=${invite}`}>Sign up with Google</GoogleButton>
          <p className="mt-2 text-center text-xs text-faint">We make your username from your Gmail name. You can set a passcode later.</p>
        </>
      )}
      <p className="mt-8 text-center text-sm text-mute">
        Already have an account?{" "}
        <button type="button" onClick={onBack} className="min-h-11 rounded-xl px-1 font-semibold text-ink underline-offset-4 hover:underline">Log in</button>
      </p>
    </>
  );
}

// ---------------------------------------------------------------- forgot passcode

function Forgot({ google, onBack, onReset }: { google: boolean; onBack: () => void; onReset: () => void }) {
  return (
    <>
      <Back onClick={onBack} />
      <Title sub="Passcodes are never stored or sent anywhere, so nobody can tell you yours. Here's how to get back in.">Forgot your passcode?</Title>
      <ol className="flex flex-col gap-3">
        {google && (
          <li className="rounded-2xl bg-card p-4">
            <h2 className="font-semibold">Linked Google before?</h2>
            <p className="mb-3 mt-1 text-sm text-mute">Sign in with Google, then set a new passcode in Account &amp; security.</p>
            <GoogleButton href="/api/auth/google/start?mode=login" />
          </li>
        )}
        <li className="rounded-2xl bg-card p-4">
          <h2 className="flex items-center gap-2 font-semibold"><LifeBuoy size={18} className="text-info" aria-hidden /> Ask for a reset code</h2>
          <p className="mb-3 mt-1 text-sm text-mute">Message the person who runs Iron Log. They can make a one-time code (valid 24 h) for your username.</p>
          <Btn kind="soft" className="w-full" onClick={onReset}>I have a reset code</Btn>
        </li>
      </ol>
      <p className="mt-6 text-center text-xs text-faint">Your workouts are safe: resetting the passcode never touches your data.</p>
    </>
  );
}

function Reset({ onBack, done }: { onBack: () => void; done: (u: string) => void }) {
  const [user, setUser] = useState(() => { try { return localStorage.getItem(LAST) ?? ""; } catch { return ""; } });
  const [rc, setRc] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<{ f?: string; m: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useCountdown();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || lock.left) return;
    if (!/^\d{6,12}$/.test(code)) { setErr({ f: "passcode", m: "New passcode: 6-12 digits" }); return; }
    setBusy(true); setErr(null);
    const u = norm(user);
    const r = await call("POST", "/auth/reset", { username: u, code: rc, passcode: code });
    if (r.ok) { done(u); return; }
    setBusy(false);
    if (r.status === 429 && r.data.retryAfter) lock.start(r.data.retryAfter);
    setErr({ f: r.data.field, m: r.data.error ?? "Couldn't reset" });
  }
  return (
    <>
      <Back onClick={onBack} label="Back" />
      <Title sub="Enter your username, the code you were given, and a new passcode.">Reset passcode</Title>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Username" icon={AtSign}>
          {(p) => <input {...p} autoComplete="username" autoCapitalize="none" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value.replace(/\s/g, ""))} />}
        </Field>
        <Field label="Reset code" icon={Ticket}>
          {(p) => <input {...p} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} value={prettyCode(rc)} onChange={(e) => setRc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} className={`${p.className} uppercase tracking-[.2em]`} placeholder="ABCD-EFGH" />}
        </Field>
        <Field label="New passcode" icon={KeyRound} error={err?.f === "passcode" ? err.m : undefined} hint="6-12 digits">
          {(p) => <PasscodeInput {...p} autoComplete="new-password" value={code} onChange={setCode} />}
        </Field>
        <div aria-live="polite">{err && err.f !== "passcode" && <Notice tone="bad">{err.m}{lock.left > 0 && <> Try again in <b className="num">{mmss(lock.left)}</b>.</>}</Notice>}</div>
        <Btn kind="primary" type="submit" icon={busy ? Loader2 : undefined} disabled={busy || lock.left > 0 || !user || rc.length !== 8} className="min-h-14 text-base">
          {busy ? "Saving…" : "Set new passcode & log in"}
        </Btn>
      </form>
    </>
  );
}

/** One-time, right after the update: pick the username + passcode you'll log in with from now on. */
export function Setup() {
  const [user, setUser] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const u = user.trim().toLowerCase().replace(/^@/, "");
  const ok = /^[a-z0-9._]{3,30}$/.test(u) && /^\d{6,12}$/.test(code) && code === again;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true); setErr("");
    try {
      await send("POST", "/setup", { username: u, passcode: code, name });
      try { localStorage.setItem(LAST, u); } catch { /* private mode */ }
      location.reload();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field = "min-h-12 w-full rounded-xl bg-card2 px-4 outline-none focus:ring-2 focus:ring-acc";
  return (
    <main className="mx-auto flex min-h-dvh max-w-xs flex-col justify-center px-4">
      <img src="/icon.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
      <h1 className="text-center text-xl font-bold">Create your login</h1>
      <p className="mb-5 mt-1 text-center text-sm text-mute">From now on you log in with a username + passcode. Your data stays exactly as it is.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="block text-[11px] text-mute">Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} className={`${field} mt-1 text-ink`} />
        </label>
        <label className="block text-[11px] text-mute">Username <span className="text-faint">· unique, friends will find you by it</span>
          <input value={user} onChange={(e) => setUser(e.target.value.toLowerCase().replace(/\s/g, ""))} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={31} className={`${field} mt-1 text-ink`} />
        </label>
        <label className="block text-[11px] text-mute">Passcode <span className="text-faint">· 6-12 digits</span>
          <input type="password" inputMode="numeric" autoComplete="new-password" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 12))} className={`${field} mt-1 tracking-widest text-ink`} />
        </label>
        <label className="block text-[11px] text-mute">Passcode again
          <input type="password" inputMode="numeric" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, "").slice(0, 12))} aria-invalid={!!again && again !== code} className={`${field} mt-1 tracking-widest text-ink`} />
        </label>
        {again && again !== code && <p className="text-xs text-bad">Passcodes don't match</p>}
        {err && <p role="alert" className="text-center text-sm text-bad">{err}</p>}
        <Btn kind="primary" type="submit" icon={busy ? Loader2 : undefined} disabled={!ok || busy}>{busy ? "Saving…" : "Create login"}</Btn>
      </form>
    </main>
  );
}
