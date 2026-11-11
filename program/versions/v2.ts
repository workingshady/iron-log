import { rx, type DayPlan, type Program, type Rx } from "../types";

// v2.0.0 — Intensive PPL × Arnold, no dips / pull-ups / bands / assisted machine (gym doesn't have them).
// Built after a critique of v1 (see program/CHANGELOG.md):
//  • per-session cap ≈ 10-11 hard sets per muscle (growth plateaus beyond that in one session — Remmert/Pelland 2025);
//    weekly volume kept high by spreading it (side delts ~14/wk over 3 days, back ~20, chest ~18, traps ~12).
//  • stretch-biased picks: incline DB, overhead triceps, incline curls, pullovers, seated leg curl (Maeo 2021/2022).
//  • intensity techniques only on the LAST set of isolation work in Week 3; big lifts never to failure.
//  • small muscles (grip, wrist, neck, push-up burnouts) are FINISHERS at the end, never before heavy pulling.
//  • pull-up builder: heavy pulldowns + rows + dead hangs now → negatives → strict → weighted (Learn → Pull-up roadmap).
//
// Each row: exercise, schemes for weeks [1,2,3,4], rest (s), options. Scheme: "4x6-8" · "3x30s" · "3x30m" · "2xmax".

type W = [string, string, string, string];
interface E { ex: string; s: W; rest: number; tag?: string; t?: string; t3?: string; heavy?: boolean; noRir?: boolean; fin?: boolean }

const RIR_ISO: Rx["rir"][] = [2, 1, [0, 1], 3];
const RIR_HEAVY: Rx["rir"][] = [2, 2, 1, 3];

function make(n: number, list: E[]): Rx[] {
  return list.map((e) =>
    rx(e.ex, e.s[n - 1], {
      rest: e.rest,
      tag: e.tag,
      finisher: e.fin,
      rir: e.noRir || e.fin ? undefined : (e.heavy ? RIR_HEAVY : RIR_ISO)[n - 1],
      tech: n === 4 && !e.fin ? "Deload: smooth reps, leave 3 in the tank" : n === 3 && e.t3 ? [e.t, e.t3].filter(Boolean).join(" · ") : e.t,
    }),
  );
}

const D1: E[] = [
  // v2.2 order from your first session: close-grip moved up (done last it failed at 40 kg and the bar nearly fell),
  // laterals before the shoulder press (the order you chose), ab wheel moved out (session ran 69 min, core got skipped).
  { ex: "bench", s: ["3x5-6", "4x5-6", "4x4-6", "2x5"], rest: 180, heavy: true, t: "2 s down, touch chest, drive up" },
  { ex: "incline_db", s: ["3x8-10", "3x8-10", "4x8-10", "2x10"], rest: 120, t: "Deep stretch at the bottom", t3: "Last set: rest-pause" },
  { ex: "close_grip_bench", s: ["2x8", "3x8", "3x6-8", "2x8"], rest: 120, heavy: true, t: "Safety pins or spotter · stop 1-2 reps early · elbows tucked" },
  { ex: "db_lateral", s: ["3x12-15", "4x12-15", "4x12-15", "2x15"], rest: 75, t: "Lead with elbows, 2 s down", t3: "Last set: lengthened partials" },
  { ex: "db_ohp", s: ["3x8-10", "3x8-10", "3x8-10", "2x8"], rest: 120, t: "Strict reps only — no bouncing" },
  { ex: "oh_tri_ext", s: ["3x10-12", "3x10-12", "3x10-12", "2x12"], rest: 90, t: "Rope or 1 dumbbell · elbows forward · stop where the shoulder feels tight", t3: "Last set: drop set (−20-25%)" },
  { ex: "deficit_pushup", s: ["1xmax", "2xmax", "2xmax", "1xmax"], rest: 60, fin: true, t: "Burnout: strict, stop 1 rep before form breaks" },
];

