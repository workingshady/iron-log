import { useCallback, useEffect, useState } from "react";
import { Bot, History, Loader2, RotateCcw, User } from "lucide-react";
import { Badge, Btn, Sheet } from "../ui";
import { call, Notice } from "../auth/kit";
import { refreshProgram } from "../../lib/program";

// Version history of one of MY plans (who changed it — you or an AI app — and why), with Restore.
// Restore saves the old version as a NEW version (nothing is lost). API: worker/routes/connect.ts.

type V = { version: string; date: string; why: string; by: string; current: boolean; restorable: boolean };

export default function VersionHistory({ programId, open, onClose, onRestored }: { programId: string | null; open: boolean; onClose: () => void; onRestored?: () => void }) {
  const [list, setList] = useState<V[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!programId) return;
    setErr(null);
    call<{ versions: V[] }>("GET", `/connect/versions?program=${encodeURIComponent(programId)}`).then((r) => (r.ok ? setList(r.data.versions) : setErr(r.data.error ?? "Couldn't load the history")));
  }, [programId]);
  useEffect(() => { if (open) { setList(null); setDone(null); setSure(null); load(); } }, [open, load]);

  async function restore(v: string) {
    setBusy(v); setErr(null);
    const r = await call<{ version: string }>("POST", "/connect/versions/restore", { program: programId, version: v });
    setBusy(null); setSure(null);
    if (!r.ok) { setErr(r.data.error ?? "Couldn't restore"); return; }
    setDone(`Restored v${v} as v${r.data.version}.`);
    await refreshProgram();
    load();
    onRestored?.();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Version history" icon={History}>
      <p className="text-sm text-mute">Every change to this plan is saved. Restore brings an old version back as a new one, so you can always go back again.</p>
      <div aria-live="polite" className="mt-2">
        {done && <Notice tone="ok">{done}</Notice>}
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
      {!list && !err && <div className="flex justify-center py-8 text-mute"><Loader2 className="animate-spin" aria-label="Loading" /></div>}
      <ol className="mt-2 divide-y divide-line/60" aria-label="Plan versions, newest first">
        {(list ?? []).map((v) => {
          const ai = v.by !== "you";
          return (
            <li key={v.version} className="py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card2" aria-hidden>{ai ? <Bot size={16} className="text-info" /> : <User size={16} className="text-mute" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold num">v{v.version}</span>
                    {v.current && <Badge tone="acc">current</Badge>}
                    <span className="text-xs text-mute num">{v.date} · {ai ? v.by : "you"}</span>
                  </div>
                  {v.why && <p className="mt-0.5 text-sm text-mute bidi">{v.why}</p>}
                </div>
                {v.restorable && (
                  <Btn kind="ghost" icon={busy === v.version ? Loader2 : RotateCcw} disabled={!!busy} onClick={() => setSure(v.version)} label={`Restore version ${v.version}`}>Restore</Btn>
                )}
              </div>
              {sure === v.version && (
                <div role="alert" className="mt-2 rounded-xl border border-warn/40 bg-warn/10 p-3">
                  <p className="text-sm">Go back to <b>v{v.version}</b>? It's saved as a new version; the month and your logs continue.</p>
                  <div className="mt-3 flex gap-2">
                    <Btn kind="ghost" className="flex-1" onClick={() => setSure(null)}>Cancel</Btn>
                    <Btn kind="primary" className="flex-1" disabled={!!busy} onClick={() => restore(v.version)}>Restore</Btn>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}
