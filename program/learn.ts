// Reference content shown in Learn (and as ⓘ explanations inside workouts).
// From 1-Month-PPL-x-Arnold-Program.md. Edit freely.

export interface Term {
  key: string;
  name: string;
  short: string; // one line, shown inline
  how?: string; // how to do it
  example?: string;
  match: RegExp; // finds the term inside an exercise's technique text
}

export const TERMS: Term[] = [
  { key: "rir", name: "RIR · Reps In Reserve", short: "How many more reps you could have done. RIR 2 = stop with 2 left. RIR 0 = failure.", example: "60 kg × 8 @ RIR 2 → you stopped at 8 but could have done 10.", match: /\bRIR\b/i },
  { key: "superset", name: "Superset (A1 / A2)", short: "Do A1, then go straight to A2 with no rest. Rest after the pair, then repeat.", how: "Opposite muscles (chest/back, biceps/triceps), so neither gets much weaker and the session is faster.", example: "A1 incline press 10 reps → straight to A2 row 10 reps → rest 1:45 → repeat.", match: /superset|\b[A-E][12]\b/i },
  { key: "drop", name: "Drop set", short: "Last set to near-failure, cut the weight ~25-30% right away, do more reps to near-failure.", how: "Double drop = drop twice. Log the extra part with “+ Drop set”.", example: "Laterals 10 kg × 12 (nearly failed) → grab 7 kg → 8 more reps.", match: /drop/i },
  { key: "restpause", name: "Rest-pause", short: "Last set to near-failure, rest 15-20 s, do more reps, repeat once.", how: "Log the extra reps with “+ Drop set” at the same weight, or write them in the set note.", example: "Incline 26 kg × 8 → rest 15 s → +3 reps → rest 15 s → +2 reps.", match: /rest-pause/i },
  { key: "myo", name: "Myo-reps", short: "1 set of 12-15 to near-failure, then mini-sets of 3-5 reps with 5 breaths of rest, 3-4 times.", example: "Rear delts × 15 → 5 breaths → 4 → 5 breaths → 4 → 5 breaths → 3.", match: /myo/i },
  { key: "negative", name: "Negative", short: "Only the lowering part, slow (3-5 s). The main way to build your first pull-up or dip.", how: "Jump or step to the top, then lower under control. Count the seconds.", match: /negative|s down/i },
  { key: "partials", name: "Lengthened partials", short: "After the last full rep, do half-reps in the stretched half until failure.", example: "Calf raise: after the last full rep, 6-10 half-reps in the bottom stretch.", match: /partial/i },
  { key: "failure", name: "Failure set", short: "A set where you couldn't finish the last rep (RIR 0).", match: /failure/i },
  { key: "warmup", name: "Warm-up set", short: "Light set before working sets. Not counted in volume.", match: /warm-?up/i },
  { key: "max", name: "×max (AMRAP)", short: "As many good reps as possible, usually stopping at the target RIR.", match: /×max|max\b/i },
  { key: "deload", name: "Deload", short: "Easier week: about half the sets, same or lighter weight. You recover and come back stronger.", match: /deload/i },
  { key: "rpe", name: "RPE · session effort", short: "How hard the whole session felt, 1-10. 10 = could not have done more.", match: /\bRPE\b/i },
  { key: "e1rm", name: "e1RM · estimated 1-rep max", short: "Your estimated best single from a set (weight × (1 + reps/30)). Good for spotting progress across rep ranges.", example: "80 kg × 6 ≈ 96 kg est. max — beat it with 82.5 × 5 or 80 × 7.", match: /e1RM/i },
  { key: "volume", name: "Volume", short: "kg × reps added up (warm-ups excluded). More volume over weeks = more growth, up to a point.", match: /volume/i },
  { key: "hold", name: "Hold / top hold", short: "Pause at the hardest point (e.g. 2 s at the top of a shrug) before lowering.", match: /hold|squeeze|pause/i },
];

export function termsIn(text: string | undefined): Term[] {
  if (!text) return [];
  return TERMS.filter((t) => t.match.test(text));
}

export const WARMUP = [
  "3-5 min light cardio",
  "Arm circles + band pull-aparts × 15",
  "Wrist circles × 10 each way",
  "Palms-down floor rocks × 10",
  "Backs-of-hands rocks × 10",
  "Fist rocks × 10",
  "Fingertip push-up holds × 10 s",
  "Neck: slow circles and nods × 5 (no weight)",
  "Leg day: bodyweight squats × 10, leg swings × 10/leg, hip openers",
  "2-3 warm-up sets of the first lift (empty bar → ~50% → ~75%)",
];

