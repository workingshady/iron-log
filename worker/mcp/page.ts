// The consent page for /oauth/authorize: dark Iron Log brand, mobile-first, no JavaScript, no external assets.
// The user types the one-time connect code from Iron Log → You → Account & security → Connect AI.

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const MARK = `<svg width="44" height="44" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="114" fill="#1c1e18"/><g transform="translate(106 106) scale(3)"><path fill="#c8f560" d="M5 61h90a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h-90a3 3 0 0 1 -3 -3v-5a3 3 0 0 1 3 -3zM9 48h5a4 4 0 0 1 4 4v29a4 4 0 0 1 -4 4h-5a4 4 0 0 1 -4 -4v-29a4 4 0 0 1 4 -4zM19.5 37h7a4.5 4.5 0 0 1 4.5 4.5v50a4.5 4.5 0 0 1 -4.5 4.5h-7a4.5 4.5 0 0 1 -4.5 -4.5v-50a4.5 4.5 0 0 1 4.5 -4.5zM73.5 37h7a4.5 4.5 0 0 1 4.5 4.5v50a4.5 4.5 0 0 1 -4.5 4.5h-7a4.5 4.5 0 0 1 -4.5 -4.5v-50a4.5 4.5 0 0 1 4.5 -4.5zM86 48h5a4 4 0 0 1 4 4v29a4 4 0 0 1 -4 4h-5a4 4 0 0 1 -4 -4v-29a4 4 0 0 1 4 -4z"/><path fill="none" stroke="#c8f560" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" d="M33 28 50 11 67 28"/></g></svg>`;

const CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#111113;color:#f3f3f5;font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;justify-content:center;padding:24px 16px}
main{width:100%;max-width:440px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.brand b{font-size:18px}
h1{font-size:22px;line-height:1.25;margin:0 0 6px}
.sub{color:#9b9ba6;margin:0 0 18px;font-size:14px}
.card{background:#19191d;border-radius:18px;padding:16px;margin-bottom:12px}
.card h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#9b9ba6;margin:0 0 8px}
ul{margin:0;padding-left:18px;font-size:14px}
li{margin:3px 0}
.no{color:#9b9ba6}
label{display:block;font-weight:600;margin-bottom:6px}
.hint{color:#8a8a96;font-size:13px;margin:6px 0 0}
input[type=text]{width:100%;min-height:56px;border-radius:14px;border:1px solid #3c3c45;background:#222227;color:#f3f3f5;font-size:26px;letter-spacing:.25em;text-align:center;text-transform:uppercase;font-variant-numeric:tabular-nums;padding:8px}
input[type=text]:focus{outline:2px solid #c8f560;outline-offset:2px;border-color:#c8f560}
.err{background:rgba(255,114,114,.12);border:1px solid rgba(255,114,114,.45);color:#ffd4d4;border-radius:12px;padding:10px 12px;font-size:14px;margin:0 0 12px}
.btns{display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:16px}
button{min-height:52px;border-radius:14px;font-size:16px;font-weight:700;border:0;cursor:pointer}
button:focus-visible{outline:2px solid #c8f560;outline-offset:2px}
.ok{background:#c8f560;color:#10140a;order:2}
.cancel{order:1;background:transparent;color:#f3f3f5;border:1px solid #3c3c45}
.foot{color:#8a8a96;font-size:12px;margin-top:16px}
code{background:#222227;border-radius:6px;padding:1px 6px}
`;

const shell = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>${body}</main></body></html>`;

export function errorPage(title: string, msg: string) {
  return shell(`${title} · Iron Log`, `<div class="brand">${MARK}<b>Iron Log</b></div><h1>${esc(title)}</h1><p class="sub">${esc(msg)}</p><p class="foot">You can close this tab.</p>`);
}

export function authorizePage(p: { q: Record<string, string>; clientName: string; redirectHost: string; error?: string }) {
  const hidden = Object.entries(p.q).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
  const name = esc(p.clientName);
  return shell(`Connect ${p.clientName} · Iron Log`, `
<div class="brand">${MARK}<b>Iron Log</b></div>
<h1>Connect ${name} to Iron Log</h1>
<p class="sub">Enter the connect code from Iron Log → You → Account &amp; security → <b>Connect AI</b>. You'll go back to <b>${esc(p.redirectHost)}</b>.</p>
<form method="post" action="/oauth/authorize" autocomplete="off">
  ${hidden}
  <div class="card">
    ${p.error ? `<p class="err" role="alert" id="err">${esc(p.error)}</p>` : ""}
    <label for="code">Connect code</label>
    <input id="code" name="code" type="text" inputmode="text" autocapitalize="characters" autocomplete="one-time-code" spellcheck="false" maxlength="9" placeholder="ABCD-EFGH" required ${p.error ? 'aria-invalid="true" aria-describedby="err hint"' : 'aria-describedby="hint"'} autofocus>
    <p class="hint" id="hint">8 letters and numbers, valid for 10 minutes, works once.</p>
  </div>
  <div class="card">
    <h2>${name} will be able to</h2>
    <ul>
      <li>Read your workouts, sets, weights, RIR, rest, notes and pain flags</li>
      <li>Read your plan, months, body &amp; habit logs, cardio, tests and journal</li>
      <li>Change your plan (each change is a new version you can undo), set target weights, adjust your next workout</li>
      <li>Write month reviews, journal notes and body logs</li>
    </ul>
  </div>
  <div class="card">
    <h2>It can't</h2>
    <ul class="no">
      <li>See other people's data, your passcode or your chats</li>
      <li>Delete your logged workouts</li>
    </ul>
  </div>
  <div class="btns">
    <button class="ok" type="submit" name="action" value="approve">Approve</button>
    <button class="cancel" type="submit" name="action" value="deny" formnovalidate>Cancel</button>
  </div>
</form>
<p class="foot">Disconnect any time in Iron Log → Account &amp; security → Connect AI.</p>`);
}
