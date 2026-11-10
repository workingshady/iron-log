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
};
