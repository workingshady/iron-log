import { useState } from "react";
import { AtSign, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { send } from "../lib/api";
import { Btn } from "../components/ui";

const LAST = "il:lastUser";

/** Username + passcode. The last username is remembered on this device, so usually you only type the passcode. */
export default function Login({ onIn }: { onIn: () => void }) {
  const [user, setUser] = useState(() => { try { return localStorage.getItem(LAST) ?? ""; } catch { return ""; } });
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const u = user.trim().toLowerCase().replace(/^@/, "");
      await send("POST", "/login", { username: u, passcode: code });
      try { if (u && u !== "dev") localStorage.setItem(LAST, u); } catch { /* private mode */ }
      onIn();
      location.reload(); // re-detect real vs DEV mode before showing data
    } catch (e) {
      setErr((e as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  const field = "min-h-14 w-full rounded-xl bg-card2 pl-11 pr-4 text-lg outline-none focus:ring-2 focus:ring-acc";
  return (
    <main className="mx-auto flex min-h-dvh max-w-xs flex-col justify-center px-4">
      <h1 className="mb-6"><img src="/brand/logo.svg" alt="Iron Log" className="mx-auto w-full max-w-[280px]" /></h1>
      <form onSubmit={submit} className="flex flex-col gap-3" aria-describedby={err ? "login-err" : undefined}>
        <label className="relative block">
          <span className="sr-only">Username</span>
          <AtSign size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus={!user} value={user}
            onChange={(e) => setUser(e.target.value.replace(/\s/g, ""))} placeholder="username" className={field} />
        </label>
        <label className="relative block">
          <span className="sr-only">Passcode</span>
          <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
          <input name="password" type={show ? "text" : "password"} inputMode="numeric" autoComplete="current-password" autoFocus={!!user} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="passcode" className={`${field} pr-12 tracking-widest`} />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-mute" aria-label={show ? "Hide passcode" : "Show passcode"} aria-pressed={show}>
            {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        </label>
        {err && <p id="login-err" role="alert" className="text-center text-sm text-bad">{err}</p>}
        <Btn kind="primary" type="submit" icon={busy ? Loader2 : undefined} disabled={busy || !code || (!user && code.length < 6)}>
          {busy ? "Checking…" : "Log in"}
        </Btn>
      </form>
      <p className="mt-6 text-center text-[11px] text-faint">Test mode: username <b>dev</b> + the test passcode.</p>
    </main>
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
