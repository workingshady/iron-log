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
| **Home** | Dashboard: next workout (with exercise thumbnails), this week, streak, adherence %, minutes, creatine today, training calendar (heatmap), insights, **strength trend** (top 3 lifts, est. max + 4-week %), hard sets per calendar week, bodyweight trend |
| **Plan** | The whole month: Week 1-4 tabs, every day and exercise with thumbnails, targets, rest, technique (ⓘ explains words like "drop set"). Start any day from here. **Muscle map** shows which muscles that week hits. |
| **History** | Calendar + every workout and missed day (with the reason). Filter all / workouts / missed. Tap a workout to see or edit it. |
| **Stats** | Four tabs. **Overview**: workouts, 4-week adherence, hard sets this week, week-by-week chart (workouts / hard sets / tonnage / minutes / PRs), insights. **Strength**: est. max trend per main lift with 4-week % and sparkline, recent records, per-exercise chart (tap: est. max + volume + table), recommended vs actual, all-time records. **Volume**: hard sets per muscle per calendar week vs 10-20 (fractional: ½ for helper muscles; drop/rest-pause chain = +½; RIR 5+ not hard; ⓘ explains), body heatmap, per-program-week bars. **Patterns**: what goes with good workouts (sleep, readiness, mood, football the day before, creatine, rest length; each with sample sizes, shown only with 3+ workouts on both sides, phrased as associations), RIR mix, missed-day reasons, pain log |
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
- **Drop set**: pick **Drop by** (10/20/25/30/40 %) and **single / double / triple**. The chain is shown (e.g. 25 → 20 → 15 kg, rounded to weights you can load) and each drop is pre-filled — just type reps and Log. Your choice is remembered per exercise. No rest between drops; the rest timer starts when the chain ends (or tap Done).
- **Programmed drops** ("Last set: drop set"): after that last set the drop panel opens by itself — go straight away, or tap *Skip drop*.
- Drops and rest-pause minis **belong to their set**: they're shown indented under it (↳ drop 1, ↳ drop 2), don't count as planned sets, don't change the next set's pre-filled weight, and don't drive the weight recommendation. Summaries read `60×8 (↓45×6 ↓35×5)`.
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
Log in with username **dev** + the **DEV passcode** instead of yours → an orange "DEV MODE" bar, a **separate test database**, and separate phone storage. Settings → **Fill with dummy data** loads ~3 weeks of fake training (all set types, notes, pain, football, cardio, creatine). Try anything; your real tracking is never touched. Log out and use your normal passcode to go back.

## Preview a workout (without starting it)
- **Preview** (👁) on Home's workout card, on every day in Plan, on Grip & Wrist, and on a planned day in *This week*.
- Shows the whole session in order: supersets and finishers marked, sets × reps, rest, warm-ups, the technique note, and **today's recommended weight** with ↑ heavier / = same / ↓ lighter vs last time.
- On top: estimated minutes, exercises, total sets and the muscle groups hit. Tap an exercise for its video, cues, last time and alternatives.
- Nothing is logged and the clock doesn't start. **Start this workout** at the bottom goes straight to the start screen.

## History: calendar, search, compare
- **Month calendar**: green = workout, amber = partial, red ring = missed; dots = cardio (blue), creatine (violet), notes (grey). ‹ › to change month. **Tap a day** → everything you did: workouts with every set, cardio, creatine, body log, journal.
- **Search** an exercise, day or note; filter **All / Workouts / Missed** and by **day type** (Push, Pull…).
- **Compare**: the ⇄ button on a workout compares it with the previous one of the same day; or "Compare 2 workouts" → tap any two. Shows volume, sets, minutes and, per exercise, both sessions' sets with the change in volume and estimated max.

## Plates & rest timer
- **Plate picture**: a realistic bar (knurled shaft, collars, sleeves) with true-proportion IWF plates (25 red, 20 blue, 15 yellow, 10 green bumpers; 5 white, 2.5 red, 1.25 chrome change plates), the weight printed on each plate and numbered loading steps ("each side: 1 → 25, 2 → 10…"). Only your gym's plates are used (Settings → Equipment); clip weight is optional (Settings → clips / collars).
- **Plate loader**: tap the bar or "plates" → tap a plate to add a pair, tap a plate on the bar to take it off, live total → **Use** fills your set.
- **Rest timer settings** (Settings → Rest timer, synced to all devices): start automatically (or a Start button), sound + volume + Test, vibration, 3-2-1 countdown.
- **Rest per exercise**: open an exercise (video button) → *Rest between sets* → pick a time or Off; overrides the plan for that exercise everywhere (supersets use the longest rest in the group). Reset to plan anytime; Settings lists your custom rests.

## Inside a workout
- **Tap an exercise** to open or close it. After each set, the app moves you to the right place: superset partners alternate A1 → A2 → A1, then it goes to the next exercise.
- **The order for each set:** check the suggested kg/reps (already filled in) → do the set → tap **reps left in the tank** (RIR, optional) → **Log set**. Faded rows below show the sets still to come.
- **Warm-up sets** (the ramp to your working weight, separate from the joint warm-up) are shown open at the top of each exercise, with % and the reason:
  - **First heavy lift for a muscle** (bench, squat, pulldown, barbell row…): empty bar ×10 → 40% ×8 → 60% ×5 → 80% ×2.
  - **First other compound for a muscle**: 50% ×8 → 75% ×4. **Cold isolation** (laterals, curls on a new muscle): 50% ×10.
  - **Muscle already warm** from an earlier exercise: heavy lift → 1 feeder set (70% ×3, plus the empty bar for barbells); otherwise none — start your work sets.
  - **Supersets**: do both exercises' warm-ups first, then start round 1. Warm-ups never start the rest timer; rest ~1 min.
  - Logged as warm-up: not counted in volume, PRs or the weight engine.
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
- **Supersets**: framed together with a header — *Superset A · round 2 of 3* and a dot per round. Log A1 → the app jumps to A2 with **no rest**. Log A2 → the round is complete → the **rest timer** starts (the longest rest in the group) and says "Round 3 · A1 …". Works in any order and with uneven set counts. Each exercise keeps its own history and weight recommendation.
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