export const LEVELS = {
  pullup: {
    title: "Pull-up level (changes Day 2 and Day 5)",
    rows: [
      ["0", "Negatives + band-assisted (as written)", "Inverted rows + scap pulls"],
      ["1-3", "5×1-2 strict + 1 slow negative after each set", "3×max strict, finish band-assisted"],
      ["4-7", "4 × (max − 2) strict, then 2 band-assisted sets", "3×max strict"],
      ["8+", "Weighted pull-ups 4×5", "3×8-10 bodyweight (chin-ups OK)"],
    ],
  },
  dip: {
    title: "Dip level (changes Day 1 and Day 5)",
    rows: [
      ["0", "Support hold + assisted + negatives", "Negative dips"],
      ["1-5", "4 × (max − 1) strict dips", "Negatives or strict sets of max − 1"],
      ["6-10", "4×8-10 strict", "3×max"],
      ["10+", "Weighted dips 4×6-8", "3×max bodyweight"],
    ],
  },
};

export const WHAT_IF: [string, string][] = [
  ["Missed a day", "Just do the next session in order. Don't double up. The week stretches by a day, which is fine."],
  ["Only 4 days this week", "Day 1, 2, 3, then one merged day: first 3 exercises of Day 5 + first 3 of Day 6."],
  ["Only 3 days", "Day 1, 2, 3. Add the arm superset to the end of Day 2."],
  ["No time (30-45 min)", "First 4 exercises + 1 small-muscle exercise. Keep pull-up/dip work."],
  ["Shoulders still sore on Day 1", "Swap Day 1 and Day 2 that week (Pull first)."],
  ["Very sore in Week 1", "Normal after a break. Train with 1 fewer set; no drop sets."],
  ["Equipment taken", "⋯ → Swap: alternatives keep the same sets/reps/RIR."],
  ["Training at home", "Push-ups/DB press, DB rows, band pull-ups, goblet squat/BSS, Swiss-ball curls."],
  ["Elbow pain", "Drop wrist curls + pinches for a week, hammer-grip curls, neutral-grip bar."],
  ["Front-shoulder pain (dips/bench)", "Shorter dip range, more lean, or machine press that week. Log it as pain."],
  ["Wrist pain on push-ups", "Use handles or dumbbells instead of knuckles."],
  ["Lower back tired", "Barbell row → chest-supported row; RDL → leg curl + hip thrust."],
  ["Stalled 2 weeks", "Drop 10% and build back, or change the rep range (6 → 10)."],
  ["Sick", "No training with fever or a chest cold. Restart 1 week back, lighter."],
  ["Hit a new pull-up/dip level", "Switch to the new level next session (Learn → Levels)."],
  ["Ramadan / fasting", "Train 1-2 h after iftar, same sets, no intensity techniques, protein across iftar + suhoor."],
  ["Want to cut fat", "Same training, eat 300-500 kcal below maintenance, protein ~2 g/kg."],
];

export const NUTRITION: [string, string][] = [
  ["Protein", "130-175 g/day, 3-5 meals of 30-40 g"],
  ["Calories", "+200-300 kcal over maintenance (or maintenance to recomp)"],
  ["Creatine", "3-5 g every day (track it in Creatine)"],
  ["Pre-workout", "Rice/oats/bread + chicken/eggs/yogurt, 1-3 h before"],
  ["Post-workout", "30-40 g protein + carbs within a couple of hours"],
  ["Caffeine", "~3 mg/kg (≈200-250 mg) 30-60 min before; none within 8 h of sleep"],
  ["Sleep", "7-9 h"],
  ["Water", "3+ L (more in Cairo heat)"],
  ["Steps", "7-10k/day"],
  ["Weight gain", "+0.25-0.5 kg/week. Flat 2 weeks → +200 kcal"],
  ["Easy protein", "Chicken, eggs, Greek yogurt/laban, gibna areesh, tuna, ful + eggs, lean beef, lentils, whey"],
];

