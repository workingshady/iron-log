# Iron Log: how to use it

Your personal training tracker. It runs free on Cloudflare (Workers + D1). On your phone, open the site → browser menu → **Add to Home Screen**, and it behaves like an app.

## The 30-second version
1. **Today** → **Start workout**. Rate how you feel (optional, 5 taps), then tap **Start**. The session clock starts.
2. The current exercise is open. The weight and reps are **already filled in** from last time. Change them if needed, then tap **✓ Log set**.
3. The **rest timer** starts on its own. It beeps (and vibrates on Android) when rest is over. Use −15 / +15 / ✕ as needed.
4. After each set, tap the **RIR** you had left (0 = failure, 4+ = easy). This is optional but very useful for the review.
5. **Finish** → rate the session 1-10 → add a note → done.

## Every screen (phone: bottom bar + More · PC: left sidebar)

| Page | What it's for |
|---|---|
| **Home** | Dashboard: next workout (with exercise thumbnails), this week, streak, adherence %, minutes, creatine today, training calendar (heatmap), insights, sets/week, bodyweight trend |
| **Plan** | The whole month: Week 1-4 tabs, every day and exercise with thumbnails, targets, rest, technique (ⓘ explains words like "drop set"). Start any day from here. **Muscle map** shows which muscles that week hits. |
| **History** | Calendar + every workout and missed day (with the reason). Filter all / workouts / missed. Tap a workout to see or edit it. |
| **Stats** | "Am I getting stronger?" Insights, hard sets per muscle vs the 10-20 target, **body heatmap** (front/back; what you did vs what the plan asks), per-week bars, per-exercise trend (tap for chart + table), missed-day reasons, pain log |
| **Creatine** | Daily grams: one tap for 3/5/10 g, progress ring, streak, calendar |
| **Body & habits** | Weight, waist, sleep, protein, steps, water, energy. **Not daily**: fill only what you know, whenever (weekly weigh-in is enough). |
| **Tests** | Max-effort benchmarks (pull-ups, dips, hangs…). Test at the start and on Week 4 · Day 6. |
| **Journal** | Your story in your own words (wins, struggles, pain, life). The monthly review reads it for context. |
| **Learn** | Words & set types, warm-up checklist, pull-up/dip levels, "what if…", nutrition, safety |
| **Settings** | Schedule A/B, creatine target, download all data, log out, **Reset (delete everything)** |

**Colors mean one thing each:** green = done / main button · amber = in progress / tips · red = pain, missed, delete · blue = rest timer & explanations · violet = creatine.

## Entering weight (it depends on the equipment)
| Equipment | What to type | Example |
|---|---|---|
| Barbell (bench, squat, RDL, OHP, close-grip) | **Total incl. the bar** (20 kg default), or tap **per side** and type one side's plates | 20 kg plate each side → 60 |
| EZ / curl bar | Total incl. the EZ bar (Settings → bar weights; EZ bars vary 5-14 kg) | 10 kg bar + 5 each side → 20 |
| Two dumbbells | **One dumbbell = per hand** | two 20s → 20 |
| One dumbbell / cable / machine | The number on the dumbbell / pin | rope at 25 → 25 |
| Bodyweight | Empty, or only the extra weight | +10 plate → 10 |

Your Nov 9 dumbbell sets were typed as totals (40 = 20 each hand). They are **kept exactly as logged** and tagged `total`; the app shows them halved.

