# Sign in with Google: complete setup guide

Iron Log already contains all the code for Google sign-in. It turns on by itself once the Worker has **two secrets**:
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Until then `GET /api/auth/providers` returns `{"google": false}` and every
Google button stays hidden, so nothing breaks while you set it up.

| | |
|---|---|
| Google Cloud project | **iron-log**, ID `iron-log-514509`, project number `1077365779389` |
| Live app | `https://iron-log.workingshady.workers.dev` |
| Local dev | `http://localhost:5173` |
| Callback (redirect URI) | `https://iron-log.workingshady.workers.dev/api/auth/google/callback` |
| Privacy policy | `https://iron-log.workingshady.workers.dev/privacy` |
| Terms of service | `https://iron-log.workingshady.workers.dev/terms` |
| Consent-screen logo | `public/brand/google-logo-120.png` (120 × 120 PNG, in this repo) |
| Time needed | about 10 minutes |

---

## Where you are now (checklist)

| # | Step | Where | Status |
|---|---|---|---|
| 1 | Project created | Cloud console | ✅ done (`iron-log-514509`) |
| 2 | Google Auth Platform configured | Auth Platform → Overview | ✅ done ("OAuth configuration created") |
| 3 | Branding: name, support email, home page, authorised domain | Auth Platform → Branding | ✅ done |
| 3b | Branding: privacy policy + terms links, logo | Auth Platform → Branding | ⬜ **next** (section 3) |
| 4 | Audience: **Publish app → In production** (recommended) or Testing + test users | Auth Platform → Audience | ⬜ |
| 5 | Data access: 3 basic scopes | Auth Platform → Data access | ⬜ |
| 6 | Create the OAuth client (Web application) | Auth Platform → Clients | ⬜ (Overview says *"You haven't configured any OAuth clients"*) |
| 7 | Put the 2 secrets in the Worker | your terminal | ⬜ |
| 8 | Test: link your account, sign in, invite a friend | the app | ⬜ |

---

## How it works (so the settings make sense)

```
 Phone / browser                Iron Log Worker                         Google
 ───────────────                ───────────────                         ──────
 tap "Sign in with Google" ──▶  /api/auth/google/start
                                 makes state + nonce + PKCE secret,
                                 stores them in a signed 10-min cookie
                           ◀──  302 redirect ─────────────────────────▶ accounts.google.com
                                                                         you pick your Google account
                                                                         and agree to share name + email
 /api/auth/google/callback ◀───────────────────────────────────────────  302 back with a one-time ?code=
                                 checks state, exchanges code + PKCE
                                 secret + CLIENT_SECRET for an id_token ─▶ oauth2.googleapis.com/token
                                 verifies the id_token signature with
                                 Google's public keys, plus iss / aud /
                                 exp / nonce / email_verified
                                 finds YOUR Iron Log account by the
                                 Google id → sets the login cookie
 lands on Home             ◀──  302 /#/
```

- The **client ID** tells Google which app is asking (not secret). The **client secret** proves to Google that the server is really
  Iron Log, so it lives only in Cloudflare's secret store.
- Only the scopes `openid email profile` are used: Iron Log never sees your Google password, Gmail, Drive or contacts.
- Iron Log stays **invite-only**: a Google account that isn't linked to an Iron Log account can't get in. New people need an
  invite link first.

---

## 1. Open the Google Auth Platform

1. Go to <https://console.cloud.google.com/auth/overview>.
2. Top bar → project picker → choose **iron-log** and check the ID is `iron-log-514509`. Every later step must happen in this project,
   or you'll see the wrong app name and `invalid_client` errors.
3. Left menu: **Overview · Branding · Audience · Clients · Data access · Verification centre · Settings**.

## 2. Branding: what's already filled in

**Google Auth Platform → Branding.** You already have:

| Field | Your value | Note |
|---|---|---|
| App name | `iron-log` | You can change it to **`Iron Log`** (nicer on the consent screen). Must not contain "Google". |
| User support email | your Gmail | Shown to people on the consent screen if they have questions. |
| Application home page | `https://iron-log.workingshady.workers.dev` | ✅ |
| Authorised domain 1 | `workingshady.workers.dev` | ✅ Correct: `workers.dev` is a public suffix, so your "top private domain" is `workingshady.workers.dev`. |
| Developer contact email | your Gmail | Google sends project notices here. |

## 3. Branding: finish the missing fields

Still on **Branding**:

1. **Application privacy policy link** → `https://iron-log.workingshady.workers.dev/privacy`
2. **Application Terms of Service link** → `https://iron-log.workingshady.workers.dev/terms`
3. **App logo** → **leave it empty** if you publish to Production (section 4). In Production an uploaded logo makes Google require
   **brand verification** before the consent screen can be used normally. `public/brand/google-logo-120.png` (square 120 × 120 PNG)
   is ready for later if you do verify the brand, and it's fine to upload while the app stays in Testing.
4. **Save**.