## Months & versions
- **Months** (More → Months, or the month chip at the top of Plan): every 4-week block is saved — dates, progress (x/20 workouts), adherence, volume, PRs, average time, strength change per lift (start → best est. max), bodyweight start → end, which plan versions were used, your goal and notes, and Claude's review.
- **Start the next month** when Week 4 is done (Plan shows a card, or Months): the finished month's numbers are frozen and kept, the plan goes back to Week 1, and weights/recommendations carry over. Not allowed while a workout is in progress; it warns if the month isn't finished.
- **Plan → version chip** opens the version history: every change to the plan, newest first, with why (your data or research). Each workout keeps the version it was done with (History shows it).
- **History** is grouped by calendar month, with that month's block and totals.

## Plan screen
- **4-week progression** now shows the **weight for every week** under each sets × reps: this week = today's recommendation; later weeks = the app's own rules run forward from your real history, assuming each session goes as suggested (/h = per hand, blue = deload, green = a step up, ✓ = already done). Viewing a future week also shows that week's projected weights on each day.
- **This week's days**: each day with its muscle-group chips (sets per group). Tap a day to see the exercises.
- **4-week progression**: one table per day, exercises × W1-W4 (sets × reps), with the current week highlighted. Week 3 is the hardest, Week 4 is the deload.
- **Tap any exercise** for its sheet: video, cues, your setup note, the **next** recommended weight, your **best** and last-time sets, where it appears in the program each week, and the alternatives.

## Edit a logged set (tap any set)
- Grouped with icons: **Numbers** (± buttons; only the fields that exercise uses) · **Effort & form** (RIR, strict / cheated) · **Set type** · **Equipment used** · **Notes** · **Photo** · **Pain**. Time and real rest are shown on top.
- **Equipment used**: pin stack, plate-loaded, cable, Smith, barbell, EZ bar, dumbbell, bodyweight, other. Remembered per exercise (also on the exercise card: "Equipment: … · change"); if last time used different equipment the card warns you — the numbers don't compare.
- **Smart tags**: dashed "+ tag" suggestions from your numbers (too heavy / too light vs the rep range, hard / easy vs the RIR target) and your words (Arabic or English: lost count, grip, straps, pump…). Never added without a tap.
- **Again** logs a copy of the set now; **Save** is enabled only when something changed.

## Login & profile
- Log in with **username + passcode**. The username is unique (letters, numbers, `.` `_`), ready for friends later. 5 wrong tries → a lockout that grows (1 min, 2, 4 … up to 24 h).
- First time after the update: log in with your old passcode once → **Create your login** (pick username + passcode). Your data doesn't change.
- **Profile** (avatar on Home, top of More, or the desktop sidebar), laid out like Instagram: @username · new photo · all pages · settings on top; round profile photo + Workouts / PRs / Photos; name, bio, "training since"; **Edit profile** (photo, name, username with live "available?" check, bio, height / weight / background, change passcode); shortcut circles (Months, PRs, Body, Journal); photo grid with tabs **All · Progress · Form · Machines · Journal**.
- Progress tab → **Compare** any two progress photos side by side (days apart shown).

## Photos
- One look everywhere: the same 64 px tiles on sets, machines and journal entries; a 3-column square grid on the profile (progress photos show their date).
- Add from: a **set** (form), an **exercise** (machine seat / pin settings), a **journal entry** (up to 6, previewed before saving), or the profile **+** (pick → preview → type, caption, date → Share).
- **Every photo goes through the editor first** (same for profile photo, posts, sets, machines, journal): drag to move, pinch / scroll / slider to zoom, **centre**, rotate 90°, rule-of-thirds grid. Shapes: Original · 1:1 · 4:5 · 3:4 · 9:16 · 16:9 · 1.91:1. **Fit** shows the whole photo with a blurred, black or white background. **Filters** (Vivid, Warm, Cool, Fade, Drama, Gym, Mono, Noir), **Adjust** (brightness, contrast, saturation, warmth, vignette), **Border** (thin / thick white, black, lime, Polaroid). Keyboard: arrows move, + / − zoom, 0 centres. What you see in the frame is exactly what's saved (long side 1350 px).
- Profile photo: round crop; "Adjust current photo" re-frames it, "Choose from your photos" crops any photo into the circle.
- The profile grid uses 3:4 tiles (Instagram's 2025 grid shape); each photo gets a matching thumbnail.
- Tap any photo → full-screen viewer: swipe or ← → to move, swipe down / Esc to close, zoom, edit caption + date, set as profile photo, open the workout, delete.
- Shrunk on the phone (≤1280 px + a 360 px thumbnail). Each photo is downloaded **once** and then comes from the phone's cache (grids load the small thumbnail). Private: only after login; logging out clears the cache. Needs a connection to add.

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
