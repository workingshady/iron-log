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
| **Plan** | The whole month: Week 1-4 tabs, every day and exercise with thumbnails, targets, rest, technique (ⓘ explains words like "drop set"). Start any day from here. |
| **History** | Calendar + every workout and missed day (with the reason). Filter all / workouts / missed. Tap a workout to see or edit it. |
| **Stats** | "Am I getting stronger?" Insights, hard sets per muscle vs the 10-20 target, per-week bars, per-exercise trend (tap for chart + table), missed-day reasons, pain log |
| **Creatine** | Daily grams: one tap for 3/5/10 g, progress ring, streak, calendar |
| **Body & habits** | Weight, waist, sleep, protein, steps, water, energy. **Not daily**: fill only what you know, whenever (weekly weigh-in is enough). |
| **Tests** | Max-effort benchmarks (pull-ups, dips, hangs…). Test at the start and on Week 4 · Day 6. |
| **Journal** | Your story in your own words (wins, struggles, pain, life). The monthly review reads it for context. |
| **Learn** | Words & set types, warm-up checklist, pull-up/dip levels, "what if…", nutrition, safety |
| **Settings** | Schedule A/B, creatine target, download all data, log out, **Reset (delete everything)** |

**Colors mean one thing each:** green = done / main button · amber = in progress / tips · red = pain, missed, delete · blue = rest timer & explanations · violet = creatine.

## Inside a workout
- **Tap an exercise** to open or close it. After each set, the app moves you to the right place: superset partners alternate A1 → A2 → A1, then it goes to the next exercise.
- **Tap a logged set** to edit everything about it: kg, reps, seconds, set type (warm-up / normal / drop / failure / rest-pause), RIR, quick tags, a free **note**, and **pain** (area + mild/moderate/sharp). You can delete it here too.
- **Undo**: right after logging, an "Undo" button shows for 6 seconds.
- **Extra: Set / Drop set / Warm-up**: log sets beyond the plan. Tap ⓘ to see what a drop set is. Warm-ups don't count toward volume.
- **How-to video**: muscles, form cues and the YouTube video (it only loads when you tap it), plus a YouTube search link.
- **Swap · skip · more**: swap for an alternative · ±1 planned set · move up/down · skip the exercise today.
- Orange technique text with ⓘ (e.g. "Last set: drop set") → tap it for a plain explanation.
- **Holds** (dead hang, hollow, plates): tap **⏱ Time the hold** to start, and tap again to stop. The seconds fill in.
- **Bands / assisted**: type the band colour or assist kg in the left box.

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
