import { useState } from "react";
import { CalendarDays, Download, FlaskConical, LogOut, Mic, Settings as Gear, TriangleAlert, Dumbbell, UserRound } from "lucide-react";
import type { AppState } from "../../shared/api";
import { DOW, orderedDows, weekConfig } from "../../shared/week";
import { send, track, isDev, clearScreenCache } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, today } from "../lib/util";
import { Btn, Card, NumInput, PageHead, Chips } from "../components/ui";
import { Avatar } from "../components/Avatar";
import { forgetPhotos, setMe, useMe } from "../lib/me";
import { restPrefs, VOL, type Volume } from "../lib/restPrefs";
import { EXERCISES } from "../../program/exercises";
import { beep, clock, unlockAudio, vibrate } from "../lib/util";
import { Timer } from "lucide-react";
import { VOICE_LANGS, getVoiceLang, setVoiceLang, type VoiceLang } from "../components/Voice";
import { NotificationsCard } from "../components/push/NotificationsCard";

export default function Settings() {
  const { data: s, setData } = useLoad<AppState>("/state");
  const me = useMe();
  const [cre, setCre] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [bar, setBar] = useState<string | null>(null);
  const [ez, setEz] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [vlang, setVlang] = useState<VoiceLang>(getVoiceLang());
  if (!s) return null;
  const wk = weekConfig(s.settings, s.schedules);

  async function set(key: string, value: string) {
    setData((x) => (x ? { ...x, settings: { ...x.settings, [key]: value } } : x)); // instant on screen
    await send("PUT", `/settings/${key}`, { value });
    track("setting", { [key]: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  async function reset() {
    setBusy(true);
    try {
      await send("POST", "/reset", { confirm: "DELETE" });
      // clear everything cached on this device too
      Object.keys(localStorage).filter((k) => k.startsWith("il_")).forEach((k) => localStorage.removeItem(k));
      alert("All data deleted. Starting fresh.");
      location.hash = "/";
      location.reload();
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead icon={Gear} title="Settings" sub="Week, profile, equipment, targets, data" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card title="Your week" icon={CalendarDays} className="md:col-span-2">
          <div className="text-xs text-mute">Week starts on</div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {[{ v: 6, l: "Saturday" }, { v: 0, l: "Sunday" }, { v: 1, l: "Monday" }].map((o) => (
              <button key={o.v} onClick={() => set("weekStart", String(o.v))} className={cx("min-h-11 rounded-xl border text-sm", wk.weekStart === o.v ? "border-acc bg-acc/10 font-semibold text-acc" : "border-line")}>{o.l}</button>
            ))}
          </div>
          <div className="mt-4 text-xs text-mute">Preferred rest days (tap to toggle) — the planner keeps these free when it can</div>
          <div className="mt-1.5 grid grid-cols-7 gap-1">
            {orderedDows(wk.weekStart).map((dow) => {
              const rest = wk.restDows.includes(dow);
              return (
                <button key={dow} onClick={() => set("restDays", (rest ? wk.restDows.filter((x) => x !== dow) : [...wk.restDows, dow]).sort().join(","))}
                  className={cx("min-h-12 rounded-lg text-xs font-semibold", rest ? "bg-card2 text-faint" : "bg-acc/15 text-acc")}>
                  {DOW[dow]}<div className="text-[10px] font-normal">{rest ? "rest" : "train"}</div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-mute">{7 - wk.restDows.length} training days · your program needs 5. Football / busy days are marked per week on Home or Plan, and the week re-plans itself around them.</p>
          {saved && <p className="mt-1 text-xs text-acc">Saved ✓</p>}
        </Card>

        <a href="#/profile" className="flex min-h-16 items-center gap-3 rounded-2xl border border-line/60 bg-card p-4 hover:bg-card2">
          <Avatar id={me?.avatarId} name={me?.name ?? me?.username} size={44} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{me?.name || "Profile"}</span>
            <span className="block truncate text-xs text-mute">@{me?.username ?? "…"} · photo, bio, height, weight, passcode</span>
          </span>
          <UserRound size={18} className="text-faint" aria-hidden />
        </a>

        <Card title="Creatine daily target" icon={FlaskConical}>
          <div className="flex gap-2">
            <NumInput value={cre ?? s.settings.creatineTarget ?? "5"} onChange={setCre} />
            <Btn kind="soft" onClick={() => cre && Number(cre) > 0 && set("creatineTarget", cre)}>Save</Btn>
          </div>
          <p className="mt-2 text-xs text-mute">3-5 g is the researched range.</p>
        </Card>

        <NotificationsCard />

        <Card title="Rest timer" icon={Timer}>
          {(() => {
            const rp = restPrefs(s.settings);
            const Toggle = ({ k, on, label, hint }: { k: string; on: boolean; label: string; hint: string }) => (
              <button onClick={() => set(k, on ? "0" : "1")} className="flex min-h-12 w-full items-center gap-3 border-b border-line/50 py-2 text-left last:border-0">
                <span className="min-w-0 flex-1"><span className="block text-sm">{label}</span><span className="block text-[11px] text-mute">{hint}</span></span>
                <span className={cx("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-acc" : "bg-card3")}><span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} /></span>
              </button>
            );
            const overrides = Object.entries(s.settings).filter(([k, v]) => k.startsWith("rest:") && v !== "");
            return (
              <>
                <Toggle k="restAuto" on={rp.auto} label="Start automatically" hint="After each set. Off = a Start button appears instead." />
                <Toggle k="restSound" on={rp.sound} label="Sound when rest is over" hint="Beep at the end of the rest." />
                {rp.sound && (
                  <div className="flex items-center gap-2 border-b border-line/50 py-2">
                    <span className="flex-1 text-sm">Volume</span>
                    {(["low", "normal", "high"] as Volume[]).map((v) => (
                      <button key={v} onClick={() => set("restVolume", v)} className={cx("min-h-9 rounded-full border px-3 text-xs capitalize", rp.volume === v ? "border-acc bg-acc/15 font-semibold text-acc" : "border-line text-mute")}>{v}</button>
                    ))}
                    <button onClick={() => { unlockAudio(); beep(VOL[rp.volume]); if (rp.vibrate) vibrate([300, 150, 300]); }} className="min-h-9 rounded-full bg-card2 px-3 text-xs text-info">Test</button>
                  </div>
                )}
                <Toggle k="restVibrate" on={rp.vibrate} label="Vibrate when rest is over" hint="Works with music on / phone in pocket." />
                <Toggle k="restCountdown" on={rp.countdown} label="3-2-1 countdown beeps" hint="Short beeps in the last 3 seconds." />
                <div className="mt-2 text-[11px] text-mute">
                  Rest per exercise: open an exercise (video button) → <b>Rest between sets</b>.
                  {overrides.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {overrides.map(([k, v]) => (
                        <li key={k} className="flex items-center gap-2 text-xs text-ink">
                          <span className="min-w-0 flex-1 truncate">{EXERCISES[k.slice(5)]?.name ?? k.slice(5)}</span>
                          <span className="num text-mute">{v === "0" ? "no timer" : clock(Number(v) * 1000)}</span>
                          <button onClick={() => set(k, "")} className="min-h-8 px-1 text-info">reset</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            );
          })()}
        </Card>

        <Card title="Voice notes" icon={Mic}>
          <Chips small options={VOICE_LANGS.map((l) => ({ id: l.id, label: l.label }))} value={vlang} onChange={(v) => { if (!v) return; setVoiceLang(v as VoiceLang); setVlang(v as VoiceLang); track("voice_lang", { lang: v }); }} />
          <p className="mt-2 text-xs text-mute">{VOICE_LANGS.find((l) => l.id === vlang)?.hint}. Tap 🎤 next to any note, talk, tap again — Whisper (free, on Cloudflare) writes it out. Offline it falls back to the phone's own recognizer (one language).</p>
        </Card>

        <Card title="Equipment — plates your gym has" icon={Dumbbell}>
          <p className="mb-2 text-xs text-mute">Tap to turn on/off. The plate picture in a workout only uses these.</p>
          <div className="flex flex-wrap gap-1.5">
            {[25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5].map((p) => {
              const cur = (s.settings.plates ?? "25,20,15,10,5,2.5,1.25").split(",").map(Number);
              const on = cur.includes(p);
              return (
                <button key={p} onClick={() => { const next = on ? cur.filter((x) => x !== p) : [...cur, p]; if (!next.length) return; set("plates", next.sort((a, b) => b - a).join(",")); }}
                  className={cx("min-h-10 min-w-12 rounded-full border px-3 text-sm num", on ? "border-acc bg-acc/15 font-semibold text-acc" : "border-line text-mute")}>{p} kg</button>
              );
            })}
          </div>
        </Card>

        <Card title="Equipment — clips / collars" icon={Dumbbell}>
          <p className="mb-2 text-xs text-mute">Weight of EACH clip, added to barbell totals. Spring clips ≈ 0; competition collars 2.5 kg.</p>
          <div className="flex flex-wrap gap-1.5">
            {[0, 0.5, 1.25, 2.5].map((c) => {
              const on = Number(s.settings.collarKg ?? 0) === c;
              return <button key={c} onClick={() => set("collarKg", String(c))} className={cx("min-h-10 rounded-full border px-3 text-sm num", on ? "border-acc bg-acc/15 font-semibold text-acc" : "border-line text-mute")}>{c === 0 ? "None / spring" : `${c} kg each`}</button>;
            })}
          </div>
        </Card>

        <Card title="Equipment — bar weights" icon={Dumbbell}>
          <p className="mb-2 text-xs text-mute">Bars count in the total you enter. EZ bars vary from 5 to 14 kg — weigh yours or read the label. Fixed-weight bars: set 0 and enter the number printed on the bar.</p>
          <div className="grid grid-cols-2 gap-2">
            <div><div className="mb-1 text-[11px] text-mute">Olympic bar (kg)</div><NumInput value={bar ?? s.settings.barKg ?? "20"} onChange={setBar} /></div>
            <div><div className="mb-1 text-[11px] text-mute">EZ / curl bar (kg)</div><NumInput value={ez ?? s.settings.ezKg ?? "10"} onChange={setEz} /></div>
          </div>
          <Btn kind="soft" className="mt-2 w-full" onClick={async () => {
            const b = Number(bar ?? s.settings.barKg ?? 20), e = Number(ez ?? s.settings.ezKg ?? 10);
            if (!(b >= 0 && b <= 30 && e >= 0 && e <= 30)) return alert("Bar weights 0-30 kg");
            await set("barKg", String(b)); await set("ezKg", String(e));
          }}>Save bar weights</Btn>
          <p className="mt-2 text-xs text-mute">Dumbbells: always enter the weight of ONE dumbbell (per hand).</p>
        </Card>

        <Card title="Your data" icon={Download}>
          <a href="/api/export" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line font-semibold hover:bg-card2"><Download size={18} /> Download everything (JSON)</a>
          <p className="mt-2 text-xs text-mute">Program v{s.program.version}. For reviews, Claude uses <code>npm run export</code> on the PC.</p>
          <Btn kind="soft" icon={LogOut} className="mt-3 w-full" onClick={async () => { await send("POST", "/logout"); forgetPhotos(); setMe(null); location.reload(); }}>Log out this device</Btn>
        </Card>

        {isDev() && (
          <section className="rounded-2xl border border-warn/50 bg-warn/10 p-4 md:col-span-2">
            <div className="font-semibold text-warn">DEV mode — test database</div>
            <p className="mt-1 text-sm text-mute">Everything here is fake and separate from your real tracking. Fill it with ~3 weeks of dummy workouts (every set type, notes, pain, football, cardio, creatine) to try every feature. Log out and use your normal passcode to go back.</p>
            <Btn kind="primary" className="mt-3 w-full" disabled={busy} onClick={async () => {
              if (!confirm("Replace ALL test data with fresh dummy data?")) return;
              setBusy(true);
              try { await send("POST", `/dev/seed?today=${today()}`); clearScreenCache(); location.hash = "/"; location.reload(); } catch (e) { alert((e as Error).message); setBusy(false); }
            }}>{busy ? "Seeding…" : "Fill with dummy data"}</Btn>
          </section>
        )}

        <section className="rounded-2xl border border-bad/40 bg-bad/5 p-4 md:col-span-2">
          <div className="mb-2 flex items-center gap-2 font-semibold text-bad"><TriangleAlert size={18} /> Reset — delete ALL {isDev() ? "TEST" : "REAL"} data</div>
          <p className="text-sm text-mute">Wipes every workout, set, missed day, body log, test, journal entry, creatine log, click log and setting from the database. Use this after testing, before you start for real. It cannot be undone.</p>
          <div className="mt-3 flex flex-col gap-2 md:flex-row">
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='Type DELETE to confirm' className="min-h-12 flex-1 rounded-xl bg-card2 px-3 outline-none focus:ring-2 focus:ring-bad" />
            <Btn kind="danger" disabled={confirmText !== "DELETE" || busy} onClick={reset}>{busy ? "Deleting…" : "Delete everything"}</Btn>
          </div>
        </section>
      </div>
    </div>
  );
}
