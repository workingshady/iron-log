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

/** Quick note tags (tap instead of typing). */
export const NOTE_TAGS = ["easy", "hard", "form off", "grip failed", "felt strong", "no spotter", "equipment busy"] as const;

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
