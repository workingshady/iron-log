import { useState } from "react";
import { CalendarDays, Download, FlaskConical, LogOut, Mic, Settings as Gear, TriangleAlert, Dumbbell, UserRound } from "lucide-react";
import type { AppState } from "../../shared/api";
import { DOW, orderedDows, weekConfig } from "../../shared/week";
import { send, track, isDev, clearScreenCache } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx, today } from "../lib/util";
import { Btn, Card, NumInput, PageHead, Chips } from "../components/ui";
import { VOICE_LANGS, getVoiceLang, setVoiceLang, type VoiceLang } from "../components/Voice";

export default function Settings() {
  const { data: s, setData } = useLoad<AppState>("/state");
  const [cre, setCre] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [prof, setProf] = useState<{ name: string; height: string; weight: string; level: string }>({ name: "", height: "", weight: "", level: "returning" });
  const [profLoaded, setProfLoaded] = useState(false);
  const [bar, setBar] = useState<string | null>(null);
  const [ez, setEz] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [vlang, setVlang] = useState<VoiceLang>(getVoiceLang());
  if (!s) return null;
  if (!profLoaded) {
    setProf({ name: s.settings.profileName ?? "Shady", height: s.settings.heightCm ?? "174", weight: s.settings.bodyKg ?? "80", level: s.settings.level ?? "returning" });
    setProfLoaded(true);
  }
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

        <Card title="Profile" icon={UserRound}>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2"><div className="mb-1 text-[11px] text-mute">Name</div><input value={prof.name} onChange={(e) => setProf({ ...prof, name: e.target.value })} className="min-h-12 w-full rounded-xl bg-card2 px-3 outline-none focus:ring-2 focus:ring-acc" /></div>
            <div><div className="mb-1 text-[11px] text-mute">Height (cm)</div><NumInput value={prof.height} onChange={(v) => setProf({ ...prof, height: v })} /></div>
            <div><div className="mb-1 text-[11px] text-mute">Bodyweight (kg)</div><NumInput value={prof.weight} onChange={(v) => setProf({ ...prof, weight: v })} /></div>
          </div>
          <div className="mt-2 text-[11px] text-mute">Training background</div>
          <div className="mt-1"><Chips small clearable={false} options={[{ id: "new", label: "New" }, { id: "returning", label: "Returning after a break" }, { id: "regular", label: "Training 1y+" }]} value={prof.level} onChange={(v) => setProf({ ...prof, level: v ?? "returning" })} /></div>
          <Btn kind="soft" className="mt-3 w-full" onClick={async () => {
            const h = Number(prof.height || 0), w = Number(prof.weight || 0);
            if ((h && (h < 120 || h > 230)) || (w && (w < 35 || w > 250))) return alert("Check height / weight");
            await set("profileName", prof.name.trim()); await set("heightCm", prof.height); await set("bodyKg", prof.weight); await set("level", prof.level);
          }}>Save profile</Btn>
          <p className="mt-2 text-xs text-mute">Bodyweight is used for cardio calories and starting-weight estimates until you log weigh-ins in Body.</p>
        </Card>

        <Card title="Creatine daily target" icon={FlaskConical}>
          <div className="flex gap-2">
            <NumInput value={cre ?? s.settings.creatineTarget ?? "5"} onChange={setCre} />
            <Btn kind="soft" onClick={() => cre && Number(cre) > 0 && set("creatineTarget", cre)}>Save</Btn>
          </div>
          <p className="mt-2 text-xs text-mute">3-5 g is the researched range.</p>
        </Card>

        <Card title="Voice notes" icon={Mic}>
          <Chips small options={VOICE_LANGS.map((l) => ({ id: l.id, label: l.label }))} value={vlang} onChange={(v) => { if (!v) return; setVoiceLang(v as VoiceLang); setVlang(v as VoiceLang); track("voice_lang", { lang: v }); }} />
          <p className="mt-2 text-xs text-mute">{VOICE_LANGS.find((l) => l.id === vlang)?.hint}. Tap 🎤 next to any note, talk, tap again — Whisper (free, on Cloudflare) writes it out. Offline it falls back to the phone's own recognizer (one language).</p>
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
          <Btn kind="soft" icon={LogOut} className="mt-3 w-full" onClick={async () => { await send("POST", "/logout"); location.reload(); }}>Log out this device</Btn>
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
