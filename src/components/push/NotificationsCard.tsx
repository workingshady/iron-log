import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Moon, Send, Smartphone, Trash2 } from "lucide-react";
import { Btn, Card, Sheet } from "../ui";
import { cx } from "../../lib/util";
import {
  CAT_LABELS, currentSub, disablePush, enablePush, getPrefs, listDevices, permission, pushSupport, removeDevice, savePrefs, sendTest, subId,
  type NotifyPrefs, type PushDevice,
} from "../../lib/push";
import { DeniedHelp, IosInstallHelp } from "./PushPrompt";

function Toggle({ on, label, hint, onClick, disabled }: { on: boolean; label: string; hint?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} role="switch" aria-checked={on} className="flex min-h-12 w-full items-center gap-3 border-b border-line/50 py-2 text-left last:border-0 disabled:opacity-50">
      <span className="min-w-0 flex-1"><span className="block text-sm">{label}</span>{hint && <span className="block text-[11px] text-mute">{hint}</span>}</span>
      <span className={cx("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-acc" : "bg-card3")}><span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} /></span>
    </button>
  );
}

const ago = (t: number | null) => {
  if (!t) return "never";
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** Settings → Notifications: this device on/off, test, and (in a sheet) what pings you, quiet hours, devices. */
export function NotificationsCard() {
  const support = pushSupport();
  const [perm, setPerm] = useState(permission());
  const [here, setHere] = useState<string | null>(null); // this device's subscription id
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [devices, setDevices] = useState<PushDevice[] | null>(null);

  const refresh = useCallback(async () => {
    setPerm(permission());
    if (support === "ok") setHere(await subId(await currentSub()));
    listDevices().then(setDevices).catch(() => setDevices([]));
  }, [support]);
  useEffect(() => { refresh(); getPrefs().then(setPrefs).catch(() => {}); }, [refresh]);

  const on = perm === "granted" && !!here && (devices === null || devices.some((d) => d.id === here));

  async function toggleHere() {
    setBusy(true); setNote(null);
    try {
      if (on) { await disablePush(); setNote({ text: "Off on this device.", tone: "ok" }); }
      else {
        const p = await enablePush();
        if (p === "granted") setNote({ text: "On. Try “Send test”.", tone: "ok" });
      }
    } catch (e) { setNote({ text: (e as Error).message, tone: "bad" }); }
    await refresh();
    setBusy(false);
  }
  async function test() {
    setBusy(true); setNote(null);
    try {
      const r = await sendTest();
      setNote(r.sent ? { text: `Sent to ${r.sent} device${r.sent > 1 ? "s" : ""}. It should pop up in a few seconds.`, tone: "ok" } : { text: "No device took it. Turn notifications off and on again here.", tone: "bad" });
    } catch (e) { setNote({ text: (e as Error).message, tone: "bad" }); }
    await refresh();
    setBusy(false);
  }
  async function patch(p: Partial<NotifyPrefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...p };
    setPrefs(next); // instant
    try { setPrefs(await savePrefs(p)); } catch (e) { setNote({ text: (e as Error).message, tone: "bad" }); }
  }

  const status = support === "ios-install" ? "Add to Home Screen first" : support === "unsupported" ? "Not supported in this browser"
    : perm === "denied" ? "Blocked on this device" : on ? "On for this device" : "Off for this device";

  return (
    <Card title="Notifications" icon={Bell}>
      <div className="flex items-center gap-2">
        <span className={cx("h-2 w-2 shrink-0 rounded-full", on ? "bg-acc" : perm === "denied" ? "bg-bad" : "bg-card3")} aria-hidden />
        <span className="flex-1 text-sm">{status}</span>
      </div>
      <div className="mt-2">
        {support === "ios-install" && <IosInstallHelp />}
        {support === "unsupported" && <p className="text-xs text-mute">Use Chrome or the Iron Log Android app to get notifications.</p>}
        {support === "ok" && perm === "denied" && <DeniedHelp />}
        {support === "ok" && perm !== "denied" && (
          <Toggle on={on} disabled={busy} onClick={toggleHere} label="Notifications on this device" hint="Messages, friend requests, cheers, likes, comments, challenges, rest timer" />
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <Btn kind="soft" icon={Send} className="flex-1" disabled={busy || !devices?.length} onClick={test}>Send test</Btn>
        <Btn kind="ghost" icon={BellRing} className="flex-1" onClick={() => setSheet(true)}>What pings me</Btn>
      </div>
      {note && <p className={cx("mt-2 text-xs", note.tone === "ok" ? "text-acc" : "text-bad")}>{note.text}</p>}

      <Sheet open={sheet} onClose={() => setSheet(false)} title="What pings me" icon={BellRing}>
        {!prefs ? <p className="text-sm text-mute">Loading…</p> : (
          <>
            {CAT_LABELS.map((c) => <Toggle key={c.id} on={prefs[c.id]} label={c.label} hint={c.hint} onClick={() => patch({ [c.id]: !prefs[c.id] } as Partial<NotifyPrefs>)} />)}
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold"><Moon size={16} className="text-info" aria-hidden /> Quiet hours</div>
            <Toggle on={prefs.quiet.on} label="Don't ping me at night" hint={`No pushes between these times (${prefs.tz}). They still show in Activity.`} onClick={() => patch({ quiet: { ...prefs.quiet, on: !prefs.quiet.on } })} />
            {prefs.quiet.on && (
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(["from", "to"] as const).map((k) => (
                  <label key={k} className="text-[11px] text-mute">{k === "from" ? "From" : "Until"}
                    <input type="time" value={prefs.quiet[k]} onChange={(e) => e.target.value && patch({ quiet: { ...prefs.quiet, [k]: e.target.value } })}
                      className="mt-1 block min-h-11 w-full rounded-xl bg-card2 px-3 text-sm text-ink num outline-none focus:ring-2 focus:ring-acc" />
                  </label>
                ))}
              </div>
            )}
          </>
        )}
        <div className="mt-5 flex items-center gap-2 text-sm font-semibold"><Smartphone size={16} className="text-mute" aria-hidden /> Devices</div>
        {devices === null ? <p className="text-xs text-mute">Loading…</p> : devices.length === 0 ? <p className="mt-1 text-xs text-mute">No device gets notifications yet.</p> : (
          <ul className="mt-1">
            {devices.map((d) => (
              <li key={d.id} className="flex min-h-12 items-center gap-2 border-b border-line/50 py-1.5 last:border-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{d.ua || "Device"}{d.id === here && <span className="ml-1.5 text-[11px] text-acc">this device</span>}</span>
                  <span className="block text-[11px] text-mute">last delivered {ago(d.lastOkAt)}{d.fails ? ` · ${d.fails} failed` : ""}</span>
                </span>
                <button onClick={async () => { if (d.id === here) await disablePush(); else await removeDevice(d.id); refresh(); }} className="flex h-11 w-11 items-center justify-center rounded-full text-mute hover:bg-card2 hover:text-bad" aria-label={`Remove ${d.ua ?? "device"}`}><Trash2 size={17} /></button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </Card>
  );
}
