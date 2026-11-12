// Plan templates for friends (the owner's own plan stays program/versions/* → CURRENT).
// Each is ONE normal week (Week 2) written as a design; expand() in ./design.ts builds the 4-week wave + deload.
//
// Evidence used (see docs in the Programs screen "Why this plan"):
//  • ~10-20 hard sets per muscle per week, counted fractionally (primary 1, secondary ½) — Schoenfeld 2017 dose-response,
//    Pelland et al. 2024/2026 meta-regressions; per-session returns flatten past ~10-11 sets for one muscle.
//  • each muscle ≥2×/week when the week allows it (Schoenfeld 2016 frequency meta-analysis); split vs full body makes no
//    difference when volume is equal (Ramos-Campo 2024) → pick the split that fits your days.
//  • a wide rep range works (≈5-30, Schoenfeld 2017 load meta-analysis); heavy 3-8 for strength, 8-15 for most hypertrophy work.
//  • stop 0-3 reps short of failure (Refalo 2023: failure isn't required); big lifts stay at RIR 1-2.
//  • a planned deload every 4th week (Bell 2023 Delphi consensus).
import type { DDay, DItem, Design, TemplateMeta } from "./design";

/** i("bench", "3x6-8", 150, { heavy: true }) — scheme forms: "3x8-12" · "3x10" · "3x30s" · "3x30m" · "2xmax". */
function i(ex: string, scheme: string, rest: number, o: Partial<DItem> = {}): DItem {
  const m = scheme.match(/^(\d+)x(.+)$/);
  if (!m) throw new Error(`Bad scheme ${scheme}`);
  const sets = Number(m[1]), t = m[2];
  const base: DItem = { ex, sets, rest, ...o };
  if (t === "max") return { ...base, reps: null };
  if (t.endsWith("s")) return { ...base, seconds: Number(t.slice(0, -1)), rir: o.rir ?? null };
  if (t.endsWith("m")) return { ...base, meters: Number(t.slice(0, -1)), rir: o.rir ?? null };
  if (t.includes("-")) { const [a, b] = t.split("-").map(Number); return { ...base, reps: [a, b] }; }
  return { ...base, reps: Number(t) };
}
const H = { heavy: true } as const;
const day = (key: string, name: string, focus: string, items: DItem[]): DDay => ({ key, name, focus, items });

export interface Draft { meta: TemplateMeta; design: Design }

