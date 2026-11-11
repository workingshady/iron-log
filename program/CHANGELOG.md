# Program changelog

Each version: what changed, and the data that justified it.

## ppl-arnold@2.5.0 · 2026-11-11 — data review after W1 Push + Pull
Data: 2 sessions (69 + 80 min, RPE 8), 47 sets, 21 notes, 363 taps. Research: Plotkin 2022 (load or rep progression both grow muscle, load slightly better for strength → keep double progression), Singer 2024 meta-analysis (rest > 60 s slightly better for growth, plateau ~90 s).
- **Shrug on Pull: barbell → Machine Shrug.** Your note: "its device not dumbell". The 4 sets of 2026-11-10 were relabelled from "dumbbell shrug 50 kg/hand" (= 100 kg, wrong) to "machine shrug 50 kg" (backup: private/backups/iron-log-pre-shrugfix-…). Grip slipped → straps allowed on shrugs (traps are the target; grip has its own work).
- **Isolation rests 60-75 s → 75-90 s** (laterals, overhead triceps, face pull, curls, pushdown, rear delts, Y-raise, calves, leg extension, BSS). Your real rests were +55-137 s over plan anyway (Push +13 min, Pull +22 min in total).
- **Cues from your notes:** face pull (felt front/side delt, unsure about neck) → "rope to eyes, elbows high & wide, thumbs back, chin tucked"; neck → all 3 directions each set (you did only the front); shrugs → straps OK.
- **Weights engine:**
  - working weight = the weight of most sets (tie → the one you ended on), not the heaviest — machine row 70→60→65 "to enhance the form" now continues at 65;
  - a different rep range is not a miss (laterals 12-15 on Push vs 15-20 on Legs) → converted from est. max;
  - no double deload when an exercise appears twice in Week 4.
- **Weights for all 4 weeks** shown in Plan → 4-week progression (engine run forward from your real history).

Next weights (from the engine): W2 Push — bench 75×6, incline 22.5/h×9, close-grip 37.5×8 (↓, RIR 0 + bar nearly fell), laterals 12.5/h×12, seated DB press 12.5/h×10, overhead triceps 25×10 (↓, 30 kg → 10,8,5,5 + shoulder tight). W2 Pull — pulldown 65×8, machine row 65×8, neutral pulldown 45×11, face pull 36×14-15, machine shrug 50×12, incline curl 10/h×10, dead hang 30 s.
Patterns to fix (not program changes): 8 sets at RIR 0 in Week 1 (target 2), 2 cheated sets, 2 accidental extra sets, dead hang skipped, no weigh-in / tests / cardio logged yet, creatine 10 g/day vs 5 g target.

## app update · 2026-11-10 (no program change)
- Week planner rebuilt as an optimizer (scores every arrangement); Legs-left-out advice explains why.
- Settings: week start + preferred rest days (replaces A/B presets, still read for old data), Profile (name, height, bodyweight, background).
- One source of truth: every saved change refreshes all screens; data also refreshes when you return to the app.
- Home: Today card follows the adapted week (train / rest / football / done), quick actions, greeting.
- Cardio follows the adapted week; DEV seed copies your real settings.
- Workout: "Same as last set" one-tap; clearer session-effort prompt at Finish.
- Fix: "stopped early" insight compared against the top of the range instead of the bottom.

## ppl-arnold@2.3.0 · 2026-11-10
- **Grip & Wrist extra** (optional, 12-15 min, ≤2×/week): finger curls, behind-the-back wrist curls, reverse wrist curls, pronation/supination, radial deviation, heavy holds. Never before / the day before Pull (grip must be fresh).
- **Adaptive football week** (shared/weekplan.ts): mark football/busy days, sessions re-fit with heavy legs ≥1 day away on both sides (48 h guidance), Legs-lite or skip-for-sport when it can't fit, football logged as cardio. New excuse "Played sport / football".
- **Weights engine**: ACSM rule — 2 steps (max +10%) when you beat the top of the range by 2+ reps.
- **DEV mode**: second passcode → separate test database + dummy data.

