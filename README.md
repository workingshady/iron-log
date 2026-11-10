# Iron Log

A personal, mobile-first strength training tracker: **Cloudflare Workers + D1 + React**, all on the free tier.

- Logs every set, rest, note, pain, swap, missed day + excuse, and every tap.
- The training program is plain data in [`program/`](program/), versioned, so it's easy to edit, review and roll forward.
- Works offline. Writes sync when you're back online.

**Using it:** [docs/GUIDE.md](docs/GUIDE.md) · **Monthly review with Claude:** [CLAUDE.md](CLAUDE.md) · **Plan history:** [program/CHANGELOG.md](program/CHANGELOG.md)

## Setup (once)
```bash
npm install
cp .dev.vars.example .dev.vars          # local passcode
npm run db:migrate                      # local DB
npm run dev                             # http://localhost:5173
```

Deploy (Cloudflare account + `npx wrangler login`):
```bash
npx wrangler d1 create iron-log         # put the id in wrangler.jsonc (already done)
npm run db:migrate:remote
npx wrangler secret put APP_PASSCODE    # your login passcode
npm run deploy
```

## Edit the plan
| Want to… | Do this |
|---|---|
| Change sets/reps/rest of a day | edit `program/versions/v1.ts` (or the current version) |
| Add an exercise | add a block to `program/exercises.ts` |
| Add an alternative | add its key to `alts` + an optional conversion in `program/swaps.ts` |
| Start a new version | copy the version file, bump `version`, set `CURRENT` in `program/index.ts` |
| Add an excuse / pain area / tag | `shared/lists.ts` |

Then: `npm run check && npm run deploy`.

## Layout
```
program/   plan as data (exercises, versions, swaps, changelog)
shared/    types + pick-lists used by API and UI
worker/    Cloudflare Worker API (Hono) + D1 schema (Drizzle)
src/       React UI (screens/, components/, lib/)
migrations/ SQL migrations (generated)
scripts/   export + program check
private/   git-ignored: data exports, personal notes
```

## Android app (APK)
Download: **[latest release](https://github.com/workingshady/iron-log/releases/latest)** → `iron-log-x.y.z.apk` → open on the phone → allow "install unknown apps" once.
It's a Trusted Web Activity: the live site, full-screen, same data, updates with every deploy (the APK only needs rebuilding to change the icon/name/package).

Rebuild (needs JDK 17 + Android SDK, and the signing key in `private/android/` — never committed):
```
node scripts/build-apk.mjs <versionCode> <versionName>     # e.g. 2 1.0.1 → private/android/out/iron-log-1.0.1.apk
gh release create v1.0.1-android private/android/out/iron-log-1.0.1.apk --title "Iron Log Android 1.0.1"
```
Always increase `versionCode` and sign with the SAME key, or Android refuses the update. `/.well-known/assetlinks.json` must keep the key's SHA-256.
