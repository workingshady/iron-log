// Pick-lists used across the app. Edit freely; ids are stored in the DB, so
// don't rename an existing id (add a new one instead).

/** Set types (Hevy / MacroFactor style). Warm-ups are excluded from volume. */
export const SET_KINDS = [
  { id: "N", label: "Normal" },
  { id: "W", label: "Warm-up" },
  { id: "D", label: "Drop" },
  { id: "F", label: "Failure" },
  { id: "R", label: "Rest-pause / myo" },
] as const;
export type SetKind = (typeof SET_KINDS)[number]["id"];

/** Why a planned session didn't happen. Based on the most-cited exercise barriers (ACE). */
export const EXCUSES = [
  { id: "busy", label: "No time / busy" },
  { id: "work", label: "Work / study" },
  { id: "tired", label: "Tired / low energy" },
  { id: "sleep", label: "Slept badly" },
  { id: "sore", label: "Too sore" },
  { id: "pain", label: "Pain / injury" },
  { id: "sick", label: "Sick" },
  { id: "motivation", label: "No motivation" },
  { id: "travel", label: "Travel" },
  { id: "family", label: "Family / social" },
  { id: "gym", label: "Gym closed / crowded" },
  { id: "weather", label: "Heat / weather" },
  { id: "fasting", label: "Fasting / Ramadan" },
  { id: "sport", label: "Played sport / football" },
  { id: "planned", label: "Planned rest" },
  { id: "other", label: "Other" },
] as const;

export const PAIN_AREAS = [
  "shoulder", "elbow", "wrist", "neck", "upper back", "lower back", "hip", "knee", "ankle", "chest", "other",
] as const;

/** Quick note tags (tap instead of typing). Don't rename existing ones — they're searched in old notes. */
export const NOTE_TAGS = [
  "easy", "hard", "felt strong", "form off", "grip failed", "no spotter", "equipment busy",
  "lost count", "too heavy", "too light", "partial range", "used straps", "paused reps", "slow negatives", "great pump",
] as const;

/** Equipment actually used for a set — the same exercise on a plate-loaded machine vs a pin stack isn't comparable. */
export const EQUIP_USED = [
  { id: "stack", label: "Pin stack", hint: "machine with a weight stack + pin" },
  { id: "plates", label: "Plate-loaded", hint: "machine you load with plates (kg = plates you added)" },
  { id: "cable", label: "Cable", hint: "cable column / crossover" },
  { id: "smith", label: "Smith", hint: "Smith machine (bar on rails)" },
  { id: "barbell", label: "Barbell", hint: "free barbell" },
  { id: "ez", label: "EZ bar", hint: "EZ / curl bar" },
  { id: "dumbbell", label: "Dumbbell", hint: "dumbbells" },
  { id: "bodyweight", label: "Bodyweight", hint: "no external load" },
  { id: "other", label: "Other", hint: "kettlebell, band, landmine…" },
] as const;

/** Readiness check before a session, each 1-5 (5 = best). Soreness/stress: 5 = none. */
export const READINESS = [
  { id: "sleep", label: "Sleep" },
  { id: "energy", label: "Energy" },
  { id: "mood", label: "Mood" },
  { id: "stress", label: "Stress (5 = calm)" },
  { id: "soreness", label: "Soreness (5 = fresh)" },
] as const;

/** Resistance band colours for assisted work (thickest → thinnest). */
export const BANDS = ["black", "purple", "green", "red", "yellow"] as const;

/**
 * Sports you can mark on a day (week planner) and log as cardio (protocol = id, row id `sport-<id>-<date>`;
 * football keeps its own mark "football" and row id `football-<date>`). Ids are stored: never rename, add new ones.
 * Ids use letters/underscores only (they sit between dashes in row ids).
 * met = a "normal" session, from the Compendium of Physical Activities (Ainsworth et al. 2011, Med Sci Sports Exerc
 * 43:1575; codes in comments). Easy ≈ ×0.7, hard ≈ ×1.3 (football keeps 5 / 7 / 9).
 * legs / upper = how hard it loads that area for the week planner:
 *   legs heavy → no heavy Legs the day before / of / after; moderate → day of / after only; light → no leg rule.
 *   upper heavy → mild penalty for Push or Shoulders + Arms the day after.
 */
