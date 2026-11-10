# Iron Log: notes for Claude

Personal training tracker for Shady (Cairo, UTC+3, Fri-Sat weekend; ~174 cm, ~80 kg, returning after a break).
Goals: muscle + strength, first strict pull-ups and dips, strong core, wrestler traps/neck/forearms/grip, healthy wrists.

## Stack (all Cloudflare free tier)
- `worker/`: Hono API on Cloudflare Workers. `worker/db/schema.ts` = Drizzle schema for D1 (SQLite).
- `src/`: React + Tailwind v4 mobile UI (Vite + `@cloudflare/vite-plugin`). Hash routes, no router lib.
- `program/`: **the training plan as data.** `exercises.ts` (library + YouTube ids; check with `npx tsx scripts/check-videos.ts`), `versions/vN.ts` (plans), `swaps.ts` (alternative conversions), `groups.ts` (muscle group per exercise), `muscles.ts` (primary/secondary muscles per exercise for the body heatmap; secondary = ½ set), `learn.ts` (glossary, warm-up, levels, what-if, nutrition), `index.ts` (`CURRENT`).
- `shared/`: types + pick-lists (excuses, set kinds, pain areas) used by both sides. `shared/recommend.ts` = load recommendation rules (double progression + RIR + e1RM + deload + pain/feedback), warm-up ramp, plate math.
- `private/`: git-ignored. Exports land in `private/exports/<date>/`.

Commands: `npm run dev` · `npm run check` (validate program + types) · `npm run deploy` · `npm run export` (live DB → private/exports) · `npm run db:generate` then `db:migrate` / `db:migrate:remote` after schema edits.

## Data model (D1)
- `sessions`: status `active|done|abandoned|missed|skipped`, kind `planned|picked|extra`. `plan` JSON = the exact plan used (swaps included). `readiness` JSON (sleep/energy/mood/stress/soreness 1-5), `rpe` 1-10, `excuse` id.
- `sets`: kg/reps/seconds/meters/assist, `rir`, `kind` (N/W/D/F/R), `rest_before_s` (real rest), `done_at`, `note`, `pain_area`+`pain_level` (1-3), `swapped_from`, `suggested` (JSON of the app's recommendation at log time: compare with actual to tune `shared/recommend.ts`), `pr` (1 = PR when logged), `deleted`.
- `feedback`: per exercise per session (`id = sessionId:itemIdx`): `effort` easy|right|hard|too_much, `joints` fine|achy|pain (RP-style autoregulation).
- `events`: every tap (`set_done`, `set_edit`, `set_undo`, `rest_start/adjust/skip/done`, `ex_swap` {from,to,reason}, `ex_skip`, `ex_move`, `video_open`, `session_*`…).
- `body` (optional, any day), `tests`, `journal`, `intake` (creatine grams: item/amount/unit per entry), `settings` (schedule, creatineTarget), `program_versions` (a snapshot of each version used).
- Derived: `/api/dashboard` (calendar, forgiving streak: planned-rest/sick misses don't break it, adherence, creatine), `/api/insights` (`worker/insights.ts` rules + sets per muscle group from `program/groups.ts`), `/api/analytics` (`worker/analytics.ts`: calendar-week trends, fractional hard sets per muscle, e1RM trends, "what goes with good workouts" associations; formulas documented in the file, test with `npx tsx scripts/test-analytics.ts`).
- Plan position = the first (week, day) in `program.order` with no `done`/`skipped` session for this program id. `missed` does **not** advance it.

## Android app
- APK = Trusted Web Activity of the live site (`scripts/build-apk.mjs`, Bubblewrap core). Package `com.workingshady.ironlog`, key `private/android/iron-log.keystore` (password in `private/SETUP.md`), fingerprint served at `public/.well-known/assetlinks.json`. Releases: `gh release create vX-android <apk>` (gh at "C:/Program Files/GitHub CLI/gh.exe"). Bump versionCode each build; never change the key.
- Brand: `public/icon.svg` (app icon), `public/icon-maskable.svg`, `public/brand/{mark,logo,logo-light}.svg`; PNGs are renders of these.

## Modes & databases
- `DB` (iron-log) = real data. `DB_DEV` (iron-log-dev) = test data, used when logged in with the `DEV_PASSCODE` secret (cookie prefixed `dev.`). Every handler uses `db(c)` which picks the right one. Never seed, reset or experiment on `DB`; use DEV mode (`POST /api/dev/seed` refills it).
- Migrations must be applied to BOTH: `wrangler d1 migrations apply iron-log --remote` and `... iron-log-dev --remote`. Take `wrangler d1 export iron-log --remote --output private/backups/...` before migrating real data; additive schema changes only, data mappings via custom migrations (see 0005).
- Week planner: `shared/weekplan.ts` (scenarios: `npx tsx scripts/test-weekplan.ts`); marks stored in settings `weekMarks`. Football games are cardio rows with protocol `football`.
- Recommendations from an export: `npx tsx scripts/recs-from-export.ts private/exports/<date> <week>`.

## Review workflow (when asked to analyse data / make the next version)
1. `npm run export`, then read `private/exports/<latest>/summary.md` first, then the JSON as needed.
2. Look at the following, per exercise and per week:
   - **Progression:** hit the top of the rep range at the target RIR → raise load (+2.5 kg upper / +5 kg lower, or the next DB step). Stalled 2+ sessions → change rep range or variation.
   - **Effort accuracy:** logged RIR vs the target. Constantly easier → raise targets. RIR 0 everywhere → too much.
   - **Recovery:** readiness trends, session RPE, sleep/body logs, duration creep, real rest vs prescribed.
   - **Adherence:** missed/skipped + excuse patterns (e.g. Thursdays always missed → move days or shorten that session).
   - **Pain & swaps:** repeated pain areas or swaps on one lift → replace it, lower volume, or change grip/ROM. Take pain seriously; sharp (3) = remove the movement.
   - **Pull-up / dip level** from tests and sets → apply the level table (0 / 1-3 / 4-7 / 8+) from the original plan.
   - **Journal:** life context explains bad weeks. Don't punish a stressful week.
3. Make the new version: copy `program/versions/vN.ts` → `vN+1.ts`, bump `version` (minor for tweaks, major for a new block), and write `changelog` in 1-2 lines. Add it to `ALL_VERSIONS` and set `CURRENT`. A new program id starts the plan position from Week 1. The same id with a new version keeps the position.
4. Add a section to `program/CHANGELOG.md`: what changed and **why (with the data that showed it)**.
5. `npm run check` → `npm run deploy` → commit.

## UI principles in use
Gestalt grouping (one card = one topic, labels next to values), one meaning per color (green done/primary, amber in-progress/tips, red pain/missed/destructive, blue rest/info, violet creatine), dark grey surfaces stepping lighter for depth, one primary action per screen (Hick), ≥44px targets with the main button low (Fitts), details in sheets (progressive disclosure), a forgiving streak plus adherence % that never resets.

## Rules for code changes
- Keep the UI decluttered: one primary action per screen, details behind a tap (sheets), no walls of text.
- Big touch targets (≥44px), numbers in tabular figures, dark theme tokens in `src/index.css`.
- Never break offline logging: all writes go through `queue()` in `src/lib/api.ts` with client-generated ids.
- Don't rename stored ids (exercise keys, excuse ids, set kinds). Add new ones instead.
- Commits: no Co-Authored-By trailer. Never commit `private/` or `docs/superpowers/`.
