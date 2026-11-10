// Which muscles each exercise trains, for the body heatmap.
// p = primary (counts 1 set) · s = secondary (counts ½ set) — the usual "fractional sets" method.
// Muscle names are the ones the body map draws (react-body-highlighter).

export type Muscle =
  | "trapezius" | "upper-back" | "lower-back" | "chest" | "biceps" | "triceps" | "forearm"
  | "back-deltoids" | "front-deltoids" | "abs" | "obliques" | "adductor" | "abductors"
  | "hamstring" | "quadriceps" | "calves" | "gluteal" | "neck";

export const MUSCLE_LABEL: Record<Muscle, string> = {
  trapezius: "Traps", "upper-back": "Upper back / lats", "lower-back": "Lower back", chest: "Chest", biceps: "Biceps", triceps: "Triceps",
  forearm: "Forearms & grip", "back-deltoids": "Rear delts", "front-deltoids": "Front & side delts", abs: "Abs", obliques: "Obliques",
  adductor: "Adductors", abductors: "Abductors", hamstring: "Hamstrings", quadriceps: "Quads", calves: "Calves", gluteal: "Glutes", neck: "Neck",
};

type M = { p: Muscle[]; s?: Muscle[] };
export const EX_MUSCLES: Record<string, M> = {
  bench: { p: ["chest"], s: ["triceps", "front-deltoids"] },
  db_bench: { p: ["chest"], s: ["triceps", "front-deltoids"] },
  incline_db: { p: ["chest", "front-deltoids"], s: ["triceps"] },
  machine_press: { p: ["chest"], s: ["triceps", "front-deltoids"] },
  pushup: { p: ["chest"], s: ["triceps", "front-deltoids", "abs"] },
  knuckle_pushup: { p: ["chest"], s: ["triceps", "forearm"] },
  assisted_dip: { p: ["chest", "triceps"], s: ["front-deltoids"] },
  neg_dip: { p: ["chest", "triceps"], s: ["front-deltoids"] },
  dip: { p: ["chest", "triceps"], s: ["front-deltoids"] },
  bench_dip: { p: ["triceps"], s: ["chest", "front-deltoids"] },
  dip_hold: { p: ["triceps"], s: ["chest", "front-deltoids", "trapezius"] },
  db_ohp: { p: ["front-deltoids"], s: ["triceps", "trapezius"] },
  ohp: { p: ["front-deltoids"], s: ["triceps", "trapezius", "abs"] },
  machine_shoulder_press: { p: ["front-deltoids"], s: ["triceps"] },
  db_lateral: { p: ["front-deltoids"], s: ["trapezius"] },
  cable_lateral: { p: ["front-deltoids"], s: ["trapezius"] },
  machine_lateral: { p: ["front-deltoids"] },
  face_pull: { p: ["back-deltoids"], s: ["trapezius", "upper-back"] },
  rear_delt_fly: { p: ["back-deltoids"], s: ["upper-back"] },
  reverse_pec_deck: { p: ["back-deltoids"], s: ["upper-back"] },
  band_pull_apart: { p: ["back-deltoids"], s: ["upper-back", "trapezius"] },
  oh_tri_ext: { p: ["triceps"] },
  pushdown: { p: ["triceps"] },
  neg_pullup: { p: ["upper-back"], s: ["biceps", "forearm"] },
  pullup: { p: ["upper-back"], s: ["biceps", "forearm"] },
  chinup: { p: ["upper-back", "biceps"], s: ["forearm"] },
  band_pullup: { p: ["upper-back"], s: ["biceps"] },
  assisted_pullup_machine: { p: ["upper-back"], s: ["biceps"] },
  pulldown: { p: ["upper-back"], s: ["biceps"] },
  bb_row: { p: ["upper-back"], s: ["back-deltoids", "biceps", "lower-back", "trapezius"] },
  cs_row: { p: ["upper-back"], s: ["back-deltoids", "biceps"] },
  cable_row: { p: ["upper-back"], s: ["back-deltoids", "biceps"] },
  db_row: { p: ["upper-back"], s: ["back-deltoids", "biceps"] },
  inverted_row: { p: ["upper-back"], s: ["back-deltoids", "biceps", "abs"] },
  scap_pullup: { p: ["upper-back"], s: ["trapezius"] },
  ez_curl: { p: ["biceps"], s: ["forearm"] },
  db_curl: { p: ["biceps"], s: ["forearm"] },
  incline_curl: { p: ["biceps"] },
  hammer_curl: { p: ["biceps", "forearm"] },
  bb_shrug: { p: ["trapezius"], s: ["forearm"] },
  db_shrug: { p: ["trapezius"], s: ["forearm"] },
  farmer_carry: { p: ["trapezius", "forearm"], s: ["abs", "obliques"] },
  squat: { p: ["quadriceps", "gluteal"], s: ["adductor", "lower-back"] },
  goblet_squat: { p: ["quadriceps", "gluteal"], s: ["abs"] },
  leg_press: { p: ["quadriceps"], s: ["gluteal", "adductor"] },
  hack_squat: { p: ["quadriceps"], s: ["gluteal"] },
  bss: { p: ["quadriceps", "gluteal"], s: ["adductor"] },
  walking_lunge: { p: ["quadriceps", "gluteal"], s: ["adductor"] },
  rdl: { p: ["hamstring", "gluteal"], s: ["lower-back", "forearm"] },
  db_rdl: { p: ["hamstring", "gluteal"], s: ["lower-back"] },
  hip_thrust: { p: ["gluteal"], s: ["hamstring"] },
  leg_curl: { p: ["hamstring"] },
  nordic_curl: { p: ["hamstring"] },
  standing_calf: { p: ["calves"] },
  seated_calf: { p: ["calves"] },
  ab_wheel: { p: ["abs"], s: ["upper-back", "obliques"] },
  hanging_knee_raise: { p: ["abs"], s: ["forearm", "obliques"] },
  hanging_leg_raise: { p: ["abs"], s: ["forearm", "obliques"] },
  hollow_hold: { p: ["abs"] },
  plank: { p: ["abs"], s: ["obliques"] },
  dead_bug: { p: ["abs"] },
  cable_crunch: { p: ["abs"], s: ["obliques"] },
  tuck_lsit: { p: ["abs"], s: ["triceps"] },
  plate_pinch: { p: ["forearm"] },
  dead_hang: { p: ["forearm"], s: ["upper-back"] },
  wrist_curl: { p: ["forearm"] },
  rev_wrist_curl: { p: ["forearm"] },
  wrist_roller: { p: ["forearm"] },
  neck: { p: ["neck"], s: ["trapezius"] },
  close_grip_bench: { p: ["triceps", "chest"], s: ["front-deltoids"] },
  deficit_pushup: { p: ["chest"], s: ["triceps", "front-deltoids", "abs"] },
  neutral_pulldown: { p: ["upper-back"], s: ["biceps"] },
  straight_arm_pulldown: { p: ["upper-back"], s: ["triceps"] },
  db_pullover: { p: ["upper-back", "chest"], s: ["triceps"] },
  wide_cable_row: { p: ["upper-back", "back-deltoids"], s: ["trapezius", "biceps"] },
  machine_row: { p: ["upper-back"], s: ["back-deltoids", "biceps"] },
  lean_lateral: { p: ["front-deltoids"] },
  cable_y_raise: { p: ["front-deltoids"], s: ["trapezius"] },
  kelso_shrug: { p: ["trapezius"], s: ["upper-back", "back-deltoids"] },
  reverse_curl: { p: ["forearm"], s: ["biceps"] },
  leg_extension: { p: ["quadriceps"] },
  seated_leg_curl: { p: ["hamstring"] },
  finger_curl: { p: ["forearm"] },
  bb_wrist_curl_behind: { p: ["forearm"] },
  db_pro_sup: { p: ["forearm"] },
  radial_dev: { p: ["forearm"] },
  towel_hang: { p: ["forearm"], s: ["upper-back"] },
  db_hold: { p: ["forearm"], s: ["trapezius"] },
};

/** Fractional weekly sets per muscle from {exercise → sets}. */
export function muscleVolume(exSets: Record<string, number>): Partial<Record<Muscle, number>> {
  const out: Partial<Record<Muscle, number>> = {};
  for (const [ex, n] of Object.entries(exSets)) {
    const m = EX_MUSCLES[ex];
    if (!m) continue;
    m.p.forEach((x) => (out[x] = (out[x] ?? 0) + n));
    (m.s ?? []).forEach((x) => (out[x] = (out[x] ?? 0) + n / 2));
  }
  return out;
}