const D2: E[] = [
  { ex: "pulldown", s: ["3x6-8", "4x6-8", "4x5-7", "2x8"], rest: 150, heavy: true, t: "Pull-up builder: heavy, full stretch at top, chest to bar" },
  { ex: "machine_row", s: ["3x6-8", "3x6-8", "3x6-8", "2x8"], rest: 150, heavy: true, t: "Heavy, chest on pad — spares the lower back before Legs" },
  { ex: "neutral_pulldown", s: ["2x10-12", "3x10-12", "3x10-12", "2x10"], rest: 90, t: "3 s down", t3: "Last set: lengthened partials" },
  { ex: "face_pull", s: ["3x15", "3x15", "3x15-20", "2x15"], rest: 90, t: "Rope to eyes, elbows high & wide, thumbs back, chin tucked — feel the back of the shoulder", t3: "Last set: drop set (−20-25%)" },
  { ex: "machine_shrug", s: ["3x10-12", "3x10-12", "4x8-12", "2x12"], rest: 90, t: "Straight up, hold 2 s · straps if grip slips first" },
  { ex: "incline_curl", s: ["3x10-12", "3x10-12", "3x10-12", "2x12"], rest: 90, t: "Arms hang behind you", t3: "Last set: drop set (−20-25%)" },
  { ex: "dead_hang", s: ["2x30s", "3x30s", "3x40s", "2x30s"], rest: 60, fin: true, t: "Pull-up base & grip · no straps" },
  { ex: "neck", s: ["1x15", "2x15", "2x20", "1x15"], rest: 60, fin: true, t: "Light & slow · all 3 directions each set: front, back, both sides" },
];

const D3: E[] = [
  { ex: "squat", s: ["3x5-6", "4x5-6", "4x4-6", "2x5"], rest: 180, heavy: true, t: "Brace, 2 s down, full depth" },
  { ex: "rdl", s: ["3x6-8", "3x6-8", "3x6-8", "2x8"], rest: 150, heavy: true, t: "Deep hamstring stretch, flat back" },
  { ex: "leg_press", s: ["2x10-12", "3x10-12", "3x10-12", "2x12"], rest: 120, t: "Full depth, knees track toes" },
  { ex: "seated_leg_curl", s: ["3x10-12", "3x10-12", "4x10-12", "2x12"], rest: 90, t: "Lean forward, 3 s down", t3: "Last set: lengthened partials" },
  { ex: "leg_extension", s: ["2x12-15", "2x12-15", "3x12-15", "1x15"], rest: 75, t3: "Last set: drop set (pin −20-25%)" },
  { ex: "standing_calf", s: ["3x10-12", "4x10-12", "4x10-12", "2x12"], rest: 75, t: "2 s pause in the stretch", t3: "Last set: lengthened partials" },
  { ex: "db_lateral", s: ["2x15-20", "3x15-20", "3x15-20", "1x15"], rest: 45, t: "Delts 3rd hit of the week", t3: "Last set: myo-reps" },
  { ex: "hanging_knee_raise", s: ["3x10", "3x12", "3x12-15", "2x10"], rest: 60, noRir: true },
  { ex: "farmer_carry", s: ["2x30m", "3x30m", "3x40m", "2x30m"], rest: 90, fin: true, t: "Heavy, tall, no straps" },
  { ex: "neck", s: ["1x15", "1x20", "2x20", "1x15"], rest: 60, fin: true, t: "Light & slow" },
];

const D5: E[] = [
  { ex: "db_bench", s: ["3x8-10", "3x8-10", "4x8-10", "2x10"], rest: 0, tag: "A1", t: "Deep stretch" },
  { ex: "cs_row", s: ["3x8-10", "3x8-10", "4x8-10", "2x10"], rest: 105, tag: "A2", t: "Squeeze 1 s" },
  { ex: "machine_press", s: ["2x10-12", "3x10-12", "3x10-12", "2x12"], rest: 0, tag: "B1", t3: "Last set: drop set (−20-25%)" },
  { ex: "wide_cable_row", s: ["2x10-12", "3x10-12", "3x10-12", "2x12"], rest: 90, tag: "B2", t: "Elbows out, pull to sternum" },
  { ex: "db_pullover", s: ["2x12", "3x12", "3x12-15", "1x12"], rest: 0, tag: "C1", t: "Big stretch" },
  { ex: "kelso_shrug", s: ["2x12", "3x12", "3x12-15", "2x12"], rest: 75, tag: "C2", t: "Pinch blades, hold 2 s" },
  { ex: "hollow_hold", s: ["3x20s", "3x30s", "3x40s", "2x20s"], rest: 60, noRir: true },
  { ex: "pushup", s: ["1xmax", "2xmax", "2xmax", "1xmax"], rest: 60, fin: true, t: "Push-up burnout: strict, chest to floor" },
  { ex: "wrist_curl", s: ["2x15-20", "2x15-20", "3x15-20", "1x20"], rest: 0, tag: "E1", fin: true },
  { ex: "rev_wrist_curl", s: ["2x15-20", "2x15-20", "3x15-20", "1x20"], rest: 45, tag: "E2", fin: true },
];