export type Load = "heavy" | "moderate" | "light";
export interface Sport { id: string; label: string; emoji: string; met: number; legs: Load; upper: Load }
export const SPORTS: readonly Sport[] = [
  { id: "football", label: "Football", emoji: "⚽", met: 7, legs: "heavy", upper: "light" }, // 15610 soccer, casual 7.0
  { id: "padel", label: "Padel", emoji: "🎾", met: 6, legs: "heavy", upper: "moderate" }, // no own code: 15680 tennis doubles 6.0
  { id: "tennis", label: "Tennis", emoji: "🎾", met: 7.3, legs: "heavy", upper: "moderate" }, // 15675 tennis, general 7.3
  { id: "squash", label: "Squash", emoji: "🏸", met: 7.3, legs: "heavy", upper: "moderate" }, // 15652 squash, general 7.3
  { id: "basketball", label: "Basketball", emoji: "🏀", met: 6.5, legs: "heavy", upper: "light" }, // 15055 basketball, general 6.5
  { id: "volleyball", label: "Volleyball", emoji: "🏐", met: 6, legs: "moderate", upper: "moderate" }, // 15711 volleyball, competitive, gym 6.0
  { id: "handball", label: "Handball", emoji: "🤾", met: 8, legs: "heavy", upper: "moderate" }, // 15340 handball, team 8.0
  { id: "swimming", label: "Swimming", emoji: "🏊", met: 5.8, legs: "light", upper: "heavy" }, // 18310 swimming laps, freestyle, light/moderate 5.8
  { id: "running", label: "Running", emoji: "🏃", met: 8, legs: "heavy", upper: "light" }, // 12150 running, general 8.0
  { id: "cycling", label: "Cycling", emoji: "🚴", met: 7.5, legs: "moderate", upper: "light" }, // 01015 bicycling, general 7.5
  { id: "hiking", label: "Hiking", emoji: "🥾", met: 6, legs: "moderate", upper: "light" }, // 17080 hiking, cross country 6.0
  { id: "martial_arts", label: "Martial arts", emoji: "🤼", met: 6, legs: "moderate", upper: "heavy" }, // 15730 wrestling 6.0 (15430 martial arts, moderate 10.3)
  { id: "boxing", label: "Boxing", emoji: "🥊", met: 5.5, legs: "moderate", upper: "heavy" }, // 15110 boxing, punching bag 5.5 (15120 sparring 7.8)
  { id: "climbing", label: "Climbing", emoji: "🧗", met: 5.8, legs: "light", upper: "heavy" }, // 15540 rock climbing, low-moderate difficulty 5.8
  { id: "yoga", label: "Yoga / mobility", emoji: "🧘", met: 2.5, legs: "light", upper: "light" }, // 02150 yoga, Hatha 2.5
  { id: "other", label: "Other sport", emoji: "🏅", met: 5, legs: "moderate", upper: "moderate" }, // generic moderate effort
];
export const sportById = (id: string | null | undefined): Sport | undefined => SPORTS.find((s) => s.id === id);
/** RPE + MET multiplier per intensity choice in the log sheet. */
export const SPORT_INTENSITY = { easy: { rpe: 4, k: 0.7 }, normal: { rpe: 7, k: 1 }, hard: { rpe: 9, k: 1.3 } } as const;
/** Cardio row id for a sport game on a date (client side; the server adds the user id for non-owners). */
export const sportRowId = (id: string, iso: string) => (id === "football" ? `football-${iso}` : `sport-${id}-${iso}`);
