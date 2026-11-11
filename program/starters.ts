// Starting-weight estimates for exercises you haven't done yet.
// est. 1RM of the exercise ≈ ratio × your bench-press est. 1RM (or, with no bench yet, ≈ ratio × 0.8 × bodyweight).
// Ratios are conservative middle-of-the-road values from strength-standard tables (StrengthLevel community data)
// and coaching rules of thumb, then the app aims for ~3 reps in reserve and rounds DOWN. Machines/cables differ
// between brands — always treat set 1 as a test. Dumbbell pairs are PER HAND.
export const STARTER: Record<string, number> = {
  // chest / triceps
  db_bench: 0.37, incline_db: 0.33, machine_press: 0.9, close_grip_bench: 0.85, pushdown: 0.35, oh_tri_ext: 0.3,
  // back
  pulldown: 0.8, neutral_pulldown: 0.8, machine_row: 0.8, cable_row: 0.8, wide_cable_row: 0.7, bb_row: 0.75,
  cs_row: 0.3, db_row: 0.35, db_pullover: 0.25, straight_arm_pulldown: 0.3, face_pull: 0.25,
  // shoulders
  ohp: 0.6, db_ohp: 0.22, machine_shoulder_press: 0.55, db_lateral: 0.1, cable_lateral: 0.08, lean_lateral: 0.08,
  cable_y_raise: 0.07, rear_delt_fly: 0.08, reverse_pec_deck: 0.35,
  // arms / forearms
  ez_curl: 0.4, db_curl: 0.15, incline_curl: 0.13, hammer_curl: 0.16, reverse_curl: 0.3, wrist_curl: 0.3, rev_wrist_curl: 0.15,
  // traps / carries
  finger_curl: 0.5, bb_wrist_curl_behind: 0.6, db_pro_sup: 0.06, radial_dev: 0.06,
  bb_shrug: 1.2, db_shrug: 0.4, kelso_shrug: 0.25, farmer_carry: 0.3,
  // legs
  squat: 1.1, rdl: 1.1, leg_press: 2.0, hack_squat: 1.2, leg_extension: 0.6, seated_leg_curl: 0.5, leg_curl: 0.45,
  standing_calf: 1.0, seated_calf: 0.6, bss: 0.2, goblet_squat: 0.3, hip_thrust: 1.2, db_rdl: 0.35,
  // exercise bank (v2.4) — same method: ratio × bench est. max, conservative
  incline_bench: 0.8, smith_incline: 0.75, pec_deck: 0.45, cable_fly: 0.12, low_cable_fly: 0.08, db_fly: 0.12, landmine_press: 0.35, deadlift: 1.4, rack_pull: 1.5, tbar_row: 0.6, seal_row: 0.55, meadows_row: 0.3, single_arm_pulldown: 0.3, single_arm_cable_row: 0.35, arnold_press: 0.18, cable_upright_row: 0.3, cable_rear_fly: 0.06, db_front_raise: 0.08, push_press: 0.75, preacher_curl: 0.33, cable_curl: 0.35, bayesian_curl: 0.12, spider_curl: 0.12, concentration_curl: 0.14, skull_crusher: 0.35, jm_press: 0.6, db_oh_ext: 0.18, single_arm_pushdown: 0.15, db_kickback: 0.07, front_squat: 0.85, smith_squat: 0.95, step_up: 0.15, reverse_lunge: 0.18, good_morning: 0.5, single_leg_rdl: 0.2, cable_pull_through: 0.4, hip_abduction: 0.5, hip_adduction: 0.5, leg_press_calf: 1.4, single_leg_calf: 0.15, pallof_press: 0.1, woodchop: 0.15, smith_shrug: 1.1,
  machine_shrug: 1.0,
};
