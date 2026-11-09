// How to convert a target when you swap to an alternative.
// Rule (research: free weights ≈ machines when volume is matched): keep SAME sets, rep range and RIR.
// Only the load changes. `ratio` = suggested starting weight ÷ your last weight on the main lift
// (for dumbbells: per dumbbell). `reps` overrides the rep target (bodyweight swaps).
// These are rough population averages — start a bit light and find the RIR on set 1.
//
// Sources: barbell ≈ 1.36 × total dumbbell weight (416-lifter survey, garagegymreviews);
// leg press ≈ 1.8-2.2 × squat (rule of thumb); machine vs free weight hypertrophy equal when volume matched.

export interface SwapHint {
  ratio?: number;
  reps?: number | [number, number];
  note?: string;
}

const H: Record<string, SwapHint> = {
  "bench>db_bench": { ratio: 0.37, note: "Each DB ≈ bar ÷ 2.7" },
  "bench>machine_press": { ratio: 0.9, note: "Machines vary a lot — test set 1" },
  "bench>pushup": { reps: [8, 20], note: "Add a backpack/plate if 20+ is easy" },
  "db_bench>bench": { ratio: 2.7 },
  "incline_db>machine_press": { ratio: 2.0 },
  "incline_db>db_bench": { ratio: 1.1 },
  "machine_press>db_bench": { ratio: 0.4 },
  "machine_press>pushup": { reps: [8, 20] },
  "ohp>db_ohp": { ratio: 0.4, note: "Each DB ≈ 40% of the bar" },
  "db_ohp>ohp": { ratio: 2.3 },
  "db_ohp>machine_shoulder_press": { ratio: 1.8 },
  "assisted_dip>bench_dip": { reps: [10, 15] },
  "assisted_dip>neg_dip": { reps: 3, note: "3-5 s lowering" },
  "neg_dip>bench_dip": { reps: [10, 15] },
  "dip_hold>bench_dip": { reps: [10, 15] },
  "db_lateral>cable_lateral": { ratio: 0.6, note: "Cable feels heavier — go light" },
  "cable_lateral>db_lateral": { ratio: 1.6 },
  "oh_tri_ext>pushdown": { ratio: 1.0, note: "Depends on the stack — test set 1" },
  "pushdown>oh_tri_ext": { ratio: 1.0 },
  "ab_wheel>plank": { note: "Hold 30-45 s per set" },
  "ab_wheel>dead_bug": { reps: [8, 12], note: "per side" },
  "bb_row>cs_row": { ratio: 0.35, note: "Each DB" },
  "bb_row>db_row": { ratio: 0.45, note: "Each arm" },
  "cs_row>db_row": { ratio: 1.2 },
  "cs_row>cable_row": { ratio: 2.0 },
  "neg_pullup>band_pullup": { reps: [5, 8] },
  "neg_pullup>pulldown": { reps: [6, 10], note: "≈ 70-80% of bodyweight is a hard set" },
  "band_pullup>pulldown": { reps: [8, 12] },
  "band_pullup>assisted_pullup_machine": { note: "Assist ≈ 30-50% of bodyweight to start" },
  "pulldown>band_pullup": { reps: [6, 10] },
  "face_pull>band_pull_apart": { reps: [15, 25] },
  "face_pull>reverse_pec_deck": { ratio: 1.2 },
  "bb_shrug>db_shrug": { ratio: 0.45, note: "Each DB" },
  "bb_shrug>farmer_carry": { note: "Heavy DBs, 30 m" },
  "db_shrug>bb_shrug": { ratio: 2.2 },
  "ez_curl>db_curl": { ratio: 0.45, note: "Each DB" },
  "ez_curl>incline_curl": { ratio: 0.35, note: "Each DB — stretched position is harder" },
  "incline_curl>ez_curl": { ratio: 2.6 },
  "incline_curl>db_curl": { ratio: 1.2 },
  "hammer_curl>db_curl": { ratio: 0.9 },
  "squat>goblet_squat": { ratio: 0.35, reps: [10, 15], note: "Goblet is limited by your arms — use more reps" },
  "squat>leg_press": { ratio: 1.8, note: "Leg press ≈ 1.8-2.2× squat" },
  "leg_press>goblet_squat": { ratio: 0.2, reps: [10, 15] },
  "leg_press>hack_squat": { ratio: 0.6 },
  "rdl>db_rdl": { ratio: 0.4, note: "Each DB" },
  "rdl>hip_thrust": { ratio: 1.0 },
  "leg_curl>nordic_curl": { reps: [3, 6], note: "Lower slowly, push back up" },
  "standing_calf>seated_calf": { ratio: 0.6 },
  "seated_calf>standing_calf": { ratio: 1.6 },
  "bss>walking_lunge": { ratio: 1.0 },
  "hanging_knee_raise>hanging_leg_raise": { reps: [6, 10] },
  "dead_hang>plate_pinch": { note: "Same time target" },
  "plate_pinch>dead_hang": { note: "Same time target" },
  "hollow_hold>plank": { note: "Double the time" },
  "hollow_hold>dead_bug": { reps: [8, 12] },
  "wrist_curl>wrist_roller": { reps: [2, 3], note: "Full roll up + down = 1 rep" },
  "rev_wrist_curl>wrist_roller": { reps: [2, 3] },
  "knuckle_pushup>pushup": {},
  "rear_delt_fly>face_pull": { ratio: 2.0 },
  "rear_delt_fly>reverse_pec_deck": { ratio: 2.0 },
  "cable_crunch>ab_wheel": { reps: [6, 10] },
};

export const DEFAULT_SWAP_NOTE = "Same sets, reps & RIR. New weight: start ~10% light and find the RIR on set 1.";

export function swapHint(from: string, to: string): SwapHint {
  return H[`${from}>${to}`] ?? {};
}

/** Why you swapped — stored with the swap so the review can spot patterns. */
export const SWAP_REASONS = ["equipment busy", "no equipment", "pain", "too hard", "too easy", "preference"] as const;