const D6: E[] = [
  { ex: "lean_lateral", s: ["3x12-15", "4x12-15", "4x12-15", "2x15"], rest: 45, t: "Width first, while fresh", t3: "Last set: lengthened partials" },
  { ex: "ohp", s: ["3x6-8", "3x6-8", "4x5-7", "2x6"], rest: 150, heavy: true, t: "Glutes tight, no back lean" },
  { ex: "cable_y_raise", s: ["2x12-15", "3x12-15", "3x12-15", "1x15"], rest: 75, t3: "Last set: drop set (−20-25%)" },
  { ex: "rear_delt_fly", s: ["3x15", "3x15", "3x15-20", "2x15"], rest: 75, t3: "Last set: myo-reps" },
  { ex: "ez_curl", s: ["3x8-10", "3x8-10", "3x8-10", "2x10"], rest: 0, tag: "A1", t: "Elbows pinned, 2 s down" },
  { ex: "pushdown", s: ["3x10-12", "3x10-12", "3x10-12", "2x12"], rest: 90, tag: "A2", t3: "Last set: drop set (−20-25%)" },
  { ex: "hammer_curl", s: ["2x10-12", "2x10-12", "3x10-12", "1x12"], rest: 60 },
  { ex: "db_shrug", s: ["2x12-15", "3x12-15", "3x12-15", "2x12"], rest: 75, t: "Hold 2 s at the top · or the shrug machine (enter the stack number)" },
  { ex: "bss", s: ["2x8-10", "2x8-10", "3x8-10", "1x10"], rest: 90, t: "Leg booster (2nd leg hit)" },
  { ex: "seated_calf", s: ["2x12-15", "3x12-15", "3x12-15", "2x12"], rest: 60, t: "2 s stretch pause" },
  { ex: "reverse_curl", s: ["2x12-15", "2x12-15", "3x12-15", "1x15"], rest: 60, fin: true, t: "Forearm thickness" },
  { ex: "neck", s: ["1x15", "1x20", "2x20", "1x15"], rest: 60, fin: true, t: "Light & slow" },
];

// Optional "Grip & Wrist" extra (12-15 min, 2×/week): every direction the wrist moves + finger and grip holds.
// Do it after Chest+Back / Shoulders+Arms or on a rest day — NOT before or the day before Pull (grip must be fresh).
const X1: E[] = [
  { ex: "finger_curl", s: ["2x12-15", "3x12-15", "3x12-15", "2x12"], rest: 60, t: "Roll to the fingertips, roll back up", t3: "Last set: lengthened partials" },
  { ex: "bb_wrist_curl_behind", s: ["2x10-12", "3x10-12", "3x10-12", "1x12"], rest: 60, t: "Heavy flexors" },
  { ex: "rev_wrist_curl", s: ["2x15", "3x15", "3x15-20", "1x15"], rest: 45, t: "Extensors protect the elbow" },
  { ex: "db_pro_sup", s: ["2x12", "2x12", "3x12", "1x12"], rest: 45, t: "Slow, each side" },
  { ex: "radial_dev", s: ["2x15", "2x15", "2x15-20", "1x15"], rest: 45, t: "Light, wrist only" },
  { ex: "db_hold", s: ["2x30s", "2x40s", "3x40s", "1x30s"], rest: 60, t: "Heaviest dumbbells you can hold" },
];
const extras = (n: number): DayPlan[] => [
  { key: "X1", name: "Grip & Wrist", focus: "Optional extra · 12-15 min · forearm size + tough wrists", items: make(n, X1) },
];

