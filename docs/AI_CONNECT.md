# Connect Claude or ChatGPT to Iron Log

Iron Log can be connected to **Claude** or **ChatGPT** so the AI works as your coach: it reads your workouts and can adjust your plan, your target weights and your next workout. It's the same thing Shady does with Claude Code for his own plan, now for everyone, from the chat app you already use.

> Connector URL: **`https://iron-log.workingshady.workers.dev/mcp`**
> Connect code: Iron Log → **You → ≡ → Account & security → Connect AI → Create connect code**

| Way | Best for | Works on |
|---|---|---|
| **⭐ Claude Code (recommended)** | the most reliable and powerful way; also works when your Claude account belongs to a company/team that blocks custom connectors | Windows, Mac, Linux terminal (Claude Pro, Max, Team or Enterprise, or an API account) |
| Claude website / desktop app | chatting from the normal Claude app | personal Claude accounts (Free allows 1 custom connector); on Team/Enterprise only the organisation owner can add it |
| ChatGPT | if you prefer ChatGPT | ChatGPT web with Developer mode (plan-dependent) |

---

## What the AI can do

**Read (your data only)**
- Your workouts: every set with weight, reps, RIR (reps in reserve), rest you actually took, set type (warm-up, drop set …), notes, pain flags, form check, and what the app suggested vs. what you did.
- Per-exercise history: estimated max over time, best sets, the app's next recommendation.
- Progress: strength trends, hard sets per muscle per week, volume, adherence, streak, PRs, "what goes with good workouts".
- Your plan (all 4 weeks), its versions and why each one was made, your months and month reviews.
- Body & habit logs (weight, waist, sleep, protein, steps, water, energy), creatine, cardio, fitness tests, and your journal (mood, tags).
- The exercise library and the plan templates.

**Change**
- **Your plan**: add / remove / swap / reorder exercises, sets, reps, RIR, rest and notes, for every week or just one week; rename days; add your own custom exercise; switch plans or make a new one from a template.
- **Target weights**: "use 62.5 kg × 6 on bench for the next two weeks". It shows in the workout instead of the app's automatic suggestion until the date you agree on.
- **Your next workout only**: "make tomorrow's Push 45 minutes", "no overhead pressing next session". Used once, when that workout starts; the plan itself stays the same.
- **Notes**: write your month review (shows under Months), add journal notes (tagged `ai`), log body numbers.

**Can't**
- See anyone else's data, your passcode, your chats or your friends.
- Delete your logged workouts or sets.
- Edit the built-in default plan in place. If you're on it, the AI first makes **your own copy** (`fork_plan`), and edits that.

