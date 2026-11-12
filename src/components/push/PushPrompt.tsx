import { useState } from "react";
import { Bell, X } from "lucide-react";
import { Btn, Sheet } from "../ui";
import { enablePush, isIOS, isTwa, pushSupport, shouldNudge, snoozeNudge } from "../../lib/push";

/** How to undo a "Block" on this kind of device (shown when permission is denied). */
export function DeniedHelp() {
  const how = isTwa()
    ? "Long-press the Iron Log icon → App info → Notifications → allow."
    : isIOS()
      ? "iPhone Settings → Notifications → Iron Log → Allow Notifications."
      : /Android/.test(navigator.userAgent)
        ? "Chrome: tap ⋮ → Settings → Site settings → Notifications → find this site → Allow. Or long-press the installed app icon → App info → Notifications."
        : "Click the icon left of the address bar → Site settings → Notifications → Allow, then reload.";
  return <p className="text-xs text-mute"><b className="text-warn">Notifications are blocked on this device.</b> {how}</p>;
}

export function IosInstallHelp() {
  return (
    <p className="text-xs text-mute">
      On iPhone/iPad, notifications only work from the Home Screen app (iOS 16.4+): open this site in <b>Safari</b> → Share <span aria-hidden>⎋</span> → <b>Add to Home Screen</b>, then open Iron Log from the icon and turn notifications on here.
    </p>
  );
}

/**
 * Soft pre-prompt (sheet). The browser's own prompt only shows after "Turn on" → no wasted one-shot "Block".
 * Mount it after a meaningful action (sent a first message, added a friend, finished a rest…).
 */
export function PushPrompt({ open, onClose, reason, onDone }: { open: boolean; onClose: () => void; reason?: string; onDone?: (granted: boolean) => void }) {
  const [state, setState] = useState<"ask" | "busy" | "denied" | "error">("ask");
  const [msg, setMsg] = useState("");
  const support = pushSupport();
  const close = () => { if (state === "ask") snoozeNudge(); setState("ask"); onClose(); };
  async function turnOn() {
    setState("busy");
    try {
      const p = await enablePush();
      if (p === "granted") { onDone?.(true); setState("ask"); onClose(); return; }
      setState("denied");
      onDone?.(false);
    } catch (e) {
      setMsg((e as Error).message);
      setState("error");
    }
  }
  return (
    <Sheet open={open} onClose={close} title="Turn on notifications?" icon={Bell}>
      <p className="text-sm text-ink">{reason ?? "Get pinged when a friend messages you, cheers you on or comments, and when your rest is over with the screen off."}</p>
      <p className="mt-1.5 text-xs text-mute">Only things friends do and your own timer. No ads, no daily nagging. Change what pings you any time in Settings.</p>
      {support === "ios-install" && <div className="mt-3"><IosInstallHelp /></div>}
      {support === "unsupported" && <p className="mt-3 text-xs text-mute">This browser can't receive notifications. Try Chrome, or the Iron Log Android app.</p>}
      {state === "denied" && <div className="mt-3"><DeniedHelp /></div>}
      {state === "error" && <p className="mt-3 text-xs text-bad">{msg}</p>}
      <div className="mt-4 flex gap-2">
        <Btn kind="ghost" className="flex-1" onClick={close}>Not now</Btn>
        {support === "ok" && state !== "denied" && (
          <Btn kind="primary" icon={Bell} className="flex-1" disabled={state === "busy"} onClick={turnOn}>{state === "busy" ? "Turning on…" : "Turn on"}</Btn>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Small inline nudge for other screens (Chats, Friends, after a first message…). Renders nothing unless the browser could
 * still ask and the user hasn't dismissed it in the last 14 days. Example:
 *   <PushNudge reason="Get pinged when Omar replies." />
 */
export function PushNudge({ reason, className }: { reason: string; className?: string }) {
  const [show, setShow] = useState(shouldNudge);
  const [open, setOpen] = useState(false);
  if (!show) return null;
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-info/30 bg-info/5 p-3 ${className ?? ""}`}>
      <Bell size={18} className="shrink-0 text-info" aria-hidden />
      <span className="min-w-0 flex-1 text-sm">{reason}</span>
      <button onClick={() => setOpen(true)} className="min-h-11 shrink-0 rounded-xl bg-info px-3 text-sm font-semibold text-black">Turn on</button>
      <button onClick={() => { snoozeNudge(); setShow(false); }} className="flex h-11 w-9 shrink-0 items-center justify-center text-mute" aria-label="Not now"><X size={16} /></button>
      <PushPrompt open={open} onClose={() => { setOpen(false); setShow(shouldNudge()); }} reason={reason} onDone={() => setShow(false)} />
    </div>
  );
}