## Recommended weights (every set, every exercise, every day)
Each exercise shows **Today: 75 kg × 6** plus *why*, and the inputs are pre-filled. The same numbers are on **Plan** (→), **Home** (Today's targets) and **Stats → Next session**.

| Colour | Rule | Example (your data) |
|---|---|---|
| 🟢 +1 step | Top of the rep range on every set with ≥ target reps in reserve | bench 3×6 @75 with 2 left → 77.5 |
| 🟢 +2 steps | same + you tapped "Easy" | |
| 🔵 same, +1 rep | inside the range, or 1 rep short | incline 22.5/hand × 9, 7 → 22.5 × 9 |
| 🔵 same, own it | top reps but at RIR 0 when the target was 2 | bench 75×6 @0 → stay 75 |
| 🟠 ~3% lighter per missing rep | average 2+ reps below the range (max −15%, rounded down) | triceps 30 × 10, 8, 5, 5 → 25 × 10 · close-grip 40 × 7, 7, 5 → 37.5 × 8 |
| 🟠 1 step lighter | pain, or "Joints: Pain" | |
| ⚪ from your max | rep target changes a lot between weeks | e1RM 90, 6 reps @RIR 2 → 70 |
| ⚪ starting estimate | never done it: from your bench est. max (or bodyweight) × a strength-standard ratio, −10% safety, ~3 reps left | pulldown 50 × 8 · machine row 50 · squat 70 × 6 · RDL 70 × 8 · leg press 115 × 12 |
| ⚪ deload | week 4 | −10% |

**Ignored for decisions:** warm-ups, drop sets, rest-pause mini-sets, sets marked **Cheated**.
**Math:** est. max = kg × (1 + (reps + RIR)/30). RIR trusted only 0-3 (people under-call it by ~1 rep and are worst far from failure). Dumbbells move in 2.5 kg steps per hand.

**Recommended vs actual:** every set stores what the app recommended when you logged it. Stats → *Recommended vs actual* shows each session with **beat / hit / close / missed**; the monthly review uses it to tune the rules.

## Extra sets, drop sets, rest-pause
- **Drop set**: opens a small panel already ~25% lighter → type reps → Log. Tap again for a double drop. No rest timer, you stay on the exercise.
- **Rest-pause**: same weight, rest 15-20 s, log the mini-set reps (don't add them to the main set).
- **Extra set**: a normal set beyond the plan; the rest timer runs.

## Your week (Settings)
**Week starts on** Sat / Sun / Mon, and **preferred rest days** (tap to toggle). Saved instantly; every screen updates. These are preferences: the planner keeps them free when it can.

## Football weeks (adaptive week)
The planner tries every possible arrangement of your remaining sessions and picks the best one. Hard rules: no lifting on football or busy days; heavy Legs never the day before, of, or after football. Then it scores: program order, no same muscles two days in a row (Pull→Chest+Back, Push→Shoulders+Arms), max 3 hard days in a row (football counts), recovery the day after football, and your preferred rest days.
Example (Mon start, Push done, football Wed): Tue Pull · Wed ⚽ · Thu rest (Tue-Sat would be 5 hard days straight) · Fri Legs (48 h after) · Sat Chest+Back · Sun Shoulders+Arms.
Cardio follows it too: football = your cardio, and no hard intervals the day before football or Legs.


Plan (top) and Home show **This week** as 7 tiles. Tap a day → **⚽ Football** or **Busy**. The week re-fits itself:
- No lifting on a football day. **Heavy Legs never the day before, the day of, or the day after football**; 2 days before only if nothing else fits (≥48 h between a match and heavy leg work).
- Sessions keep program order when they can — otherwise Legs is moved later and an upper day comes first.
- Your schedule's rest days stay rest days unless the sessions wouldn't fit. Max 3 hard days in a row (football counts).
- Shoulders + Arms next to a football day → skip the leg booster (split squats).
- If Legs can't fit safely: **Legs-lite** (squat + RDL + calves, 2 sets) on the safest day, or **Skip Legs this week (football)** — football already loaded your legs. Other sessions that don't fit move to next week (the week stretches).
- After the game, tap the day → **Log the game** (minutes + intensity). It counts as cardio (~7 METs).
Home's main card follows the adapted plan ("Adapted week: Legs moved…").

## Grip & Wrist (optional extra)
Plan → **Grip & Wrist** (12-15 min, up to 2×/week): barbell finger curls (roll the bar to your fingertips and back), behind-the-back wrist curls, reverse wrist curls, dumbbell pronation/supination, radial deviation (hammer lever), heavy dumbbell holds. It covers every direction the wrist moves plus grip. Do it after Chest+Back / Shoulders+Arms or on a rest day — never before Pull or the day before Pull (grip must be fresh for pulling). It starts as an *extra* and never moves your place in the plan. Weekly forearm work without it: Pull dead hangs, Legs farmer's carries, Chest+Back wrist curls, Shoulders+Arms reverse curls.

## DEV / test mode
Log in with the **DEV passcode** instead of yours → an orange "DEV MODE" bar, a **separate test database**, and separate phone storage. Settings → **Fill with dummy data** loads ~3 weeks of fake training (all set types, notes, pain, football, cardio, creatine). Try anything; your real tracking is never touched. Log out and use your normal passcode to go back.

## Inside a workout
- **Tap an exercise** to open or close it. After each set, the app moves you to the right place: superset partners alternate A1 → A2 → A1, then it goes to the next exercise.
- **The order for each set:** check the suggested kg/reps (already filled in) → do the set → tap **reps left in the tank** (RIR, optional) → **Log set**. Faded rows below show the sets still to come.
- **Warm-up sets** (heavy lifts): "Show warm-up sets" gives a ramp (bar → 50% → 70% → 85%). Tap each after doing it.
- **Plates per side** appear for barbell lifts (20 kg bar).
- **🏆 PR**: beat your best estimated max, reps or hold time, and it lights up. PRs are listed when you finish and in Stats.
- **Quick check** after the last set of each exercise: how hard (Easy / Just right / Hard / Too much) and joints (Fine / Achy / Pain). Optional, two taps. It tunes next time's weight.
- **Add a note** under the set before logging (e.g. "shoulder tight", "lost count") — no need to edit afterwards.
- **Tap a logged set** to edit everything about it: kg, reps, seconds, set type (warm-up / normal / drop / failure / rest-pause), RIR, quick tags, a free **note**, and **pain** (area + mild/moderate/sharp). You can delete it here too.
- **Undo**: right after logging, an "Undo" button shows for 6 seconds.
- **Extra: Set / Drop set / Warm-up**: log sets beyond the plan. Tap ⓘ to see what a drop set is. Warm-ups don't count toward volume.
- **How-to video**: muscles, form cues and the YouTube video (it only loads when you tap it), plus a YouTube search link.
- **Swap · skip · more**: swap for an alternative · ±1 planned set · move up/down · skip the exercise today.
- Orange technique text with ⓘ (e.g. "Last set: drop set") → tap it for a plain explanation.
- **Holds** (dead hang, hollow, plates): tap **⏱ Time the hold** to start, and tap again to stop. The seconds fill in.
- **Bands / assisted**: type the band colour or assist kg in the left box.
- **Exercise strip** (top, under the timer): every exercise with done/total. Tap one to jump to it. Green = done, amber = started.
- **Supersets** are framed together with a label ("Superset A · do A1 then A2 back-to-back, rest after the pair").
- **Session log** (the list icon next to the timer): every set in the order you did it, with time, kind, RIR, rest and note. Tap a row to edit it.
- **Your setup** (📍): seat height, pin, grip, saved per exercise and shown every session. Edit it on the card or in the exercise sheet.
- **Notes, fast**: tap a tag chip (e.g. "lost count", "cheated reps", "too heavy") or the 🎤 to speak (Chrome on Android). "Cheated reps" also marks the set as not strict.
- **Finished cards** collapse to a one-line summary (e.g. "75×6 · 75×6 · 75×5").
- **Finish screen** compares each exercise with last time and shows how many got stronger.

## Notes & Journal (More → Notes & Journal)
- **Every note in one place**: journal entries, set notes, workout notes, cardio, body and test notes, newest first, grouped by day. Tap a set or workout title to open that session.
- **Search** works in Arabic and English and ignores Arabic spelling variants (أ/إ/ا, ة/ه, ى/ي, tashkeel). Matches are highlighted. Filter chips: Journal · Set notes · Workouts · Cardio · Body · Tests · Pain.
- **Mood** (😣 → 😄, optional) on each entry; the strip on top shows the last 14 days. **Tags**: pick several. Dashed blue tags (“+ pain”) are suggestions from your words, in Arabic or English — nothing is tagged without your tap.
- Tap ✏️ on a journal entry to edit text, mood or tags, or delete it.

## Voice notes (🎤 next to every note box)
- Tap 🎤, talk (up to 2 min), tap ■. The audio is sent to Whisper on Cloudflare (free, ~200 min/day) and the text is added to the note. Nothing is stored except the text.
- **Language** (Settings → Voice notes, or the chips under the journal box): **عربي + English** (default, for mixed sentences like “الكتف واجعني في الـ incline”), **عربي** only, or **English** only.
- Tested: Egyptian Arabic, English, and mixed sentences come back word-for-word, with English gym words kept in English.
- **Offline** it uses the phone's own recognizer (one language at a time). If the mic is blocked, allow it for the site in Chrome settings.
- Arabic and mixed text show right-to-left automatically, line by line.

## Plan screen
- **This week's days**: each day with its muscle-group chips (sets per group). Tap a day to see the exercises.
- **4-week progression**: one table per day, exercises × W1-W4 (sets × reps), with the current week highlighted. Week 3 is the hardest, Week 4 is the deload.
- **Tap any exercise** for its sheet: video, cues, your setup note, the **next** recommended weight, your **best** and last-time sets, where it appears in the program each week, and the alternatives.

## Swapping exercises
⋯ → **Swap**. Pick **why** (equipment busy, pain, …), then the alternative. The app:
- keeps **the same sets, reps and RIR** (research: machines and free weights build the same muscle when volume matches),
- changes the reps for bodyweight swaps (e.g. bench → push-ups = 8-20),
- suggests a **starting kg** from your last weight (e.g. bench 60 kg → each dumbbell ≈ 22 kg),
- records **from → to + reason** on the plan and on every set, so the review can spot patterns ("swapped bench 3× for shoulder pain").

## Missed days, skips, extra days
- **Can't train** → pick a reason (busy, tired, slept badly, sore, pain, sick, travel, fasting…) + an optional note. By default the session **stays next**, and the week just stretches, as the program rules say.
- Tick **"Drop it from the plan"** only if you really want to skip that session for good.
- **Other day** → do any session out of order. Already-done sessions run as an **extra**, which doesn't move your place in the plan.

## Safety nets (so the data stays clean)
- **Works offline.** Every write is saved on the phone first and sent when you're online. An orange "N unsynced" badge shows anything waiting. You can even start a workout with no signal.
- **Typo guard**: weight over 400 kg or reps over 100 are blocked. More than 1.5× your best asks "Typo?".
- **Double-tap guard** on Log set, plus Undo.
- **Screen stays awake** during a workout where the phone supports it.
- Deleted sets are kept in the database (marked deleted), so history can be checked.
- **iPhone note:** iOS has no vibration for websites, so the timer beeps instead. Tap once in the workout to unlock sound. When the screen locks, iOS pauses web apps, but the timer is based on clock time, so it's correct when you come back.

## What gets recorded
Every session (start/end time, readiness, RPE, bodyweight, note), every set (kg, reps, seconds, meters, band, RIR, set type, real rest taken, time, note, pain, swap), every missed day + reason, body logs, tests, journal, and an **event log of every tap** (set done/edit/delete/undo, rest start/adjust/skip, swaps, skips, video opens, …).

## Testing first, then a clean start
Play with the app as much as you like. When you're ready to track for real: **Settings → Reset**, type `DELETE`, confirm. Every record is wiped from the database (and this device's cache). Your program stays.

## Monthly loop with Claude
1. Train for 1-4 weeks.
2. On the PC, in this folder: `npm run export` → writes `private/exports/<date>/` (never committed).
3. Ask Claude: *"Review my training data and make the next program version."* Claude follows `CLAUDE.md`.
4. Claude creates `program/versions/v2.ts`, explains every change in `program/CHANGELOG.md`, runs `npm run check`, and deploys.
5. Your app now shows the new version. Old sessions keep the exact plan they were done with.
