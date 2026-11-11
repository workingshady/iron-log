// Version history of the plan, shown in the app (Plan → Versions). Newest first.
// Every program change gets an entry: what changed and WHY (the data or research behind it).
// Long-form notes stay in program/CHANGELOG.md. Version ids match `programVersionId()` → "ppl-arnold@2.5.0".

export interface VersionEntry {
  id: string; // "ppl-arnold@2.5.0"
  version: string;
  date: string; // YYYY-MM-DD released
  title: string;
  /** What triggered it: your data, research, your request. */
  why: string;
  changes: string[];
  kind: "major" | "minor" | "patch";
}

export const HISTORY: VersionEntry[] = [
  {
    id: "ppl-arnold@2.5.0", version: "2.5.0", date: "2026-11-11", kind: "minor",
    title: "Review of Week 1 Push + Pull",
    why: "Your first 2 sessions (47 sets, 21 notes) + research: Plotkin 2022 (load or rep progression both grow muscle), Singer 2024 (rest > 60 s helps, plateau ~90 s).",
    changes: [
      "Shrug on Pull: barbell → Machine Shrug (what your gym has); 4 logged sets relabelled from 'dumbbell 50 kg/hand' to 'machine 50 kg'.",
      "Isolation rests 60-75 s → 75-90 s.",
      "Clearer cues: face pull (elbows high, chin tucked), neck (all 3 directions), shrugs (straps OK).",
      "Weights engine: working weight = the weight of most sets (machine row 70→60→65 continues at 65); a different rep range is not a miss; no double deload; deload rounding fixed.",
      "Plan shows the projected weight for every week.",
    ],
  },
  {
    id: "ppl-arnold@2.4.0", version: "2.4.0", date: "2026-11-10", kind: "minor",
    title: "Drop sets only where they make sense",
    why: "Sødal 2023 meta-analysis: drop sets ≈ straight sets for growth in ½-⅓ the time, best on machines/cables, fatiguing.",
    changes: [
      "Leg press drop → leg extension (pin stack, quick, knee-friendly).",
      "EZ-curl drop removed (one drop per superset).",
      "No drop sets within 2 days of football.",
    ],
  },
  {
    id: "ppl-arnold@2.3.0", version: "2.3.0", date: "2026-11-10", kind: "minor",
    title: "Grip & Wrist extra + football-aware week",
    why: "Your goals (wrestler grip, healthy wrists) and football days moving Legs.",
    changes: ["Optional Grip & Wrist session (6 forearm/grip exercises, ≤2×/week).", "Week planner that re-fits sessions around football / busy days (legs ≥ 48 h away).", "ACSM 2-step jump when you beat the range by 2+ reps."],
  },
  {
    id: "ppl-arnold@2.2.0", version: "2.2.0", date: "2026-11-10", kind: "minor",
    title: "First data review (W1 Push)",
    why: "22 sets, 69 min, 14 notes: close-grip failed late, laterals moved, session too long.",
    changes: ["Close-grip bench earlier with safety pins.", "Laterals before seated DB press (your order).", "Ab wheel moved off Push.", "Dumbbells per hand; bars counted in totals; RIR-aware estimates."],
  },
  {
    id: "ppl-arnold@2.1.0", version: "2.1.0", date: "2026-11-09", kind: "patch",
    title: "Machine row on Pull",
    why: "Same growth, saves the lower back for Legs the next day.",
    changes: ["Barbell row → machine row on Pull."],
  },
  {
    id: "ppl-arnold@2.0.0", version: "2.0.0", date: "2026-11-09", kind: "major",
    title: "Intensive v2",
    why: "Gym has no assisted machine or bands; v1 had too much volume per session.",
    changes: ["Per-session cap ~11 hard sets per muscle, weekly volume spread out.", "Stretch-biased exercises, seated leg curl.", "Techniques only on the last isolation sets in Week 3.", "Small muscles as finishers; pull-up roadmap."],
  },
  {
    id: "ppl-arnold@1.0.0", version: "1.0.0", date: "2026-11-09", kind: "major",
    title: "First version",
    why: "Built from your 1-month PPL × Arnold plan.",
    changes: ["Week 1 is for finding starting weights."],
  },
];