Every change is logged in your account (as an `ai_…` event with the app's name), so nothing happens silently.

## Privacy and control

- The AI only gets **your** account: the connection is tied to the person who made the connect code, and every request is checked against that.
- Nothing is shared with Anthropic or OpenAI until you ask the AI something that needs it; then the data it reads goes into that chat (like pasting it yourself). Their privacy policies apply to chats.
- **Disconnect any time**: Iron Log → Account & security → Connect AI → Connected apps → **Disconnect**. It stops working immediately. You can also remove the connector inside Claude/ChatGPT.
- The connection uses OAuth with a one-time code, so the AI never sees your passcode. Access tokens last 1 hour and renew automatically for up to 30 days of use; if one is ever reused after renewal, the whole connection is cut off as a precaution.

---

## ⭐ Option 1 (recommended): Claude Code

Claude Code is Claude in your terminal. It talks to Iron Log directly, isn't blocked by company/team connector rules, and is
exactly how Shady's own plan is managed. It needs a Claude **Pro, Max, Team or Enterprise** plan (or an Anthropic API account).

**1. Install Claude Code** (once):

- Windows (PowerShell): `irm https://claude.ai/install.ps1 | iex`
- Mac / Linux: `curl -fsSL https://claude.ai/install.sh | bash`
- Then run `claude` once and sign in with your Claude account.

**2. Add Iron Log** (once). The `--scope user` part makes it work from any folder:

```
claude mcp add --scope user --transport http iron-log https://iron-log.workingshady.workers.dev/mcp
```

You should see *"Added HTTP MCP server iron-log …"*.

**3. Sign in with a connect code:**

1. Start Claude Code: `claude`
2. Type `/mcp`, choose **iron-log** → **Authenticate**. Your browser opens the dark Iron Log page *"Connect Claude Code to Iron Log"*.
   (If no browser opens, copy the link Claude Code prints and open it.)
3. In the Iron Log app: **You → ≡ → Account & security → Connect AI → Create connect code** (8 characters, valid 10 minutes).
4. Type the code on the Iron Log page in the browser (with or without the dash) → **Approve**.
5. Back in Claude Code you'll see **"Authentication successful. Connected to iron-log."**

**4. Use it.** Just ask, for example:

- `Read my Iron Log and review my last workout`
- `Show my bench press history and what I should lift next time`
- `I only have 3 days a week now. Make my own copy of my plan and adapt it`
- `Write my month review`

Claude Code asks before it runs a tool that changes something. Type `/mcp` any time to see the connection, re-authenticate or
disconnect. To remove it completely: `claude mcp remove --scope user iron-log`.

> Already added it without `--scope user`? It then only works when you start `claude` in that same folder. Fix:
> `claude mcp remove iron-log` and add it again with `--scope user`.

## Option 2: Claude website or desktop app

Add the connector on the **website or desktop app** (adding custom connectors isn't available in the phone app; once added, it
then also works in the Claude phone app).

**Personal account (Free, Pro, Max).** The **Free plan allows one custom connector** (Anthropic's help page).

1. **Make a code first** in Iron Log: **You → ≡ → Account & security → Connect AI → Create connect code** (10 minutes).
2. In Claude: **Customize → Connectors → "+" Add → Add custom connector**. (Older layout: **Settings → Connectors**.)
3. Name `Iron Log`, URL `https://iron-log.workingshady.workers.dev/mcp` → **Continue**. Claude shows the settings it detected →
   **Continue** again.
4. **Authentication:** keep **Sign in now**. **OAuth client:** keep **"Use Claude's published identity (Recommended)"**
   ("Register automatically" also works). Click **Add**.
5. A dark Iron Log page opens: *"Connect Claude to Iron Log"*. Type the connect code → **Approve**. You're back in Claude, connected.
6. In a chat: **"+" → Connectors** → switch **Iron Log** on. Ask e.g. *"Review my last workout"*. Claude asks permission the
   first time it uses each tool (allow once or always).

**Team or Enterprise account (e.g. a work account).** Only an organisation **Owner** can add custom connectors: **Organization
settings → Connectors → Add → Custom → Web**, name `Iron Log`, the URL above, default sign-in settings. Members then just open
**Customize → Connectors → Iron Log → Connect** and enter their own code. If you see *"Ask an organization owner to add this for
your team"* (the button is greyed out), either ask the owner, use a personal Claude account, or use **Claude Code** (Option 1).

Tip: Iron Log also offers ready-made prompts (Review my last workout, Weekly check-in, Monthly review, I only have N days,
Something hurts). In Claude they're in the "+" menu under Iron Log.

## Option 3: ChatGPT

ChatGPT calls these **apps / connectors in Developer mode**. At the time of writing (Nov 2026) it's a beta, available on the web for paid plans (OpenAI lists Business and Enterprise/Edu; Plus/Pro have had it too). On Business/Enterprise an admin may have to allow it. **Plans and menus change often**; check OpenAI's help page below if something looks different.

1. **Make a code first** (same as step 1 above).
2. In ChatGPT on the web: click your name → **Settings** → **Apps & Connectors** (sometimes just **Apps**) → **Advanced settings** → turn on **Developer mode**.
3. Back in **Apps & Connectors**, click **Create** (or **Add custom connector / app**):
   - Name: `Iron Log`
   - Description: `My training log and plan`
   - MCP server URL: `https://iron-log.workingshady.workers.dev/mcp`
   - Authentication: **OAuth**
   - Tick "I trust this application", then **Create**.
4. ChatGPT opens the Iron Log page: type your connect code and press **Approve**. ChatGPT then lists the tools it found.
5. In a new chat, pick **Developer mode** / the Iron Log app from the "+" menu and ask away. ChatGPT asks you to confirm before any tool that changes something.

---

## Ready-to-paste prompts

**After a workout**
> Review my last Iron Log workout. Compare what I did with the app's suggestions (weight, reps, RIR, rest), look at pain flags and how each exercise felt, and tell me in a few bullets what went well, what to change next time and the weights to aim for. Don't change anything yet.

**Weekly check-in**
> Do my weekly check-in: sessions done and missed (and why), hard sets per muscle vs 10-20 a week, effort (RIR), sleep and recovery, PRs. Give me one or two concrete changes for next week and ask before applying them.

**Monthly review + next month**
> It's the end of my month. Do a full review (progress per lift, adherence, recovery, pain, journal context), save it as my month review, then propose the next version of my plan with the data behind each change. Apply it only after I say yes.

**"I only have 3 days"**
> From now on I can only train 3 days a week, about 60 minutes. Rebuild my plan for that while keeping my main lifts and each muscle at roughly 10-20 hard sets a week. Show me the new week before saving.

**"My shoulder hurts"**
> My left shoulder hurts on pressing (dull, 2/3). Look at which exercises load it and my recent pain logs. Change my next workout to avoid the painful movements, and suggest joint-friendlier swaps for the plan. If it sounds serious, tell me to see a doctor.

**"Swap exercises I hate"**
> I hate Bulgarian split squats and skull crushers. Swap them for something that trains the same muscles with the equipment in a normal gym, keep sets and reps similar, and tell me why you picked them.

**"Set my weights for next week"**
> Look at my last two weeks per exercise and set target weights for next week where the app's suggestion seems too easy or too hard for me. Explain each one in a line.

---

## How versions and undo work

- Your plan is one **design week** (the "Build" week). Iron Log turns it into a 4-week month: **W1 ramp-in** (one set fewer), **W2 build**, **W3 overload** (an extra set on smaller lifts), **W4 deload** (half the sets, lighter).
- Every AI change saves a **new version** (1.0.0 → 1.0.1 for tweaks, → 1.1.0 for bigger changes) with a one-line **why**. Your logs, the month and your place in the plan continue.
- **Undo**: ask the AI ("undo the last plan change" / "go back to version 1.0.2"), or in Iron Log open **Plan → Programs**, tap your plan → **Version history** → **Restore**. Restoring saves the old version as a new one, so you can always go back again. Each row shows who made it: *you* or the AI app's name.
- **Switching to a different plan** (or making your own copy of the default plan) starts a **new month at Week 1**. Your history, PRs and weight recommendations always carry over: they follow the exercise, not the plan.
- **Target weights** expire on their date (default 2 weeks) or when you ask the AI to clear them.
- A **next-workout change** is used once, when you start that workout. Ask the AI to "remove the change for my next workout" to cancel it.
- Changes you make yourself in the plan editor are versions too (marked *you*).

## Troubleshooting

| Problem | Fix |
|---|---|
| Claude: "Add custom connector" is greyed out / "Ask an organization owner…" | Your Claude account belongs to a Team/Enterprise organisation. Use **Claude Code** (Option 1), a personal account, or ask the owner. |
| Claude Code: tools missing in another folder | It was added without `--scope user`. Remove it and add it again with `--scope user`. |
| Claude Code: "needs authentication" | Type `/mcp` → iron-log → **Authenticate** and enter a fresh connect code. |
| "That code isn't right" / "expired" | Codes last 10 minutes and work once. Make a new one right before you press Connect. Only the newest code works. |
| "Too many wrong codes" | Wait the minutes shown, then try again with a fresh code. |
| "This app isn't registered" / "Wrong return address" | Remove the Iron Log connector in Claude/ChatGPT and add it again. |
| The AI says it's not connected / asks to sign in again | You (or the app) disconnected it, or it wasn't used for 30 days. Make a new code and reconnect. |
| The AI can't edit your plan | You're on the built-in default plan. Say "make my own copy of my plan first" (it starts a new month at Week 1; nothing is lost). |
| A change didn't show in the app | Pull down / reopen the screen; the app refreshes the plan when it comes back to the front. |
| The weights in the workout look different from what the app usually suggests | An AI target is active (the reason line says "Claude target …" or similar). Ask the AI to clear it. |
| ChatGPT has no "Developer mode" | It depends on your plan and region and may be off for your workspace; see OpenAI's page below. |
| Free Claude says you've reached the connector limit | The Free plan allows one custom connector; remove another one first. |

## For the technically curious

- Standard **MCP over Streamable HTTP** at `/mcp` (stateless JSON responses; supports the 2025-03-26 / 2025-06-18 / 2025-11-25 handshake and the 2026-07-28 per-request metadata style), with **OAuth 2.1 + PKCE (S256)**, protected-resource metadata (RFC 9728), authorization-server metadata (RFC 8414), dynamic client registration (RFC 7591), Client ID Metadata Documents, token revocation (RFC 7009) and rotating refresh tokens.
- Tokens are random 256-bit values; the server stores only their SHA-256 hash.
- Server code: `worker/mcp/*`, `worker/routes/mcp.ts`, `worker/routes/connect.ts`. End-to-end test: `node scripts/test-mcp.mjs http://localhost:5186` (DEV database only).

## Sources

- MCP specification: [Authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization), [Authorization server discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery), [Client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration), [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http), [Versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning), [server/discover](https://modelcontextprotocol.io/specification/2026-07-28/server/discover), [2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- Anthropic: [Building custom connectors via remote MCP servers](https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers), [Connector authentication (callback URL, PKCE, refresh rules)](https://www.claude.com/docs/connectors/building/authentication)
- Anthropic: [Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) (plans, Free = 1 custom connector, Team/Enterprise owner rule, web/desktop), [Claude Code: connect to MCP servers](https://docs.claude.com/en/docs/claude-code/mcp)
- OpenAI: [Connecting custom MCP servers in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt) (menus and plan availability change often)
- OAuth RFCs: [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728), [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414), [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591), [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009), [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html), [RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207), [OAuth 2.1 draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)
