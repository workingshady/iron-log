import { forwardRef, useEffect, useId, useState, type ReactNode } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cx } from "../../lib/util";

// Small building blocks shared by the Login / Join / Reset screens and the Security page.

/** fetch that keeps the status + JSON body (the app's send() only keeps the message). */
export async function call<T = Record<string, unknown>>(method: string, url: string, body?: unknown) {
  try {
    const r = await fetch(`/api${url}`, {
      method, credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await r.json().catch(() => ({}))) as T & { error?: string; field?: string; retryAfter?: number };
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "No connection. Check your internet and try again." } as T & { error?: string; field?: string; retryAfter?: number } };
  }
}

/** Messages for ?auth_error=<code> (the server only sends codes, so nobody can put their own text on our login screen). */
export const AUTH_ERRORS: Record<string, string> = {
  google_off: "Google sign-in isn't set up on this server yet.",
  google_dev: "Google sign-in doesn't work in DEV (test) mode.",
  login_first: "Log in first, then link Google from Account & security.",
  invite_invalid: "That invite isn't valid any more. Ask your friend for a new one.",
  state: "The Google sign-in took too long or was opened in another tab. Please try again.",
  cancelled: "Google sign-in was cancelled.",
  google_error: "Google couldn't sign you in. Please try again.",
  verify: "We couldn't verify your Google account. Please try again.",
  locked: "Too many tries from this network. Wait a few minutes.",
  google_taken: "That Google account is already linked to another Iron Log account.",
  no_account: "No Iron Log account uses this Google account yet. Log in with your passcode and link Google in Account & security, or join with an invite.",
  signup_failed: "Couldn't create your account. Please try again.",
};

/** Read and remove ?auth_error / ?auth from the URL (keeps the #route). */
export function takeAuthParams() {
  const q = new URLSearchParams(location.search);
  const err = q.get("auth_error");
  const ok = q.get("auth");
  if (err || ok) {
    q.delete("auth_error");
    q.delete("auth");
    const rest = q.toString();
    history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
  }
  return { error: err ? AUTH_ERRORS[err] ?? "Sign-in failed. Please try again." : null, ok };
}

/** Seconds left of a lockout, ticking down. */
export function useCountdown() {
  const [until, setUntil] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!until) return;
    const i = setInterval(() => { if (Date.now() >= until) setUntil(0); tick((n) => n + 1); }, 1000);
    return () => clearInterval(i);
  }, [until]);
  const left = until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0;
  return { left, start: (s: number) => setUntil(Date.now() + s * 1000) };
}
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export const FIELD = "min-h-14 w-full rounded-xl bg-card2 px-4 text-base text-ink outline-none placeholder:text-faint focus:ring-2 focus:ring-acc aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad/70";

/** Labelled field: visible label, optional hint, inline error linked with aria-describedby. */
export function Field({ id: given, label, hint, error, icon: Icon, children }: {
  id?: string; label: string; hint?: ReactNode; error?: string | null; icon?: LucideIcon;
  children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean; className: string }) => ReactNode;
}) {
  const auto = useId();
  const id = given ?? auto;
  const desc = [hint ? `${id}-h` : "", error ? `${id}-e` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-mute">{label}</label>
      <div className="relative">
        {Icon && <Icon size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" aria-hidden />}
        {children({ id, "aria-describedby": desc, "aria-invalid": error ? true : undefined, className: cx(FIELD, Icon && "pl-11") })}
      </div>
      {hint && !error && <p id={`${id}-h`} className="mt-1.5 text-xs text-faint">{hint}</p>}
      {error && <p id={`${id}-e`} className="mt-1.5 text-xs text-bad">{error}</p>}
    </div>
  );
}

/** Digits-only passcode input with a show/hide button (numeric keypad, password-manager friendly). */
export const PasscodeInput = forwardRef<HTMLInputElement, {
  id: string; value: string; onChange: (v: string) => void; autoComplete: "current-password" | "new-password" | "one-time-code";
  className: string; name?: string; autoFocus?: boolean; placeholder?: string; "aria-describedby"?: string; "aria-invalid"?: boolean;
}>(function PasscodeInput({ onChange, className, ...p }, ref) {
  const [show, setShow] = useState(false);
  return (
    <>
      <input
        ref={ref} {...p} type={show ? "text" : "password"} inputMode="numeric" pattern="[0-9]*" maxLength={12} spellCheck={false} autoCapitalize="none"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 12))}
        className={cx(className, "pr-14 tracking-[.3em] num placeholder:tracking-normal")}
      />
      <button
        type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide passcode" : "Show passcode"} aria-pressed={show}
        className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-lg text-mute hover:text-ink"
      >
        {show ? <EyeOff size={19} aria-hidden /> : <Eye size={19} aria-hidden />}
      </button>
    </>
  );
});

/** Official Google "G" (multi-colour, never recoloured). */
export function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * "Sign in with Google" button following Google's branding guidelines (dark theme: fill #131314, 1 px #8E918F stroke,
 * #E3E3E3 label, Roboto Medium-like weight, standard G, pill shape). A plain link to the server flow (works without JS state).
 */
export function GoogleButton({ href, children = "Sign in with Google", disabled }: { href: string; children?: ReactNode; disabled?: boolean }) {
  return (
    <a
      href={disabled ? undefined : href}
      aria-disabled={disabled || undefined}
      className={cx(
        "flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full border border-[#8E918F] bg-[#131314] px-4 text-[15px] font-medium text-[#E3E3E3] transition hover:bg-[#1f1f21] active:scale-[.98]",
        disabled && "pointer-events-none opacity-40",
      )}
      style={{ fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif" }}
    >
      <GoogleG />
      <span>{children}</span>
    </a>
  );
}

/** "or" divider between the passcode form and the Google button. */
export const OrLine = () => (
  <div className="my-5 flex items-center gap-3 text-xs text-faint" aria-hidden>
    <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
  </div>
);

/** Status line that screen readers announce (errors = alert, success = status). */
export function Notice({ tone, children, id }: { tone: "bad" | "ok" | "info"; children: ReactNode; id?: string }) {
  return (
    <p id={id} role={tone === "bad" ? "alert" : "status"} className={cx("rounded-xl px-3 py-2.5 text-sm", tone === "bad" ? "bg-bad/10 text-bad" : tone === "ok" ? "bg-acc/10 text-acc" : "bg-info/10 text-info")}>
      {children}
    </p>
  );
}

/** Invite code display: ABCD-EFGH. */
export const prettyCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);
export const joinLink = (code: string) => `${location.origin}/#/join/${code}`;
