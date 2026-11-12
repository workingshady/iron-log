# Phone notifications (Web Push)

Friends get a real notification on their phone (lock screen, notification shade) when someone messages them, sends or
accepts a friend request, likes or comments on their post, cheers them, or a challenge changes. The rest timer can also
ping you when the rest is over while the app is in the background.

No npm packages and no third-party service: the Worker talks to the browser's own push service (Google FCM for
Chrome/Android, Apple for iPhone, Mozilla, Microsoft) using the standard Web Push protocol.

## How it works

```
phone (browser / Android app)             Worker (Cloudflare)                       push service (FCM / Apple / …)
1. tap "Turn on" → permission prompt
2. pushManager.subscribe(VAPID public key)
   → {endpoint, keys.p256dh, keys.auth}
3. POST /api/push/subscribe  ───────────►  push_subscriptions row (id = sha256(endpoint))
                                          4. something happens (like, message…)
                                             notify() / chat send → after the response:
                                             check prefs + quiet hours, encrypt payload
                                             (RFC 8291), sign VAPID JWT (RFC 8292)
                                             POST endpoint  ─────────────────────────►  stores (TTL) & delivers
5. public/sw.js "push" event ◄─────────────────────────────────────────────────────────  (even if the app is closed)
   decrypt (browser does it) → showNotification
6. tap → "notificationclick" → focus the app window and open the hash route (#/chat/…)
```

| Piece | File |
|---|---|
| Encryption (aes128gcm), VAPID JWT (ES256), sending, pruning, prefs, texts | `worker/push.ts` |
| API: key, subscribe/unsubscribe, devices, test, prefs | `worker/routes/push.ts` |
| Hook: every in-app notification also pushes (only when the row is new) | `worker/friends.ts` `notify()` |
| Hook: new chat message → other members | `worker/routes/chat.ts` (send route) |
| Service worker: `push`, `notificationclick`, `pushsubscriptionchange`, local `notify` message | `public/sw.js` |
| Client: permission, subscribe, device list, prefs, local notifications | `src/lib/push.ts` |
| UI: Settings card, soft pre-prompt, inline nudge | `src/components/push/*` |
| Rest timer local notification | `src/components/RestTimer.tsx` |
| Android app notification delegation | `scripts/build-apk.mjs` (`enableNotifications: true`) |
| Tests (RFC 8291 test vector, round trip, VAPID signature, quiet hours) | `npx tsx scripts/test-push.mts` |

### Endpoints (all after login)

| Method | Path | |
|---|---|---|
| GET | `/api/push/key` | `{key, configured}`: VAPID public key for `applicationServerKey` |
| POST | `/api/push/subscribe` | `{endpoint, keys:{p256dh, auth}, ua}`: save this device (max 10 per person, newest kept) |
| DELETE | `/api/push/subscribe` | `{endpoint}`: turn this device off |
| GET | `/api/push/devices` | my devices (label, created, last delivered, fails), no endpoints or keys |
| DELETE | `/api/push/devices/:id` | remove one device |
| POST | `/api/push/test` | send "Notifications work 💪" to all my devices, returns each push service status |
| GET / PUT | `/api/push/prefs` | `users.prefs.notify`: `{chat, friends, likes, comments, cheers, challenges, rest, quiet:{on,from,to}, tz}` |

### What's sent

Payload (encrypted, ≤ ~300 bytes): `{title, body, url, tag, kind, icon:"/icon-192.png", badge:"/icon-monochrome-512.png", renotify, ts}`.
No private data (journal, pain, body stats) is ever pushed. Chat previews go only to members of that chat.

| Event | Phone text | Opens | Collapse (tag + Topic) | TTL / urgency |
|---|---|---|---|---|
| chat message | DM: **Omar** · "Bench at 6?"; group: **Group** · "Omar: …" | `#/chat/<id>` | one per chat; the SW stacks the last 4 lines, "Omar (3)" | 1 day, high |
| friend request / accept | "Omar wants to be friends" / "…accepted…" | `#/friends` / `#/u/omar` | per person | 7 / 3 days |
| like | "Omar liked your post" | `#/notifications` | one per post, newest liker, **no re-alert** | 3 days, low |
| comment | "Omar commented on your post" | `#/notifications` | one per post, re-alerts | 3 days |
| cheer | "Omar cheered you on" | `#/compete` | per person | 1 day |
| challenge invite / join / won / done | short line | `#/compete` | per challenge | 1-3 days |
| rest timer (local, not a push) | "Rest over" · "Next: Bench press · set 3" | current screen | `rest` | n/a |