const days = (n: number): DayPlan[] => [
  { key: "D1", name: "Push", focus: "Chest + shoulder strength · close-grip replaces dips", items: make(n, D1) },
  { key: "D2", name: "Pull", focus: "Back width + pull-up builder + traps", items: make(n, D2) },
  { key: "D3", name: "Legs", focus: "Legs + delts 3rd hit + grip", items: make(n, D3) },
  { key: "D5", name: "Chest + Back", focus: "Arnold supersets · mass · upper-back thickness", items: make(n, D5) },
  { key: "D6", name: "Shoulders + Arms", focus: "Width first · arms · traps · leg booster", items: make(n, D6) },
];

export const v2: Program = {
  id: "ppl-arnold",
  version: "2.5.0",
  name: "PPL × Arnold · Intensive v2",
  changelog:
    "2.5: from your first 2 sessions — machine shrug on Pull (what your gym has), isolation rests 75-90 s (Singer 2024: >60 s helps, plateau ~90 s), clearer face-pull/neck/overhead-triceps cues; weights for all 4 weeks shown in Plan. 2.4: drop sets only on machines/cables/dumbbell isolation (leg press → leg extension, EZ curl drop removed — one drop per superset), −20-25% per drop, never 2 days before football. 2.3: Grip & Wrist extra session (6 forearm/grip exercises), football-aware week planner. 2.2: from your first Push — close-grip earlier with safety, laterals before shoulder press, ab wheel moved off Push, smarter weight engine (per-hand dumbbells, RIR-aware). 2.1: barbell row → machine row on Pull day (same growth, saves the lower back for Legs the next day). 2.0: No dips, pull-ups, bands or assisted machine. Per-session volume capped at ~11 sets per muscle, weekly volume spread for more growth. Stretch-biased picks, seated leg curl, techniques only on last isolation sets, small muscles as finishers, pull-up roadmap.",
  order: ["D1", "D2", "D3", "D5", "D6"],
  schedules: {
    "A (Mon start)": ["rest", "D1", "D2", "D3", "rest", "D5", "D6"],
    "B (Sat start, Egypt weekend)": ["D2", "D3", "rest", "D5", "D6", "rest", "D1"],
  },
  tests: [
    { key: "pullups", name: "Strict pull-ups (attempt)", unit: "reps" },
    { key: "dead_hang", name: "Dead hang", unit: "s" },
    { key: "pulldown_bw", name: "Lat pulldown reps at 80% bodyweight", unit: "reps" },
    { key: "pushups", name: "Push-ups (strict, max)", unit: "reps" },
    { key: "hollow", name: "Hollow body hold", unit: "s" },
    { key: "plank", name: "Plank", unit: "s" },
  ],
  rules: [
    "Every rep counts only with full range + control (≈2 s down). Use the rep counter if you lose count.",
    "Burn ≠ failure. Keep going until the target reps or until 1-2 reps are left — don't stop when it starts to burn.",
    "Log the truth: real reps, real RIR, tap 'cheated' if form broke. The plan adjusts to what you actually did.",
    "Hit the top of the rep range on all sets at the target RIR → add weight next time (the app suggests it).",
    "Big lifts (bench, squat, RDL, rows, pulldown, OHP) never to failure — RIR 1-2 even in Week 3.",
    "Finishers (grip, wrist, neck, push-ups) come last. Never train grip hard the day before Pull day.",
    "Missed a day → do the next session, don't double up. Sharp pain → stop, swap, log it.",
  ],
  weeks: [
    { n: 1, name: "Ramp-in", brief: "Hard but no failure: RIR 2 on everything. Find working weights. Every rep strict and counted.", days: days(1), extras: extras(1) },
    { n: 2, name: "Build", brief: "More sets. Isolation RIR 1, big lifts RIR 2. Beat last week by a rep or a weight step.", days: days(2), extras: extras(2) },
    { n: 3, name: "Overload", brief: "Hardest week. Isolation to RIR 0-1, techniques on the LAST set only. Big lifts stay at RIR 1.", days: days(3), extras: extras(3) },
    { n: 4, name: "Deload + test", brief: "Half the sets, RIR 3. Do the tests (More → Tests) before Day 1 and Day 6. Recover, then v3.", days: days(4), extras: extras(4) },
  ],
};