export const DRAFTS: Draft[] = [
  // ------------------------------------------------------------ 2 days
  {
    meta: {
      id: "fb2", name: "Full Body A/B", split: "Full body", days: 2, levels: ["beginner", "intermediate"], goals: ["general", "muscle", "strength"], equipment: "gym", focus: [],
      blurb: "Two full-body sessions a week. The least time for real progress.",
      why: "Every muscle twice a week — frequency of 2 beats 1 for growth (Schoenfeld 2016). ~7-10 hard sets per muscle per week is enough to grow for beginners and to keep gains when life is busy. A big squat, press, pull and hinge every week drive strength.",
    },
    design: { days: [
      day("D1", "Full Body A", "Squat · bench · pulldown", [
        i("squat", "3x5-8", 165, H), i("bench", "3x6-10", 150, H), i("pulldown", "3x8-12", 120), i("seated_leg_curl", "3x10-12", 75),
        i("db_lateral", "3x12-15", 60), i("ez_curl", "3x10-12", 0, { tag: "A1" }), i("pushdown", "3x10-12", 75, { tag: "A2" }),
      ]),
      day("D2", "Full Body B", "Hinge · incline · row", [
        i("rdl", "3x6-10", 150, H), i("incline_db", "3x8-12", 120), i("cable_row", "3x8-12", 105), i("leg_press", "3x10-12", 120),
        i("face_pull", "2x12-15", 60), i("standing_calf", "3x10-15", 60), i("hanging_knee_raise", "2x10-15", 60, { rir: null }),
      ]),
    ] },
  },
  // ------------------------------------------------------------ 3 days
  {
    meta: {
      id: "fb3", name: "Full Body 3×", split: "Full body", days: 3, levels: ["beginner"], goals: ["general", "muscle", "strength"], equipment: "gym", focus: [],
      blurb: "The classic beginner plan: three short full-body days, every muscle 3× a week.",
      why: "Beginners grow fastest from practising the main lifts often. Spreading ~10-12 sets per muscle over 3 sessions keeps each workout short and every set high-quality. Machines next to free weights make the learning curve gentle.",
    },
    design: { days: [
      day("D1", "Full Body A", "Squat · bench · row", [
        i("squat", "3x6-8", 165, H), i("bench", "3x6-8", 150, H), i("cable_row", "3x10-12", 90), i("leg_curl", "2x10-12", 75),
        i("db_lateral", "2x12-15", 60), i("plank", "2x30s", 60),
      ]),
      day("D2", "Full Body B", "Hinge · shoulder press · pulldown", [
        i("rdl", "3x8-10", 150, H), i("db_ohp", "3x8-12", 120), i("pulldown", "3x8-12", 105), i("leg_press", "3x10-12", 120),
        i("db_curl", "2x10-12", 60), i("pushdown", "2x10-12", 60), i("pushup", "2xmax", 60, { fin: true, tech: "Strict, stop 1 rep before form breaks" }),
      ]),
      day("D3", "Full Body C", "Single leg · incline · machine row", [
        i("bss", "2x8-10", 90), i("incline_db", "3x8-12", 120), i("machine_row", "3x10-12", 90), i("seated_leg_curl", "2x10-12", 75),
        i("face_pull", "2x12-15", 60), i("standing_calf", "3x10-15", 60), i("cable_crunch", "2x10-15", 60),
      ]),
    ] },
  },
  {
    meta: {
      id: "ulf3", name: "Upper · Lower · Full", split: "Upper / lower / full", days: 3, levels: ["intermediate"], goals: ["muscle", "strength"], equipment: "gym", focus: [],
      blurb: "Three days, every muscle twice: a heavy upper, a heavy lower, and a full-body pump day.",
      why: "For 3 days a week this gets each muscle 2× (Schoenfeld 2016) with ~10-14 weekly sets — the middle of the 10-20 range (Pelland 2024). Heavy compounds early in the week, higher-rep machine work in the full-body day for joint-friendly volume.",
    },
    design: { days: [
      day("D1", "Upper", "Heavy press + pull · arms", [
        i("bench", "3x6-8", 165, H), i("pulldown", "3x8-12", 120), i("db_ohp", "2x8-12", 120), i("cable_row", "3x8-12", 90),
        i("db_lateral", "3x12-15", 60), i("ez_curl", "2x10-12", 0, { tag: "A1" }), i("pushdown", "2x10-12", 75, { tag: "A2" }),
      ]),
      day("D2", "Lower", "Squat + hinge · core", [
        i("squat", "3x5-8", 180, H), i("rdl", "3x8-10", 150, H), i("leg_extension", "2x12-15", 75), i("seated_leg_curl", "3x10-12", 75),
        i("standing_calf", "3x10-15", 60), i("cable_crunch", "2x10-15", 60),
      ]),
      day("D3", "Full Body", "Machines · higher reps", [
        i("incline_db", "3x8-12", 120), i("machine_row", "3x8-12", 90), i("leg_press", "3x10-12", 120), i("leg_curl", "2x10-12", 75),
        i("cable_fly", "2x12-15", 60), i("cable_lateral", "2x12-15", 60), i("incline_curl", "2x10-12", 0, { tag: "A1" }), i("oh_tri_ext", "2x10-12", 75, { tag: "A2" }),
      ]),
    ] },
  },
  {
    meta: {
      id: "db3", name: "Home Dumbbells 3×", split: "Full body", days: 3, levels: ["beginner", "intermediate"], goals: ["general", "muscle"], equipment: "dumbbells", focus: [],
      blurb: "Adjustable dumbbells and a bench at home. No gym, full body three times a week.",
      why: "Muscle responds to hard sets, not to the tool: with 8-20 reps taken close to failure, dumbbells build muscle like machines (Schoenfeld 2017 load meta-analysis). Higher rep ranges make the most of limited weight; single-leg work keeps legs challenged.",
    },
    design: { days: [
      day("D1", "Full Body A", "Goblet squat · press · row", [
        i("goblet_squat", "3x10-15", 120), i("db_bench", "3x8-12", 120), i("db_row", "3x8-12", 75), i("db_lateral", "3x12-20", 60),
        i("db_curl", "2x10-15", 0, { tag: "A1" }), i("db_oh_ext", "2x10-15", 60, { tag: "A2" }),
      ]),
      day("D2", "Full Body B", "Hinge · overhead · bent row", [
        i("db_rdl", "3x8-12", 120), i("db_ohp", "3x8-12", 120), i("db_bent_row", "3x8-12", 90), i("bss", "2x8-12", 90),
        i("rear_delt_fly", "2x12-20", 60), i("plank", "2x30s", 45),
      ]),
      day("D3", "Full Body C", "Lunge · incline · pullover", [
        i("reverse_lunge", "3x8-12", 90), i("incline_db", "3x8-12", 120), i("db_pullover", "2x10-15", 75), i("single_leg_rdl", "2x10-12", 75),
        i("hammer_curl", "2x10-15", 0, { tag: "A1" }), i("db_kickback", "2x12-15", 60, { tag: "A2" }), i("single_leg_calf", "3x10-15", 45),
      ]),
    ] },
  },
  {
    meta: {
      id: "bw3", name: "Bodyweight 3×", split: "Full body", days: 3, levels: ["beginner", "intermediate"], goals: ["general", "muscle"], equipment: "bodyweight", focus: [],
      blurb: "No weights: a pull-up bar, a sturdy table and the floor. Push-ups to pull-ups.",
      why: "Sets of up to ~30 reps still build muscle when they end close to failure (Schoenfeld 2017). Progress by harder variations (incline → floor → deficit push-up, negatives → pull-ups, split squat → Bulgarian) instead of weight.",
    },
    design: { days: [
      day("D1", "Full Body A", "Push-up · row · squat", [
        i("pushup", "3x8-20", 90), i("inverted_row", "3x8-15", 90), i("bw_squat", "3x15-25", 75), i("pike_pushup", "2x6-12", 90),
        i("glute_bridge", "3x12-20", 60), i("plank", "3x30s", 45),
      ]),
      day("D2", "Full Body B", "Chin-up · dips · split squat", [
        i("chinup", "3x3-10", 120, { tech: "Can't do 3 yet → swap to negatives (3-5 s down)" }), i("bench_dip", "3x8-15", 75), i("bw_split_squat", "3x10-15", 75),
        i("slider_leg_curl", "3x8-12", 75), i("calf_raise_bw", "3x15-25", 45), i("hollow_hold", "2x20s", 45),
      ]),
      day("D3", "Full Body C", "Pull-up · deficit push-up · glutes", [
        i("pullup", "3x3-8", 120, { tech: "Can't do 3 yet → swap to negatives" }), i("deficit_pushup", "3x6-15", 90), i("bw_squat", "3x15-25", 75),
        i("single_leg_glute_bridge", "2x10-15", 60), i("prone_y_raise", "2x10-15", 45), i("reverse_crunch", "2x10-15", 45), i("side_plank", "2x20s", 45),
      ]),
    ] },
  },
  // ------------------------------------------------------------ 4 days
  {
    meta: {
      id: "ul4", name: "Upper / Lower 4×", split: "Upper / lower", days: 4, levels: ["beginner", "intermediate"], goals: ["muscle", "strength", "general"], equipment: "gym", focus: [],
      blurb: "The most popular 4-day split: two upper, two lower. Balanced, flexible, proven.",
      why: "Each muscle twice a week with ~12-16 weekly sets (Pelland 2024 sweet spot) and no more than ~8-10 sets per muscle in a session. Day A leans heavy (5-8 reps), day B leans pump (8-15), so you build strength and size together.",
    },
    design: { days: [
      day("D1", "Upper A", "Heavy bench + row · arms", [
        i("bench", "4x5-8", 165, H), i("bb_row", "3x6-10", 150, H), i("db_ohp", "2x8-12", 120), i("pulldown", "3x8-12", 105),
        i("db_lateral", "3x12-15", 60), i("ez_curl", "2x8-12", 0, { tag: "A1" }), i("pushdown", "2x10-12", 75, { tag: "A2" }),
      ]),
      day("D2", "Lower A", "Heavy squat + hinge", [
        i("squat", "4x5-8", 180, H), i("rdl", "3x8-10", 150, H), i("leg_extension", "2x10-15", 75), i("seated_leg_curl", "3x10-12", 75),
        i("standing_calf", "3x10-15", 60), i("cable_crunch", "3x10-15", 60),
      ]),
      day("D3", "Upper B", "Incline · cable row · delts · arms", [
        i("incline_db", "3x8-12", 120), i("cable_row", "3x8-12", 105), i("pec_deck", "2x12-15", 75), i("neutral_pulldown", "3x10-12", 90),
        i("cable_lateral", "3x12-15", 60), i("incline_curl", "2x10-12", 0, { tag: "A1" }), i("oh_tri_ext", "2x10-12", 75, { tag: "A2" }), i("face_pull", "2x12-15", 60),
      ]),
      day("D4", "Lower B", "Leg press · glutes · single leg", [
        i("leg_press", "3x10-12", 120), i("hip_thrust", "3x8-12", 120), i("bss", "2x8-12", 90), i("leg_curl", "3x10-12", 75),
        i("seated_calf", "3x12-15", 60), i("hanging_knee_raise", "3x10-15", 60, { rir: null }),
      ]),
    ] },
  },
  {
    meta: {
      id: "phul4", name: "PHUL", split: "Power / hypertrophy upper-lower", days: 4, levels: ["intermediate", "advanced"], goals: ["strength", "muscle"], equipment: "gym", focus: ["Quads", "Hamstrings/Glutes", "Chest", "Back"],
      blurb: "Power Hypertrophy Upper Lower: 2 heavy days (3-5 reps) + 2 bodybuilding days.",
      why: "Heavy loads build max strength best (Schoenfeld 2017: high load > low load for 1RM), moderate loads add volume for size. Strength and size days for each half of the body = every muscle 2×/week with ~14-18 sets.",
    },
    design: { days: [
      day("D1", "Power Upper", "Heavy press + row (3-5 reps)", [
        i("bench", "4x3-5", 180, H), i("bb_row", "4x3-5", 180, H), i("db_ohp", "3x6-8", 150), i("pulldown", "3x6-10", 120),
        i("ez_curl", "2x6-10", 0, { tag: "A1" }), i("skull_crusher", "2x6-10", 90, { tag: "A2" }),
      ]),
      day("D2", "Power Lower", "Heavy squat + deadlift", [
        i("squat", "4x3-5", 180, H), i("deadlift", "3x3-5", 210, H), i("leg_press", "3x8-10", 150), i("leg_curl", "3x6-10", 90),
        i("standing_calf", "4x6-10", 75),
      ]),
      day("D3", "Hypertrophy Upper", "Volume · pump", [
        i("incline_db", "4x8-12", 120), i("pec_deck", "3x10-15", 75), i("cable_row", "4x8-12", 90), i("neutral_pulldown", "3x10-12", 90),
        i("db_lateral", "3x12-15", 60), i("incline_curl", "3x10-12", 0, { tag: "A1" }), i("oh_tri_ext", "3x10-12", 75, { tag: "A2" }),
      ]),
      day("D4", "Hypertrophy Lower", "Volume · pump", [
        i("bss", "3x8-12", 90), i("leg_extension", "3x12-15", 75), i("seated_leg_curl", "4x10-12", 75), i("hip_thrust", "3x8-12", 120),
        i("seated_calf", "4x12-15", 60), i("cable_crunch", "3x10-15", 60),
      ]),
    ] },
  },
  {
    meta: {
      id: "db4", name: "Home Dumbbells Upper / Lower", split: "Upper / lower", days: 4, levels: ["intermediate"], goals: ["muscle", "general"], equipment: "dumbbells", focus: [],
      blurb: "Four home days with dumbbells and a bench: more volume than the 3-day home plan.",
      why: "Upper/lower gives each muscle 2× per week and room for ~12-16 weekly sets (Pelland 2024). With fixed dumbbells you progress reps first (to 15-20), then the next dumbbell — double progression.",
    },
    design: { days: [
      day("D1", "Upper A", "Press · row · shoulders", [
        i("db_bench", "4x8-12", 120), i("db_bent_row", "4x8-12", 90), i("db_ohp", "3x8-12", 120), i("db_lateral", "3x12-20", 60),
        i("db_curl", "2x10-15", 0, { tag: "A1" }), i("db_oh_ext", "2x10-15", 60, { tag: "A2" }),
      ]),
      day("D2", "Lower A", "Squat · hinge · calves", [
        i("goblet_squat", "4x10-15", 120), i("db_rdl", "3x8-12", 120), i("bss", "2x8-12", 90), i("single_leg_calf", "3x10-15", 45),
        i("dead_bug", "2x8-12", 45, { rir: null }),
      ]),
      day("D3", "Upper B", "Incline · one-arm row · arms", [
        i("incline_db", "3x8-12", 120), i("db_row", "3x8-12", 75), i("db_fly", "2x12-15", 75), i("arnold_press", "2x10-12", 90),
        i("rear_delt_fly", "3x12-20", 60), i("hammer_curl", "2x10-15", 0, { tag: "A1" }), i("db_kickback", "2x12-15", 60, { tag: "A2" }),
      ]),
      day("D4", "Lower B", "Lunge · single-leg hinge · glutes", [
        i("reverse_lunge", "3x8-12", 90), i("single_leg_rdl", "3x8-12", 75), i("glute_bridge", "3x12-20", 60), i("step_up", "2x10-12", 90),
        i("calf_raise_bw", "3x15-20", 45), i("reverse_crunch", "2x10-15", 45),
      ]),
    ] },
  },
  // ------------------------------------------------------------ 5 days
  {
    meta: {
      id: "pplul5", name: "PPL + Upper / Lower", split: "Push / pull / legs + upper / lower", days: 5, levels: ["intermediate"], goals: ["muscle", "strength"], equipment: "gym", focus: [],
      blurb: "Five days: push, pull, legs, then upper and lower. Every muscle twice, lots of variety.",
      why: "PPL gives focused sessions; adding an upper and a lower day brings every muscle to 2×/week (Schoenfeld 2016) and ~14-18 weekly sets. Session volume per muscle stays ≤ ~10 sets where returns flatten.",
    },
    design: { days: [
      day("D1", "Push", "Chest · shoulders · triceps", [
        i("bench", "3x5-8", 165, H), i("incline_db", "3x8-12", 120), i("machine_shoulder_press", "2x8-12", 105), i("db_lateral", "3x12-15", 60),
        i("pushdown", "2x10-12", 75), i("oh_tri_ext", "2x10-12", 75),
      ]),
      day("D2", "Pull", "Back · rear delts · biceps", [
        i("pulldown", "3x6-10", 120), i("bb_row", "3x6-10", 150, H), i("cable_row", "2x10-12", 90), i("face_pull", "3x12-15", 60),
        i("incline_curl", "3x10-12", 75), i("hammer_curl", "2x10-12", 60),
      ]),
      day("D3", "Legs", "Squat · hinge · core", [
        i("squat", "3x5-8", 180, H), i("rdl", "3x8-10", 150, H), i("leg_extension", "3x10-15", 75), i("seated_leg_curl", "3x10-12", 75),
        i("standing_calf", "3x10-15", 60), i("cable_crunch", "3x10-15", 60),
      ]),
      day("D4", "Upper", "Machines · supersets", [
        i("machine_press", "3x8-12", 120), i("neutral_pulldown", "3x8-12", 90), i("pec_deck", "2x12-15", 75), i("machine_row", "3x8-12", 90),
        i("cable_lateral", "3x12-15", 60), i("ez_curl", "2x10-12", 0, { tag: "A1" }), i("skull_crusher", "2x10-12", 75, { tag: "A2" }),
      ]),
      day("D5", "Lower", "Leg press · glutes · lunges", [
        i("leg_press", "3x10-12", 120), i("hip_thrust", "3x8-12", 120), i("leg_curl", "3x10-12", 75), i("walking_lunge", "2x10-12", 90),
        i("seated_calf", "3x12-15", 60), i("hanging_knee_raise", "3x10-15", 60, { rir: null }),
      ]),
    ] },
  },
  {
    meta: {
      id: "split5", name: "Body-Part Split 5×", split: "Body-part split (+ 2nd hits)", days: 5, levels: ["intermediate", "advanced"], goals: ["muscle"], equipment: "gym", focus: ["Shoulders", "Biceps", "Triceps", "Chest"],
      blurb: "A bodybuilding split (chest · back · legs · shoulders+arms) with a 5th day that hits everything again.",
      why: "Classic 'bro splits' train each muscle once a week; the 5th upper+legs day restores 2× frequency (Schoenfeld 2016). Big single-muscle sessions are capped at ~10 sets because growth per session plateaus beyond that (Pelland 2024).",
    },
    design: { days: [
      day("D1", "Chest", "Chest + side delts", [
        i("bench", "4x6-8", 165, H), i("incline_db", "3x8-12", 120), i("cable_fly", "3x12-15", 75), i("dip_machine", "2x10-12", 75),
        i("db_lateral", "3x12-15", 60),
      ]),
      day("D2", "Back", "Width + thickness + traps", [
        i("bb_row", "4x6-8", 150, H), i("pulldown", "3x8-12", 120), i("single_arm_cable_row", "3x10-12", 75), i("straight_arm_pulldown", "2x12-15", 60),
        i("reverse_pec_deck", "3x12-15", 60), i("bb_shrug", "3x10-12", 75),
      ]),
      day("D3", "Legs", "Quads · hamstrings · calves", [
        i("squat", "4x5-8", 180, H), i("rdl", "3x8-10", 150, H), i("leg_press", "3x10-12", 120), i("seated_leg_curl", "3x10-12", 75),
        i("leg_extension", "2x12-15", 75), i("standing_calf", "4x10-15", 60),
      ]),
      day("D4", "Shoulders + Arms", "Press · laterals · arm supersets", [
        i("ohp", "3x6-8", 150, H), i("cable_lateral", "4x12-15", 60), i("preacher_curl", "3x8-12", 0, { tag: "A1" }), i("skull_crusher", "3x8-12", 75, { tag: "A2" }),
        i("incline_curl", "2x10-12", 0, { tag: "B1" }), i("pushdown", "2x10-12", 75, { tag: "B2" }), i("face_pull", "2x15", 60),
      ]),
      day("D5", "Upper + Legs", "Second hit for everything", [
        i("machine_incline_press", "3x8-12", 120), i("machine_row", "3x8-12", 90), i("hack_squat", "3x8-12", 150), i("leg_curl", "3x10-12", 75),
        i("db_lateral", "3x15-20", 45), i("hammer_curl", "2x10-12", 60), i("cable_crunch", "3x10-15", 60),
      ]),
    ] },
  },
  // ------------------------------------------------------------ 6 days
  {
    meta: {
      id: "ppl6", name: "Push Pull Legs ×2", split: "Push / pull / legs", days: 6, levels: ["intermediate", "advanced"], goals: ["muscle"], equipment: "gym", focus: [],
      blurb: "Six days, each muscle twice: a heavier A rotation and a pump B rotation.",
      why: "Six shorter sessions spread ~15-20 weekly sets per muscle (upper end of Pelland 2024) so no session goes past ~9 sets for one muscle. Best if you recover well and like the gym daily; drop to 5 days by merging Push B + Pull B if needed.",
    },
    design: { days: [
      day("D1", "Push A", "Heavy bench · shoulders · triceps", [
        i("bench", "3x5-8", 165, H), i("machine_shoulder_press", "3x8-12", 120), i("cable_fly", "2x12-15", 75), i("db_lateral", "3x12-15", 60),
        i("pushdown", "3x10-12", 75),
      ]),
      day("D2", "Pull A", "Pulldown · row · biceps", [
        i("pulldown", "3x6-10", 120), i("bb_row", "3x6-10", 150, H), i("face_pull", "3x12-15", 60), i("ez_curl", "3x8-12", 75),
        i("hammer_curl", "2x10-12", 60),
      ]),
      day("D3", "Legs A", "Squat · hinge", [
        i("squat", "3x5-8", 180, H), i("rdl", "3x8-10", 150, H), i("leg_extension", "2x12-15", 75), i("leg_curl", "2x10-12", 75), i("seated_calf", "3x12-15", 60),
        i("cable_crunch", "3x10-15", 60),
      ]),
      day("D4", "Push B", "Incline · pump", [
        i("incline_db", "3x8-12", 120), i("db_ohp", "2x8-12", 120), i("pec_deck", "2x12-15", 75), i("cable_lateral", "3x12-15", 60),
        i("oh_tri_ext", "3x10-12", 75),
      ]),
      day("D5", "Pull B", "Cable row · lats · rear delts", [
        i("cable_row", "3x8-12", 105), i("single_arm_pulldown", "3x10-12", 75), i("reverse_pec_deck", "3x12-15", 60), i("incline_curl", "3x10-12", 75),
      ]),
      day("D6", "Legs B", "Leg press · hamstrings · glutes", [
        i("leg_press", "3x10-12", 120), i("seated_leg_curl", "3x10-12", 75), i("bss", "2x8-12", 90), i("hip_thrust", "2x8-12", 120),
        i("standing_calf", "3x10-15", 60), i("hanging_knee_raise", "3x10-15", 60, { rir: null }),
      ]),
    ] },
  },
  {
    meta: {
      id: "arnold6", name: "Arnold Split", split: "Chest+back / shoulders+arms / legs", days: 6, levels: ["advanced"], goals: ["muscle"], equipment: "gym", focus: ["Chest", "Back", "Shoulders", "Biceps", "Triceps"],
      blurb: "Arnold's golden-era split: antagonist supersets, big upper-body volume, 6 days.",
      why: "Chest+back and biceps+triceps supersets save time with no loss in growth when muscles don't overlap. Upper body gets ~16-20 weekly sets per muscle, the top of the 10-20 range — for experienced lifters who recover well.",
    },
    design: { days: [
      day("D1", "Chest + Back A", "Heavy bench + row · supersets", [
        i("bench", "4x6-8", 165, H), i("bb_row", "4x6-8", 150, H), i("incline_db", "3x8-12", 0, { tag: "A1" }), i("pulldown", "3x8-12", 120, { tag: "A2" }),
        i("cable_fly", "2x12-15", 0, { tag: "B1" }), i("straight_arm_pulldown", "2x12-15", 75, { tag: "B2" }),
      ]),
      day("D2", "Shoulders + Arms A", "OHP · laterals · arm supersets", [
        i("ohp", "3x6-8", 150, H), i("db_lateral", "3x12-15", 60), i("ez_curl", "3x8-10", 0, { tag: "A1" }), i("skull_crusher", "3x8-12", 90, { tag: "A2" }),
        i("incline_curl", "2x10-12", 0, { tag: "B1" }), i("pushdown", "2x10-12", 75, { tag: "B2" }), i("wrist_curl", "2x15-20", 45, { fin: true }),
      ]),
      day("D3", "Legs A", "Squat · hinge · calves", [
        i("squat", "4x5-8", 180, H), i("rdl", "3x8-10", 150, H), i("leg_extension", "3x12-15", 75), i("seated_leg_curl", "3x10-12", 75),
        i("standing_calf", "4x10-15", 60), i("cable_crunch", "3x10-15", 60),
      ]),
      day("D4", "Chest + Back B", "Incline · cable row · supersets", [
        i("machine_incline_press", "3x8-12", 120), i("cable_row", "3x8-12", 120), i("db_bench", "3x8-12", 0, { tag: "A1" }), i("neutral_pulldown", "3x10-12", 90, { tag: "A2" }),
        i("pec_deck", "2x12-15", 0, { tag: "B1" }), i("reverse_pec_deck", "2x12-15", 60, { tag: "B2" }),
      ]),
      day("D5", "Shoulders + Arms B", "DB press · cable laterals · arms", [
        i("db_ohp", "3x8-12", 120), i("cable_lateral", "3x12-15", 60), i("preacher_curl", "3x10-12", 0, { tag: "A1" }), i("oh_tri_ext", "2x10-12", 75, { tag: "A2" }),
        i("hammer_curl", "2x10-12", 0, { tag: "B1" }), i("dip_machine", "2x10-12", 75, { tag: "B2" }), i("bb_shrug", "3x10-12", 75),
      ]),
      day("D6", "Legs B", "Hack squat · glutes · lunges", [
        i("hack_squat", "3x8-12", 150), i("hip_thrust", "3x8-12", 120), i("leg_curl", "3x10-12", 75), i("walking_lunge", "2x10-12", 90),
        i("seated_calf", "4x12-15", 60), i("hanging_knee_raise", "3x10-15", 60, { rir: null }),
      ]),
    ] },
  },
];