## ppl-arnold@2.2.0 · 2026-11-10 — first data review (1 session: W1 Push, 2026-11-09)
Data: 22 sets, 69 min, 14 notes, 142 taps. Changes come straight from it:
- **Close-grip bench moved from last to 3rd.** Done last it fell to 40 kg × 7, 7, 5 at RIR 0 and "the bar was gone fall". Fresh + safety pins / spotter, stop 1-2 reps early.
- **Laterals before seated DB press**: the order you chose in the session (logged as 4 "move" taps).
- **Ab wheel removed from Push**: session ran 69 min and both core + push-up finisher were skipped. Core stays on Legs (knee raises) and Chest+Back (hollow hold).
- **Overhead triceps cue**: you used a rope and noted the shoulder felt tight / stuck mid-range at 30 kg (10, 8, 5, 5 reps) → app now suggests ~25 kg × 10 and the cue says stop where the shoulder feels tight.
- **Weights engine v2.2** (shared/recommend.ts): dumbbells per hand (your notes showed totals: 40 = 20 each hand), barbell/EZ totals include the bar (bar weights in Settings), cheated / drop / rest-pause sets excluded from progression, RIR-adjusted estimated max with RIR trusted only 0-3, ~3% lighter per missing rep when a lift was too heavy.
- **Logging fixes from the data**: note field before logging (20+ sets were edited afterwards to add notes), Rest-pause button (you did 5 + 5 reps and logged 10), cardio "Skip" can't duplicate (4 duplicate rows from repeat taps — kept, ignored in stats), creatine double-tap guard.

Next session recommendations (W2 Push): bench 75 kg × 6 · incline 22.5/hand × 9 · close-grip 37.5 kg × 8 · laterals 10/hand × 15 · seated DB press 12.5/hand × 10 · overhead triceps 25 kg × 10.

## ppl-arnold@2.1.0 · 2026-11-09
- Pull day: barbell row → **machine row** (chest-supported). Same growth as barbell rows, much less lower-back fatigue — and Legs (squat + RDL) is the next day. Barbell row stays as an alternative. Source: free weight ≈ machine for hypertrophy (Haugen 2023 meta-analysis); Barbell Medicine on chest-supported rows.
- Bench press kept on purpose as the strength anchor (≈17% more load than dumbbells, best progression); dumbbell + machine presses carry the growth work.

## ppl-arnold@2.0.0 · 2026-11-09 — Intensive v2
No training data yet; changes come from a self-critique of v1 + the user's constraints and habits.

**Constraints:** gym has no dip station use planned, no assisted pull-up machine, no bands → removed dips, pull-ups, negatives, band/assisted work.
**Goals stressed by the user:** intensive, wide shoulders (side delts), back mass + strength toward pull-ups and weighted pull-ups, traps, grip/wrists, push-ups as extras.
**Known habits to counter:** miscounting reps, cheating form, ending sets/sessions early when it burns.

| v1 problem | v2 change | Evidence |
|---|---|---|
| Too much per-session volume (W3: back ~36, delts ~30 planned sets/week, many per session) | ≈10-11 hard sets per muscle per session; weekly volume spread (side delts ~14, back ~20, chest ~18, traps ~12) | Remmert/Pelland 2025 per-session preprint; Pelland 2026 weekly dose-response |
| Lying leg curl | Seated leg curl | Maeo 2021 (14% vs 9%) |
| Few stretch-biased exercises | Overhead triceps, incline curls, pullovers, deep calves, lengthened partials (W3) | Maeo 2022; Pedrosa 2022 |
| Techniques on most W3 exercises | Only last set of isolation; big lifts RIR 1 | Drop-set reviews: no clear extra growth vs volume-matched |
| Dips / pull-ups / bands | Close-grip bench, push-ups; heavy pulldowns, neutral pulldowns, rows, hangs → pull-up roadmap | Marines pull-up guide; dip-alternative guides |
| No cardio | 3×/wk after lifting: incline intervals (D1), hill walk (D5), short intervals (D6), optional walks | Wilson 2012; Schumann 2023 |
| Small-muscle work mixed in | Grip / wrist / neck / push-up burnouts = finishers at the end, not the day before Pull | Forearm-order consensus (after pulls) |

New exercises: close-grip bench, deficit push-up, neutral pulldown, straight-arm pulldown (alt), DB pullover, wide cable row, machine row (alt), lean-away cable lateral, cable Y-raise, Kelso shrug, EZ reverse curl, leg extension, seated leg curl. Every exercise now has ≥2 alternatives.
App support added with it: rep counter + 3 s tempo beeper, strict/cheated flag per set, "stopped early" alert + insight, cardio timer + tracker.

## ppl-arnold@1.0.0 · 2026-11-09
- First version, built from `1-Month-PPL-x-Arnold-Program.md` (PPL × Arnold split, 5 days, W1 re-entry → W2 build → W3 overload → W4 deload + re-test).
- No training data yet. Week 1 is for finding working weights at RIR 3.
- Assumes 0 strict pull-ups and 0 dips. Update this after the Day-1 tests.