> Both pages are already live (open them to check). Use the clean addresses without `.html`.

The pages say, in plain words, what Iron Log collects, who can see what, that Google data is only used to sign in
(Google's **Limited Use** policy), how to download / delete data, and the health disclaimer. Edit `public/privacy.html` /
`public/terms.html` if anything changes.

## 4. Audience: publish to Production (recommended)

**Google Auth Platform → Audience**

1. **User type: External.** "Internal" is only for Google Workspace organisations; a normal Gmail account can't pick it.
2. **Publishing status → Publish app → Confirm.** It becomes **In production**, the same as your other project (Moto Infinite).

Why Production works for Iron Log without any review:

| | |
|---|---|
| Scopes | Iron Log asks only `openid email profile`, which are **non-sensitive**. Google's app (scope) verification is only for sensitive / restricted scopes, so there is nothing to submit. |
| "OAuth user cap 1 / 100" | You saw this on Moto Infinite. The cap only counts users granting **unapproved sensitive or restricted** scopes. With basic scopes it doesn't limit you. |
| Who can sign in with Google | Any Google account, with no test-user list to maintain. **Iron Log is still invite-only**: a Google account that isn't linked to an Iron Log account (or joining with an invite) gets "No Iron Log account uses this Google account yet". |
| Consent screen | Works right away. Until the **brand** is verified, Google may show the domain (`workingshady.workers.dev`) instead of the name "Iron Log", with no logo. That's cosmetic. |
| Brand verification (optional) | Needed only to show the name + logo. It requires proving you own the authorised domain in **Google Search Console**. `workers.dev` is a public suffix, so `workingshady.workers.dev` counts as your own domain; verifying it with an HTML file in `public/` may work, otherwise use a custom domain. Ask Claude to add the verification file if you want to try. |

**Alternative: stay in Testing.** Then only Gmail addresses you list under **Test users** (max 100 for the project's lifetime) can
sign in, others get *"Access blocked: iron-log has not completed the Google verification process"* (403), and the consent screen
shows *"Google hasn't verified this app"* (tap **Continue**). Only useful if you want Google itself to block unknown accounts.

## 5. Data access: the 3 basic scopes

**Google Auth Platform → Data access → Add or remove scopes**

Tick only:

| Scope | Shown as | Why |
|---|---|---|
| `openid` | OpenID | sign-in itself |
| `.../auth/userinfo.email` | email | to show which Google account is linked |
| `.../auth/userinfo.profile` | profile | name for a new account |

**Update → Save.** All three are **non-sensitive**, so no security review is ever needed. Don't add anything else.

## 6. Create the OAuth client

**Google Auth Platform → Clients → + Create client**

1. **Application type:** `Web application`
2. **Name:** `Iron Log web` (only you see it)
3. **Authorised JavaScript origins** → **+ Add URI** for each:
   - `https://iron-log.workingshady.workers.dev`
   - `http://localhost:5173`
4. **Authorised redirect URIs** → **+ Add URI** for each:
   - `https://iron-log.workingshady.workers.dev/api/auth/google/callback`
   - `http://localhost:5173/api/auth/google/callback`
5. **Create**.

A dialog shows:

- **Client ID** like `1077365779389-xxxxxxxx.apps.googleusercontent.com`
- **Client secret** like `GOCSPX-xxxxxxxxxxxxxxxx`

**Copy both now** (or **Download JSON**). New projects show the secret **only once**. If you lose it: open the client →
**Add secret** → use the new one → delete the old one.

Redirect-URI rules (the #1 cause of errors): the URI must match **exactly**: `https`, the full host, the path
`/api/auth/google/callback`, **no trailing slash**. `http://` is allowed only for `localhost`. Changes can take 5 minutes to a few
hours to apply.

## 7. Give the secrets to the Worker

In a terminal in the project folder (`D:\90_Graveyard\iron-log`). In Claude Code you can type each line with `!` in front:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
# paste the Client ID → Enter
npx wrangler secret put GOOGLE_CLIENT_SECRET
# paste the Client secret → Enter
```

- Secrets take effect immediately on the live Worker; no redeploy needed for them.
- Check they exist (values stay hidden): `npx wrangler secret list`.
- **Never** paste the secret into chat, code, docs, GitHub issues or screenshots.

For local development only, add the same two values to `.dev.vars` (git-ignored, never committed):

```
GOOGLE_CLIENT_ID=1077365779389-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
```

## 8. Test it

1. Open <https://iron-log.workingshady.workers.dev/api/auth/providers> → it must show `{"google":true}`.
   (`false` = one of the two secrets is missing or misspelled.)
2. **Link your own account first:** log in with `a_leoboy1` + passcode → **You → ≡ → Account & security → Google → Link** →
   choose your Gmail → you return to Account & security with *"Google is linked"*.
3. **Sign in with Google:** log out → on the login screen tap **Sign in with Google** → you land on Home.
4. **Invite a friend:**
   1. Only if you stayed in Testing: add their Gmail to **Audience → Test users** (section 4).
   2. In **Account & security → Invite friends → New invite**, share the link (`…/#/join/ABCD2345`).
   3. On the join screen they tap **Sign up with Google** (or choose a username + passcode).
   4. A Google-made account gets a username from their Gmail name and **no passcode**. They can add one in Account & security,
      and should, as a backup.
5. Google sign-in is switched off in DEV (test) mode on purpose: test with your real account.

## 9. Testing vs Production (summary)

| | **In production** (recommended) | **Testing** |
|---|---|---|
| Who can use Google sign-in | any Google account linked to / invited into Iron Log | only listed test users (≤ 100, lifetime) |
| Warning screen | none for basic scopes | "Google hasn't verified this app" → Continue |
| Name / logo on consent | after brand verification (else shows the domain) | shown |
| Review needed | none (basic scopes) | none |
| Iron Log access control | invite-only either way | invite-only either way |

## 10. Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| No Google button in the app | `/api/auth/providers` returns `false` | A secret is missing → step 7, then `npx wrangler secret list`. |
| `Error 400: redirect_uri_mismatch` | The callback isn't in the client's list exactly | Clients → Iron Log web → add `https://iron-log.workingshady.workers.dev/api/auth/google/callback` (no trailing slash). Wait a few minutes. Running Vite on another port? Add that port's callback too. |
| `Error 403: access_denied` / "Access blocked: … has not completed the Google verification process" | App is still in Testing and that Gmail isn't a test user | Audience → **Publish app** (section 4), or add the Gmail as a test user. |
| Consent screen says `workingshady.workers.dev` instead of "Iron Log" | Production without brand verification | Cosmetic; verify the brand (section 4) if you want the name + logo. |
| Google asks for verification after you uploaded a logo | A logo in Production needs brand verification | Remove the logo in Branding, or complete brand verification. |
| `Error 401: invalid_client` / "The OAuth client was not found" | Wrong/old client ID, or secret from another client | Re-copy both from **Clients → Iron Log web**, run `wrangler secret put` again for **both**. |
| `Error 400: invalid_request` mentioning origin | The JavaScript origin is missing | Add `https://iron-log.workingshady.workers.dev` under Authorised JavaScript origins. |
| Consent screen shows another app name | Client made in the wrong project | Check the project ID `iron-log-514509` in the top bar. |
| App: "No Iron Log account uses this Google account yet" | That Google account isn't linked | Log in with passcode → Account & security → Link; or join with an invite. |
| App: "That Google account is already linked to another Iron Log account" | One Google account = one Iron Log account | Unlink it there first. |
| App: "The Google sign-in took too long…" | The 10-minute sign-in cookie expired, or you switched browser/tab mid-way (e.g. the Android app opened Chrome) | Start again in the same browser / app. |
| Works on the website but not in the Android app | The app opens Google in a browser tab, and the cookie must come back to the same place | Finish sign-in in the tab it opened; if needed sign in once on the website, then reopen the app. |
| "Can't unlink: set a passcode first" | You'd lock yourself out | Account & security → set a passcode → unlink. |

## 11. Security notes

- The client **secret** exists only in Cloudflare Worker secrets and your local `.dev.vars`, never in code, docs or git.
- PKCE (stops stolen codes), `state` (stops cross-site forgery) and `nonce` (stops replayed tokens) are all checked; the
  `id_token` signature is verified against Google's published keys on every sign-in.
- The sign-in cookie is HttpOnly, Secure, SameSite=Lax, single-use, HMAC-signed and lasts 10 minutes.
- Iron Log stores only your Google account id (`sub`) and email; no Google access/refresh tokens are kept.
- Error redirects carry short codes (`?auth_error=no_account`), never free text, so nobody can put fake messages on the login page.
- If the secret ever leaks: **Clients → Iron Log web → Add secret** → `wrangler secret put GOOGLE_CLIENT_SECRET` with the new one →
  delete the old secret in the console.
- People can remove Iron Log's access from their Google account any time at <https://myaccount.google.com/permissions>.

## Official docs

- Google Auth Platform: manage OAuth clients: <https://support.google.com/cloud/answer/15549257>
- Consent screen, audience & test users: <https://support.google.com/cloud/answer/15549945>
- Unverified apps & the 100-user cap: <https://support.google.com/cloud/answer/7454865>
- OAuth 2.0 for web server apps (redirect-URI rules, PKCE): <https://developers.google.com/identity/protocols/oauth2/web-server>
- OpenID Connect (id_token validation, JWKS, nonce): <https://developers.google.com/identity/openid-connect/openid-connect>
- Brand verification: <https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification>
- Google API Services User Data Policy (Limited Use): <https://developers.google.com/terms/api-services-user-data-policy>
- Sign in with Google branding guidelines: <https://developers.google.com/identity/branding-guidelines>
- Cloudflare Wrangler secrets: <https://developers.cloudflare.com/workers/configuration/secrets/>
