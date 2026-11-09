// Reference content shown in Learn (and as ⓘ explanations inside workouts).
// From 1-Month-PPL-x-Arnold-Program.md. Edit freely.

export interface Term {
  key: string;
  name: string;
  short: string; // one line, shown inline
  how?: string; // how to do it
  match: RegExp; // finds the term inside an exercise's technique text
}

export const TERMS: Term[] = [
  { key: "rir", name: "RIR · Reps In Reserve", short: "How many more reps you could have done. RIR 2 = stop with 2 left. RIR 0 = failure.", match: /\bRIR\b/i },
  { key: "superset", name: "Superset (A1 / A2)", short: "Do A1, then go straight to A2 with no rest. Rest after the pair, then repeat.", how: "Opposite muscles (chest/back, biceps/triceps), so neither gets much weaker and the session is faster.", match: /superset|\b[A-E][12]\b/i },
  { key: "drop", name: "Drop set", short: "Last set to near-failure, cut the weight ~25-30% right away, do more reps to near-failure.", how: "Double drop = drop twice. Log the extra part with “+ Drop set”.", match: /drop/i },
  { key: "restpause", name: "Rest-pause", short: "Last set to near-failure, rest 15-20 s, do more reps, repeat once.", how: "Log the extra reps with “+ Drop set” at the same weight, or write them in the set note.", match: /rest-pause/i },
  { key: "myo", name: "Myo-reps", short: "1 set of 12-15 to near-failure, then mini-sets of 3-5 reps with 5 breaths of rest, 3-4 times.", match: /myo/i },
  { key: "negative", name: "Negative", short: "Only the lowering part, slow (3-5 s). The main way to build your first pull-up or dip.", how: "Jump or step to the top, then lower under control. Count the seconds.", match: /negative|s down/i },
  { key: "partials", name: "Lengthened partials", short: "After the last full rep, do half-reps in the stretched half until failure.", match: /partial/i },
  { key: "failure", name: "Failure set", short: "A set where you couldn't finish the last rep (RIR 0).", match: /failure/i },
  { key: "warmup", name: "Warm-up set", short: "Light set before working sets. Not counted in volume.", match: /warm-?up/i },
  { key: "max", name: "×max (AMRAP)", short: "As many good reps as possible, usually stopping at the target RIR.", match: /×max|max\b/i },
  { key: "deload", name: "Deload", short: "Easier week: about half the sets, same or lighter weight. You recover and come back stronger.", match: /deload/i },
  { key: "rpe", name: "RPE · session effort", short: "How hard the whole session felt, 1-10. 10 = could not have done more.", match: /\bRPE\b/i },
  { key: "e1rm", name: "e1RM · estimated 1-rep max", short: "Your estimated best single from a set (weight × (1 + reps/30)). Good for spotting progress across rep ranges.", match: /e1RM/i },
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
