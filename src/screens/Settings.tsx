import { useState } from "react";
import { CalendarDays, Download, FlaskConical, LogOut, Settings as Gear, TriangleAlert } from "lucide-react";
import type { AppState } from "../../shared/api";
import { send, track } from "../lib/api";
import { useLoad } from "../lib/useLoad";
import { cx } from "../lib/util";
import { Btn, Card, NumInput, PageHead } from "../components/ui";

export default function Settings() {
  const { data: s, reload } = useLoad<AppState>("/state");
  const [cre, setCre] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!s) return null;

  async function set(key: string, value: string) {
    await send("PUT", `/settings/${key}`, { value });
    track("setting", { [key]: value });
    reload();
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
      <PageHead icon={Gear} title="Settings" sub="Schedule, targets, your data." />
      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Weekly schedule" icon={CalendarDays} className="md:col-span-2">
          <div className="grid gap-2 md:grid-cols-2">
            {Object.entries(s.schedules).map(([name, days]) => (
              <button key={name} onClick={() => set("schedule", name)} className={cx("rounded-xl border p-3 text-left", s.settings.schedule === name ? "border-acc bg-acc/5" : "border-line hover:bg-card2")}>
                <div className="font-semibold">{name}</div>
                <div className="mt-2 flex gap-1 text-[11px]">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                    <span key={d} className={cx("flex-1 rounded py-1 text-center", days[i] === "rest" ? "bg-card2 text-faint" : "bg-acc/15 text-acc")}>{d}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-mute">Used for "rest day" hints and where the calendar week starts.</p>
        </Card>

        <Card title="Creatine daily target" icon={FlaskConical}>
          <div className="flex gap-2">
            <NumInput value={cre ?? s.settings.creatineTarget ?? "5"} onChange={setCre} />
            <Btn kind="soft" onClick={() => cre && Number(cre) > 0 && set("creatineTarget", cre)}>Save</Btn>
          </div>
          <p className="mt-2 text-xs text-mute">3-5 g is the researched range.</p>
        </Card>

        <Card title="Your data" icon={Download}>
          <a href="/api/export" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line font-semibold hover:bg-card2"><Download size={18} /> Download everything (JSON)</a>
          <p className="mt-2 text-xs text-mute">Program v{s.program.version}. For reviews, Claude uses <code>npm run export</code> on the PC.</p>
          <Btn kind="soft" icon={LogOut} className="mt-3 w-full" onClick={async () => { await send("POST", "/logout"); location.reload(); }}>Log out this device</Btn>
        </Card>

        <section className="rounded-2xl border border-bad/40 bg-bad/5 p-4 md:col-span-2">
          <div className="mb-2 flex items-center gap-2 font-semibold text-bad"><TriangleAlert size={18} /> Reset — delete ALL data</div>
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