export const SAFETY = [
  "Week 1 should feel too easy. After a break, the risk is tendon pain, not under-training.",
  "Neck: always light, slow, controlled. Stop with any pain, tingling or dizziness.",
  "Dips: shoulders only slightly below elbows at first.",
  "Never skip the wrist warm-up.",
  "Sharp joint pain = stop that exercise, swap it, log the pain. Muscle burn is fine.",
  "Injury or medical condition → check with a doctor or physio.",
];


/** How one training day flows, start to finish. */
export const SESSION_FLOW: { step: string; what: string }[] = [
  { step: "Check in", what: "Tap Start → rate sleep/energy (optional). The clock starts." },
  { step: "Warm up", what: "8-10 min: light cardio, wrists, then the warm-up ramp shown on the first heavy lift." },
  { step: "Main lifts", what: "Heavy compounds first, while fresh. Weight is pre-filled from your last session." },
  { step: "Accessories", what: "Isolation work: laterals, curls, triceps — closer to failure." },
  { step: "Finishers", what: "Small muscles last: grip, wrists, neck, push-up burnout (5-10 min)." },
  { step: "Quick check", what: "After each exercise: how hard + joints (2 taps) → tunes next time." },
  { step: "Finish", what: "Session effort 1-10 + a note. Then cardio if it's a cardio day." },
];

/** Rules that turn effort into growth — with do / don't examples. */
export const GROW_RULES: { rule: string; why: string; good: string; bad: string }[] = [
  { rule: "Count every rep — or let the app count", why: "Lost count = wrong numbers = wrong next weight.", good: "Use 'Count reps for me' and tap each rep.", bad: "'About 8… maybe 10.'" },
  { rule: "Burn is not failure", why: "The last 3-5 reps before failure are the ones that grow muscle.", good: "Target 10-12: it burns at 8 → keep going to 10-12.", bad: "Stopping at 8 because it burns, with 3 reps left." },
  { rule: "A rep counts only if it's strict", why: "Cheated reps move the weight, not the muscle.", good: "Full range, ~2 s down, no swinging. Tap 'Strict'.", bad: "Swinging curls, half-range laterals. If it happens, tap 'Cheated' — honesty fixes the plan." },
  { rule: "Finish the plan, not the mood", why: "Volume across weeks is what adds muscle.", good: "Feeling done early? Do the remaining sets lighter — still count them.", bad: "Leaving after 3 exercises because 'the pump is there'." },
  { rule: "Log the truth", why: "Recommendations and the monthly review are built from your logs.", good: "Logged 7 reps when you got 7.", bad: "Writing 10 because the target was 10." },
];

/** Pull-up roadmap without bands or an assisted machine. */
export const PULLUP_ROADMAP: { stage: string; do: string; next: string }[] = [
  { stage: "1 · Build the base (now)", do: "Heavy lat pulldowns + rows, dead hangs 30-45 s, scap pulls.", next: "Pulldown 8 reps at ~80% bodyweight and a 45 s hang." },
  { stage: "2 · Negatives", do: "Add 3×3 slow negatives (jump up, 5 s down) at the start of Pull day.", next: "Each negative 8-10 s, controlled to the bottom." },
  { stage: "3 · First reps", do: "5×1-2 strict pull-ups + one slow negative after each set.", next: "3 strict pull-ups in one set." },
  { stage: "4 · Volume", do: "4 × (max − 1) strict, twice a week. Chin-ups are fine.", next: "8-10 strict pull-ups." },
  { stage: "5 · Weighted", do: "Belt or dumbbell between the feet: 4×5, add 1.25-2.5 kg when all sets hit 5.", next: "+20 kg × 5 — strong wrestler level." },
];

