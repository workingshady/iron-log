import { useCallback, useEffect, useState } from "react";
import { Bot, Check, Copy, KeyRound, Link2, Loader2, Unplug } from "lucide-react";
import { Btn, Card } from "../ui";
import { call, mmss, Notice, prettyCode, useCountdown } from "../auth/kit";

// Account & security → "Connect AI": one-time connect code + MCP URL, steps for Claude / ChatGPT, connected apps.
// Server side: worker/routes/connect.ts (codes, apps) and worker/mcp/* (OAuth + MCP). Guide for friends: docs/AI_CONNECT.md.

type App = { grantId: string; label: string; connectedAt: number; lastUsedAt: number | null };
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "never");
const PROD_URL = "https://iron-log.workingshady.workers.dev/mcp";

async function copyText(s: string) { try { await navigator.clipboard.writeText(s); return true; } catch { return false; } }

export default function ConnectAI({ dev }: { dev: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [mcpUrl, setMcpUrl] = useState(() => (location.hostname.endsWith("workers.dev") ? `${location.origin}/mcp` : location.hostname === "localhost" || location.hostname === "127.0.0.1" ? `${location.origin}/mcp` : PROD_URL));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "url" | null>(null);
  const [apps, setApps] = useState<App[] | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const timer = useCountdown();

  const load = useCallback(() => { call<{ apps: App[] }>("GET", "/connect/apps").then((r) => r.ok && setApps(r.data.apps)); }, []);
  useEffect(load, [load]);
  // a new connection shows up after the user approves in the AI app: refresh while a code is live
  useEffect(() => { if (!code || timer.left === 0) return; const i = setInterval(load, 8000); return () => clearInterval(i); }, [code, timer.left > 0, load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function make() {
    setBusy(true); setErr(null);
    const r = await call<{ code: string; expiresAt: number; mcpUrl: string }>("POST", "/connect/code");
    setBusy(false);
    if (!r.ok) { setErr(r.data.error ?? "Couldn't make a code"); return; }
    setCode(r.data.code);
    setMcpUrl(r.data.mcpUrl);
    timer.start(Math.round((r.data.expiresAt - Date.now()) / 1000));
  }
  async function doCopy(what: "code" | "url", text: string) {
    if (await copyText(text)) { setCopied(what); setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000); }
  }
  async function disconnect(id: string) {
    const r = await call("DELETE", `/connect/apps/${id}`);
    setSure(null);
    if (!r.ok) setErr(r.data.error ?? "Couldn't disconnect");
    load();
  }
  const live = !!code && timer.left > 0;

  return (
    <Card title="Connect AI" icon={Bot}>
      <p className="text-sm text-mute">Let Claude or ChatGPT read your training and adjust your plan, weights and next workout, like a coach. Only your data. Every plan change is a new version you can undo.</p>
      {dev && <p className="mt-2 text-xs text-warn">DEV mode: the AI connects to the test database (tokens start with ilmdev_).</p>}

      <div className="mt-3 rounded-xl bg-card2 p-3">
        <div className="text-xs text-mute" id="mcp-url-lbl">Connector URL</div>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all text-sm" aria-labelledby="mcp-url-lbl">{mcpUrl}</code>
          <button type="button" onClick={() => doCopy("url", mcpUrl)} aria-label={copied === "url" ? "Copied" : "Copy connector URL"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-mute hover:bg-card3 hover:text-ink">
            {copied === "url" ? <Check size={18} className="text-acc" /> : <Copy size={18} />}
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {live && (
          <div className="mt-3 rounded-2xl border border-acc/40 bg-acc/5 p-4 text-center">
            <div className="text-xs text-mute">Connect code · works once</div>
            <div className="my-1 text-4xl font-bold tracking-[.18em] text-acc num">{prettyCode(code!)}</div>
            <div className="text-xs text-mute">Expires in <b className="num text-ink">{mmss(timer.left)}</b></div>
            <Btn kind="ghost" icon={copied === "code" ? Check : Copy} className="mt-3 w-full" onClick={() => doCopy("code", code!)}>{copied === "code" ? "Copied" : "Copy code"}</Btn>
          </div>
        )}
        {code && !live && <div className="mt-3"><Notice tone="info">That code expired. Make a new one when you're ready.</Notice></div>}
        {err && <div className="mt-2"><Notice tone="bad">{err}</Notice></div>}
      </div>
      <Btn kind={live ? "soft" : "primary"} icon={busy ? Loader2 : KeyRound} className="mt-3 w-full" disabled={busy} onClick={make}>{live ? "New code" : "Create connect code"}</Btn>

      <details className="mt-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">How to connect</summary>
        <div className="space-y-3 pb-2 text-sm text-mute">
          <div>
            <div className="font-semibold text-ink">Claude (web, desktop or phone)</div>
            <ol className="ml-4 list-decimal space-y-0.5">
              <li>Settings → Connectors → <b className="text-ink">Add custom connector</b>.</li>
              <li>Name it "Iron Log", paste the connector URL, Add.</li>
              <li>Tap <b className="text-ink">Connect</b>, type the code above, Approve.</li>
            </ol>
          </div>
          <div>
            <div className="font-semibold text-ink">ChatGPT</div>
            <ol className="ml-4 list-decimal space-y-0.5">
              <li>Settings → Apps &amp; Connectors → Advanced → turn on <b className="text-ink">Developer mode</b>.</li>
              <li>Create a connector: paste the URL, authentication OAuth.</li>
              <li>Sign in when asked: type the code above, Approve.</li>
            </ol>
          </div>
          <p className="text-xs text-faint">Make the code right before you connect: it lasts 10 minutes and works once.</p>
        </div>
      </details>

      <div className="mt-2 border-t border-line/60 pt-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Link2 size={16} className="text-mute" aria-hidden /> Connected apps</div>
        {apps && apps.length === 0 && <p className="text-sm text-faint">None yet.</p>}
        <ul className="divide-y divide-line/60" aria-label="Connected AI apps">
          {(apps ?? []).map((a) => (
            <li key={a.grantId} className="py-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{a.label}</div>
                  <div className="text-xs text-mute num">Connected {when(a.connectedAt)} · last used {when(a.lastUsedAt)}</div>
                </div>
                <Btn kind="ghost" icon={Unplug} onClick={() => setSure(a.grantId)} label={`Disconnect ${a.label}`}>Disconnect</Btn>
              </div>
              {sure === a.grantId && (
                <div role="alert" className="mt-2 rounded-xl border border-bad/40 bg-bad/10 p-3">
                  <p className="text-sm">Disconnect <b>{a.label}</b>? It stops working right away. Your data and plan stay as they are.</p>
                  <div className="mt-3 flex gap-2">
                    <Btn kind="ghost" className="flex-1" onClick={() => setSure(null)}>Keep</Btn>
                    <Btn kind="danger" className="flex-1" onClick={() => disconnect(a.grantId)}>Disconnect</Btn>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
