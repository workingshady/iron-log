// Your week, from Settings: which day it starts on and which weekdays you prefer to rest.
// Stored as settings "weekStart" ("0" Sun … "6" Sat) and "restDays" ("0,4" = Sun + Thu).
// Older installs only had a preset ("A (Mon start)" / "B (Sat start…)") — still understood.

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface WeekConfig { weekStart: number; restDows: number[]; schedule: string[] }

export function weekConfig(settings: Record<string, string> | undefined | null, presets: Record<string, string[]>): WeekConfig {
  const preset = settings?.schedule ? presets[settings.schedule] : null;
  const weekStart = settings?.weekStart != null && settings.weekStart !== "" ? Number(settings.weekStart) : settings?.schedule?.startsWith("B") ? 6 : 1;
  let restDows: number[];
  if (settings?.restDays != null) restDows = settings.restDays === "" ? [] : settings.restDays.split(",").map(Number);
  else if (preset) restDows = preset.map((v, i) => (v === "rest" ? i : -1)).filter((i) => i >= 0);
  else restDows = [0, 4]; // Mon-start default: Thu + Sun
  const schedule = Array.from({ length: 7 }, (_, i) => (restDows.includes(i) ? "rest" : "train"));
  return { weekStart, restDows, schedule };
}

/** Weekdays in display order starting from weekStart. */
export const orderedDows = (weekStart: number) => Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