/** Why v2 changed — each point backed by a source. */
export const WHY_V2: { point: string; fix: string; ref: string; url: string }[] = [
  { point: "v1 packed too many sets into single sessions (back ~36, delts ~30 planned per week in W3).", fix: "Cap ≈ 10-11 hard sets per muscle per session; spread weekly volume.", ref: "Remmert, Pelland et al. 2025 (preprint)", url: "https://sportrxiv.org/index.php/server/preprint/view/537" },
  { point: "Lying leg curl.", fix: "Seated leg curl — 14% vs 9% hamstring growth.", ref: "Maeo et al. 2021", url: "https://mennohenselmans.com/these-are-the-best-exercises-to-build-muscle-science-based/" },
  { point: "Not enough stretched-position work.", fix: "Overhead triceps, incline curls, pullovers, deep calves, lengthened partials.", ref: "Maeo 2022 (triceps 28.5% vs 19.6%); Pedrosa 2022", url: "https://biolayne.com/reps/issue-4/are-you-pressing-down-your-triceps-growth/" },
  { point: "Intensity techniques everywhere in Week 3.", fix: "Only on the last set of isolation work; big lifts stay at RIR 1.", ref: "Drop-set review (Brookbush)", url: "https://brookbushinstitute.com/articles/drop-sets-comprehensive-systematic-review-and-training-recommendations" },
  { point: "Relied on dips, pull-ups, bands your gym doesn't have.", fix: "Close-grip bench + push-ups; heavy pulldowns + hangs → pull-up roadmap.", ref: "Marines pull-up guide", url: "https://www.marines.mil/Portals/1/Docs/PullupTrainingGuide.pdf" },
  { point: "No cardio plan.", fix: "3×/week after lifting, mostly incline walking, no hard runs before leg day.", ref: "Wilson 2012; Schumann 2023", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9474354" },
  { point: "Weekly volume matters more than frequency.", fix: "Side delts ~14 sets/week over 3 days, back ~20, chest ~18.", ref: "Pelland et al. 2026 meta-regression", url: "https://sportrxiv.org/index.php/server/preprint/view/537" },
];

export const CARDIO_GUIDE: [string, string][] = [
  ["When", "After lifting, or on separate days. Never hard intervals on or the day before leg day."],
  ["How often", "About 3 sessions/week: 2 interval days + 1-2 hill walks. Rest-day walks are optional."],
  ["Which kind", "Mostly incline walking — it interferes least with muscle gain. Short runs only inside intervals."],
  ["Effort", "Intervals 8/10 (can't talk). Hill walk 6/10 (short sentences). Zone 2: 4-5/10 (full conversation)."],
  ["Fat loss", "Comes from the calorie deficit. Cardio adds ~250-400 kcal per session; don't eat it back with junk."],
];


/** "Is this the best exercise?" — the honest verdict for each main lift in the current plan. */
export const VERDICTS: { ex: string; verdict: "keep" | "optional" | "changed"; why: string }[] = [
  { ex: "Barbell bench press", verdict: "keep", why: "Strength anchor: ~17% more load than dumbbells and the easiest lift to progress. For SIZE, dumbbell and machine presses are equal (Haugen 2023) — swap it if your shoulders complain." },
  { ex: "Incline DB press (30°)", verdict: "keep", why: "Upper chest + deep stretch. ~30° gives the most upper-chest activity." },
  { ex: "Seated DB shoulder press", verdict: "keep", why: "Stable → more load on the delts than standing." },
  { ex: "Close-grip bench", verdict: "keep", why: "The best dip replacement: triceps + pressing strength." },
  { ex: "Lateral raises (DB / cable / lean-away)", verdict: "keep", why: "The #1 side-delt exercise. Cable ≈ dumbbell — use whichever is free." },
  { ex: "Overhead triceps extension", verdict: "keep", why: "Long-head growth 28.5% vs 19.6% for pushdowns (Maeo 2022)." },
  { ex: "Heavy lat pulldown", verdict: "keep", why: "Same muscle activity as pull-ups → your pull-up builder." },
  { ex: "Barbell row → machine row", verdict: "changed", why: "Same growth, far less lower-back fatigue — and Legs (squat + RDL) is the next day." },
  { ex: "Back squat", verdict: "keep", why: "Strength. For size, leg press / hack squat are equal (so they're the alternatives)." },
  { ex: "Romanian deadlift", verdict: "keep", why: "Top hamstring activity of the hinges, big stretch." },
  { ex: "Seated leg curl", verdict: "keep", why: "14% vs 9% hamstring growth vs lying curls (Maeo 2021)." },
  { ex: "Leg extension", verdict: "keep", why: "Trains the rectus femoris squats under-train; lengthened partials work well (Pedrosa 2022)." },
  { ex: "Machine chest press", verdict: "keep", why: "Safe to push near failure, hard to cheat — good for honest reps." },
  { ex: "Dumbbell pullover", verdict: "optional", why: "Popular, little growth data. Straight-arm pulldown is the alternative." },
  { ex: "Standing overhead press", verdict: "keep", why: "Strength. Seated / machine are equal for size — swap if the lower back is tired." },
  { ex: "Cable Y-raise", verdict: "optional", why: "Variety for side delts; no direct growth study. Plain cable laterals are fine." },
];
