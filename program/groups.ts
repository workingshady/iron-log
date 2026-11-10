// Which muscle group each exercise counts toward (for weekly sets per muscle).
// Research target from the program: ~10-20 hard sets per muscle per week.
export const GROUPS = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings/Glutes", "Calves", "Core", "Traps", "Forearms/Grip", "Neck"] as const;
export type Group = (typeof GROUPS)[number];

export const EX_GROUP: Record<string, Group> = {
  bench: "Chest", db_bench: "Chest", incline_db: "Chest", machine_press: "Chest", pushup: "Chest", knuckle_pushup: "Chest",
  assisted_dip: "Chest", neg_dip: "Chest", dip: "Chest", bench_dip: "Triceps", dip_hold: "Triceps",
  db_ohp: "Shoulders", ohp: "Shoulders", machine_shoulder_press: "Shoulders", db_lateral: "Shoulders", cable_lateral: "Shoulders", machine_lateral: "Shoulders",
  face_pull: "Shoulders", rear_delt_fly: "Shoulders", reverse_pec_deck: "Shoulders", band_pull_apart: "Shoulders",
  oh_tri_ext: "Triceps", pushdown: "Triceps",
  neg_pullup: "Back", pullup: "Back", chinup: "Back", band_pullup: "Back", assisted_pullup_machine: "Back", pulldown: "Back", bb_row: "Back",
  cs_row: "Back", cable_row: "Back", db_row: "Back", inverted_row: "Back", scap_pullup: "Back",
  ez_curl: "Biceps", db_curl: "Biceps", incline_curl: "Biceps", hammer_curl: "Biceps",
  bb_shrug: "Traps", db_shrug: "Traps", farmer_carry: "Traps",
  squat: "Quads", goblet_squat: "Quads", leg_press: "Quads", hack_squat: "Quads", bss: "Quads", walking_lunge: "Quads",
  rdl: "Hamstrings/Glutes", db_rdl: "Hamstrings/Glutes", hip_thrust: "Hamstrings/Glutes", leg_curl: "Hamstrings/Glutes", nordic_curl: "Hamstrings/Glutes",
  standing_calf: "Calves", seated_calf: "Calves",
  ab_wheel: "Core", hanging_knee_raise: "Core", hanging_leg_raise: "Core", hollow_hold: "Core", plank: "Core", dead_bug: "Core", cable_crunch: "Core", tuck_lsit: "Core",
  plate_pinch: "Forearms/Grip", dead_hang: "Forearms/Grip", wrist_curl: "Forearms/Grip", rev_wrist_curl: "Forearms/Grip", wrist_roller: "Forearms/Grip",
  neck: "Neck",
  close_grip_bench: "Triceps", deficit_pushup: "Chest", neutral_pulldown: "Back", straight_arm_pulldown: "Back", db_pullover: "Back",
  wide_cable_row: "Back", machine_row: "Back", lean_lateral: "Shoulders", cable_y_raise: "Shoulders", kelso_shrug: "Traps",
  reverse_curl: "Forearms/Grip", leg_extension: "Quads", seated_leg_curl: "Hamstrings/Glutes",
  incline_bench: "Chest", smith_incline: "Chest", pec_deck: "Chest", cable_fly: "Chest", low_cable_fly: "Chest", db_fly: "Chest", landmine_press: "Shoulders", diamond_pushup: "Triceps", deadlift: "Hamstrings/Glutes", rack_pull: "Back", tbar_row: "Back", seal_row: "Back", meadows_row: "Back", single_arm_pulldown: "Back", single_arm_cable_row: "Back", back_extension: "Hamstrings/Glutes", arnold_press: "Shoulders", cable_upright_row: "Shoulders", cable_rear_fly: "Shoulders", db_front_raise: "Shoulders", push_press: "Shoulders", preacher_curl: "Biceps", cable_curl: "Biceps", bayesian_curl: "Biceps", spider_curl: "Biceps", concentration_curl: "Biceps", skull_crusher: "Triceps", jm_press: "Triceps", db_oh_ext: "Triceps", single_arm_pushdown: "Triceps", db_kickback: "Triceps", front_squat: "Quads", smith_squat: "Quads", step_up: "Quads", sissy_squat: "Quads", reverse_lunge: "Quads", good_morning: "Hamstrings/Glutes", single_leg_rdl: "Hamstrings/Glutes", cable_pull_through: "Hamstrings/Glutes", hip_abduction: "Hamstrings/Glutes", hip_adduction: "Hamstrings/Glutes", leg_press_calf: "Calves", single_leg_calf: "Calves", pallof_press: "Core", woodchop: "Core", side_plank: "Core", decline_crunch: "Core", reverse_crunch: "Core", smith_shrug: "Traps", hand_gripper: "Forearms/Grip",
  finger_curl: "Forearms/Grip", bb_wrist_curl_behind: "Forearms/Grip", db_pro_sup: "Forearms/Grip", radial_dev: "Forearms/Grip", towel_hang: "Forearms/Grip", db_hold: "Forearms/Grip",
};