Noise control:
- `notify()` only pushes when the in-app notification row is **new** (the ids are deterministic, so like → unlike → like
  doesn't ping twice).
- Chat: only the first message of a burst alerts; messages within 60 s of an unread one update the notification silently.
  Muted chats (`conversation_members.muted`) and blocked people never push.
- If the chat is open and visible on that device, the service worker doesn't show it (the live socket already did).
- `Topic` header (RFC 8030): if the phone is offline, the push service keeps only the newest push per topic.
- Quiet hours (per person, in their time zone): nothing is pushed in that window; it still shows in Activity.

Delivery bookkeeping: `404/410` from the push service → the subscription is deleted. Other failures increment `fails`;
8 in a row → deleted. A success sets `lastOkAt` and resets `fails` (shown as "last delivered" in Settings).

### Implementation notes
- `notify(raw, …)` has no request context, so it uses `import { env, waitUntil } from "cloudflare:workers"` to read the
  VAPID keys and to run the push **after** the response is sent (never awaited on the response path).
- Encryption follows RFC 8291 exactly (ECDH P-256 + HKDF-SHA-256 + AES-128-GCM, one record, rs 4096); `scripts/test-push.mts`
  reproduces the RFC's Appendix A output byte for byte and decrypts with an independent `node:crypto` receiver.
- VAPID: ES256 JWT `{aud: endpoint origin, exp: now+12h, sub: VAPID_SUBJECT}`, cached per push service ~11 h;
  header `Authorization: vapid t=<jwt>, k=<public key>`.
- Endpoints must belong to a known push service (FCM / Google, Mozilla, Apple, Microsoft WNS), so the Worker can't be
  used to POST to arbitrary URLs.
- Local dev: the app only registers `/sw.js` in production builds; `src/lib/push.ts` registers it on demand, and `sw.js`
  skips all caching on `localhost` so Vite keeps working.

## Production setup

Worker vars/secrets (same values as `.dev.vars`; `private/vapid.json` is the key pair):
- `VAPID_PUBLIC_KEY` (var or secret): uncompressed P-256 point, base64url
- `VAPID_PRIVATE_KEY` (**secret**): the JWK `d`, base64url
- `VAPID_SUBJECT` (var): `https://iron-log.workingshady.workers.dev` or `mailto:you@…`

Never change the key pair casually: every existing subscription is bound to the public key. If it does change, each
device re-subscribes on its next app start (`syncPush()`), or from Settings → Notifications.

Android app: rebuild the APK (`node scripts/build-apk.mjs <nextVersionCode>`) for notification delegation. Without the
rebuild, the TWA still uses Chrome's own site notification permission (works, but the notification shows as Chrome's
and Android 13+ may never ask).

## Turning it on (for friends)

**Android app (Iron Log APK):** Settings → Notifications → turn on → Android asks "Allow Iron Log to send you
notifications?" → Allow. Manage later in Android Settings → Apps → Iron Log → Notifications.

**Chrome on Android / desktop:** Settings → Notifications → turn on → Allow. Works with the tab closed (Chrome on Android
needs to be allowed to run in the background; battery savers on some phones, e.g. Xiaomi/Huawei/Samsung "deep sleep",
can delay pushes: set Chrome/Iron Log battery to "Unrestricted").

**iPhone / iPad (iOS / iPadOS 16.4+):** web push only works for an app added to the Home Screen.
Safari → Share → **Add to Home Screen** → open Iron Log **from the icon** → Settings → Notifications → turn on → Allow.
Manage in iPhone Settings → Notifications → Iron Log.

Then tap **Send test**. "What pings me" picks the types, quiet hours, and lists your devices (remove old phones there).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Card says "Blocked on this device" | The browser remembers "Block". Android app: long-press icon → App info → Notifications → allow. Chrome: ⋮ → Settings → Site settings → Notifications → allow this site. iPhone: Settings → Notifications → Iron Log. Then turn on again. |
| iPhone: no toggle, "Add to Home Screen first" | Safari tab can't receive push. Install to Home Screen and open from the icon (iOS 16.4+). |
| "Send test" says sent, nothing appears | Phone in Do Not Disturb / Focus, or battery optimisation killing Chrome. Check Android notification channel for Chrome/Iron Log isn't silenced. |
| "No device took it" | The subscription expired. Turn notifications off and on again on that phone. |
| Pushes stopped after a while | The push service rotated the subscription: `pushsubscriptionchange` re-subscribes, and every app start re-syncs. Opening the app once fixes it. |
| Server error "Push isn't set up on the server" | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` missing in the Worker env. |
| Rest-timer notification late or missing with the screen off | The page runs the timer; Android may pause a backgrounded page after a few minutes. Short rests (< 5 min) are fine; the sound/vibration still plays when you come back. |
| Duplicate notifications | Two devices on the same phone (browser + app). Remove one in "What pings me" → Devices. |

## Not built (yet)
- Daily workout reminder at a chosen time: needs a scheduler. Option: a Cron Trigger (`"triggers": {"crons": ["*/15 * * * *"]}`
  + `scheduled()` export in `worker/index.ts`) that pushes to people whose reminder time falls in the window and who
  haven't trained today. Free plan allows it.
- Server-side rest timer push (reliable with the screen locked for long rests): a Durable Object alarm set at rest start.

## Sources
- RFC 8030 Generic Event Delivery Using HTTP Push (TTL, Urgency, Topic): https://www.rfc-editor.org/rfc/rfc8030
- RFC 8291 Message Encryption for Web Push (test vector in Appendix A): https://www.rfc-editor.org/rfc/rfc8291
- RFC 8292 VAPID: https://www.rfc-editor.org/rfc/rfc8292
- RFC 8188 Encrypted Content-Encoding for HTTP (aes128gcm): https://www.rfc-editor.org/rfc/rfc8188
- web.dev, Push notifications overview: https://web.dev/articles/push-notifications-overview
- web.dev, Permission UX: https://web.dev/articles/push-notifications-permissions-ux
- MDN Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API, `showNotification`: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification, `pushsubscriptionchange`: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/pushsubscriptionchange_event
- WebKit, Web Push for Web Apps on iOS and iPadOS (16.4, Home Screen only): https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Chrome, TWA notification delegation: https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide ; Bubblewrap `enableNotifications` (adds `POST_NOTIFICATIONS` + `NotificationPermissionRequestActivity`): https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/core/src/lib/features/FeatureManager.ts
- Android 13 notification runtime permission: https://developer.android.com/develop/ui/views/notifications/notification-permission
- Cloudflare Workers, `waitUntil` / `env` from `cloudflare:workers`: https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil , https://developers.cloudflare.com/workers/runtime-apis/bindings/#importing-env-as-a-global
